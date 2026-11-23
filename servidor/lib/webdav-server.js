// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/webdav-server.js
 * Servidor WebDAV Multi-Tenant Criptografado RFC 4918 Class 2.
 * - Isolamento estrito por credencial (Cofre Pessoal ou Organização).
 * - Descriptografia AURTENC2 em streaming (HTTP 206) e gravação atômica cifrada no PUT.
 * - Suporte a LOCK/UNLOCK/If/Overwrite/PROPPATCH, chunked PUT, multi-volume (EXDEV) e ponte Portfolio.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vaultCrypto = require('./vault-crypto');
const { extractClientIpForRateLimit } = require('./webdav-tokens');

const SERVER_INTERNAL_HIDDEN_NAMES = new Set([
  '.trash',
  '.git',
  '.sync-journal.json',
  'trash_manifest.json',
  'catalog.json',
  'sig_index.json',
  'webdav_tokens.json',
  'shares.json',
  'audit.jsonl',
]);

const PORTFOLIO_IGNORED_NAMES = new Set([
  'originals',
  'thumbs',
  'lost+found',
  'LOST.DIR',
  '$RECYCLE.BIN',
  'System Volume Information',
  '.Trash-1000',
  'node_modules',
]);

const MAX_XML_BODY_BYTES = 64 * 1024;
const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_LOCKS = 1000;

function toRfc1123Date(date) {
  return new Date(date).toUTCString();
}

function toIsoDate(date) {
  return new Date(date).toISOString();
}

function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function encodeRfc3986Segment(seg) {
  return encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function computeEtag(stat, plaintextSize) {
  const mtimePart = Math.floor(Number(stat.mtimeMs) || 0).toString(16);
  const sizePart = Math.max(0, Number(plaintextSize) || 0).toString(16);
  return `"${mtimePart}-${sizePart}"`;
}

function isServerControlEntry(name, isInsidePortfolio = false) {
  if (!name) return true;
  if (SERVER_INTERNAL_HIDDEN_NAMES.has(name)) return true;
  if (name.startsWith('.aurt_tmp_') || name.startsWith('.aurt_chunk_') || name.endsWith('.enc.tmp')) return true;
  if (name.endsWith('.shortcut.json') || name.endsWith('.shortcut')) return true;
  if (isInsidePortfolio && PORTFOLIO_IGNORED_NAMES.has(name)) return true;
  return false;
}

function decodeWebdavRelPath(rawPathname, basePath) {
  if (typeof rawPathname !== 'string') return { ok: false, status: 400 };
  if (rawPathname.includes('\0') || rawPathname.includes('\\')) return { ok: false, status: 400 };

  const normBase = basePath.replace(/\/+$/, '');
  if (!rawPathname.startsWith(normBase)) return { ok: false, status: 404 };

  const tail = rawPathname.slice(normBase.length).replace(/^\/+/, '');
  if (!tail) return { ok: true, relPath: '' };

  const rawSegments = tail.split('/');
  const decodedSegments = [];
  for (const seg of rawSegments) {
    if (!seg) continue;
    if (/%2e%2e/i.test(seg) || seg === '.' || seg === '..') {
      return { ok: false, status: 403 };
    }
    let dec;
    try {
      dec = decodeURIComponent(seg);
    } catch {
      return { ok: false, status: 400 };
    }
    if (!dec || dec === '.' || dec === '..' || dec.includes('/') || dec.includes('\\') || dec.includes('\0')) {
      return { ok: false, status: 403 };
    }
    decodedSegments.push(dec.normalize('NFC'));
  }
  return { ok: true, relPath: decodedSegments.join('/') };
}

function readXmlBodyLimited(req, maxBytes = MAX_XML_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    let settled = false;

    const onData = (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        settled = true;
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onErr);
        const err = new Error('Corpo XML excede o limite de 64 KB.');
        err.statusCode = 413;
        return reject(err);
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      const text = Buffer.concat(chunks).toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
        const err = new Error('Declarações DTD/ENTITY não permitidas.');
        err.statusCode = 400;
        return reject(err);
      }
      resolve(text);
    };

    const onErr = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onErr);
  });
}

function parseIfLockTokens(ifHeader) {
  const tokens = [];
  if (!ifHeader) return tokens;
  const re = /<(opaquelocktoken:[^>]+)>/gi;
  let m;
  while ((m = re.exec(String(ifHeader))) !== null) {
    tokens.push(m[1]);
  }
  return tokens;
}

class WebdavServer {
  constructor(options = {}) {
    this.basePath = (options.basePath || '/webdav/cofre').replace(/\/+$/, '');
    this.tokenManager = options.tokenManager;
    this.buildTenantContext = options.buildTenantContext;
    this.getStagingDir = options.getStagingDir;
    this.getDiskCapacitySync = options.getDiskCapacitySync;
    this.isExternalStorageMounted = options.isExternalStorageMounted || (() => true);
    this.isStagingOnExternalStorage = options.isStagingOnExternalStorage || (() => true);
    this.getVolumesPool = options.getVolumesPool || (() => []);
    this.getStorageDir = options.getStorageDir;
    this.getMimeType = options.getMimeType || (() => 'application/octet-stream');
    this.isPortfolioRelatedRelPath = options.isPortfolioRelatedRelPath || (() => false);
    this.isTenantPathPinProtected = options.isTenantPathPinProtected || (() => null);
    this.hasAnyPinUnderPrefix = options.hasAnyPinUnderPrefix || (() => false);
    this.moveFileSafe = options.moveFileSafe;
    this.renameDirectorySafeFAT32 = options.renameDirectorySafeFAT32;
    this.getTenantTrashDirAndManifest = options.getTenantTrashDirAndManifest;
    this.readTenantTrashManifest = options.readTenantTrashManifest;
    this.writeTenantTrashManifest = options.writeTenantTrashManifest;
    this.invalidateThumb = options.invalidateThumb || (() => Promise.resolve());
    this.queueThumb = options.queueThumb || (() => {});
    this.onPortfolioMutated = options.onPortfolioMutated || (() => {});
    this.onUploadCompleted = options.onUploadCompleted || (() => {});
    this.allowedOriginHosts = options.allowedOriginHosts || null;
    this.minSafetyBufferBytes = options.minSafetyBufferBytes ?? 30 * 1024 * 1024;
    this.maxLocks = options.maxLocks ?? DEFAULT_MAX_LOCKS;
    this.lockTtlMs = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;

    this.locks = new Map();
    this.inFlightReservedBytes = new Map();
  }

  _pruneLocks() {
    const now = Date.now();
    for (const [tok, info] of this.locks.entries()) {
      if (now >= info.expiresAt) {
        this.locks.delete(tok);
      }
    }
  }

  _getScopeLockKey(tenant) {
    return `${tenant.scopeType}:${tenant.pinNamespaceId}`;
  }

  _findActiveLockForPath(tenant, relPath) {
    this._pruneLocks();
    const scopeKey = this._getScopeLockKey(tenant);
    const norm = relPath.replace(/^\/+|\/+$/g, '');
    for (const info of this.locks.values()) {
      if (info.scopeKey !== scopeKey) continue;
      if (info.relPath === norm) return info;
      if (info.depth === 'infinity' && (!info.relPath || norm.startsWith(`${info.relPath}/`))) {
        return info;
      }
    }
    return null;
  }

  _assertLockSatisfied(req, tenant, relPath) {
    const activeLock = this._findActiveLockForPath(tenant, relPath);
    if (!activeLock) return;
    const presented = parseIfLockTokens(req.headers.if);
    const lockTokenHeader = String(req.headers['lock-token'] || '').replace(/^<|>$/g, '').trim();
    if (presented.includes(activeLock.token) || lockTokenHeader === activeLock.token) {
      return;
    }
    const err = new Error('Recurso bloqueado por LOCK WebDAV.');
    err.statusCode = 423;
    throw err;
  }

  _addReservedBytes(pinNamespaceId, delta) {
    const prev = this.inFlightReservedBytes.get(pinNamespaceId) || 0;
    const next = Math.max(0, prev + delta);
    if (next === 0) this.inFlightReservedBytes.delete(pinNamespaceId);
    else this.inFlightReservedBytes.set(pinNamespaceId, next);
    return next;
  }

  _buildHref(relPath, isDir) {
    const clean = String(relPath || '').replace(/^\/+|\/+$/g, '');
    if (!clean) return `${this.basePath}/`;
    const encoded = clean.split('/').filter(Boolean).map(encodeRfc3986Segment).join('/');
    return `${this.basePath}/${encoded}${isDir ? '/' : ''}`;
  }

  _hasLockedPin(tenant, relPath, recursive = false) {
    if (!relPath && !recursive) return false;
    if (relPath && this.isTenantPathPinProtected(tenant.pinNamespaceId, relPath)) {
      return true;
    }
    if (recursive && this.hasAnyPinUnderPrefix(tenant.pinNamespaceId, relPath)) {
      return true;
    }
    return false;
  }

  async _getPlaintextSizeAndStat(fullPath) {
    const st = await fs.promises.lstat(fullPath);
    if (st.isSymbolicLink()) return { isSymlink: true, st };
    if (st.isDirectory()) return { isSymlink: false, st, plaintextSize: 0, isEncrypted: false };
    const hdr = await vaultCrypto.readEncryptedHeader(fullPath).catch(() => null);
    return {
      isSymlink: false,
      st,
      plaintextSize: hdr ? hdr.plaintextSize : st.size,
      isEncrypted: Boolean(hdr),
    };
  }

  async _computePlaintextTreeBytes(dirPath) {
    let sum = 0;
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true }).catch(() => []);
    for (const d of entries) {
      if (isServerControlEntry(d.name, false)) continue;
      const full = path.join(dirPath, d.name);
      const st = await fs.promises.lstat(full).catch(() => null);
      if (!st || st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        sum += await this._computePlaintextTreeBytes(full);
      } else if (st.isFile()) {
        const hdr = await vaultCrypto.readEncryptedHeader(full).catch(() => null);
        sum += hdr ? hdr.plaintextSize : st.size;
      }
    }
    return sum;
  }

  _resolveExistingEntry(tenant, relPath) {
    if (!relPath) {
      return { fullPath: tenant.userRoot, isRoot: true };
    }
    const primary = tenant.resolveSafePath(relPath, { forWrite: false });
    if (fs.existsSync(primary)) {
      return { fullPath: primary, isRoot: false };
    }
    const dirs = tenant.resolveListingDirs(relPath);
    for (const d of dirs) {
      if (d?.dirPath && fs.existsSync(d.dirPath)) {
        return { fullPath: d.dirPath, isRoot: false };
      }
    }
    // Check secondary pool volumes
    const pool = this.getVolumesPool();
    const storageDir = this.getStorageDir();
    if (Array.isArray(pool) && pool.length > 1 && storageDir) {
      const nsSub = path.relative(storageDir, tenant.userRoot);
      for (const vol of pool) {
        if (!vol.online || path.resolve(vol.rootDir) === path.resolve(storageDir)) continue;
        const candidate = path.join(vol.rootDir, nsSub, relPath);
        if (fs.existsSync(candidate)) {
          return { fullPath: candidate, isRoot: false };
        }
      }
    }
    return null;
  }

  async _cleanupSecondaryVolumes(tenant, relPath) {
    const pool = this.getVolumesPool();
    const storageDir = this.getStorageDir();
    if (!Array.isArray(pool) || pool.length <= 1 || !storageDir || !relPath) return;
    const nsSub = path.relative(storageDir, tenant.userRoot);
    for (const vol of pool) {
      if (!vol.online || path.resolve(vol.rootDir) === path.resolve(storageDir)) continue;
      const extraTarget = path.join(vol.rootDir, nsSub, relPath);
      if (fs.existsSync(extraTarget)) {
        await fs.promises.rm(extraTarget, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  _buildPropstatXml(relPath, name, info) {
    const isDir = info.st.isDirectory();
    const href = this._buildHref(relPath, isDir);
    const displayName = name || (isDir ? 'Cofre' : path.basename(relPath));
    const modified = toRfc1123Date(info.st.mtime);
    const created = toIsoDate(info.st.birthtimeMs > 0 ? info.st.birthtime : info.st.mtime);
    const etag = computeEtag(info.st, info.plaintextSize);

    let propXml = `
      <D:displayname>${escapeXml(displayName)}</D:displayname>
      <D:creationdate>${escapeXml(created)}</D:creationdate>
      <D:getlastmodified>${escapeXml(modified)}</D:getlastmodified>
      <D:getetag>${escapeXml(etag)}</D:getetag>`;

    if (isDir) {
      propXml += `
      <D:resourcetype><D:collection/></D:resourcetype>`;
    } else {
      propXml += `
      <D:resourcetype/>
      <D:getcontentlength>${info.plaintextSize}</D:getcontentlength>
      <D:getcontenttype>${escapeXml(this.getMimeType(displayName))}</D:getcontenttype>`;
    }

    return `
  <D:response>
    <D:href>${escapeXml(href)}</D:href>
    <D:propstat>
      <D:prop>${propXml}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
  }

  _parseDestinationHeader(req) {
    const destHeader = req.headers.destination;
    if (!destHeader || typeof destHeader !== 'string') {
      return { ok: false, status: 400, error: 'Cabeçalho Destination obrigatório.' };
    }
    let pathname = destHeader.trim();
    if (/^https?:\/\//i.test(pathname)) {
      let parsed;
      try {
        parsed = new URL(pathname);
      } catch {
        return { ok: false, status: 400, error: 'URL Destination malformada.' };
      }
      const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
      const destHost = parsed.host.toLowerCase();
      const trustedHost =
        (reqHost && destHost === reqHost) ||
        (this.allowedOriginHosts && this.allowedOriginHosts.has(parsed.hostname.toLowerCase()));
      if (!trustedHost) {
        return { ok: false, status: 502, error: 'Destination aponta para host externo não confiável.' };
      }
      pathname = parsed.pathname;
    }
    if (!pathname.startsWith(this.basePath)) {
      return { ok: false, status: 502, error: 'Destination fora do escopo WebDAV do Cofre.' };
    }
    return decodeWebdavRelPath(pathname, this.basePath);
  }

  async _copyOrMoveFileSingle(srcFull, srcRel, destFull, destRel, tenant, isMove) {
    const isDestPortfolio = tenant.scopeType !== 'org' && this.isPortfolioRelatedRelPath(destRel);
    const hdr = await vaultCrypto.readEncryptedHeader(srcFull).catch(() => null);
    const srcIsEncrypted = Boolean(hdr);
    const destShouldEncrypt = !isDestPortfolio && vaultCrypto.isEncryptionEnabled();

    await fs.promises.mkdir(path.dirname(destFull), { recursive: true });

    if (srcIsEncrypted === destShouldEncrypt) {
      if (isMove) {
        try {
          await fs.promises.rename(srcFull, destFull);
        } catch (err) {
          if (err && err.code === 'EXDEV') {
            const tmpDest = path.join(path.dirname(destFull), `.aurt_tmp_mv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
            await fs.promises.copyFile(srcFull, tmpDest);
            await this.moveFileSafe(tmpDest, destFull);
            await fs.promises.unlink(srcFull);
          } else {
            throw err;
          }
        }
      } else {
        const tmpDest = path.join(path.dirname(destFull), `.aurt_tmp_cp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
        await fs.promises.copyFile(srcFull, tmpDest);
        await this.moveFileSafe(tmpDest, destFull);
      }
      return;
    }

    // Cruzamento de fronteira Portfolio (plaintext) <-> Cofre (AURTENC2)
    if (!srcIsEncrypted && destShouldEncrypt) {
      await vaultCrypto.encryptFileAtomic(srcFull, destFull, tenant.ownerNs);
      if (isMove) await fs.promises.unlink(srcFull).catch(() => {});
      return;
    }

    // Encrypted -> Plaintext
    const stagingDir = this.getStagingDir();
    const tmpPlain = path.join(stagingDir, `.aurt_tmp_dec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    await fs.promises.mkdir(stagingDir, { recursive: true });
    try {
      await new Promise((resolve, reject) => {
        const decStream = vaultCrypto.createDecryptStream(srcFull, tenant.ownerNs);
        const ws = fs.createWriteStream(tmpPlain);
        decStream.on('error', reject);
        ws.on('error', reject);
        ws.on('finish', resolve);
        decStream.pipe(ws);
      });
      await this.moveFileSafe(tmpPlain, destFull);
      if (isMove) await fs.promises.unlink(srcFull).catch(() => {});
    } catch (err) {
      await fs.promises.unlink(tmpPlain).catch(() => {});
      throw err;
    }
  }

  async _copyOrMoveEntryRecursive(srcFull, srcRel, destFull, destRel, tenant, isMove) {
    const st = await fs.promises.lstat(srcFull);
    if (st.isSymbolicLink()) {
      const err = new Error('Symlinks não são permitidos.');
      err.statusCode = 403;
      throw err;
    }
    if (!st.isDirectory()) {
      await this._copyOrMoveFileSingle(srcFull, srcRel, destFull, destRel, tenant, isMove);
      return;
    }

    await fs.promises.mkdir(destFull, { recursive: true });
    const entries = await fs.promises.readdir(srcFull, { withFileTypes: true }).catch(() => []);
    for (const d of entries) {
      if (isServerControlEntry(d.name, false)) continue;
      const childSrcFull = path.join(srcFull, d.name);
      const childDestFull = path.join(destFull, d.name);
      const childSrcRel = `${srcRel}/${d.name}`;
      const childDestRel = `${destRel}/${d.name}`;
      await this._copyOrMoveEntryRecursive(childSrcFull, childSrcRel, childDestFull, childDestRel, tenant, isMove);
    }
    if (isMove) {
      await fs.promises.rm(srcFull, { recursive: true, force: true }).catch(() => {});
    }
  }

  middleware() {
    return async (req, res, next) => {
      const reqPathname = (req.originalUrl || req.url || '').split('?')[0];
      if (!reqPathname.startsWith(this.basePath)) {
        return next();
      }

      // Sem timeout de 5 min do Node para transferências grandes; evita compressão gzip/br sobre streams WebDAV
      try { req.setTimeout(0); } catch {}
      try { res.setTimeout(0); } catch {}
      delete req.headers['accept-encoding'];
      res.setHeader('Cache-Control', 'no-transform');

      const clientIp = extractClientIpForRateLimit(req);
      const authHeader = String(req.headers.authorization || '');
      if (!authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Aurtistic Cofre WebDAV"');
        return res.status(401).send('Autenticação WebDAV necessária.');
      }

      let tokenId = '';
      let secret = '';
      try {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx !== -1) {
          tokenId = decoded.slice(0, colonIdx).trim();
          secret = decoded.slice(colonIdx + 1);
        }
      } catch {}

      const authRes = await this.tokenManager.verifyBasicCredentials(tokenId, secret, clientIp);
      if (!authRes.ok) {
        if (authRes.status === 401) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Aurtistic Cofre WebDAV"');
        }
        return res.status(authRes.status || 401).send(authRes.error || 'Não autorizado.');
      }

      const tenant = this.buildTenantContext(authRes);
      const parsedPath = decodeWebdavRelPath(reqPathname, this.basePath);
      if (!parsedPath.ok) {
        return res.status(parsedPath.status).send('Caminho WebDAV inválido.');
      }
      const relPath = parsedPath.relPath;
      const method = req.method.toUpperCase();

      try {
        if (method === 'OPTIONS') {
          res.setHeader('DAV', '1, 2');
          res.setHeader('MS-Author-Via', 'DAV');
          res.setHeader('Allow', 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
          return res.status(200).end();
        }

        // 2. PROPFIND
        if (method === 'PROPFIND') {
          await readXmlBodyLimited(req);
          const rawDepth = String(req.headers.depth || '1').toLowerCase().trim();
          if (rawDepth === 'infinity') {
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            return res.status(403).send('<?xml version="1.0" encoding="utf-8"?><D:error xmlns:D="DAV:"><D:propfind-finite-depth/></D:error>');
          }
          if (this._hasLockedPin(tenant, relPath, false)) {
            return res.status(423).send('Pasta protegida por PIN.');
          }

          const existing = this._resolveExistingEntry(tenant, relPath);
          if (!existing) {
            return res.status(404).end();
          }

          const rootInfo = await this._getPlaintextSizeAndStat(existing.fullPath);
          if (rootInfo.isSymlink) return res.status(404).end();

          let responses = this._buildPropstatXml(
            relPath,
            relPath ? path.posix.basename(relPath) : (tenant.orgSlug ? `Cofre-${tenant.orgSlug}` : 'Cofre-Pessoal'),
            rootInfo
          );

          if (rootInfo.st.isDirectory() && rawDepth !== '0') {
            const seenNames = new Set();
            const isPortfolioDir = tenant.scopeType !== 'org' && this.isPortfolioRelatedRelPath(relPath);
            const dirsToList = relPath
              ? tenant.resolveListingDirs(relPath)
              : [{ dirPath: tenant.userRoot, isLegacyBridge: false }];

            // Pool multi-volume
            const pool = this.getVolumesPool();
            const storageDir = this.getStorageDir();
            if (Array.isArray(pool) && pool.length > 1 && storageDir) {
              const nsSub = path.relative(storageDir, tenant.userRoot);
              for (const vol of pool) {
                if (!vol.online || path.resolve(vol.rootDir) === path.resolve(storageDir)) continue;
                const extraDir = relPath ? path.join(vol.rootDir, nsSub, relPath) : path.join(vol.rootDir, nsSub);
                if (fs.existsSync(extraDir) && !dirsToList.some((d) => path.resolve(d.dirPath) === path.resolve(extraDir))) {
                  dirsToList.push({ dirPath: extraDir, isLegacyBridge: false });
                }
              }
            }

            // Ponte virtual Portfolio na raiz do Admin pessoal
            if (!relPath && tenant.scopeType !== 'org' && tenant.role === 'admin') {
              const portCheck = tenant.resolveListingDirs('Portfolio');
              if (portCheck && portCheck.length > 0 && fs.existsSync(portCheck[0].dirPath) && !fs.existsSync(path.join(tenant.userRoot, 'Portfolio'))) {
                try {
                  const pInfo = await this._getPlaintextSizeAndStat(portCheck[0].dirPath);
                  if (!pInfo.isSymlink) {
                    seenNames.add('Portfolio');
                    responses += this._buildPropstatXml('Portfolio', 'Portfolio', pInfo);
                  }
                } catch {}
              }
            }

            for (const { dirPath } of dirsToList) {
              const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true }).catch(() => []);
              for (const d of dirents) {
                if (seenNames.has(d.name) || isServerControlEntry(d.name, isPortfolioDir)) continue;
                const childFull = path.join(dirPath, d.name);
                const childRel = relPath ? `${relPath}/${d.name}` : d.name;
                if (this._hasLockedPin(tenant, childRel, false)) continue;
                try {
                  const childInfo = await this._getPlaintextSizeAndStat(childFull);
                  if (childInfo.isSymlink) continue;
                  seenNames.add(d.name);
                  responses += this._buildPropstatXml(childRel, d.name, childInfo);
                } catch {}
              }
            }
          }

          const xml = `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">${responses}\n</D:multistatus>`;
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          return res.status(207).send(xml);
        }

        // 3. HEAD & GET
        if (method === 'HEAD' || method === 'GET') {
          if (this._hasLockedPin(tenant, relPath, false)) {
            return res.status(423).send('Recurso protegido por PIN.');
          }
          const existing = this._resolveExistingEntry(tenant, relPath);
          if (!existing) return res.status(404).end();
          const info = await this._getPlaintextSizeAndStat(existing.fullPath);
          if (info.isSymlink) return res.status(404).end();

          if (info.st.isDirectory()) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            if (method === 'HEAD') return res.status(200).end();
            return res.status(200).send(`<html><body><h1>${escapeXml(relPath || '/')}</h1></body></html>`);
          }

          const fileSize = info.plaintextSize;
          const etag = computeEtag(info.st, fileSize);
          res.setHeader('ETag', etag);
          res.setHeader('Last-Modified', toRfc1123Date(info.st.mtime));
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', this.getMimeType(path.basename(existing.fullPath)));
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', 'sandbox');

          if (method === 'HEAD') {
            res.setHeader('Content-Length', String(fileSize));
            return res.status(200).end();
          }

          if (info.isEncrypted) {
            try {
              vaultCrypto.getMasterKey();
            } catch (keyErr) {
              return res.status(503).send(keyErr.message);
            }
          }

          const rangeHeader = req.headers.range;
          let stream;
          if (rangeHeader) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
            if (!match) {
              res.setHeader('Content-Range', `bytes */${fileSize}`);
              return res.status(416).end();
            }
            let start = match[1] ? parseInt(match[1], 10) : 0;
            let end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
            if (!match[1] && match[2]) {
              const suffixLen = parseInt(match[2], 10);
              start = Math.max(0, fileSize - suffixLen);
              end = fileSize - 1;
            }
            if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
              res.setHeader('Content-Range', `bytes */${fileSize}`);
              return res.status(416).end();
            }
            end = Math.min(end, fileSize - 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', String(end - start + 1));
            stream = info.isEncrypted
              ? vaultCrypto.createDecryptStream(existing.fullPath, tenant.ownerNs, start, end)
              : fs.createReadStream(existing.fullPath, { start, end, highWaterMark: 64 * 1024 });
          } else {
            res.status(200);
            res.setHeader('Content-Length', String(fileSize));
            stream = info.isEncrypted
              ? vaultCrypto.createDecryptStream(existing.fullPath, tenant.ownerNs)
              : fs.createReadStream(existing.fullPath, { highWaterMark: 64 * 1024 });
          }

          const destroyStream = () => {
            try { stream.destroy(); } catch {}
          };
          req.on('aborted', destroyStream);
          res.on('close', destroyStream);
          stream.on('error', () => {
            if (!res.headersSent) res.status(500).end();
            else res.destroy();
          });
          return stream.pipe(res);
        }

        // 4. PUT (chunked + staging externo >= 2.1x + cota concorrente + AURTENC2 atômico)
        if (method === 'PUT') {
          if (tenant.readOnly || tenant.quotaLimitBytes <= 0) {
            return res.status(403).send('Sem permissão de escrita.');
          }
          if (!relPath) return res.status(405).end();
          if (this._hasLockedPin(tenant, relPath, false)) {
            return res.status(423).send('Pasta protegida por PIN.');
          }
          this._assertLockSatisfied(req, tenant, relPath);

          if (!this.isExternalStorageMounted() || !this.isStagingOnExternalStorage()) {
            return res.status(507).send('HD Externo não montado ou staging indisponível.');
          }

          const stagingDir = this.getStagingDir();
          await fs.promises.mkdir(stagingDir, { recursive: true });
          const targetPath = tenant.resolveSafePath(relPath, { forWrite: true });
          const existing = this._resolveExistingEntry(tenant, relPath);
          let prevPlaintextSize = 0;
          let existingExisted = false;
          if (existing) {
            const exInfo = await this._getPlaintextSizeAndStat(existing.fullPath).catch(() => null);
            if (exInfo?.st?.isDirectory()) return res.status(409).send('Destino é um diretório.');
            if (exInfo && !exInfo.isSymlink) {
              prevPlaintextSize = exInfo.plaintextSize;
              existingExisted = true;
            }
          }

          const declaredLen = req.headers['content-length'] ? Number(req.headers['content-length']) : null;
          const currentUsed = await tenant.getUsedBytes();

          const checkCapacity = (inFlightDelta) => {
            const reservedTotal = this.inFlightReservedBytes.get(tenant.pinNamespaceId) || 0;
            const projectedUsed = currentUsed - prevPlaintextSize + reservedTotal;
            if (projectedUsed > tenant.quotaLimitBytes) {
              return 'Limite de cota do Cofre excedido.';
            }
            const diskCap = this.getDiskCapacitySync(stagingDir);
            const requiredFree = Math.ceil(inFlightDelta * 2.1) + this.minSafetyBufferBytes;
            if (diskCap && typeof diskCap.freeBytes === 'number' && diskCap.freeBytes < requiredFree) {
              return 'Espaço livre insuficiente no disco externo (margem de segurança 2.1x).';
            }
            return null;
          };

          let reservedAdded = 0;
          if (declaredLen !== null && !Number.isNaN(declaredLen) && declaredLen >= 0) {
            this._addReservedBytes(tenant.pinNamespaceId, declaredLen);
            reservedAdded = declaredLen;
            const capErr = checkCapacity(declaredLen);
            if (capErr) {
              this._addReservedBytes(tenant.pinNamespaceId, -reservedAdded);
              return res.status(507).send(capErr);
            }
          }

          const stagingPath = path.join(stagingDir, `.aurt_tmp_wd_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`);
          let bytesWritten = 0;
          let abortedOrFailed = false;
          let lastCapCheckBytes = 0;

          try {
            await new Promise((resolve, reject) => {
              const ws = fs.createWriteStream(stagingPath);
              const failWith = (status, msg) => {
                if (abortedOrFailed) return;
                abortedOrFailed = true;
                req.unpipe(ws);
                ws.destroy();
                const err = new Error(msg);
                err.statusCode = status;
                reject(err);
              };

              req.on('aborted', () => failWith(499, 'Upload abortado pelo cliente.'));
              ws.on('error', (err) => failWith(500, err.message));
              ws.on('finish', resolve);

              req.on('data', (chunk) => {
                if (abortedOrFailed) return;
                bytesWritten += chunk.length;
                if (declaredLen === null) {
                  this._addReservedBytes(tenant.pinNamespaceId, chunk.length);
                  reservedAdded += chunk.length;
                }
                if (bytesWritten - lastCapCheckBytes >= 262144 || (declaredLen !== null && bytesWritten > declaredLen)) {
                  lastCapCheckBytes = bytesWritten;
                  const capErr = checkCapacity(bytesWritten);
                  if (capErr) failWith(507, capErr);
                }
              });

              req.pipe(ws);
            });

            // Checagem final pós-streaming
            const finalCapErr = checkCapacity(bytesWritten);
            if (finalCapErr) {
              const err = new Error(finalCapErr);
              err.statusCode = 507;
              throw err;
            }

            const isPortfolio = tenant.scopeType !== 'org' && this.isPortfolioRelatedRelPath(relPath);
            await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
            if (!isPortfolio && vaultCrypto.isEncryptionEnabled()) {
              await vaultCrypto.encryptFileAtomic(stagingPath, targetPath, tenant.ownerNs);
              await fs.promises.unlink(stagingPath).catch(() => {});
            } else {
              await this.moveFileSafe(stagingPath, targetPath);
            }

            await this._cleanupSecondaryVolumes(tenant, relPath);
            const totalUsedBytes = await tenant.adjustUsedBytes(bytesWritten - prevPlaintextSize);
            await this.invalidateThumb(tenant.pinNamespaceId, relPath);
            this.queueThumb(tenant.pinNamespaceId, relPath, targetPath);
            if (isPortfolio) this.onPortfolioMutated();

            void Promise.resolve(
              this.onUploadCompleted({
                tenant,
                action: 'upsert',
                relPath,
                item: {
                  name: path.basename(relPath),
                  relativePath: relPath,
                  mimeType: this.getMimeType(path.basename(relPath)),
                  sizeBytes: bytesWritten,
                  isDirectory: false,
                  hasPin: false,
                },
                totalUsedBytes,
              })
            ).catch(() => {});

            const finalSt = await fs.promises.stat(targetPath);
            res.setHeader('ETag', computeEtag(finalSt, bytesWritten));
            return res.status(existingExisted ? 204 : 201).end();
          } catch (putErr) {
            await fs.promises.unlink(stagingPath).catch(() => {});
            if (putErr.statusCode === 499) return;
            throw putErr;
          } finally {
            if (reservedAdded > 0) {
              this._addReservedBytes(tenant.pinNamespaceId, -reservedAdded);
            }
          }
        }

        // 5. MKCOL
        if (method === 'MKCOL') {
          if (tenant.readOnly || tenant.quotaLimitBytes <= 0) {
            return res.status(403).send('Sem permissão de escrita.');
          }
          if (!relPath) return res.status(405).end();
          const contentLen = Number(req.headers['content-length'] || 0);
          if (contentLen > 0) return res.status(415).send('Corpo não suportado em MKCOL.');
          if (this._hasLockedPin(tenant, relPath, false)) return res.status(423).send('Pasta protegida por PIN.');
          this._assertLockSatisfied(req, tenant, relPath);

          const targetDir = tenant.resolveSafePath(relPath, { forWrite: true });
          if (fs.existsSync(targetDir)) return res.status(405).send('Já existe.');
          const parentDir = path.dirname(targetDir);
          if (!fs.existsSync(parentDir)) return res.status(409).send('Diretório pai inexistente.');

          await fs.promises.mkdir(targetDir);
          if (tenant.scopeType !== 'org' && this.isPortfolioRelatedRelPath(relPath)) {
            this.onPortfolioMutated();
          }
          return res.status(201).end();
        }

        // 6. DELETE (sempre para .trash + bloqueio PIN recursivo + proteção raiz /Portfolio)
        if (method === 'DELETE') {
          if (tenant.readOnly || tenant.quotaLimitBytes <= 0) {
            return res.status(403).send('Sem permissão de exclusão.');
          }
          if (!relPath || relPath.toLowerCase() === 'portfolio') {
            return res.status(403).send('Não é permitido remover a raiz do Cofre ou Portfolio.');
          }
          if (this._hasLockedPin(tenant, relPath, true)) {
            return res.status(423).send('Operação bloqueada: pasta ou subpasta protegida por PIN.');
          }
          this._assertLockSatisfied(req, tenant, relPath);

          const existing = this._resolveExistingEntry(tenant, relPath);
          if (!existing) return res.status(404).end();
          const info = await this._getPlaintextSizeAndStat(existing.fullPath);
          if (info.isSymlink) return res.status(403).send('Symlinks não são permitidos.');

          const entryBytes = info.st.isDirectory()
            ? await this._computePlaintextTreeBytes(existing.fullPath)
            : info.plaintextSize;

          const { trashDir } = this.getTenantTrashDirAndManifest(tenant.userRoot);
          await fs.promises.mkdir(trashDir, { recursive: true });
          const trashId = `tr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
          const baseName = path.basename(existing.fullPath);
          const storedName = `${trashId}_${baseName}`;
          const trashDest = path.join(trashDir, storedName);

          if (info.st.isDirectory()) {
            await this.renameDirectorySafeFAT32(existing.fullPath, trashDest);
            if (fs.existsSync(existing.fullPath)) {
              await fs.promises.rm(existing.fullPath, { recursive: true, force: true }).catch(() => {});
            }
          } else {
            await this.moveFileSafe(existing.fullPath, trashDest);
          }

          await this._cleanupSecondaryVolumes(tenant, relPath);
          const manifest = await this.readTenantTrashManifest(tenant.userRoot);
          manifest.unshift({
            trashId,
            storedName,
            name: baseName,
            originalRelativePath: relPath,
            isDirectory: info.st.isDirectory(),
            sizeBytes: entryBytes,
            mimeType: info.st.isDirectory() ? 'inode/directory' : this.getMimeType(baseName),
            deletedAt: new Date().toISOString(),
          });
          await this.writeTenantTrashManifest(tenant.userRoot, manifest);
          await this.invalidateThumb(tenant.pinNamespaceId, relPath);
          const totalUsedBytes = await tenant.getUsedBytes(true);
          if (tenant.scopeType !== 'org' && this.isPortfolioRelatedRelPath(relPath)) {
            this.onPortfolioMutated();
          }
          void Promise.resolve(
            this.onUploadCompleted({
              tenant,
              action: 'delete',
              relPath,
              totalUsedBytes,
            })
          ).catch(() => {});
          return res.status(204).end();
        }

        // 7. MOVE & COPY
        if (method === 'MOVE' || method === 'COPY') {
          if (tenant.readOnly || tenant.quotaLimitBytes <= 0) {
            return res.status(403).send('Sem permissão de escrita.');
          }
          if (!relPath || (method === 'MOVE' && relPath.toLowerCase() === 'portfolio')) {
            return res.status(403).send('Operação não permitida na raiz.');
          }

          const destParsed = this._parseDestinationHeader(req);
          if (!destParsed.ok) {
            return res.status(destParsed.status || 400).send(destParsed.error || 'Destination inválido.');
          }
          const destRel = destParsed.relPath;
          if (!destRel || destRel === relPath || destRel.startsWith(`${relPath}/`)) {
            return res.status(403).send('Destino inválido.');
          }

          // Verificação recursiva de PIN na origem E no destino
          if (this._hasLockedPin(tenant, relPath, true) || this._hasLockedPin(tenant, destRel, true)) {
            return res.status(423).send('Operação bloqueada: origem ou destino protegido por PIN.');
          }
          if (method === 'MOVE') this._assertLockSatisfied(req, tenant, relPath);
          this._assertLockSatisfied(req, tenant, destRel);

          const srcExisting = this._resolveExistingEntry(tenant, relPath);
          if (!srcExisting) return res.status(404).end();
          const srcInfo = await this._getPlaintextSizeAndStat(srcExisting.fullPath);
          if (srcInfo.isSymlink) return res.status(403).send('Symlinks não são permitidos.');

          const overwriteHeader = String(req.headers.overwrite || 'T').toUpperCase().trim();
          const destTarget = tenant.resolveSafePath(destRel, { forWrite: true });
          const destExisting = this._resolveExistingEntry(tenant, destRel);
          const destExisted = Boolean(destExisting);
          if (destExisted && overwriteHeader === 'F') {
            return res.status(412).send('Destino já existe e Overwrite=F.');
          }

          const srcBytes = srcInfo.st.isDirectory()
            ? await this._computePlaintextTreeBytes(srcExisting.fullPath)
            : srcInfo.plaintextSize;

          let overwrittenBytes = 0;
          if (destExisted) {
            const dInfo = await this._getPlaintextSizeAndStat(destExisting.fullPath);
            overwrittenBytes = dInfo.st.isDirectory()
              ? await this._computePlaintextTreeBytes(destExisting.fullPath)
              : dInfo.plaintextSize;
          }

          if (method === 'COPY') {
            const used = await tenant.getUsedBytes();
            const delta = srcBytes - overwrittenBytes;
            if (delta > 0 && used + delta > tenant.quotaLimitBytes) {
              return res.status(507).send('Limite de cota excedido para COPY.');
            }
          }

          if (destExisted) {
            await fs.promises.rm(destExisting.fullPath, { recursive: true, force: true }).catch(() => {});
            await this._cleanupSecondaryVolumes(tenant, destRel);
          }

          await this._copyOrMoveEntryRecursive(
            srcExisting.fullPath,
            relPath,
            destTarget,
            destRel,
            tenant,
            method === 'MOVE'
          );

          if (method === 'MOVE') {
            await this._cleanupSecondaryVolumes(tenant, relPath);
            await this.invalidateThumb(tenant.pinNamespaceId, relPath);
          }
          await this.invalidateThumb(tenant.pinNamespaceId, destRel);

          // Regra explícita de cota (especialmente fronteira Portfolio <-> Cofre)
          let totalUsedBytes;
          if (method === 'COPY') {
            totalUsedBytes = await tenant.adjustUsedBytes(srcBytes - overwrittenBytes);
          } else {
            totalUsedBytes = await tenant.getUsedBytes(true);
          }

          if (
            tenant.scopeType !== 'org' &&
            (this.isPortfolioRelatedRelPath(relPath) || this.isPortfolioRelatedRelPath(destRel))
          ) {
            this.onPortfolioMutated();
          }
          if (method === 'MOVE') {
            void Promise.resolve(
              this.onUploadCompleted({
                tenant,
                action: 'delete',
                relPath,
                totalUsedBytes,
              })
            ).catch(() => {});
          }
          if (!srcInfo.st.isDirectory()) {
            void Promise.resolve(
              this.onUploadCompleted({
                tenant,
                action: 'upsert',
                relPath: destRel,
                item: {
                  name: path.basename(destRel),
                  relativePath: destRel,
                  mimeType: this.getMimeType(path.basename(destRel)),
                  sizeBytes: srcBytes,
                  isDirectory: false,
                  hasPin: false,
                },
                totalUsedBytes,
              })
            ).catch(() => {});
          }
          return res.status(destExisted ? 204 : 201).end();
        }

        // 8. LOCK / UNLOCK / PROPPATCH
        if (method === 'LOCK') {
          if (tenant.readOnly || tenant.quotaLimitBytes <= 0) {
            return res.status(403).send('Sem permissão de escrita.');
          }
          if (this._hasLockedPin(tenant, relPath, false)) return res.status(423).end();
          await readXmlBodyLimited(req);
          this._pruneLocks();

          const ifTokens = parseIfLockTokens(req.headers.if);
          if (ifTokens.length > 0 && this.locks.has(ifTokens[0])) {
            const refreshed = this.locks.get(ifTokens[0]);
            refreshed.expiresAt = Date.now() + this.lockTtlMs;
            res.setHeader('Lock-Token', `<${refreshed.token}>`);
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            return res.status(200).send(
              `<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock><D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:depth>${escapeXml(refreshed.depth)}</D:depth><D:timeout>Second-${Math.floor(this.lockTtlMs / 1000)}</D:timeout><D:locktoken><D:href>${escapeXml(refreshed.token)}</D:href></D:locktoken></D:activelock></D:lockdiscovery></D:prop>`
            );
          }

          this._assertLockSatisfied(req, tenant, relPath);
          if (this.locks.size >= this.maxLocks) {
            const oldest = this.locks.keys().next().value;
            if (oldest) this.locks.delete(oldest);
          }

          // Cria recurso vazio 0 B se LOCK em recurso ainda inexistente (RFC 4918)
          let createdNew = false;
          if (relPath && !this._resolveExistingEntry(tenant, relPath)) {
            const targetPath = tenant.resolveSafePath(relPath, { forWrite: true });
            await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
            const isPortfolio = tenant.scopeType !== 'org' && this.isPortfolioRelatedRelPath(relPath);
            if (!isPortfolio && vaultCrypto.isEncryptionEnabled()) {
              const stagingDir = this.getStagingDir();
              await fs.promises.mkdir(stagingDir, { recursive: true });
              const emptyStage = path.join(stagingDir, `.aurt_tmp_lock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
              await fs.promises.writeFile(emptyStage, Buffer.alloc(0));
              await vaultCrypto.encryptFileAtomic(emptyStage, targetPath, tenant.ownerNs);
              await fs.promises.unlink(emptyStage).catch(() => {});
            } else {
              await fs.promises.writeFile(targetPath, Buffer.alloc(0));
            }
            createdNew = true;
          }

          const token = `opaquelocktoken:urn:uuid:${crypto.randomUUID()}`;
          const depth = String(req.headers.depth || '0').toLowerCase() === 'infinity' ? 'infinity' : '0';
          this.locks.set(token, {
            token,
            scopeKey: this._getScopeLockKey(tenant),
            relPath,
            depth,
            expiresAt: Date.now() + this.lockTtlMs,
          });

          res.setHeader('Lock-Token', `<${token}>`);
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          return res.status(createdNew ? 201 : 200).send(
            `<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock><D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:depth>${escapeXml(depth)}</D:depth><D:timeout>Second-${Math.floor(this.lockTtlMs / 1000)}</D:timeout><D:locktoken><D:href>${escapeXml(token)}</D:href></D:locktoken></D:activelock></D:lockdiscovery></D:prop>`
          );
        }

        if (method === 'UNLOCK') {
          const lockToken = String(req.headers['lock-token'] || '').replace(/^<|>$/g, '').trim();
          const lockInfo = this.locks.get(lockToken);
          if (!lockInfo || lockInfo.scopeKey !== this._getScopeLockKey(tenant)) {
            return res.status(409).end();
          }
          this.locks.delete(lockToken);
          return res.status(204).end();
        }

        if (method === 'PROPPATCH') {
          if (tenant.readOnly) return res.status(403).end();
          if (this._hasLockedPin(tenant, relPath, false)) return res.status(423).end();
          this._assertLockSatisfied(req, tenant, relPath);
          await readXmlBodyLimited(req);
          const href = this._buildHref(relPath, false);
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          return res.status(207).send(
            `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>${escapeXml(href)}</D:href><D:propstat><D:prop/><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`
          );
        }

        return res.status(405).end();
      } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
          console.error('[WebDAV Error]', { method, path: reqPathname, error: err?.message });
        }
        if (!res.headersSent) {
          return res.status(err.statusCode || 500).send(err.message || 'Erro interno WebDAV.');
        }
      }
    };
  }
}

module.exports = WebdavServer;
