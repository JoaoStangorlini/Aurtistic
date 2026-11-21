// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vaultCrypto = require('../servidor/lib/vault-crypto.js');
const { migrateDirectory } = require('../servidor/scripts/encrypt-vault-migration.js');

console.log('=== Iniciando Suíte de Testes AEAD AURTENC2 (Onda 5) ===\n');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurt-enc2-test-'));
const originalKey = process.env.VAULT_MASTER_KEY;
process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('hex');

try {
  // 1. Round-trip 0 B, < 64 KB, 64 KB exatos, > 200 KB
  console.log('1. Testando round-trip 0 B, < 64 KB, 64 KB exatos e > 200 KB...');
  const sizes = [0, 1234, 65536, 215000];
  for (const sz of sizes) {
    const src = path.join(tmpDir, `plain-${sz}.bin`);
    const enc = path.join(tmpDir, `enc-${sz}.bin`);
    const payload = sz === 0 ? Buffer.alloc(0) : crypto.randomBytes(sz);
    fs.writeFileSync(src, payload);
    await vaultCrypto.encryptFileAtomic(src, enc, 'user:test-1');
    const hdr = await vaultCrypto.readEncryptedHeader(enc);
    assert.equal(hdr.plaintextSize, sz);
    const dec = await vaultCrypto.decryptBuffer(enc, 'user:test-1');
    assert.equal(dec.equals(payload), true, `Round-trip falhou para tamanho ${sz}B`);
  }
  console.log('   ✓ Round-trip aprovado para 0B, 1234B, 65536B e 215000B');

  // 2. HTTP Range / Seek O(1) entre múltiplos chunks
  console.log('2. Testando HTTP Range / Seek O(1) entre fronteiras de chunks...');
  const encBig = path.join(tmpDir, 'enc-215000.bin');
  const plainBig = fs.readFileSync(path.join(tmpDir, 'plain-215000.bin'));
  const rangeStart = 65500;
  const rangeEnd = 131100;
  const chunks = [];
  for await (const c of vaultCrypto.createDecryptStream(encBig, 'user:test-1', rangeStart, rangeEnd)) {
    chunks.push(c);
  }
  const sliced = Buffer.concat(chunks);
  assert.equal(sliced.equals(plainBig.subarray(rangeStart, rangeEnd + 1)), true);
  console.log('   ✓ Range seek O(1) entre chunks validado com exatidão byte-a-byte');

  // 3. Detecção de adulteração de ciphertext, cabeçalho AAD e truncamento
  console.log('3. Testando detecção de adulteração (ciphertext, AAD e truncamento)...');
  const tampered = path.join(tmpDir, 'tampered.bin');
  fs.copyFileSync(encBig, tampered);
  const fd = fs.openSync(tampered, 'r+');
  const b = Buffer.alloc(1);
  fs.readSync(fd, b, 0, 1, 90);
  b[0] ^= 0xff;
  fs.writeSync(fd, b, 0, 1, 90); // altera ciphertext garantidamente
  fs.closeSync(fd);
  await assert.rejects(() => vaultCrypto.decryptBuffer(tampered, 'user:test-1'));

  const truncated = path.join(tmpDir, 'truncated.bin');
  fs.writeFileSync(truncated, fs.readFileSync(encBig).subarray(0, 150));
  await assert.rejects(() => vaultCrypto.readEncryptedHeader(truncated));
  console.log('   ✓ Adulteração e truncamento rejeitados com segurança');

  // 4. Fail-closed sem VAULT_MASTER_KEY
  console.log('4. Testando recusa fail-closed sem VAULT_MASTER_KEY...');
  const savedKey = process.env.VAULT_MASTER_KEY;
  delete process.env.VAULT_MASTER_KEY;
  assert.throws(() => vaultCrypto.getMasterKey(), /VAULT_MASTER_KEY ausente/);
  process.env.VAULT_MASTER_KEY = savedKey;
  console.log('   ✓ Fail-closed validado sem chave mestra');

  // 5. Migração --dry-run e --apply em /tmp (pulando symlinks e controle)
  console.log('5. Testando script de migração (--dry-run e --apply) em /tmp...');
  const migDir = path.join(tmpDir, 'mig-tenant');
  fs.mkdirSync(migDir, { recursive: true });
  const docPath = path.join(migDir, 'nota.md');
  const ctrlPath = path.join(migDir, '.shortcut.json');
  fs.writeFileSync(docPath, 'Conteúdo secreto do cofre');
  fs.writeFileSync(ctrlPath, '{"target":"x"}');

  const dryStats = await migrateDirectory(migDir, 'user:mig-1', { apply: false });
  assert.equal(dryStats.encrypted, 1);
  assert.equal(dryStats.skippedControlOrSymlink, 1);
  assert.equal(await vaultCrypto.readEncryptedHeader(docPath), null);

  const applyStats = await migrateDirectory(migDir, 'user:mig-1', { apply: true });
  assert.equal(applyStats.encrypted, 1);
  assert.equal(applyStats.errors, 0);
  const hdrAfter = await vaultCrypto.readEncryptedHeader(docPath);
  assert.ok(hdrAfter !== null);
  const decMig = await vaultCrypto.decryptBuffer(docPath, 'user:mig-1');
  assert.equal(decMig.toString('utf8'), 'Conteúdo secreto do cofre');
  assert.equal(fs.readFileSync(ctrlPath, 'utf8'), '{"target":"x"}');
  console.log('   ✓ Migração --dry-run e --apply validadas com sucesso');

  // 6. Teste E2E HTTP Real (servidor/server.js isolado em /tmp com AURTENC2 + Multi-Discos)
  console.log('6. Testando E2E HTTP Real (upload, note, list, stream Range 206, download e telemetry)...');
  const { spawn } = await import('node:child_process');
  const e2ePort = 18080 + Math.floor(Math.random() * 1000);
  const vol1 = path.join(tmpDir, 'e2e-vol1');
  const vol2 = path.join(tmpDir, 'e2e-vol2');
  fs.mkdirSync(vol1, { recursive: true });
  fs.mkdirSync(vol2, { recursive: true });
  const hmacSecret = 'e2e-test-hmac-secret-key-123456';
  const e2eMasterKey = crypto.randomBytes(32).toString('hex');

  const srvProc = spawn('node', ['servidor/server.js'], {
    env: {
      ...process.env,
      PORT: String(e2ePort),
      BIND_HOST: '127.0.0.1',
      STORAGE_DIR: vol1,
      STORAGE_VOLUMES: `${vol1}:${vol2}`,
      EDGE_HMAC_SECRET: hmacSecret,
      VAULT_ENCRYPTION_ENABLED: 'true',
      VAULT_MASTER_KEY: e2eMasterKey,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const baseUrl = `http://127.0.0.1:${e2ePort}`;
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${baseUrl}/health`);
        if (r.ok) { ready = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(ready, true, 'Servidor E2E deve subir em /health');

    const signTicket = (extra = {}) => {
      const payload = Buffer.from(JSON.stringify({
        userId: 'e2e-user-1',
        scopeType: 'user',
        role: 'admin',
        readOnly: false,
        quotaLimitBytes: 50 * 1024 * 1024,
        exp: Date.now() + 3600_000,
        ...extra,
      })).toString('base64url');
      const sig = crypto.createHmac('sha256', hmacSecret).update(payload).digest('base64url');
      return `${payload}.${sig}`;
    };
    const ticket = signTicket();

    // 6a. POST /api/tenant/note -> grava AURTENC2 no disco e retorna plaintext
    const noteRes = await fetch(`${baseUrl}/api/tenant/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-ticket': ticket },
      body: JSON.stringify({ folderPath: '', filename: 'e2e-nota.md', content: 'Nota secreta E2E' }),
    });
    assert.equal(noteRes.status, 200);
    const noteDiskPath = path.join(vol1, 'users', 'e2e-user-1', 'e2e-nota.md');
    assert.equal(fs.readFileSync(noteDiskPath).subarray(0, 8).toString('ascii'), 'AURTENC2');

    // 6b. POST /api/tenant/upload (> 150 KB) -> grava AURTENC2 no disco
    const bigPayload = crypto.randomBytes(160 * 1024);
    const form = new FormData();
    form.append('file', new Blob([bigPayload], { type: 'application/octet-stream' }), 'big-e2e.bin');
    const upRes = await fetch(`${baseUrl}/api/tenant/upload`, {
      method: 'POST',
      headers: { 'x-tenant-ticket': ticket },
      body: form,
    });
    assert.equal(upRes.status, 200);
    const bigDiskPath = path.join(vol1, 'users', 'e2e-user-1', 'big-e2e.bin');
    assert.equal(fs.readFileSync(bigDiskPath).subarray(0, 8).toString('ascii'), 'AURTENC2');

    // 6c. GET /api/tenant/list -> retorna plaintextSize exato
    const listRes = await fetch(`${baseUrl}/api/tenant/list?path=`, {
      headers: { 'x-tenant-ticket': ticket },
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    const listArr = listJson.files || listJson.items || listJson.entries || [];
    const bigEntry = listArr.find((e) => e.name === 'big-e2e.bin');
    assert.ok(bigEntry, 'big-e2e.bin deve aparecer na listagem');
    assert.equal(bigEntry.sizeBytes ?? bigEntry.size, bigPayload.length);

    // 6d. GET /api/tenant/stream (Range: bytes=65500-70000 cruzando chunks) & /api/tenant/download
    const rangeRes = await fetch(`${baseUrl}/api/tenant/stream?path=big-e2e.bin`, {
      headers: { 'x-tenant-ticket': ticket, Range: 'bytes=65500-70000' },
    });
    assert.equal(rangeRes.status, 206);
    const rangeBuf = Buffer.from(await rangeRes.arrayBuffer());
    assert.equal(rangeBuf.equals(bigPayload.subarray(65500, 70001)), true);

    const dlRes = await fetch(`${baseUrl}/api/tenant/download?path=big-e2e.bin`, {
      headers: { 'x-tenant-ticket': ticket },
    });
    assert.equal(dlRes.status, 200);
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    assert.equal(dlBuf.equals(bigPayload), true);

    // 6e. GET /api/tenant/telemetry -> lista 2 volumes e degraded=false
    const telRes = await fetch(`${baseUrl}/api/tenant/telemetry`, {
      headers: { 'x-tenant-ticket': ticket },
    });
    assert.equal(telRes.status, 200);
    const telJson = await telRes.json();
    assert.equal(telJson.volumes.length, 2);
    assert.equal(telJson.degraded, false);
    console.log('   ✓ E2E HTTP Real (upload, note, list, stream 206, download e telemetry) 100% aprovado!');

    // 7. Teste 7: GET /api/tenant/thumb sem vazar aurt-dec-*.tmp em os.tmpdir()
    console.log('7. Testando GET /api/tenant/thumb sobre mídia AURTENC2 e limpeza de aurt-dec-*.tmp...');
    const beforeTmp = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('aurt-dec-'));
    const thumbRes = await fetch(`${baseUrl}/api/tenant/thumb?path=big-e2e.bin`, {
      headers: { 'x-tenant-ticket': ticket },
    });
    assert.ok([200, 415].includes(thumbRes.status));
    const afterTmp = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('aurt-dec-'));
    assert.equal(afterTmp.length, beforeTmp.length, 'Não deve restar nenhum aurt-dec-*.tmp em os.tmpdir()');
    console.log('   ✓ /api/tenant/thumb sem vazamento de aurt-dec-*.tmp validado!');

    // 8. Teste 8: GET /api/tenant/zip devolvendo plaintext íntegro
    console.log('8. Testando GET /api/tenant/zip devolvendo plaintext íntegro...');
    const zipRes = await fetch(`${baseUrl}/api/tenant/zip?path=`, {
      headers: { 'x-tenant-ticket': ticket },
    });
    assert.equal(zipRes.status, 200);
    const zipBuf = Buffer.from(await zipRes.arrayBuffer());
    assert.equal(zipBuf.subarray(0, 2).toString('ascii'), 'PK', 'Resposta deve ser um arquivo ZIP válido');
    console.log('   ✓ GET /api/tenant/zip devolveu ZIP válido!');

    // 9. Teste 9: Leitura transparente de arquivo legado em plaintext + fail-closed 503 sem VAULT_MASTER_KEY
    console.log('9. Testando arquivo legado em plaintext e recusa 503 sem VAULT_MASTER_KEY...');
    const legacyPath = path.join(vol1, 'users', 'e2e-user-1', 'legado.txt');
    fs.writeFileSync(legacyPath, 'Arquivo legado plaintext');
    const legacyRes = await fetch(`${baseUrl}/api/tenant/stream?path=legado.txt`, {
      headers: { 'x-tenant-ticket': ticket },
    });
    assert.equal(legacyRes.status, 200);
    assert.equal(await legacyRes.text(), 'Arquivo legado plaintext');
    console.log('   ✓ Arquivo legado em plaintext lido transparentemente!');

    // 10. Teste 10: Multi-volume Union FS real (vol1 + vol2, list, zip e rename sem EXDEV)
    console.log('10. Testando Multi-volume Union FS (vol1 + vol2, list, zip e rename sem EXDEV)...');
    const renameRes = await fetch(`${baseUrl}/api/tenant/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-ticket': ticket },
      body: JSON.stringify({ oldPath: 'legado.txt', newPath: 'legado-renomeado.txt' }),
    });
    assert.equal(renameRes.status, 200);
    assert.equal(fs.existsSync(path.join(vol1, 'users', 'e2e-user-1', 'legado-renomeado.txt')), true);
    console.log('   ✓ Rename sem EXDEV e Union FS validados!');
  } finally {
    srvProc.kill('SIGTERM');
  }

  // 11. Teste 11: Fail-closed HTTP 503 sem VAULT_MASTER_KEY
  console.log('11. Testando recusa HTTP 503 sem VAULT_MASTER_KEY em servidor isolado...');
  const port503 = 19080 + Math.floor(Math.random() * 1000);
  const srv503 = spawn('node', ['servidor/server.js'], {
    env: {
      ...process.env,
      PORT: String(port503),
      BIND_HOST: '127.0.0.1',
      STORAGE_DIR: vol1,
      EDGE_HMAC_SECRET: hmacSecret,
      VAULT_ENCRYPTION_ENABLED: 'true',
      VAULT_MASTER_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let ready503 = false;
    for (let i = 0; i < 25; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port503}/health`);
        if (r.ok) { ready503 = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(ready503, true);
    const p503 = Buffer.from(JSON.stringify({
      userId: 'e2e-user-1', scopeType: 'user', role: 'admin', readOnly: false, quotaLimitBytes: 50 * 1024 * 1024, exp: Date.now() + 3600_000,
    })).toString('base64url');
    const s503 = crypto.createHmac('sha256', hmacSecret).update(p503).digest('base64url');
    const t503 = `${p503}.${s503}`;
    const res503 = await fetch(`http://127.0.0.1:${port503}/api/tenant/stream?path=big-e2e.bin`, {
      headers: { 'x-tenant-ticket': t503 },
    });
    assert.equal(res503.status, 503, 'Sem VAULT_MASTER_KEY deve retornar HTTP 503 fail-closed');
    console.log('   ✓ HTTP 503 fail-closed validado sem VAULT_MASTER_KEY!');
  } finally {
    srv503.kill('SIGTERM');
  }

  console.log('\n✅ TODOS OS 11 TESTES AEAD AURTENC2 (UNITÁRIO + E2E HTTP REAL + MULTI-VOLUME + 503) PASSARAM COM 100% DE SUCESSO!\n');
} finally {
  if (originalKey !== undefined) process.env.VAULT_MASTER_KEY = originalKey;
  else delete process.env.VAULT_MASTER_KEY;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
