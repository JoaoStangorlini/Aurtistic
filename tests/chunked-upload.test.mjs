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
const { ChunkedUploadManager } = require('../servidor/lib/chunked-upload.js');
const { WebdavTokenManager, extractClientIpForRateLimit } = require('../servidor/lib/webdav-tokens.js');
const express = require('../servidor/node_modules/express');

process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.VAULT_ENCRYPTION_ENABLED = 'true';

const HMAC_SECRET = 'test_edge_hmac_secret_1234567890';
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aurt-chunked-test-'));
const internalDir = path.join(tmpRoot, 'internal');
const storageDir = path.join(tmpRoot, 'storage');
const secVolDir = path.join(tmpRoot, 'storage_sec');
const stagingDir = path.join(storageDir, 'tenants', 'tmp_tenant_uploads');
const usersRoot = path.join(storageDir, 'tenants', 'users');
const orgsRoot = path.join(storageDir, 'tenants', 'orgs');
const thumbsDir = path.join(internalDir, 'thumbs');

for (const d of [internalDir, storageDir, secVolDir, stagingDir, usersRoot, orgsRoot, thumbsDir]) {
  fs.mkdirSync(d, { recursive: true });
}

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';

const usedBytesMap = new Map();
const pinStore = { [TENANT_A]: { CofreSecreto: { pinHash: 'x' } } };
let mockFreeBytes = 500 * 1024 * 1024;
let mockQuotaLimit = 400 * 1024; // 400 KB
let portfolioMutatedCount = 0;
const receivedSyncWebhooks = [];

// Mock servidor Next.js recebendo POST /api/internal/vault-index-sync com validação HMAC + anti-replay
const webhookServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const ts = String(req.headers['x-edge-timestamp'] || '');
    const sig = String(req.headers['x-edge-signature'] || '');
    const tsNum = Number(ts);
    const tsValid = Boolean(ts) && !Number.isNaN(tsNum) && Math.abs(Date.now() - tsNum) <= 5 * 60 * 1000;
    const expected = crypto.createHmac('sha256', HMAC_SECRET).update(`${ts}.${rawBody}`).digest('hex');
    const sigValid = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!tsValid || !sigValid) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Assinatura ou timestamp inválido.' }));
    }
    receivedSyncWebhooks.push({
      url: req.url,
      validSig: true,
      body: JSON.parse(rawBody || '{}'),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
});

let webhookUrl = '';
const tokenManager = new WebdavTokenManager({
  storePath: path.join(internalDir, 'webdav_tokens.json'),
  cacheTtlMs: 60_000,
  resolveEntitlement: async (rec) => ({
    ok: true,
    active: true,
    role: rec.userId === ADMIN_ID ? 'admin' : 'member',
    canWrite: !rec.readOnlyRequested,
    quotaLimitBytes: mockQuotaLimit,
  }),
});

function normalizeRel(raw) {
  return String(raw || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '').trim();
}

function isPortfolioRel(rel) {
  const c = normalizeRel(rel).toLowerCase();
  return c === 'portfolio' || c.startsWith('portfolio/');
}

function isPinLocked(userId, rel) {
  const pins = pinStore[userId] || {};
  const parts = normalizeRel(rel).split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const scope = parts.slice(0, i).join('/');
    if (pins[scope]) return { lockedScope: scope, record: pins[scope] };
  }
  return null;
}

function buildTenantCtx({
  userId,
  scopeType = 'user',
  orgSlug = null,
  role = 'member',
  readOnly = false,
  quotaLimitBytes = mockQuotaLimit,
  unlockedPinsSet = new Set(),
}) {
  const pinNamespaceId = scopeType === 'org' ? `org:${orgSlug}` : userId;
  const userRoot = path.join(usersRoot, userId);
  fs.mkdirSync(userRoot, { recursive: true });
  return {
    userId,
    scopeType,
    orgSlug,
    organizationId: null,
    pinNamespaceId,
    ownerNs: `user:${userId}`,
    role,
    purpose: unlockedPinsSet.size > 0 ? 'vault' : 'device_token',
    quotaLimitBytes,
    usedBytes: 0,
    readOnly,
    allowDownload: true,
    unlockedPinsSet,
    userRoot,
    resolveSafePath: (relPath) => {
      const clean = normalizeRel(relPath);
      const target = clean ? path.resolve(userRoot, clean) : userRoot;
      if (target !== userRoot && !target.startsWith(`${userRoot}${path.sep}`)) {
        const err = new Error('Path traversal bloqueado.');
        err.statusCode = 403;
        throw err;
      }
      return target;
    },
    resolveListingDirs: () => [{ dirPath: userRoot, isLegacyBridge: false }],
    getUsedBytes: async () => usedBytesMap.get(pinNamespaceId) || 0,
    adjustUsedBytes: async (delta) => {
      const next = Math.max(0, (usedBytesMap.get(pinNamespaceId) || 0) + delta);
      usedBytesMap.set(pinNamespaceId, next);
      return next;
    },
  };
}

function createManager(ttlMs = 150) {
  return new ChunkedUploadManager({
    primaryAdminUuid: ADMIN_ID,
    sessionTtlMs: ttlMs,
    minSafetyBufferBytes: 1024,
    getStagingDir: () => stagingDir,
    getStorageDir: () => storageDir,
    getVolumesPool: () => [
      { rootDir: storageDir, tenantBaseDir: path.join(storageDir, 'tenants'), online: true },
      { rootDir: secVolDir, tenantBaseDir: path.join(secVolDir, 'tenants'), online: true },
    ],
    getDiskCapacitySync: () => ({ freeBytes: mockFreeBytes }),
    isExternalStorageMounted: () => true,
    isStagingOnExternalStorage: () => true,
    normalizeTenantRelPath: normalizeRel,
    sanitizeFilename: (n) => path.basename(String(n || 'arquivo')),
    isPortfolioRelatedRelPath: isPortfolioRel,
    assertFolderPinUnlockedIfRequired: (req, relPath) => {
      const lock = isPinLocked(req.tenant.userId, relPath);
      if (lock && !req.tenant.unlockedPinsSet.has(lock.lockedScope)) {
        const err = new Error('Pasta protegida por PIN.');
        err.statusCode = 423;
        throw err;
      }
    },
    assertPublicMediaPathAllowed: () => {},
    invalidateThumb: async () => {},
    queueThumb: () => {},
    onPortfolioMutated: () => {
      portfolioMutatedCount++;
    },
    onUploadCompleted: async ({ tenant, action, relPath, item, sha256, totalUsedBytes }) => {
      const ts = String(Date.now());
      const body = JSON.stringify({
        userId: tenant.userId,
        scopeType: tenant.scopeType,
        action,
        relPath,
        item,
        sha256,
        totalUsedBytes,
      });
      const sig = crypto.createHmac('sha256', HMAC_SECRET).update(`${ts}.${body}`).digest('hex');
      await fetch(`${webhookUrl}/api/internal/vault-index-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-edge-timestamp': ts,
          'x-edge-signature': sig,
        },
        body,
      });
    },
  });
}

let chunkedManager = createManager(150);

const app = express();
app.use(express.json({ limit: '2mb' }));

async function verifyAuth(req, res, next) {
  const rawTicket = String(req.headers['x-tenant-ticket'] || '').trim();
  if (rawTicket) {
    const parsed = JSON.parse(Buffer.from(rawTicket, 'base64url').toString('utf8'));
    req.tenant = buildTenantCtx({
      userId: parsed.userId,
      role: parsed.role || 'member',
      quotaLimitBytes: mockQuotaLimit,
      unlockedPinsSet: new Set(parsed.unlockedPins || []),
    });
    return next();
  }

  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Authorization Basic ou x-tenant-ticket obrigatório.' });
  }
  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  const tokenId = idx >= 0 ? decoded.slice(0, idx) : '';
  const secret = idx >= 0 ? decoded.slice(idx + 1) : '';
  const resAuth = await tokenManager.verifyBasicCredentials(tokenId, secret, extractClientIpForRateLimit(req));
  if (!resAuth.ok) {
    return res.status(resAuth.status || 401).json({ error: resAuth.error });
  }
  req.tenant = buildTenantCtx({
    userId: resAuth.token.userId,
    scopeType: resAuth.token.scopeType,
    orgSlug: resAuth.token.orgSlug,
    role: resAuth.effective.role,
    readOnly: resAuth.effective.readOnly,
    quotaLimitBytes: resAuth.effective.quotaLimitBytes,
    unlockedPinsSet: new Set(),
  });
  return next();
}

app.post('/api/tenant/upload/chunked/init', verifyAuth, (req, res) => chunkedManager.handleInit(req, res));
app.put('/api/tenant/upload/chunked/:uploadId/:chunkIndex', verifyAuth, (req, res) => chunkedManager.handlePutChunk(req, res));
app.get('/api/tenant/upload/chunked/:uploadId/status', verifyAuth, (req, res) => chunkedManager.handleStatus(req, res));
app.post('/api/tenant/upload/chunked/:uploadId/complete', verifyAuth, (req, res) => chunkedManager.handleComplete(req, res));
app.delete('/api/tenant/upload/chunked/:uploadId', verifyAuth, (req, res) => chunkedManager.handleAbort(req, res));

// Manifesto com ocultação total de PIN não desbloqueado
app.get('/api/tenant/manifest', verifyAuth, async (req, res) => {
  const cleanRel = normalizeRel(req.query.folder);
  const lockTop = isPinLocked(req.tenant.userId, cleanRel);
  if (lockTop && !req.tenant.unlockedPinsSet.has(lockTop.lockedScope)) {
    return res.status(423).json({ error: 'Pasta protegida por PIN.' });
  }
  const baseDir = req.tenant.resolveSafePath(cleanRel);
  const files = [];
  async function walk(dir, prefix) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const d of entries) {
      const inner = prefix ? `${prefix}/${d.name}` : d.name;
      const tenantRel = cleanRel ? `${cleanRel}/${inner}` : inner;
      const lock = isPinLocked(req.tenant.userId, tenantRel);
      if (lock && !req.tenant.unlockedPinsSet.has(lock.lockedScope)) continue;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        await walk(full, inner);
      } else if (d.isFile()) {
        const hdr = await vaultCrypto.readEncryptedHeader(full).catch(() => null);
        const st = await fs.promises.stat(full);
        files.push({
          relPath: inner,
          sizeBytes: hdr ? hdr.plaintextSize : st.size,
          sha256: hdr?.plaintextSha256 ? hdr.plaintextSha256.toString('hex') : null,
        });
      }
    }
  }
  await walk(baseDir, '');
  return res.json({ success: true, folder: cleanRel, files, lockedSubfolders: [] });
});

async function handleStream(req, res) {
  const rel = normalizeRel(req.query.path);
  const fullPath = req.tenant.resolveSafePath(rel);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Not found' });
  const st = fs.statSync(fullPath);
  const encHdr = await vaultCrypto.readEncryptedHeader(fullPath).catch(() => null);
  const fileSize = encHdr ? encHdr.plaintextSize : st.size;

  const etag = `"${Math.floor(st.mtimeMs).toString(16)}-${fileSize.toString(16)}"`;
  res.setHeader('ETag', etag);
  if (encHdr && encHdr.plaintextSha256) {
    res.setHeader('X-Plaintext-Sha256', encHdr.plaintextSha256.toString('hex'));
  }
  res.setHeader('Accept-Ranges', 'bytes');

  let rangeHeader = req.headers.range;
  const ifRange = req.headers['if-range'];
  if (rangeHeader && ifRange) {
    const trimmed = String(ifRange).trim();
    const ok = trimmed.startsWith('"') ? trimmed === etag : Date.parse(trimmed) >= Math.floor(st.mtimeMs / 1000) * 1000;
    if (!ok) rangeHeader = null;
  }

  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = Math.min(m[2] ? parseInt(m[2], 10) : fileSize - 1, fileSize - 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', String(end - start + 1));
    if (req.method === 'HEAD') return res.end();
    const s = encHdr
      ? vaultCrypto.createDecryptStream(fullPath, req.tenant.ownerNs, start, end)
      : fs.createReadStream(fullPath, { start, end });
    return s.pipe(res);
  }
  res.status(200);
  res.setHeader('Content-Length', String(fileSize));
  if (req.method === 'HEAD') return res.end();
  const s = encHdr
    ? vaultCrypto.createDecryptStream(fullPath, req.tenant.ownerNs)
    : fs.createReadStream(fullPath);
  return s.pipe(res);
}

app.head('/api/tenant/stream', verifyAuth, handleStream);
app.get('/api/tenant/stream', verifyAuth, handleStream);

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function completeAndWait(baseUrl, authHeader, uploadId) {
  const [comp1, comp2] = await Promise.all([
    fetch(`${baseUrl}/api/tenant/upload/chunked/${uploadId}/complete`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    }),
    fetch(`${baseUrl}/api/tenant/upload/chunked/${uploadId}/complete`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    }),
  ]);
  assert.ok([200, 202].includes(comp1.status), `Esperado 200 ou 202 no complete 1, veio ${comp1.status}`);
  assert.ok([200, 202].includes(comp2.status), `Esperado 200 ou 202 no complete concorrente, veio ${comp2.status}`);

  for (let i = 0; i < 60; i++) {
    const stRes = await fetch(`${baseUrl}/api/tenant/upload/chunked/${uploadId}/status`, {
      headers: { Authorization: authHeader },
    });
    assert.equal(stRes.status, 200);
    const stJson = await stRes.json();
    if (stJson.state === 'completed') {
      // Idempotência: repetir /complete após conclusão devolve 200
      const compReplay = await fetch(`${baseUrl}/api/tenant/upload/chunked/${uploadId}/complete`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      });
      assert.equal(compReplay.status, 200);
      const replayJson = await compReplay.json();
      assert.equal(replayJson.state, 'completed');
      return replayJson;
    }
    if (stJson.state === 'failed') {
      throw new Error(`Finalização falhou: ${stJson.error}`);
    }
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error('Timeout aguardando estado completed em /status');
}

async function runTests() {
  await new Promise((r) => webhookServer.listen(0, '127.0.0.1', r));
  webhookUrl = `http://127.0.0.1:${webhookServer.address().port}`;

  const httpServer = http.createServer(app);
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  try {
    const tokA = await tokenManager.createToken({
      userId: TENANT_A,
      scopeType: 'user',
      label: 'Test-A-RW',
      callerReadOnly: false,
      role: 'member',
      quotaLimitBytes: mockQuotaLimit,
    });
    const tokAReadOnly = await tokenManager.createToken({
      userId: TENANT_A,
      scopeType: 'user',
      label: 'Test-A-RO',
      callerReadOnly: true,
      role: 'member',
      quotaLimitBytes: mockQuotaLimit,
    });
    const tokB = await tokenManager.createToken({
      userId: TENANT_B,
      scopeType: 'user',
      label: 'Test-B-RW',
      callerReadOnly: false,
      role: 'member',
      quotaLimitBytes: mockQuotaLimit,
    });
    const tokAdmin = await tokenManager.createToken({
      userId: ADMIN_ID,
      scopeType: 'user',
      label: 'Test-Admin-RW',
      callerReadOnly: false,
      role: 'admin',
      quotaLimitBytes: mockQuotaLimit,
    });

    const authA = `Basic ${Buffer.from(`${tokA.tokenId}:${tokA.secret}`).toString('base64')}`;
    const authARO = `Basic ${Buffer.from(`${tokAReadOnly.tokenId}:${tokAReadOnly.secret}`).toString('base64')}`;
    const authB = `Basic ${Buffer.from(`${tokB.tokenId}:${tokB.secret}`).toString('base64')}`;
    const authAdmin = `Basic ${Buffer.from(`${tokAdmin.tokenId}:${tokAdmin.secret}`).toString('base64')}`;
    const ticketAWithPin = Buffer.from(
      JSON.stringify({ userId: TENANT_A, role: 'member', unlockedPins: ['CofreSecreto'] })
    ).toString('base64url');

    // 1. Limite de chunkSize adaptativo
    const badChunkMin = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/fail.bin', totalSize: 2048, chunkSize: 1024 }),
    });
    assert.equal(badChunkMin.status, 400);

    const badChunkMax = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/fail.bin', totalSize: 2048, chunkSize: 64 * 1024 * 1024 }),
    });
    assert.equal(badChunkMax.status, 400);

    // 2. Upload fora de ordem sem fileSha256 + chunk maior que esperado rejeitado + /complete 202 concorrente -> completed + cleanup secVol
    const payloadA = crypto.randomBytes(160 * 1024); // 160 KB = 64K + 64K + 32K
    const chunkSize = 64 * 1024;
    const staleSecPath = path.join(secVolDir, 'tenants', 'users', TENANT_A, 'Projetos', 'video_teste.bin');
    fs.mkdirSync(path.dirname(staleSecPath), { recursive: true });
    fs.writeFileSync(staleSecPath, Buffer.from('stale-old-copy'));

    const init1 = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/video_teste.bin', totalSize: payloadA.length, chunkSize }),
    });
    assert.equal(init1.status, 201);
    const { uploadId, totalChunks } = await init1.json();
    assert.equal(totalChunks, 3);

    const c0 = payloadA.subarray(0, chunkSize);
    const c1 = payloadA.subarray(chunkSize, chunkSize * 2);
    const c2 = payloadA.subarray(chunkSize * 2);

    // Envia chunk 2 primeiro (fora de ordem!)
    const put2 = await fetch(`${baseUrl}/api/tenant/upload/chunked/${uploadId}/2`, {
      method: 'PUT',
      headers: { Authorization: authA, 'Content-Type': 'application/octet-stream', 'x-chunk-sha256': sha256Hex(c2) },
      body: c2,
    });
    assert.equal(put2.status, 200);

    // Chunk maior que o tamanho esperado para índice 2 deve ser rejeitado com 400
    const oversized = Buffer.alloc(c2.length + 100, 7);
    const putOversize = await fetch(`${baseUrl}/api/tenant/upload/chunked/${uploadId}/2`, {
      method: 'PUT',
      headers: { Authorization: authA, 'Content-Type': 'application/octet-stream', 'x-chunk-sha256': sha256Hex(oversized) },
      body: oversized,
    });
    assert.equal(putOversize.status, 400);

    // Chunk 1 com SHA errado -> 400
    const put1Bad = await fetch(`${baseUrl}/api/tenant/upload/chunked/${uploadId}/1`, {
      method: 'PUT',
      headers: { Authorization: authA, 'Content-Type': 'application/octet-stream', 'x-chunk-sha256': '0'.repeat(64) },
      body: c1,
    });
    assert.equal(put1Bad.status, 400);

    // Retomada via /status mostra apenas chunk 2 recebido e [0, 1] faltantes
    const statusOk = await fetch(`${baseUrl}/api/tenant/upload/chunked/${uploadId}/status`, {
      headers: { Authorization: authA },
    });
    const statusJson = await statusOk.json();
    assert.deepEqual(statusJson.uploadedChunks, [2]);
    assert.deepEqual(statusJson.missingChunks, [0, 1]);
    assert.equal(statusJson.state, 'uploading');

    // Completa chunks 0 e 1 e testa /complete assíncrono + concorrência + idempotência
    for (const [idx, buf] of [[0, c0], [1, c1]]) {
      const r = await fetch(`${baseUrl}/api/tenant/upload/chunked/${uploadId}/${idx}`, {
        method: 'PUT',
        headers: { Authorization: authA, 'Content-Type': 'application/octet-stream', 'x-chunk-sha256': sha256Hex(buf) },
        body: buf,
      });
      assert.equal(r.status, 200);
    }

    const compJson = await completeAndWait(baseUrl, authA, uploadId);
    assert.equal(compJson.sha256, sha256Hex(payloadA));
    assert.equal(fs.existsSync(staleSecPath), false, 'Cópia antiga em volume secundário deve ser removida');

    const destFile1 = path.join(usersRoot, TENANT_A, 'Projetos', 'video_teste.bin');
    const decrypted1 = await vaultCrypto.decryptBuffer(destFile1, `user:${TENANT_A}`);
    assert.equal(Buffer.compare(decrypted1, payloadA), 0);

    await new Promise((r) => setTimeout(r, 40));
    assert.equal(receivedSyncWebhooks.length, 1);
    assert.equal(receivedSyncWebhooks[0].validSig, true);

    // 3. HEAD & GET Range: X-Plaintext-Sha256 (mesmo sem fileSha256 no /init!), ETag e If-Range divergente -> 200
    const headEnc = await fetch(`${baseUrl}/api/tenant/stream?path=${encodeURIComponent('Projetos/video_teste.bin')}`, {
      method: 'HEAD',
      headers: { Authorization: authA },
    });
    assert.equal(headEnc.status, 200);
    assert.equal(headEnc.headers.get('x-plaintext-sha256'), sha256Hex(payloadA));
    const etag1 = headEnc.headers.get('etag');
    assert.ok(etag1 && etag1.startsWith('"'));

    // If-Range igual -> 206
    const rangeMatch = await fetch(`${baseUrl}/api/tenant/stream?path=${encodeURIComponent('Projetos/video_teste.bin')}`, {
      headers: { Authorization: authA, Range: 'bytes=10-25', 'If-Range': etag1 },
    });
    assert.equal(rangeMatch.status, 206);
    assert.equal(Buffer.compare(Buffer.from(await rangeMatch.arrayBuffer()), payloadA.subarray(10, 26)), 0);

    // If-Range divergente -> 200 arquivo completo
    const rangeMismatch = await fetch(`${baseUrl}/api/tenant/stream?path=${encodeURIComponent('Projetos/video_teste.bin')}`, {
      headers: { Authorization: authA, Range: 'bytes=10-25', 'If-Range': '"etag-antigo-diferente"' },
    });
    assert.equal(rangeMismatch.status, 200);
    assert.equal(Buffer.compare(Buffer.from(await rangeMismatch.arrayBuffer()), payloadA), 0);

    // 4. Sobrescrita validando delta de cota (160 KB existente, quota 400 KB, overwrite por 260 KB -> delta 100 KB OK)
    const payloadOverwrite = crypto.randomBytes(260 * 1024);
    const initOw = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relPath: 'Projetos/video_teste.bin',
        totalSize: payloadOverwrite.length,
        chunkSize,
        overwrite: true,
      }),
    });
    assert.equal(initOw.status, 201, 'Sobrescrita deve usar delta (260-160=100 KB), cabendo na cota de 400 KB');
    const { uploadId: owId } = await initOw.json();
    await fetch(`${baseUrl}/api/tenant/upload/chunked/${owId}`, { method: 'DELETE', headers: { Authorization: authA } });

    // 5. Upload de arquivo vazio (totalSize === 0)
    const emptySha = sha256Hex(Buffer.alloc(0));
    const initZero = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/vazio.txt', totalSize: 0, chunkSize }),
    });
    assert.equal(initZero.status, 201);
    const { uploadId: zeroId } = await initZero.json();
    await fetch(`${baseUrl}/api/tenant/upload/chunked/${zeroId}/0`, {
      method: 'PUT',
      headers: { Authorization: authA, 'Content-Type': 'application/octet-stream', 'x-chunk-sha256': emptySha },
      body: Buffer.alloc(0),
    });
    await completeAndWait(baseUrl, authA, zeroId);
    const zeroDest = path.join(usersRoot, TENANT_A, 'Projetos', 'vazio.txt');
    assert.equal((await vaultCrypto.decryptBuffer(zeroDest, `user:${TENANT_A}`)).length, 0);

    // 6. PIN & Permissões: readOnly 403, PIN Basic 423, Manifesto oculta subpasta com PIN sem desbloqueio e libera com x-tenant-ticket
    const secretFile = path.join(usersRoot, TENANT_A, 'Projetos', 'publico.txt');
    const pinDir = path.join(usersRoot, TENANT_A, 'CofreSecreto');
    fs.mkdirSync(pinDir, { recursive: true });
    fs.writeFileSync(path.join(pinDir, 'confidencial.txt'), Buffer.from('segredo'));

    const initRO = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authARO, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/ro.txt', totalSize: 0, chunkSize }),
    });
    assert.equal(initRO.status, 403);

    const initPinBasic = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'CofreSecreto/segredo.txt', totalSize: 10, chunkSize }),
    });
    assert.equal(initPinBasic.status, 423);

    // Manifesto raiz via Basic Token NÃO vaza 'CofreSecreto'
    const manBasic = await fetch(`${baseUrl}/api/tenant/manifest`, { headers: { Authorization: authA } });
    assert.equal(manBasic.status, 200);
    const manBasicJson = await manBasic.json();
    assert.equal(manBasicJson.files.some((f) => f.relPath.includes('CofreSecreto')), false);
    assert.deepEqual(manBasicJson.lockedSubfolders, []);

    // Manifesto raiz via x-tenant-ticket com PIN desbloqueado VÊ 'CofreSecreto/confidencial.txt'
    const manTicket = await fetch(`${baseUrl}/api/tenant/manifest`, {
      headers: { 'x-tenant-ticket': ticketAWithPin },
    });
    assert.equal(manTicket.status, 200);
    const manTicketJson = await manTicket.json();
    assert.equal(manTicketJson.files.some((f) => f.relPath === 'CofreSecreto/confidencial.txt'), true);

    // 7. Portfolio: bloqueado para não-admin (403) e permitido em plaintext para admin pessoal (201/202->completed)
    const initPortMember = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Portfolio/Ensaio/foto.jpg', totalSize: 10, chunkSize }),
    });
    assert.equal(initPortMember.status, 403, 'Não-admin não pode gravar em Portfolio via chunked');

    const portData = Buffer.from('FAKE_JPEG_PORTFOLIO_PLAIN_DATA');
    const initPortAdmin = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authAdmin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relPath: 'Portfolio/Ensaio/foto.jpg',
        totalSize: portData.length,
        chunkSize,
        fileSha256: sha256Hex(portData),
      }),
    });
    assert.equal(initPortAdmin.status, 201);
    const { uploadId: portId } = await initPortAdmin.json();
    await fetch(`${baseUrl}/api/tenant/upload/chunked/${portId}/0`, {
      method: 'PUT',
      headers: { Authorization: authAdmin, 'Content-Type': 'application/octet-stream', 'x-chunk-sha256': sha256Hex(portData) },
      body: portData,
    });
    await completeAndWait(baseUrl, authAdmin, portId);
    assert.equal(portfolioMutatedCount, 1);

    const portDest = path.join(usersRoot, ADMIN_ID, 'Portfolio', 'Ensaio', 'foto.jpg');
    assert.equal(await vaultCrypto.readEncryptedHeader(portDest), null);

    // 8. Reidratação de inFlightReservedBytes simulando reboot (recriando ChunkedUploadManager)
    usedBytesMap.set(TENANT_B, 50 * 1024);
    chunkedManager = createManager(60_000); // TTL longo para testar reidratação pós-reboot
    const initRehydrate = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authB, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/reboot.bin', totalSize: 150 * 1024, chunkSize }),
    });
    assert.equal(initRehydrate.status, 201);
    const { uploadId: rebootId } = await initRehydrate.json();
    assert.equal(chunkedManager.getReservedBytesForTenant(TENANT_B), 150 * 1024);

    // Simula reboot instanciando novo manager e varrendo disco
    chunkedManager = createManager(60_000);
    assert.equal(chunkedManager.getReservedBytesForTenant(TENANT_B), 0);
    await chunkedManager.sweepExpiredSessions();
    assert.equal(chunkedManager.getReservedBytesForTenant(TENANT_B), 150 * 1024, 'Reboot deve reidratar reserva em voo');
    await fetch(`${baseUrl}/api/tenant/upload/chunked/${rebootId}`, { method: 'DELETE', headers: { Authorization: authB } });

    // 9. TTL expirado libera inFlightReservedBytes
    chunkedManager = createManager(120);
    usedBytesMap.set(TENANT_A, 100 * 1024);
    const initReserve = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/grande1.bin', totalSize: 220 * 1024, chunkSize }),
    });
    assert.equal(initReserve.status, 201);

    const initBlocked = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/grande2.bin', totalSize: 120 * 1024, chunkSize }),
    });
    assert.equal(initBlocked.status, 413);

    await new Promise((r) => setTimeout(r, 160));
    const initAfterTtl = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/grande2.bin', totalSize: 120 * 1024, chunkSize }),
    });
    assert.equal(initAfterTtl.status, 201);
    const { uploadId: ttlSecondId } = await initAfterTtl.json();
    await fetch(`${baseUrl}/api/tenant/upload/chunked/${ttlSecondId}`, { method: 'DELETE', headers: { Authorization: authA } });

    // 10. Anti-replay timestamp expirado no webhook HMAC
    const expiredTs = String(Date.now() - 10 * 60 * 1000);
    const expiredBody = JSON.stringify({ userId: TENANT_A, relPath: 'Projetos/x.txt' });
    const expiredSig = crypto.createHmac('sha256', HMAC_SECRET).update(`${expiredTs}.${expiredBody}`).digest('hex');
    const replayRes = await fetch(`${webhookUrl}/api/internal/vault-index-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-edge-timestamp': expiredTs,
        'x-edge-signature': expiredSig,
      },
      body: expiredBody,
    });
    assert.equal(replayRes.status, 401);

    // 11. Isolamento cross-tenant & disco < 2.1x
    const prevFree = mockFreeBytes;
    mockFreeBytes = 100 * 1024;
    const initDiskFull = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/sem_espaco.bin', totalSize: 80 * 1024, chunkSize }),
    });
    assert.equal(initDiskFull.status, 507);
    mockFreeBytes = prevFree;

    const initCross = await fetch(`${baseUrl}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: { Authorization: authA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: 'Projetos/cross_a.bin', totalSize: 1024, chunkSize }),
    });
    assert.equal(initCross.status, 201);
    const { uploadId: crossId } = await initCross.json();
    const statusCross = await fetch(`${baseUrl}/api/tenant/upload/chunked/${crossId}/status`, {
      headers: { Authorization: authB },
    });
    assert.equal(statusCross.status, 403);
    await fetch(`${baseUrl}/api/tenant/upload/chunked/${crossId}`, { method: 'DELETE', headers: { Authorization: authA } });

    // 12. Teste unitário direto de encryptPartFilesAtomic: zero plaintext concatenado + .enc.tmp no mesmo diretório
    const partPathTmp = path.join(tmpRoot, 'part_unit_0.bin');
    fs.writeFileSync(partPathTmp, Buffer.from('hello-part-0'));
    const partPathTmp1 = path.join(tmpRoot, 'part_unit_1.bin');
    fs.writeFileSync(partPathTmp1, Buffer.from('-and-part-1'));
    const unitDestDir = path.join(tmpRoot, 'final_vol_dir');
    fs.mkdirSync(unitDestDir, { recursive: true });
    const unitDestOk = path.join(unitDestDir, 'unit_ok.bin');

    const origOpen = fs.promises.open;
    const writeOpenedPaths = [];
    fs.promises.open = async function spyOpen(filePath, flags, mode) {
      if (flags === 'w') writeOpenedPaths.push(String(filePath));
      return origOpen.call(fs.promises, filePath, flags, mode);
    };
    try {
      await vaultCrypto.encryptPartFilesAtomic(
        [partPathTmp, partPathTmp1],
        23,
        sha256Hex(Buffer.from('hello-part-0-and-part-1')),
        unitDestOk,
        `user:${TENANT_A}`
      );
    } finally {
      fs.promises.open = origOpen;
    }
    assert.equal(writeOpenedPaths.length, 1);
    assert.equal(path.dirname(writeOpenedPaths[0]), unitDestDir);
    assert.ok(writeOpenedPaths[0].endsWith('.enc.tmp'));

    const unitDestFail = path.join(unitDestDir, 'unit_fail.bin');
    await assert.rejects(
      () => vaultCrypto.encryptPartFilesAtomic([partPathTmp], 12, 'f'.repeat(64), unitDestFail, `user:${TENANT_A}`),
      /SHA-256/
    );
    assert.equal(fs.readdirSync(unitDestDir).some((n) => n.endsWith('.enc.tmp')), false);

    // 13. Verificação de /api/tenant/folder-sync/apply em servidor/server.js (Basic Auth + readOnly + PIN + notifyNextVaultIndexSync)
    const serverSrc = fs.readFileSync(path.join(process.cwd(), 'servidor', 'server.js'), 'utf8');
    const folderSyncMatch = serverSrc.match(/app\.post\(['"]\/api\/tenant\/folder-sync\/apply['"],\s*([A-Za-z0-9_]+)/);
    assert.ok(folderSyncMatch, 'Rota /api/tenant/folder-sync/apply deve existir em servidor/server.js');
    assert.equal(
      folderSyncMatch[1],
      'verifyTenantAuthOrDeviceToken',
      'folder-sync/apply deve aceitar Authorization: Basic via verifyTenantAuthOrDeviceToken'
    );
    const folderSyncBlockStart = serverSrc.indexOf("app.post('/api/tenant/folder-sync/apply'");
    const folderSyncBlock = serverSrc.slice(folderSyncBlockStart, folderSyncBlockStart + 4000);
    assert.ok(folderSyncBlock.includes('req.tenant.readOnly'), 'folder-sync/apply deve checar readOnly (403)');
    assert.ok(folderSyncBlock.includes('assertFolderPinUnlockedIfRequired'), 'folder-sync/apply deve checar PIN (423)');
    assert.ok(folderSyncBlock.includes('notifyNextVaultIndexSync'), 'folder-sync/apply deve disparar notifyNextVaultIndexSync');
    assert.ok(folderSyncBlock.includes("action: 'delete'"), 'folder-sync/apply deve notificar action: delete');

    console.log('ALL_CHUNKED_UPLOAD_TESTS_PASSED');
  } finally {
    await new Promise((r) => httpServer.close(r));
    await new Promise((r) => webhookServer.close(r));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
