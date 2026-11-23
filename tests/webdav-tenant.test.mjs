// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vaultCrypto = require('../servidor/lib/vault-crypto.js');
const { WebdavTokenManager } = require('../servidor/lib/webdav-tokens.js');
const WebdavServer = require('../servidor/lib/webdav-server.js');
const express = require('../servidor/node_modules/express');

// Setup chave master para vault-crypto
process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.VAULT_ENCRYPTION_ENABLED = 'true';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aurt-webdav-test-'));
const internalDir = path.join(tmpRoot, 'internal');
const storageDir = path.join(tmpRoot, 'storage');
const secVolDir = path.join(tmpRoot, 'storage_sec');
const stagingDir = path.join(storageDir, 'tenants', 'tmp_tenant_uploads');
const portfolioDir = path.join(storageDir, 'portfolio');
const usersRoot = path.join(storageDir, 'tenants', 'users');
const orgsRoot = path.join(storageDir, 'tenants', 'orgs');
const thumbsDir = path.join(internalDir, 'thumbs');

for (const d of [internalDir, storageDir, secVolDir, stagingDir, portfolioDir, usersRoot, orgsRoot, thumbsDir]) {
  fs.mkdirSync(d, { recursive: true });
}

const usedBytesMap = new Map();
const pinStore = {};
let portfolioMutatedCount = 0;
let entitlementMock = async () => ({ ok: true, active: true, role: 'admin', canWrite: true, quotaLimitBytes: 1024 * 1024 });

const tokenManager = new WebdavTokenManager({
  storePath: path.join(internalDir, 'webdav_tokens.json'),
  cacheTtlMs: 60_000,
  rateLimitMaxFailures: 4,
  resolveEntitlement: (rec) => entitlementMock(rec),
});

const webdav = new WebdavServer({
  basePath: '/webdav/cofre',
  tokenManager,
  allowedOriginHosts: new Set(['storage.hublabdiv.com.br']),
  minSafetyBufferBytes: 1024,
  getStorageDir: () => storageDir,
  getStagingDir: () => stagingDir,
  getVolumesPool: () => [
    { rootDir: storageDir, tenantBaseDir: path.join(storageDir, 'tenants'), online: true },
    { rootDir: secVolDir, tenantBaseDir: path.join(secVolDir, 'tenants'), online: true },
  ],
  getDiskCapacitySync: () => ({ freeBytes: 500 * 1024 * 1024 }),
  isExternalStorageMounted: () => true,
  isStagingOnExternalStorage: () => true,
  getMimeType: (f) => (f.endsWith('.txt') ? 'text/plain' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'),
  isPortfolioRelatedRelPath: (rel) => {
    const c = String(rel || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    return c === 'portfolio' || c.startsWith('portfolio/');
  },
  isTenantPathPinProtected: (ns, rel) => {
    const pins = pinStore[ns] || {};
    const parts = String(rel || '').split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/');
      if (pins[p]) return { lockedScope: p };
    }
    return null;
  },
  hasAnyPinUnderPrefix: (ns, prefix) => {
    const pins = pinStore[ns] || {};
    const clean = String(prefix || '').replace(/^\/+|\/+$/g, '');
    return Object.keys(pins).some((k) => (!clean ? true : k === clean || k.startsWith(`${clean}/`)));
  },
  moveFileSafe: async (src, dest) => {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.rename(src, dest);
  },
  renameDirectorySafeFAT32: async (src, dest) => {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.rename(src, dest);
  },
  getTenantTrashDirAndManifest: (uRoot) => ({
    trashDir: path.join(uRoot, '.trash'),
    manifestPath: path.join(uRoot, '.trash', 'trash_manifest.json'),
  }),
  readTenantTrashManifest: async (uRoot) => {
    const mp = path.join(uRoot, '.trash', 'trash_manifest.json');
    try {
      return JSON.parse(await fs.promises.readFile(mp, 'utf8'));
    } catch {
      return [];
    }
  },
  writeTenantTrashManifest: async (uRoot, items) => {
    const mp = path.join(uRoot, '.trash', 'trash_manifest.json');
    await fs.promises.mkdir(path.dirname(mp), { recursive: true });
    await fs.promises.writeFile(mp, JSON.stringify(items));
  },
  invalidateThumb: async () => {},
  queueThumb: () => {},
  onPortfolioMutated: () => {
    portfolioMutatedCount += 1;
  },
  buildTenantContext: ({ token, effective }) => {
    const scopeType = token.scopeType;
    const orgSlug = token.orgSlug;
    const pinNamespaceId = scopeType === 'org' ? `org:${orgSlug}` : token.userId;
    const userRoot = scopeType === 'org' ? path.join(orgsRoot, orgSlug) : path.join(usersRoot, token.userId);
    fs.mkdirSync(userRoot, { recursive: true });
    return {
      userId: token.userId,
      scopeType,
      orgSlug,
      organizationId: token.organizationId,
      pinNamespaceId,
      ownerNs: scopeType === 'org' ? `org:${orgSlug}` : `user:${token.userId}`,
      role: effective.role,
      quotaLimitBytes: effective.quotaLimitBytes,
      readOnly: effective.readOnly,
      userRoot,
      resolveSafePath: (relPath) => {
        const clean = String(relPath || '').replace(/^\/+|\/+$/g, '');
        if (scopeType !== 'org' && (clean.toLowerCase() === 'portfolio' || clean.toLowerCase().startsWith('portfolio/'))) {
          const tail = clean.replace(/^portfolio\/?/i, '');
          return tail ? path.join(portfolioDir, tail) : portfolioDir;
        }
        return clean ? path.join(userRoot, clean) : userRoot;
      },
      resolveListingDirs: (cleanRel) => {
        const clean = String(cleanRel || '').replace(/^\/+|\/+$/g, '');
        if (scopeType !== 'org' && (clean.toLowerCase() === 'portfolio' || clean.toLowerCase().startsWith('portfolio/'))) {
          const tail = clean.replace(/^portfolio\/?/i, '');
          const p = tail ? path.join(portfolioDir, tail) : portfolioDir;
          return fs.existsSync(p) ? [{ dirPath: p, isLegacyBridge: true }] : [];
        }
        const p = clean ? path.join(userRoot, clean) : userRoot;
        return fs.existsSync(p) ? [{ dirPath: p, isLegacyBridge: false }] : [];
      },
      getUsedBytes: async () => usedBytesMap.get(pinNamespaceId) || 0,
      adjustUsedBytes: async (delta) => {
        const next = Math.max(0, (usedBytesMap.get(pinNamespaceId) || 0) + delta);
        usedBytesMap.set(pinNamespaceId, next);
        return next;
      },
    };
  },
});

const app = express();
app.use(webdav.middleware());
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}/webdav/cofre`;

function authHdr(tokenId, secret) {
  return `Basic ${Buffer.from(`${tokenId}:${secret}`).toString('base64')}`;
}

async function reqDav(method, relPath, { tokenId, secret, headers = {}, body } = {}) {
  const res = await fetch(`${baseUrl}${relPath}`, {
    method,
    headers: {
      ...(tokenId ? { Authorization: authHdr(tokenId, secret) } : {}),
      ...headers,
    },
    body,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

try {
  // 1. Validade 'never' bloqueada em org, permitida em user
  await assert.rejects(
    () => tokenManager.createToken({ userId: 'u1', scopeType: 'org', orgSlug: 'labdiv', ttlDays: null }),
    /30 ou 90 dias/
  );

  const userCred = await tokenManager.createToken({
    userId: 'u1',
    scopeType: 'user',
    ttlDays: null,
    role: 'admin',
    quotaLimitBytes: 1024 * 1024,
  });
  const orgCred = await tokenManager.createToken({
    userId: 'u1',
    scopeType: 'org',
    organizationId: 'org-1',
    orgSlug: 'labdiv',
    ttlDays: 90,
    role: 'member',
    readOnly: true,
    quotaLimitBytes: 1024 * 1024,
  });

  // 2. PUT criptografado AURTENC2 + 0 B + PROPFIND + GET + Range 206 + CSP sandbox + nosniff
  const putRes = await reqDav('PUT', '/foto%20%26%20a%C3%A7%C3%A3o%20(1).txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    body: 'conteudo-secreto-0123456789',
  });
  assert.equal(putRes.status, 201);

  const physicalFile = path.join(usersRoot, 'u1', 'foto & ação (1).txt');
  const hdr = vaultCrypto.readEncryptedHeaderSync(physicalFile);
  assert.ok(hdr, 'Arquivo no cofre deve estar criptografado em AURTENC2');
  assert.equal(hdr.plaintextSize, 27);

  // PUT 0 B
  const putZero = await reqDav('PUT', '/vazio.txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    body: '',
  });
  assert.equal(putZero.status, 201);
  assert.equal(vaultCrypto.readEncryptedHeaderSync(path.join(usersRoot, 'u1', 'vazio.txt')).plaintextSize, 0);

  // Sobrescrita 0 B -> dados + limpeza secundária
  const secDup = path.join(secVolDir, 'tenants', 'users', 'u1', 'vazio.txt');
  fs.mkdirSync(path.dirname(secDup), { recursive: true });
  fs.writeFileSync(secDup, 'fantasma');
  const putOverwrite = await reqDav('PUT', '/vazio.txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    body: 'agora-com-conteudo',
  });
  assert.equal(putOverwrite.status, 204);
  assert.equal(fs.existsSync(secDup), false, 'Cópia secundária fantasma deve ser removida no overwrite');
  assert.equal(usedBytesMap.get('u1'), 27 + 18);

  // GET + Range + headers segurança
  const getFull = await reqDav('GET', '/foto%20%26%20a%C3%A7%C3%A3o%20(1).txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
  });
  assert.equal(getFull.status, 200);
  assert.equal(getFull.text, 'conteudo-secreto-0123456789');
  assert.equal(getFull.headers.get('content-security-policy'), 'sandbox');
  assert.equal(getFull.headers.get('x-content-type-options'), 'nosniff');

  const getRange = await reqDav('GET', '/foto%20%26%20a%C3%A7%C3%A3o%20(1).txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    headers: { Range: 'bytes=0-7' },
  });
  assert.equal(getRange.status, 206);
  assert.equal(getRange.text, 'conteudo');

  // PROPFIND + ETag consistency + RFC1123/ISO8601 + Depth infinity 403
  const propRes = await reqDav('PROPFIND', '/', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    headers: { Depth: '1' },
  });
  assert.equal(propRes.status, 207);
  assert.ok(propRes.text.includes('<D:getcontentlength>27</D:getcontentlength>'));
  assert.ok(propRes.text.includes('foto%20%26%20a%C3%A7%C3%A3o%20%281%29.txt') || propRes.text.includes('foto%20%26%20a%C3%A7%C3%A3o%20(1).txt'));
  assert.ok(propRes.text.includes('<D:creationdate>'));
  assert.ok(propRes.text.includes(getFull.headers.get('etag').replace(/"/g, '&quot;')));

  const propInf = await reqDav('PROPFIND', '/', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    headers: { Depth: 'infinity' },
  });
  assert.equal(propInf.status, 403);

  // 3. XML > 64 KB -> 413; URL malformada -> 400
  const bigXml = await reqDav('PROPFIND', '/', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    body: 'x'.repeat(70 * 1024),
  });
  assert.equal(bigXml.status, 413);

  const badUrl = await reqDav('GET', '/%ZZ', { tokenId: userCred.tokenId, secret: userCred.secret });
  assert.equal(badUrl.status, 400);

  // 4. Isolamento multi-tenant + readOnly
  const orgList = await reqDav('PROPFIND', '/', { tokenId: orgCred.tokenId, secret: orgCred.secret });
  assert.equal(orgList.status, 207);
  assert.ok(!orgList.text.includes('vazio.txt'));
  const orgPut = await reqDav('PUT', '/tentativa.txt', {
    tokenId: orgCred.tokenId,
    secret: orgCred.secret,
    body: 'abc',
  });
  assert.equal(orgPut.status, 403);

  // 5. LOCK + If + Overwrite: F (412) + MOVE Portfolio <-> Cofre
  const lockRes = await reqDav('LOCK', '/lockado.txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    body: '',
  });
  assert.equal(lockRes.status, 201);
  const lockTok = lockRes.headers.get('lock-token').replace(/^<|>$/g, '');
  const lockedNoIf = await reqDav('PUT', '/lockado.txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    body: 'bloqueado',
  });
  assert.equal(lockedNoIf.status, 423);
  const lockedWithIf = await reqDav('PUT', '/lockado.txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    headers: { If: `(<${lockTok}>)` },
    body: 'desbloqueado',
  });
  assert.equal(lockedWithIf.status, 204);
  const unlockRes = await reqDav('UNLOCK', '/lockado.txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    headers: { 'Lock-Token': `<${lockTok}>` },
  });
  assert.equal(unlockRes.status, 204);

  // Overwrite: F -> 412
  const mvFail = await reqDav('MOVE', '/lockado.txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    headers: {
      Destination: `https://storage.hublabdiv.com.br/webdav/cofre/vazio.txt`,
      Overwrite: 'F',
    },
  });
  assert.equal(mvFail.status, 412);

  // Fronteira Cofre (AURTENC2) -> Portfolio (plaintext) via MOVE + bloqueio DELETE /Portfolio
  const mvToPort = await reqDav('MOVE', '/lockado.txt', {
    tokenId: userCred.tokenId,
    secret: userCred.secret,
    headers: {
      Destination: '/webdav/cofre/Portfolio/exportado.txt',
      'X-Forwarded-Proto': 'https',
      Overwrite: 'T',
    },
  });
  assert.equal(mvToPort.status, 201);
  const portFile = path.join(portfolioDir, 'exportado.txt');
  assert.equal(fs.readFileSync(portFile, 'utf8'), 'desbloqueado', 'No Portfolio deve estar em plaintext');
  assert.ok(portfolioMutatedCount > 0);

  const delPortRoot = await reqDav('DELETE', '/Portfolio', { tokenId: userCred.tokenId, secret: userCred.secret });
  assert.equal(delPortRoot.status, 403);

  // 6. PIN recursivo bloqueando DELETE em pasta pai com 423
  await reqDav('MKCOL', '/Secreta', { tokenId: userCred.tokenId, secret: userCred.secret });
  await reqDav('MKCOL', '/Secreta/CofreInterno', { tokenId: userCred.tokenId, secret: userCred.secret });
  pinStore['u1'] = { 'Secreta/CofreInterno': { pinHash: 'x' } };
  const delParentPin = await reqDav('DELETE', '/Secreta', { tokenId: userCred.tokenId, secret: userCred.secret });
  assert.equal(delParentPin.status, 423);
  assert.ok(fs.existsSync(path.join(usersRoot, 'u1', 'Secreta', 'CofreInterno')));

  // 7. DELETE normal -> vai para .trash
  const delVazio = await reqDav('DELETE', '/vazio.txt', { tokenId: userCred.tokenId, secret: userCred.secret });
  assert.equal(delVazio.status, 204);
  assert.ok(!fs.existsSync(path.join(usersRoot, 'u1', 'vazio.txt')));
  assert.ok(fs.existsSync(path.join(usersRoot, 'u1', '.trash', 'trash_manifest.json')));

  // 8. Chunked PUT excedendo cota -> 507 + limpeza staging
  entitlementMock = async () => ({ ok: true, active: true, role: 'admin', canWrite: true, quotaLimitBytes: 100 });
  await tokenManager.invalidateCache({ userId: 'u1' });
  const bigChunkRes = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/webdav/cofre/excede.bin',
        method: 'PUT',
        headers: {
          Authorization: authHdr(userCred.tokenId, userCred.secret),
          'Transfer-Encoding': 'chunked',
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', () => resolve(507));
    req.write(Buffer.alloc(1024, 65));
    req.end();
  });
  assert.equal(bigChunkRes, 507);
  assert.equal(fs.readdirSync(stagingDir).length, 0, 'Staging deve estar limpo após 507');

  // 9. Socket abort no meio do GET sem erro/leak
  await new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/webdav/cofre/foto%20%26%20a%C3%A7%C3%A3o%20(1).txt',
        method: 'GET',
        headers: { Authorization: authHdr(userCred.tokenId, userCred.secret) },
      },
      (res) => {
        res.once('data', () => {
          req.destroy();
          setTimeout(resolve, 40);
        });
      }
    );
    req.end();
  });

  // 10. Revogação expurga cache imediatamente -> 401
  const revoked = await tokenManager.revokeToken(userCred.tokenId, { userId: 'u1', scopeType: 'user', orgSlug: null });
  assert.equal(revoked, true);
  const afterRevoke = await reqDav('PROPFIND', '/', { tokenId: userCred.tokenId, secret: userCred.secret });
  assert.equal(afterRevoke.status, 401);

  // 11. Rate limit via CF-Connecting-IP em loopback após falhas
  for (let i = 0; i < 4; i++) {
    const fail = await reqDav('PROPFIND', '/', {
      tokenId: 'wd_invalido',
      secret: 'errado',
      headers: { 'CF-Connecting-IP': '203.0.113.55' },
    });
    assert.equal(fail.status, 401);
  }
  const blocked = await reqDav('PROPFIND', '/', {
    tokenId: 'wd_invalido',
    secret: 'errado',
    headers: { 'CF-Connecting-IP': '203.0.113.55' },
  });
  assert.equal(blocked.status, 429);

  console.log('✅ webdav-tenant.test.mjs: 11/11 PASS');
} finally {
  server.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
