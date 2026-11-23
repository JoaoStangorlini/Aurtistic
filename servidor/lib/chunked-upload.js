// Este programa é um software livre (Licença AGPLv3)
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vaultCrypto = require('./vault-crypto');

const MIN_CHUNK_SIZE = 64 * 1024; // 64 KB
const MAX_CHUNK_SIZE = 32 * 1024 * 1024; // 32 MB (LAN direta)
const DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB (Cloudflare Tunnel HTTPS)
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_RESULT_TTL_MS = 15 * 60 * 1000; // 15 min para idempotência de /complete e /status
const DEFAULT_MIN_SAFETY_BUFFER_BYTES = 30 * 1024 * 1024; // 30 MB
const DEFAULT_MAX_CONCURRENT_SESSIONS_PER_TENANT = 10;
const SESSION_DIR_PREFIX = '.aurt_chunk_';

function isValidUploadId(uploadId) {
  return typeof uploadId === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(uploadId);
}

function isValidSha256Hex(val) {
  return typeof val === 'string' && /^[a-f0-9]{64}$/i.test(val.trim());
}

class ChunkedUploadManager {
  constructor(options = {}) {
    this.getStagingDir = options.getStagingDir;
    this.getStorageDir = options.getStorageDir;
    this.getVolumesPool = options.getVolumesPool || (() => []);
    this.getDiskCapacitySync = options.getDiskCapacitySync;
    this.isExternalStorageMounted = options.isExternalStorageMounted || (() => true);
    this.isStagingOnExternalStorage = options.isStagingOnExternalStorage || (() => true);
    this.normalizeTenantRelPath =
      options.normalizeTenantRelPath ||
      ((p) => String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
    this.sanitizeFilename = options.sanitizeFilename || ((n) => path.basename(String(n || 'arquivo')));
    this.isPortfolioRelatedRelPath = options.isPortfolioRelatedRelPath || (() => false);
    this.assertFolderPinUnlockedIfRequired = options.assertFolderPinUnlockedIfRequired || (() => {});
    this.assertPublicMediaPathAllowed = options.assertPublicMediaPathAllowed || (() => {});
    this.buildTenantEntryDescriptorAsync = options.buildTenantEntryDescriptorAsync;
    this.computeFileSha256 = options.computeFileSha256;
    this.invalidateThumb = options.invalidateThumb || (() => Promise.resolve());
    this.queueThumb = options.queueThumb || (() => {});
    this.onPortfolioMutated = options.onPortfolioMutated || (() => {});
    this.onUploadCompleted = options.onUploadCompleted || (() => {});
    this.primaryAdminUuid = options.primaryAdminUuid || 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';

    this.sessionTtlMs =
      Number.isFinite(Number(options.sessionTtlMs)) && Number(options.sessionTtlMs) > 0
        ? Number(options.sessionTtlMs)
        : DEFAULT_SESSION_TTL_MS;
    this.resultTtlMs =
      Number.isFinite(Number(options.resultTtlMs)) && Number(options.resultTtlMs) > 0
        ? Number(options.resultTtlMs)
        : DEFAULT_RESULT_TTL_MS;
    this.minSafetyBufferBytes =
      Number.isFinite(Number(options.minSafetyBufferBytes)) && Number(options.minSafetyBufferBytes) >= 0
        ? Number(options.minSafetyBufferBytes)
        : DEFAULT_MIN_SAFETY_BUFFER_BYTES;
    this.maxConcurrentSessionsPerTenant =
      Number.isFinite(Number(options.maxConcurrentSessionsPerTenant)) &&
      Number(options.maxConcurrentSessionsPerTenant) > 0
        ? Number(options.maxConcurrentSessionsPerTenant)
        : DEFAULT_MAX_CONCURRENT_SESSIONS_PER_TENANT;

    this.sessions = new Map();
    this.inFlightReservedBytes = new Map();
    this.completingIds = new Set();
    this.completedResults = new Map();
    this.failedResults = new Map();
  }

  _addReservedBytes(pinNamespaceId, delta) {
    if (!pinNamespaceId || !delta) return 0;
    const prev = this.inFlightReservedBytes.get(pinNamespaceId) || 0;
    const next = Math.max(0, prev + delta);
    if (next === 0) this.inFlightReservedBytes.delete(pinNamespaceId);
    else this.inFlightReservedBytes.set(pinNamespaceId, next);
    return next;
  }

  getReservedBytesForTenant(pinNamespaceId) {
    return this.inFlightReservedBytes.get(pinNamespaceId) || 0;
  }

  getTotalReservedBytes() {
    let sum = 0;
    for (const v of this.inFlightReservedBytes.values()) sum += v;
    return sum;
  }

  _countActiveSessionsForTenant(pinNamespaceId) {
    let count = 0;
    for (const sess of this.sessions.values()) {
      if (sess.pinNamespaceId === pinNamespaceId) count++;
    }
    return count;
  }

  _getSessionDir(uploadId) {
    return path.join(this.getStagingDir(), `${SESSION_DIR_PREFIX}${uploadId}`);
  }

  _getSessionMetaPath(uploadId) {
    return path.join(this._getSessionDir(uploadId), 'session.json');
  }

  async _persistSession(session) {
    const metaPath = this._getSessionMetaPath(session.uploadId);
    const tmpPath = `${metaPath}.tmp`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(session), { mode: 0o600 });
    await fs.promises.rename(tmpPath, metaPath);
  }

  async _loadSession(uploadId) {
    if (!isValidUploadId(uploadId)) return null;
    const cached = this.sessions.get(uploadId);
    if (cached) return cached;

    const metaPath = this._getSessionMetaPath(uploadId);
    try {
      const raw = await fs.promises.readFile(metaPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.uploadId !== uploadId) return null;
      if (parsed.state === 'finalizing' && !this.completingIds.has(uploadId)) {
        parsed.state = 'uploading';
      }
      this.sessions.set(uploadId, parsed);
      if (parsed.reservedBytes > 0 && parsed.pinNamespaceId) {
        this._addReservedBytes(parsed.pinNamespaceId, parsed.reservedBytes);
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async _releaseAndRemoveSession(sessionOrId) {
    const session =
      typeof sessionOrId === 'string'
        ? await this._loadSession(sessionOrId)
        : sessionOrId;
    const uploadId = typeof sessionOrId === 'string' ? sessionOrId : sessionOrId?.uploadId;
    if (session && session.reservedBytes > 0 && !session._released) {
      session._released = true;
      this._addReservedBytes(session.pinNamespaceId, -session.reservedBytes);
    }
    if (uploadId) {
      this.sessions.delete(uploadId);
      const dir = this._getSessionDir(uploadId);
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Varre sessões expiradas (TTL ultrapassado) ou órfãs no staging, reidratando
   * sessões válidas pós-reboot e liberando `inFlightReservedBytes` de expiradas.
   */
  async sweepExpiredSessions(now = Date.now()) {
    let cleaned = 0;

    for (const [id, entry] of this.completedResults.entries()) {
      if (entry.expiresAt <= now) this.completedResults.delete(id);
    }
    for (const [id, entry] of this.failedResults.entries()) {
      if (entry.expiresAt <= now) this.failedResults.delete(id);
    }

    // 1. Limpar sessões em memória expiradas
    for (const [uploadId, sess] of Array.from(this.sessions.entries())) {
      if (this.completingIds.has(uploadId)) continue;
      if (Number(sess.expiresAt) <= now) {
        await this._releaseAndRemoveSession(sess);
        cleaned++;
      }
    }

    // 2. Varrer diretórios no staging (reidratação pós-reinício e remoção de expiradas)
    const stagingDir = this.getStagingDir();
    if (!stagingDir || !fs.existsSync(stagingDir)) return { cleaned };

    const entries = await fs.promises.readdir(stagingDir, { withFileTypes: true }).catch(() => []);
    for (const ent of entries) {
      if (!ent.isDirectory() || !ent.name.startsWith(SESSION_DIR_PREFIX)) continue;
      const uploadId = ent.name.slice(SESSION_DIR_PREFIX.length);
      if (this.completingIds.has(uploadId)) continue;

      const sessionDir = path.join(stagingDir, ent.name);
      const metaPath = path.join(sessionDir, 'session.json');
      try {
        const raw = await fs.promises.readFile(metaPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || Number(parsed.expiresAt) <= now) {
          if (this.sessions.has(uploadId)) {
            await this._releaseAndRemoveSession(this.sessions.get(uploadId));
          } else {
            await fs.promises.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
          }
          cleaned++;
        } else if (!this.sessions.has(uploadId)) {
          // Se havia uma finalização interrompida por queda/reboot, volta para uploading
          if (parsed.state === 'finalizing') {
            parsed.state = 'uploading';
            await this._persistSession(parsed).catch(() => {});
          }
          this.sessions.set(uploadId, parsed);
          if (parsed.reservedBytes > 0 && parsed.pinNamespaceId) {
            this._addReservedBytes(parsed.pinNamespaceId, parsed.reservedBytes);
          }
        }
      } catch {
        const st = await fs.promises.stat(sessionDir).catch(() => null);
        if (st && st.mtimeMs + this.sessionTtlMs <= now) {
          await fs.promises.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
          cleaned++;
        }
      }
    }
    return { cleaned };
  }

  async _getExistingPlaintextBytes(tenant, relPath) {
    const primaryPath = tenant.resolveSafePath(relPath, { forWrite: true });
    const candidates = [primaryPath];
    const pool = this.getVolumesPool();
    const storageDir = this.getStorageDir();
    if (Array.isArray(pool) && pool.length > 1 && storageDir) {
      const nsSub = path.relative(storageDir, tenant.userRoot);
      for (const vol of pool) {
        if (!vol.online || path.resolve(vol.rootDir) === path.resolve(storageDir)) continue;
        const volRoot = vol.rootDir || vol.tenantBaseDir;
        candidates.push(path.join(volRoot, nsSub, relPath));
      }
    }
    for (const cand of candidates) {
      try {
        const st = await fs.promises.stat(cand);
        if (st.isDirectory()) {
          const err = new Error('Destino já existe como diretório.');
          err.statusCode = 409;
          throw err;
        }
        if (st.isFile()) {
          const hdr = await vaultCrypto.readEncryptedHeader(cand).catch(() => null);
          return hdr ? hdr.plaintextSize : st.size;
        }
      } catch (err) {
        if (err && err.statusCode === 409) throw err;
      }
    }
    return 0;
  }

  async _cleanupSecondaryVolumes(tenant, relPath) {
    const pool = this.getVolumesPool();
    const storageDir = this.getStorageDir();
    if (!Array.isArray(pool) || pool.length <= 1 || !storageDir) return;
    const nsSub = path.relative(storageDir, tenant.userRoot);
    for (const vol of pool) {
      if (!vol.online || path.resolve(vol.rootDir) === path.resolve(storageDir)) continue;
      const volRoot = vol.rootDir || vol.tenantBaseDir;
      const oldVolFile = path.join(volRoot, nsSub, relPath);
      if (fs.existsSync(oldVolFile)) {
        await fs.promises.rm(oldVolFile, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  _expectedChunkSize(session, chunkIndex) {
    if (session.totalSize === 0) return chunkIndex === 0 ? 0 : -1;
    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) return -1;
    if (chunkIndex < session.totalChunks - 1) return session.chunkSize;
    return session.totalSize - chunkIndex * session.chunkSize;
  }

  async _inspectReceivedChunks(session) {
    const sessionDir = this._getSessionDir(session.uploadId);
    const uploadedSet = new Set();
    let receivedBytes = 0;

    for (let i = 0; i < session.totalChunks; i++) {
      const partPath = path.join(sessionDir, `${i}.part`);
      try {
        const st = await fs.promises.stat(partPath);
        const expectedLen = this._expectedChunkSize(session, i);
        if (st.isFile() && st.size === expectedLen) {
          uploadedSet.add(i);
          receivedBytes += st.size;
        }
      } catch {}
    }

    const uploadedChunks = Array.from(uploadedSet).sort((a, b) => a - b);
    const missingChunks = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!uploadedSet.has(i)) missingChunks.push(i);
    }
    return { uploadedChunks, missingChunks, receivedBytes };
  }

  _normalizeIncomingRelPath(body) {
    if (body && typeof body.relPath === 'string' && body.relPath.trim()) {
      const clean = this.normalizeTenantRelPath(body.relPath);
      if (!clean) return '';
      const dir = path.posix.dirname(clean);
      const base = this.sanitizeFilename(path.posix.basename(clean));
      return dir && dir !== '.' ? `${dir}/${base}` : base;
    }
    const rawFolder = body?.folderPath !== undefined ? body.folderPath : body?.folder;
    const rawName = body?.filename !== undefined ? body.filename : body?.fileName;
    if (!rawName || typeof rawName !== 'string') return '';
    const folderRel = this.normalizeTenantRelPath(rawFolder || '');
    const cleanName = this.sanitizeFilename(rawName);
    return folderRel ? `${folderRel}/${cleanName}` : cleanName;
  }

  _assertCanWriteRelPath(tenant, relPath) {
    const isPort = tenant.scopeType !== 'org' && this.isPortfolioRelatedRelPath(relPath);
    if (isPort && tenant.userId !== this.primaryAdminUuid && tenant.role !== 'admin') {
      const err = new Error('Apenas o administrador em escopo pessoal pode gravar na pasta Portfolio.');
      err.statusCode = 403;
      throw err;
    }
  }

  _assertSessionOwnership(req, session) {
    if (!session) {
      const err = new Error('Sessão de upload em chunks não encontrada.');
      err.statusCode = 404;
      throw err;
    }
    if (session.pinNamespaceId !== req.tenant.pinNamespaceId || session.userId !== req.tenant.userId) {
      const err = new Error('Acesso negado à sessão de upload de outro cofre.');
      err.statusCode = 403;
      throw err;
    }
  }

  async handleInit(req, res) {
    try {
      req.setTimeout?.(0);
      res.setTimeout?.(0);
      if (req.tenant.readOnly || req.tenant.purpose === 'public_media' || req.tenant.quotaLimitBytes <= 0) {
        return res.status(403).json({
          error: 'Sua conta ou credencial não possui permissão de escrita.',
        });
      }
      if (!this.isExternalStorageMounted() || !this.isStagingOnExternalStorage()) {
        return res.status(507).json({
          error: 'HD Externo não montado ou staging indisponível.',
        });
      }

      const relPath = this._normalizeIncomingRelPath(req.body || {});
      if (!relPath) {
        return res.status(400).json({ error: 'Parâmetro relPath (ou folderPath + filename) obrigatório.' });
      }

      this._assertCanWriteRelPath(req.tenant, relPath);
      this.assertPublicMediaPathAllowed(req, relPath);
      this.assertFolderPinUnlockedIfRequired(req, relPath);

      const totalSize = Number(req.body?.totalSize);
      if (!Number.isInteger(totalSize) || totalSize < 0) {
        return res.status(400).json({ error: 'totalSize inválido (inteiro >= 0 obrigatório).' });
      }

      const rawChunkSize = req.body?.chunkSize !== undefined ? Number(req.body.chunkSize) : DEFAULT_CHUNK_SIZE;
      if (!Number.isInteger(rawChunkSize) || rawChunkSize < MIN_CHUNK_SIZE || rawChunkSize > MAX_CHUNK_SIZE) {
        return res.status(400).json({
          error: `chunkSize inválido (deve estar entre ${MIN_CHUNK_SIZE} e ${MAX_CHUNK_SIZE} bytes).`,
        });
      }

      let fileSha256 = null;
      if (req.body?.fileSha256 !== undefined && req.body?.fileSha256 !== null && req.body?.fileSha256 !== '') {
        if (!isValidSha256Hex(String(req.body.fileSha256))) {
          return res.status(400).json({ error: 'fileSha256 inválido (esperado 64 caracteres hex).' });
        }
        fileSha256 = String(req.body.fileSha256).trim().toLowerCase();
      }

      // Libera sessões expiradas antes de avaliar limite de sessões, cota e espaço livre
      await this.sweepExpiredSessions();

      if (this._countActiveSessionsForTenant(req.tenant.pinNamespaceId) >= this.maxConcurrentSessionsPerTenant) {
        return res.status(429).json({
          error: `Limite de ${this.maxConcurrentSessionsPerTenant} sessões de upload simultâneas atingido.`,
        });
      }

      const targetPath = req.tenant.resolveSafePath(relPath, { forWrite: true });
      const prevBytes = await this._getExistingPlaintextBytes(req.tenant, relPath);
      const netNewBytes = Math.max(0, totalSize - prevBytes);

      const currentUsed = await req.tenant.getUsedBytes();
      const effectiveUsed = Math.max(currentUsed, Number(req.tenant.usedBytes) || 0);
      const alreadyReserved = this.getReservedBytesForTenant(req.tenant.pinNamespaceId);
      const projectedUsed = effectiveUsed + alreadyReserved + netNewBytes;

      if (projectedUsed > req.tenant.quotaLimitBytes) {
        return res.status(413).json({
          error: 'Limite de armazenamento atingido (incluindo transferências em andamento).',
        });
      }

      const stagingDir = this.getStagingDir();
      await fs.promises.mkdir(stagingDir, { recursive: true });
      const diskCap = this.getDiskCapacitySync ? this.getDiskCapacitySync(stagingDir) : null;
      const totalAllReserved = this.getTotalReservedBytes();
      const requiredFree = Math.ceil(totalSize * 2.1) + totalAllReserved + this.minSafetyBufferBytes;
      if (diskCap && typeof diskCap.freeBytes === 'number' && diskCap.freeBytes < requiredFree) {
        return res.status(507).json({
          error: 'Espaço em disco insuficiente no staging externo (exigido >= 2.1x o tamanho do arquivo + reservas ativas).',
        });
      }

      const uploadId = crypto.randomUUID();
      const totalChunks = totalSize === 0 ? 1 : Math.ceil(totalSize / rawChunkSize);
      const now = Date.now();
      const session = {
        uploadId,
        state: 'uploading',
        userId: req.tenant.userId,
        scopeType: req.tenant.scopeType || 'user',
        orgSlug: req.tenant.orgSlug || null,
        pinNamespaceId: req.tenant.pinNamespaceId,
        relPath,
        targetPath,
        totalSize,
        chunkSize: rawChunkSize,
        totalChunks,
        overwrite: Boolean(req.body?.overwrite),
        fileSha256,
        reservedBytes: netNewBytes,
        createdAt: now,
        expiresAt: now + this.sessionTtlMs,
      };

      const sessionDir = this._getSessionDir(uploadId);
      await fs.promises.mkdir(sessionDir, { recursive: true });
      await this._persistSession(session);

      this.sessions.set(uploadId, session);
      if (session.reservedBytes > 0) {
        this._addReservedBytes(session.pinNamespaceId, session.reservedBytes);
      }

      return res.status(201).json({
        ok: true,
        state: 'uploading',
        uploadId,
        relPath,
        totalSize,
        chunkSize: rawChunkSize,
        totalChunks,
        expiresAt: session.expiresAt,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }

  async handlePutChunk(req, res) {
    let tmpPartPath = null;
    try {
      req.setTimeout?.(0);
      res.setTimeout?.(0);
      if (req.tenant.readOnly || req.tenant.purpose === 'public_media' || req.tenant.quotaLimitBytes <= 0) {
        return res.status(403).json({ error: 'Sem permissão de escrita.' });
      }

      const uploadId = String(req.params.uploadId || '').trim();
      const chunkIndex = Number(req.params.chunkIndex);
      if (!isValidUploadId(uploadId) || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
        return res.status(400).json({ error: 'Parâmetros uploadId ou chunkIndex inválidos.' });
      }

      const session = await this._loadSession(uploadId);
      this._assertSessionOwnership(req, session);

      if (Date.now() > Number(session.expiresAt)) {
        await this._releaseAndRemoveSession(session);
        return res.status(410).json({ error: 'Sessão de upload expirada.' });
      }
      if (session.state === 'finalizing') {
        return res.status(409).json({ error: 'Sessão já está sendo finalizada.' });
      }

      this._assertCanWriteRelPath(req.tenant, session.relPath);
      this.assertPublicMediaPathAllowed(req, session.relPath);
      this.assertFolderPinUnlockedIfRequired(req, session.relPath);

      const expectedLen = this._expectedChunkSize(session, chunkIndex);
      if (expectedLen < 0) {
        return res.status(400).json({ error: 'Índice de chunk fora do intervalo esperado.' });
      }

      const rawSha = String(req.headers['x-chunk-sha256'] || '').trim().toLowerCase();
      if (!isValidSha256Hex(rawSha)) {
        return res.status(400).json({ error: 'Cabeçalho x-chunk-sha256 obrigatório (64 caracteres hex).' });
      }

      const sessionDir = this._getSessionDir(uploadId);
      await fs.promises.mkdir(sessionDir, { recursive: true });
      tmpPartPath = path.join(sessionDir, `${chunkIndex}.part.${process.pid}.${Date.now()}.tmp`);
      const finalPartPath = path.join(sessionDir, `${chunkIndex}.part`);

      const hash = crypto.createHash('sha256');
      let bytesReceived = 0;

      if (Buffer.isBuffer(req.body)) {
        bytesReceived = req.body.length;
        if (bytesReceived > expectedLen) {
          return res.status(400).json({ error: `Chunk ${chunkIndex} excede tamanho esperado (${expectedLen}).` });
        }
        hash.update(req.body);
        await fs.promises.writeFile(tmpPartPath, req.body);
      } else {
        await new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(tmpPartPath);
          let settled = false;
          const fail = (status, msg) => {
            if (settled) return;
            settled = true;
            req.unpipe(ws);
            ws.destroy();
            const err = new Error(msg);
            err.statusCode = status;
            reject(err);
          };

          req.on('aborted', () => fail(499, 'Upload de chunk abortado pelo cliente.'));
          req.on('error', (err) => fail(400, err.message));
          ws.on('error', (err) => fail(500, err.message));
          ws.on('finish', () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          });

          req.on('data', (chunk) => {
            if (settled) return;
            bytesReceived += chunk.length;
            if (bytesReceived > expectedLen) {
              return fail(400, `Chunk ${chunkIndex} excede o tamanho esperado (${expectedLen} bytes).`);
            }
            hash.update(chunk);
          });

          req.pipe(ws);
        });
      }

      if (bytesReceived !== expectedLen) {
        await fs.promises.unlink(tmpPartPath).catch(() => {});
        return res.status(400).json({
          error: `Tamanho do chunk ${chunkIndex} incompleto (${bytesReceived} != ${expectedLen}).`,
        });
      }

      const actualSha = hash.digest('hex');
      if (actualSha !== rawSha) {
        await fs.promises.unlink(tmpPartPath).catch(() => {});
        return res.status(400).json({ error: `SHA-256 do chunk ${chunkIndex} não confere.` });
      }

      await fs.promises.rename(tmpPartPath, finalPartPath);
      tmpPartPath = null;

      session.expiresAt = Date.now() + this.sessionTtlMs;
      await this._persistSession(session).catch(() => {});

      return res.json({
        ok: true,
        uploadId,
        chunkIndex,
        sizeBytes: bytesReceived,
        sha256: actualSha,
      });
    } catch (err) {
      if (tmpPartPath) await fs.promises.unlink(tmpPartPath).catch(() => {});
      if (err?.statusCode === 499) return;
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }

  async handleStatus(req, res) {
    try {
      const uploadId = String(req.params.uploadId || '').trim();
      if (!isValidUploadId(uploadId)) {
        return res.status(400).json({ error: 'uploadId inválido.' });
      }

      const cachedDone = this.completedResults.get(uploadId);
      if (cachedDone && cachedDone.expiresAt > Date.now()) {
        this._assertSessionOwnership(req, cachedDone);
        return res.json({
          ...cachedDone.result,
          state: 'completed',
          uploadId,
        });
      }

      const cachedFail = this.failedResults.get(uploadId);
      if (cachedFail && cachedFail.expiresAt > Date.now()) {
        this._assertSessionOwnership(req, cachedFail);
        return res.json({
          ok: false,
          state: 'failed',
          uploadId,
          error: cachedFail.error,
          statusCode: cachedFail.statusCode,
        });
      }

      const session = await this._loadSession(uploadId);
      this._assertSessionOwnership(req, session);

      if (Date.now() > Number(session.expiresAt) && !this.completingIds.has(uploadId)) {
        await this._releaseAndRemoveSession(session);
        return res.status(410).json({ error: 'Sessão de upload expirada.' });
      }

      const { uploadedChunks, missingChunks, receivedBytes } = await this._inspectReceivedChunks(session);
      return res.json({
        ok: true,
        state: this.completingIds.has(uploadId) ? 'finalizing' : (session.state || 'uploading'),
        uploadId,
        relPath: session.relPath,
        totalSize: session.totalSize,
        chunkSize: session.chunkSize,
        totalChunks: session.totalChunks,
        uploadedChunks,
        missingChunks,
        receivedBytes,
        expiresAt: session.expiresAt,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }

  async _assemblePlaintextAtomic(partPaths, expectedTotalSize, expectedSha256Hex, destPath) {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    // Mesmo diretório/volume de destPath para rename atômico sem EXDEV e ignorado pelos filtros .aurt_tmp_*/*.tmp
    const tmpDest = path.join(path.dirname(destPath), `.aurt_tmp_${path.basename(destPath)}.${process.pid}.${Date.now()}.tmp`);
    const hash = crypto.createHash('sha256');
    let written = 0;

    const outFd = await fs.promises.open(tmpDest, 'w', 0o644);
    try {
      const buf = Buffer.alloc(64 * 1024);
      for (const partPath of partPaths) {
        const inFd = await fs.promises.open(partPath, 'r');
        let inPos = 0;
        try {
          while (true) {
            const { bytesRead } = await inFd.read(buf, 0, buf.length, inPos);
            if (bytesRead <= 0) break;
            const slice = buf.subarray(0, bytesRead);
            hash.update(slice);
            await outFd.write(slice, 0, bytesRead, written);
            written += bytesRead;
            inPos += bytesRead;
          }
        } finally {
          await inFd.close().catch(() => {});
        }
      }

      if (written !== expectedTotalSize) {
        const err = new Error(`Tamanho final montado (${written}) diverge do esperado (${expectedTotalSize}).`);
        err.statusCode = 400;
        throw err;
      }

      const shaHex = hash.digest('hex');
      if (expectedSha256Hex && shaHex !== expectedSha256Hex) {
        const err = new Error('SHA-256 final do arquivo não confere com fileSha256 declarado.');
        err.statusCode = 400;
        throw err;
      }

      await outFd.sync();
      await outFd.close();
      await fs.promises.rename(tmpDest, destPath);
      return { plaintextSize: written, plaintextSha256Hex: shaHex };
    } catch (err) {
      await outFd.close().catch(() => {});
      await fs.promises.unlink(tmpDest).catch(() => {});
      throw err;
    }
  }

  async _finalizeUploadBackground(tenant, session, partPaths, targetPath, prevBytes, netDeltaBytes) {
    const uploadId = session.uploadId;
    try {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

      const isPortfolio =
        tenant.scopeType !== 'org' && this.isPortfolioRelatedRelPath(session.relPath);
      const ownerNs =
        tenant.scopeType === 'org'
          ? `org:${tenant.orgSlug}`
          : `user:${tenant.userId}`;

      let resultMeta;
      if (!isPortfolio && vaultCrypto.isEncryptionEnabled()) {
        resultMeta = await vaultCrypto.encryptPartFilesAtomic(
          partPaths,
          session.totalSize,
          session.fileSha256,
          targetPath,
          ownerNs
        );
      } else {
        resultMeta = await this._assemblePlaintextAtomic(
          partPaths,
          session.totalSize,
          session.fileSha256,
          targetPath
        );
      }

      await this._releaseAndRemoveSession(session);
      await this._cleanupSecondaryVolumes(tenant, session.relPath);

      const totalUsedBytes = await tenant.adjustUsedBytes(netDeltaBytes);
      await this.invalidateThumb(tenant.pinNamespaceId, session.relPath);
      this.queueThumb(tenant.pinNamespaceId, session.relPath, targetPath);

      if (isPortfolio) {
        this.onPortfolioMutated();
      }

      const item = this.buildTenantEntryDescriptorAsync
        ? await this.buildTenantEntryDescriptorAsync(
            tenant.userId,
            targetPath,
            session.relPath,
            tenant.unlockedPinsSet,
            tenant.scopeType
          )
        : {
            name: path.basename(session.relPath),
            relativePath: session.relPath,
            isDirectory: false,
            sizeBytes: session.totalSize,
          };

      if (resultMeta?.plaintextSha256Hex) {
        item.sha256 = resultMeta.plaintextSha256Hex;
      }

      void Promise.resolve(
        this.onUploadCompleted({
          tenant,
          action: 'upsert',
          relPath: session.relPath,
          item,
          sha256: resultMeta?.plaintextSha256Hex || null,
          totalUsedBytes,
        })
      ).catch(() => {});

      const result = {
        success: true,
        ok: true,
        state: 'completed',
        action: 'upsert',
        item,
        sha256: resultMeta?.plaintextSha256Hex || null,
        total_used_bytes: totalUsedBytes,
      };
      this.failedResults.delete(uploadId);
      this.completedResults.set(uploadId, {
        pinNamespaceId: tenant.pinNamespaceId,
        userId: tenant.userId,
        result,
        expiresAt: Date.now() + this.resultTtlMs,
      });
    } catch (err) {
      session.state = 'failed';
      await this._persistSession(session).catch(() => {});
      this.failedResults.set(uploadId, {
        pinNamespaceId: tenant.pinNamespaceId,
        userId: tenant.userId,
        statusCode: err?.statusCode || 500,
        error: err?.message || 'Erro ao finalizar upload em chunks.',
        expiresAt: Date.now() + this.resultTtlMs,
      });
    } finally {
      this.completingIds.delete(uploadId);
    }
  }

  async handleComplete(req, res) {
    const uploadId = String(req.params.uploadId || '').trim();
    if (!isValidUploadId(uploadId)) {
      return res.status(400).json({ error: 'uploadId inválido.' });
    }

    req.setTimeout?.(0);
    res.setTimeout?.(0);

    // Idempotência: se já concluiu recentemente, devolve 200 imediatamente
    const cachedDone = this.completedResults.get(uploadId);
    if (cachedDone && cachedDone.expiresAt > Date.now()) {
      try {
        this._assertSessionOwnership(req, cachedDone);
        return res.status(200).json({
          ...cachedDone.result,
          state: 'completed',
          uploadId,
        });
      } catch (err) {
        return res.status(err.statusCode || 403).json({ error: err.message });
      }
    }

    // Lock síncrono ANTES de qualquer await para impedir dupla finalização concorrente
    if (this.completingIds.has(uploadId)) {
      try {
        const activeSess = await this._loadSession(uploadId);
        this._assertSessionOwnership(req, activeSess);
        return res.status(202).json({
          ok: true,
          state: 'finalizing',
          uploadId,
          relPath: activeSess.relPath,
          pollUrl: `/api/tenant/upload/chunked/${uploadId}/status`,
        });
      } catch (err) {
        return res.status(err.statusCode || 403).json({ error: err.message });
      }
    }

    this.completingIds.add(uploadId);
    let handedOffToBackground = false;
    try {
      if (req.tenant.readOnly || req.tenant.purpose === 'public_media' || req.tenant.quotaLimitBytes <= 0) {
        return res.status(403).json({ error: 'Sem permissão de escrita.' });
      }
      if (!this.isExternalStorageMounted() || !this.isStagingOnExternalStorage()) {
        return res.status(507).json({ error: 'HD Externo não montado ou staging indisponível.' });
      }

      const session = await this._loadSession(uploadId);
      this._assertSessionOwnership(req, session);

      if (Date.now() > Number(session.expiresAt)) {
        await this._releaseAndRemoveSession(session);
        return res.status(410).json({ error: 'Sessão de upload expirada.' });
      }

      this._assertCanWriteRelPath(req.tenant, session.relPath);
      this.assertPublicMediaPathAllowed(req, session.relPath);
      this.assertFolderPinUnlockedIfRequired(req, session.relPath);

      const { missingChunks } = await this._inspectReceivedChunks(session);
      if (missingChunks.length > 0) {
        return res.status(409).json({
          error: 'Chunks pendentes impedem finalização do arquivo.',
          missingChunks,
        });
      }

      const sessionDir = this._getSessionDir(uploadId);
      const partPaths = [];
      for (let i = 0; i < session.totalChunks; i++) {
        partPaths.push(path.join(sessionDir, `${i}.part`));
      }

      const targetPath = req.tenant.resolveSafePath(session.relPath, { forWrite: true });
      const prevBytes = await this._getExistingPlaintextBytes(req.tenant, session.relPath);
      const netDeltaBytes = session.totalSize - prevBytes;

      const currentUsed = await req.tenant.getUsedBytes();
      const effectiveUsed = Math.max(currentUsed, Number(req.tenant.usedBytes) || 0);
      const otherReserved = Math.max(
        0,
        this.getReservedBytesForTenant(req.tenant.pinNamespaceId) - (session.reservedBytes || 0)
      );
      if (effectiveUsed + otherReserved + Math.max(0, netDeltaBytes) > req.tenant.quotaLimitBytes) {
        return res.status(413).json({ error: 'Limite de armazenamento atingido ao finalizar upload.' });
      }

      this.failedResults.delete(uploadId);
      session.state = 'finalizing';
      await this._persistSession(session).catch(() => {});

      const tenantSnapshot = req.tenant;
      handedOffToBackground = true;
      setImmediate(() => {
        void this._finalizeUploadBackground(
          tenantSnapshot,
          session,
          partPaths,
          targetPath,
          prevBytes,
          netDeltaBytes
        );
      });

      return res.status(202).json({
        ok: true,
        state: 'finalizing',
        uploadId,
        relPath: session.relPath,
        pollUrl: `/api/tenant/upload/chunked/${uploadId}/status`,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    } finally {
      if (!handedOffToBackground) {
        this.completingIds.delete(uploadId);
      }
    }
  }

  async handleAbort(req, res) {
    try {
      const uploadId = String(req.params.uploadId || '').trim();
      if (!isValidUploadId(uploadId)) {
        return res.status(400).json({ error: 'uploadId inválido.' });
      }
      if (this.completingIds.has(uploadId)) {
        return res.status(409).json({ error: 'Não é possível abortar durante a finalização.' });
      }
      const session = await this._loadSession(uploadId);
      if (!session) {
        return res.status(404).json({ error: 'Sessão de upload não encontrada.' });
      }
      this._assertSessionOwnership(req, session);
      await this._releaseAndRemoveSession(session);
      this.failedResults.delete(uploadId);
      this.completedResults.delete(uploadId);
      return res.json({ ok: true, aborted: true, uploadId });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
}

module.exports = {
  ChunkedUploadManager,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_SESSION_TTL_MS,
  DEFAULT_RESULT_TTL_MS,
  SESSION_DIR_PREFIX,
};
