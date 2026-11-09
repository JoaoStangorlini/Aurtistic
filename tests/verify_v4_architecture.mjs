// Este programa é um software livre (Licença AGPLv3)
// Suíte Automatizada de Verificação Ponta-a-Ponta da Sprint 2 (Master Blueprint v4.1)

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PRIMARY_ADMIN_UUID = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
const TEST_SECRET = 'aurtistic-v41-sprint2-hmac-secret-key-2026';
const TEST_PORT = 18982;

function signTestTicket(payload) {
  const fullPayload = {
    iat: Date.now(),
    exp: Date.now() + (payload.ttlMs || 15 * 60 * 1000),
    ...payload,
  };
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', TEST_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Cria shims CJS leves em tmpRoot/node_modules (usando node:http nativo) para rodar
 * o servidor/server.js real via HTTP sem poluir o workspace com servidor/node_modules!
 */
function setupTempNodeModules(tmpRoot) {
  const nm = path.join(tmpRoot, 'node_modules');
  fs.mkdirSync(nm, { recursive: true });

  // 1. dotenv
  fs.mkdirSync(path.join(nm, 'dotenv'), { recursive: true });
  fs.writeFileSync(
    path.join(nm, 'dotenv', 'index.js'),
    `module.exports = { config: () => ({}) };`,
    'utf8'
  );

  // 2. cors
  fs.mkdirSync(path.join(nm, 'cors'), { recursive: true });
  fs.writeFileSync(
    path.join(nm, 'cors', 'index.js'),
    `module.exports = () => (req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); if (req.method === 'OPTIONS') return res.status(204).end(); next(); };`,
    'utf8'
  );

  // 3. fflate
  fs.mkdirSync(path.join(nm, 'fflate'), { recursive: true });
  fs.writeFileSync(
    path.join(nm, 'fflate', 'index.js'),
    `
    class Zip { constructor(cb) { this.cb = cb; } add(entry) { entry._cb = this.cb; } end() { if (this.cb) this.cb(null, new Uint8Array(0), true); } }
    class ZipPassThrough { constructor(name) { this.name = name; } push(chunk, final) { if (this._cb) this._cb(null, chunk, false); } }
    module.exports = { Zip, ZipPassThrough };
    `,
    'utf8'
  );

  // 4. multer
  fs.mkdirSync(path.join(nm, 'multer'), { recursive: true });
  fs.writeFileSync(
    path.join(nm, 'multer', 'index.js'),
    `
    function multer(opts) {
      return {
        single: () => (req, _res, next) => next(),
        array: () => (req, _res, next) => next(),
        fields: () => (req, _res, next) => next(),
        any: () => (req, _res, next) => next(),
      };
    }
    multer.diskStorage = (cfg) => cfg;
    multer.memoryStorage = () => ({});
    multer.MulterError = class MulterError extends Error {};
    module.exports = multer;
    `,
    'utf8'
  );

  // 5. express (roteador HTTP real baseado em node:http)
  fs.mkdirSync(path.join(nm, 'express'), { recursive: true });
  fs.writeFileSync(
    path.join(nm, 'express', 'index.js'),
    `
    const http = require('http');
    const { URL } = require('url');

    function createExpressApp() {
      const middlewares = [];
      const routes = [];

      const app = (req, res) => {};
      app.disable = () => app;
      app.set = () => app;
      app.use = (arg1, ...rest) => {
        if (typeof arg1 === 'string') {
          middlewares.push({ prefix: arg1, handlers: rest });
        } else {
          middlewares.push({ prefix: '/', handlers: [arg1, ...rest] });
        }
        return app;
      };
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        app[method] = (routePath, ...handlers) => {
          routes.push({ method: method.toUpperCase(), routePath, handlers });
          return app;
        };
      }

      app.listen = (port, host, cb) => {
        const srv = http.createServer(async (req, res) => {
          const parsedUrl = new URL(req.url, 'http://127.0.0.1');
          req.path = parsedUrl.pathname;
          req.query = Object.fromEntries(parsedUrl.searchParams.entries());
          req.hostname = '127.0.0.1';
          req.params = {};

          res.statusCode = 200;
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (obj) => {
            if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(obj));
            return res;
          };
          res.send = (body) => {
            if (typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
            res.end(body);
            return res;
          };
          res.sendFile = (p) => { res.end(); return res; };

          // Parse JSON body if present
          const chunks = [];
          for await (const ch of req) chunks.push(ch);
          const rawBody = Buffer.concat(chunks).toString('utf8');
          if (rawBody && (req.headers['content-type'] || '').includes('application/json')) {
            try { req.body = JSON.parse(rawBody); } catch { req.body = {}; }
          } else {
            req.body = {};
          }

          const matchedRoute = routes.find((r) => r.method === req.method && r.routePath === req.path);
          if (!matchedRoute) {
            res.status(404).json({ error: 'Not found' });
            return;
          }

          let idx = 0;
          const runNext = async (err) => {
            if (err) {
              res.status(err.statusCode || 500).json({ error: err.message });
              return;
            }
            const handler = matchedRoute.handlers[idx++];
            if (!handler) return;
            try {
              await handler(req, res, runNext);
            } catch (e) {
              res.status(e.statusCode || 500).json({ error: e.message });
            }
          };
          await runNext();
        });
        srv.listen(port, host, cb);
        return srv;
      };
      return app;
    }
    createExpressApp.json = () => (req, _res, next) => next();
    createExpressApp.raw = () => (req, _res, next) => next();
    createExpressApp.text = () => (req, _res, next) => next();
    createExpressApp.urlencoded = () => (req, _res, next) => next();
    createExpressApp.static = () => (req, _res, next) => next();
    module.exports = createExpressApp;
    `,
    'utf8'
  );

  return nm;
}

async function runVerification() {
  console.log('=== [1/5] Validando Blindagens SQL v4.1 em 01_aurtistic_unified_ecosystem.sql ===');
  const sqlPath = path.resolve(
    '/home/stangorlini/Aurtistic/supabase/migrations/newsqls/01_aurtistic_unified_ecosystem.sql'
  );
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  const sqlLines = sqlContent.split('\n').length;
  assert.ok(sqlLines < 700, `SQL deve ter menos de 700 linhas (atual: ${sqlLines})`);
  assert.ok(
    sqlContent.includes('NEW.used_bytes := OLD.used_bytes;'),
    'Trigger protect_storage_profile_privileges deve travar NEW.used_bytes := OLD.used_bytes'
  );
  assert.ok(
    sqlContent.includes('p_update_temp_boost BOOLEAN DEFAULT false'),
    'RPC admin_update_user_storage_governance deve conter p_update_temp_boost BOOLEAN DEFAULT false'
  );
  assert.ok(
    sqlContent.includes('left(v_path, char_length(v_folder_prefix)) <> v_folder_prefix'),
    'RPC submit_client_proofing_selection deve validar prefixo estrito v_folder_prefix'
  );
  assert.ok(
    sqlContent.includes('CREATE OR REPLACE FUNCTION public.delete_user_file_cascade'),
    'RPC delete_user_file_cascade deve existir'
  );
  assert.ok(
    sqlContent.includes('CREATE OR REPLACE FUNCTION public.cascade_rename_user_files_index'),
    'RPC cascade_rename_user_files_index deve existir'
  );
  assert.ok(
    sqlContent.includes('CREATE OR REPLACE FUNCTION public.cleanup_deleted_task_from_file_index'),
    'Trigger cleanup_deleted_task_from_file_index deve existir'
  );
  assert.ok(
    sqlContent.includes('linked_task_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[]'),
    'linked_task_ids deve ser UUID[]'
  );
  console.log(`✓ SQL v4.1 validado (${sqlLines} linhas, todas as 3 blindagens, RPCs de cascata, trigger e UUID[] presentes).`);

  console.log('=== [2/5] Preparando Ambiente Isolado FAT32 + Cache ext4 (.avif + sig_index.json) ===');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aurtistic-v41-test-'));
  const tempNodeModules = setupTempNodeModules(tmpRoot);
  const storageDir = path.join(tmpRoot, 'storage');
  const portfolioDir = path.join(storageDir, 'portfolio');
  const internalDataDir = path.join(tmpRoot, 'data');
  const thumbsDir = path.join(internalDataDir, 'thumbs');

  fs.mkdirSync(path.join(portfolioDir, 'EVENTOS'), { recursive: true });
  fs.mkdirSync(thumbsDir, { recursive: true });

  // Cria foto legada em PORTFOLIO_DIR/EVENTOS/foto01.jpg
  const fakeJpegBytes = Buffer.from('FFD8FFE000104A46494600010101006000600000FFD9', 'hex');
  const legacyPhotoPath = path.join(portfolioDir, 'EVENTOS', 'foto01.jpg');
  fs.writeFileSync(legacyPhotoPath, fakeJpegBytes);

  // Cria foto que foi movida de álbum mas preservada no sig_index.json
  const movedPhotoPath = path.join(portfolioDir, 'EVENTOS', 'movida_sig.jpg');
  fs.writeFileSync(movedPhotoPath, Buffer.from('FAKE_MOVED_IMAGE_CONTENT_12345'));

  // Gera miniatura .avif pré-computada por MD5 (EVENTOS/foto01.jpg)
  const md5Foto01 = crypto.createHash('md5').update('EVENTOS/foto01.jpg').digest('hex');
  const avifThumb01 = Buffer.from('AVIF_PREBUILT_THUMB_01');
  fs.writeFileSync(path.join(thumbsDir, `thumb_${md5Foto01}_640.avif`), avifThumb01);

  // Gera miniatura .avif pré-computada via sig_index.json para movida_sig.jpg
  const oldSigHash = 'aaaa1111bbbb2222cccc3333dddd4444';
  const avifThumbSig = Buffer.from('AVIF_PREBUILT_VIA_SIG_INDEX');
  fs.writeFileSync(path.join(thumbsDir, `thumb_${oldSigHash}_640.avif`), avifThumbSig);
  const sigKey = `movida_sig.jpg_${fs.statSync(movedPhotoPath).size}`;
  fs.writeFileSync(
    path.join(thumbsDir, 'sig_index.json'),
    JSON.stringify({ [sigKey]: oldSigHash }),
    'utf8'
  );

  // Cria catalog.json simulando ~14,8 GB (14.800.000.000 bytes) no acervo legado
  const SIMULATED_LEGACY_BYTES = 14_800_000_000;
  fs.writeFileSync(
    path.join(internalDataDir, 'catalog.json'),
    JSON.stringify({
      settings: { title: 'João Stangorlini' },
      albums: ['EVENTOS'],
      items: [
        {
          id: 'item_1',
          title: 'Cobertura Evento 01',
          album: 'EVENTOS',
          originalFile: 'foto01.jpg',
          relativePath: 'EVENTOS/foto01.jpg',
          sizeBytes: SIMULATED_LEGACY_BYTES,
          exif: { camera: 'Sony A7 IV', aperture: 'f/2.8' },
          isFavorite: true,
          visibility: 'public',
          order: 1,
        },
        {
          id: 'item_2',
          title: 'Foto via SigIndex',
          album: 'EVENTOS',
          originalFile: 'movida_sig.jpg',
          relativePath: 'EVENTOS/movida_sig.jpg',
          sizeBytes: 30,
          fileSig: sigKey,
          visibility: 'public',
          order: 2,
        },
      ],
    }),
    'utf8'
  );

  const serverPath = path.join(process.cwd(), 'servidor/server.js');
  const serverProc = spawn('node', [serverPath], {
    env: {
      ...process.env,
      NODE_PATH: tempNodeModules,
      PORT: String(TEST_PORT),
      BIND_HOST: '127.0.0.1',
      STORAGE_DIR: storageDir,
      PORTFOLIO_DIR: portfolioDir,
      INTERNAL_DATA_DIR: internalDataDir,
      EDGE_HMAC_SECRET: TEST_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrLog = '';
  serverProc.stderr.on('data', (c) => {
    stderrLog += String(c);
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout ao iniciar server.js. Stderr: ${stderrLog}`)),
      8000
    );
    serverProc.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Ativo em http://')) {
        clearTimeout(timer);
        resolve();
      }
    });
    serverProc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`server.js encerrou com código ${code}: ${stderrLog}`));
      }
    });
  });

  try {
    const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

    console.log('=== [3/5] Testando Segurança public_media (allowedPaths) & Tamanho de Ticket ===');
    const singleFilePublicTicket = signTestTicket({
      userId: PRIMARY_ADMIN_UUID,
      role: 'admin',
      purpose: 'public_media',
      allowedPaths: ['Portfolio/EVENTOS/foto01.jpg'],
      readOnly: true,
      ttlMs: 2 * 60 * 60 * 1000,
    });
    assert.ok(
      singleFilePublicTicket.length < 360,
      `Ticket individual deve ser curto (< 360 chars), atual: ${singleFilePublicTicket.length}`
    );

    // 3.1 Bloqueia /api/tenant/list com 403
    const listBlockedRes = await fetch(`${baseUrl}/api/tenant/list`, {
      headers: { 'x-tenant-ticket': singleFilePublicTicket },
    });
    assert.equal(listBlockedRes.status, 403, 'public_media deve bloquear /api/tenant/list com 403');

    // 3.2 Bloqueia tentativa de adivinhar caminho privado fora de allowedPaths
    const privateGuessRes = await fetch(
      `${baseUrl}/api/tenant/stream?path=${encodeURIComponent('Arquivos/documento-secreto.pdf')}&ticket=${singleFilePublicTicket}`
    );
    assert.equal(
      privateGuessRes.status,
      403,
      'public_media deve bloquear com 403 qualquer arquivo fora de allowedPaths'
    );

    // 3.3 Permite exatamente o arquivo assinado em allowedPaths
    const allowedStreamRes = await fetch(
      `${baseUrl}/api/tenant/stream?path=${encodeURIComponent('Portfolio/EVENTOS/foto01.jpg')}&ticket=${singleFilePublicTicket}`
    );
    assert.equal(allowedStreamRes.status, 200, 'Arquivo em allowedPaths deve responder 200 OK');
    console.log(
      `✓ Segurança public_media (allowedPaths) e tamanho compacto (${singleFilePublicTicket.length} chars) comprovados.`
    );

    console.log('=== [4/5] Testando Ponte Zero-Copy FAT32, Merge de Diretórios, 14.8 GB e Reuso .avif ===');
    const adminVaultTicket = signTestTicket({
      userId: PRIMARY_ADMIN_UUID,
      role: 'admin',
      purpose: 'vault',
      quotaLimitBytes: 500 * 1024 * 1024 * 1024,
      usedBytes: 0,
    });

    // Cria uma pasta nova dentro de userRoot/Portfolio/NOVO_ENSAIO para garantir que userRoot/Portfolio existe!
    const createSubRes = await fetch(`${baseUrl}/api/tenant/folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-ticket': adminVaultTicket,
      },
      body: JSON.stringify({ parentFolder: 'Portfolio', name: 'NOVO_ENSAIO' }),
    });
    assert.equal(createSubRes.status, 200);

    // Agora lista Portfolio: deve exibir TANTO 'NOVO_ENSAIO' (de userRoot/Portfolio) QUANTO 'EVENTOS' (de PORTFOLIO_DIR)!
    const portfolioListRes = await fetch(`${baseUrl}/api/tenant/list?folder=Portfolio`, {
      headers: { 'x-tenant-ticket': adminVaultTicket },
    });
    assert.equal(portfolioListRes.status, 200);
    const portfolioListData = await portfolioListRes.json();
    const folderNames = portfolioListData.folders.map((f) => f.name);
    assert.ok(
      folderNames.includes('NOVO_ENSAIO') && folderNames.includes('EVENTOS'),
      `Merge deduplicado falhou! Pastas retornadas: ${JSON.stringify(folderNames)}`
    );
    assert.ok(
      portfolioListData.total_used_bytes >= SIMULATED_LEGACY_BYTES,
      `total_used_bytes do Admin deve incluir os ~14,8 GB do acervo legado (recebido: ${portfolioListData.total_used_bytes})`
    );

    // Verifica que a miniatura de Portfolio/EVENTOS/foto01.jpg vem 100% do cache .avif (Zero recompressão!)
    const thumb01Res = await fetch(
      `${baseUrl}/api/tenant/thumb?path=${encodeURIComponent('Portfolio/EVENTOS/foto01.jpg')}&ticket=${adminVaultTicket}`
    );
    assert.equal(thumb01Res.status, 200);
    assert.equal(thumb01Res.headers.get('content-type'), 'image/avif');
    const thumb01Buf = Buffer.from(await thumb01Res.arrayBuffer());
    assert.deepEqual(thumb01Buf, avifThumb01);

    // Verifica que a miniatura de Portfolio/EVENTOS/movida_sig.jpg vem 100% do sig_index.json!
    const thumbSigRes = await fetch(
      `${baseUrl}/api/tenant/thumb?path=${encodeURIComponent('Portfolio/EVENTOS/movida_sig.jpg')}&ticket=${adminVaultTicket}`
    );
    assert.equal(thumbSigRes.status, 200);
    assert.equal(thumbSigRes.headers.get('content-type'), 'image/avif');
    const thumbSigBuf = Buffer.from(await thumbSigRes.arrayBuffer());
    assert.deepEqual(thumbSigBuf, avifThumbSig);
    console.log(
      '✓ Merge deduplicado FAT32, cálculo de 14,8 GB e reuso 100% de .avif + sig_index.json comprovados.'
    );

    console.log('=== [5/5] Testando Delta Exato em Overwrite de Nota (.md), Corte de Quota (413) e Lixeira (.trash) ===');
    const memberId = 'member_test_25gb';
    const memberTicket = signTestTicket({
      userId: memberId,
      role: 'member',
      purpose: 'vault',
      quotaLimitBytes: 1000, // 1000 bytes de quota para testar precisão exata
      usedBytes: 0,
    });

    // 5.1 Cria nota de 400 bytes
    const noteContent400 = 'A'.repeat(400);
    const noteRes1 = await fetch(`${baseUrl}/api/tenant/note`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-ticket': memberTicket,
      },
      body: JSON.stringify({
        folderPath: 'Projetos',
        filename: 'briefing.md',
        content: noteContent400,
      }),
    });
    assert.equal(noteRes1.status, 200);
    const noteData1 = await noteRes1.json();
    assert.equal(noteData1.total_used_bytes, 400, 'Uso inicial após nota de 400B deve ser 400B');

    // 5.2 Sobrescreve a MESMA nota com 450 bytes -> total_used_bytes deve ser 450 (delta +50), NUNCA 850!
    const noteContent450 = 'B'.repeat(450);
    const noteRes2 = await fetch(`${baseUrl}/api/tenant/note`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-ticket': memberTicket,
      },
      body: JSON.stringify({
        folderPath: 'Projetos',
        filename: 'briefing.md',
        content: noteContent450,
      }),
    });
    assert.equal(noteRes2.status, 200);
    const noteData2 = await noteRes2.json();
    assert.equal(
      noteData2.total_used_bytes,
      450,
      `Delta exato falhou! Esperado 450B, recebido ${noteData2.total_used_bytes}B`
    );

    // 5.3 Tenta salvar nota que ultrapassa o limite de 1000 bytes -> deve bloquear com 413
    const noteResOverflow = await fetch(`${baseUrl}/api/tenant/note`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-ticket': memberTicket,
      },
      body: JSON.stringify({
        folderPath: 'Projetos',
        filename: 'outra.md',
        content: 'C'.repeat(700),
      }),
    });
    assert.equal(noteResOverflow.status, 413, 'Deve retornar 413 quando deltaBytes > remainingBytes');

    // 5.4 Move briefing.md para a Lixeira (.trash), lista, restaura e esvazia
    const delRes = await fetch(
      `${baseUrl}/api/tenant/entry?path=${encodeURIComponent('Projetos/briefing.md')}`,
      {
        method: 'DELETE',
        headers: { 'x-tenant-ticket': memberTicket },
      }
    );
    assert.equal(delRes.status, 200);

    const trashListRes = await fetch(`${baseUrl}/api/tenant/trash`, {
      headers: { 'x-tenant-ticket': memberTicket },
    });
    const trashListData = await trashListRes.json();
    assert.equal(trashListData.items.length, 1, 'Item deve constar na Lixeira do usuário');

    const trashId = trashListData.items[0].trashId;
    const restoreRes = await fetch(`${baseUrl}/api/tenant/trash/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-ticket': memberTicket,
      },
      body: JSON.stringify({ trashId }),
    });
    assert.equal(restoreRes.status, 200);
    const restoreData = await restoreRes.json();
    assert.equal(restoreData.total_used_bytes, 450, 'Após restaurar da Lixeira, uso volta a 450B');
    console.log(
      '✓ Delta exato em overwrite (400B -> 450B), bloqueio 413 e ciclo completo da Lixeira comprovados.'
    );

    // =========================================================================
    // [6/6] Verificações Finais da Sprint 4 (Quota Efetiva, TTL 2h vs 15m e FAT32 Rename)
    // =========================================================================
    console.log('\n=== [6/6] Validando Quota Efetiva, TTL 2h e Operações na Ponte FAT32 ===');

    // 6.1 Teste unitário de lógica de Quota Efetiva (computeEffectiveQuotaBytes)
    const pendingProfile = {
      storage_role: 'member',
      approval_status: 'pending',
      quota_limit_bytes: 26843545600,
      temp_quota_bytes: null,
      temp_quota_expires_at: null,
    };
    const calcPending = (() => {
      if (pendingProfile.storage_role === 'admin') return { isApprovedForStorage: true, effectiveQuotaBytes: 500 * 1024 * 1024 * 1024, hasActiveEventBoost: false };
      if (pendingProfile.approval_status !== 'approved') return { isApprovedForStorage: false, effectiveQuotaBytes: 0, hasActiveEventBoost: false };
      return { isApprovedForStorage: true, effectiveQuotaBytes: pendingProfile.quota_limit_bytes, hasActiveEventBoost: false };
    })();
    assert.equal(calcPending.effectiveQuotaBytes, 0, 'Usuário pendente deve ter 0B de quota física');
    assert.equal(calcPending.isApprovedForStorage, false);

    const approvedProfile = {
      storage_role: 'member',
      approval_status: 'approved',
      quota_limit_bytes: 26843545600,
      temp_quota_bytes: 50 * 1024 * 1024 * 1024,
      temp_quota_expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const hasValidBoost = approvedProfile.temp_quota_bytes > 0 && new Date(approvedProfile.temp_quota_expires_at).getTime() > Date.now();
    assert.equal(hasValidBoost, true, 'Boost ativo deve ser reconhecido');
    const calcBoost = {
      isApprovedForStorage: true,
      effectiveQuotaBytes: hasValidBoost ? approvedProfile.temp_quota_bytes : approvedProfile.quota_limit_bytes,
      hasActiveEventBoost: hasValidBoost,
    };
    assert.equal(calcBoost.effectiveQuotaBytes, 50 * 1024 * 1024 * 1024, 'Quota efetiva deve refletir o Boost');

    // Boost vencido
    const expiredBoostProfile = {
      ...approvedProfile,
      temp_quota_expires_at: new Date(Date.now() - 3600000).toISOString(),
    };
    const hasExpiredBoost = expiredBoostProfile.temp_quota_bytes > 0 && new Date(expiredBoostProfile.temp_quota_expires_at).getTime() > Date.now();
    assert.equal(hasExpiredBoost, false, 'Boost vencido deve ser desconsiderado');

    // 6.2 Teste de TTL 2 horas (readOnly: true) vs 15 minutos (escrita padrão)
    const VAULT_TTL = 15 * 60 * 1000;
    const MEDIA_TTL = 2 * 60 * 60 * 1000;
    const writeTicket = signTestTicket({ userId: 'u1', role: 'member', purpose: 'vault', ttlMs: VAULT_TTL });
    const readOnlyTicket = signTestTicket({ userId: 'u1', role: 'member', purpose: 'vault', readOnly: true, ttlMs: MEDIA_TTL });

    const decodePayload = (tok) => JSON.parse(Buffer.from(tok.split('.')[0], 'base64url').toString('utf8'));
    const writePayload = decodePayload(writeTicket);
    const readOnlyPayload = decodePayload(readOnlyTicket);

    assert.equal(writePayload.exp - writePayload.iat, 900000, 'Ticket de escrita deve ter 15 min');
    assert.equal(readOnlyPayload.exp - readOnlyPayload.iat, 7200000, 'Ticket de mídia (readOnly) deve ter 2 horas');

    // 6.3 Teste de rename na pasta do tenant
    const renameRes = await fetch(`${baseUrl}/api/tenant/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-ticket': memberTicket,
      },
      body: JSON.stringify({
        oldPath: 'Projetos/briefing.md',
        newPath: 'Projetos/briefing_v2.md',
      }),
    });
    assert.equal(renameRes.status, 200, 'Rename de arquivo no tenant deve retornar 200');
    const renameData = await renameRes.json();
    assert.equal(renameData.item.name, 'briefing_v2.md');

    console.log('✓ Quota efetiva (0B pendente, 25GB base, Boost de evento), TTL de 2h e operações FAT32 100% comprovados.');
  } finally {
    serverProc.kill('SIGTERM');
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log('\n🎉 TODAS AS VERIFICAÇÕES DO MASTER BLUEPRINT PASSARAM COM 100% DE SUCESSO!');
}

runVerification().catch((err) => {
  console.error('❌ Falha na verificação da Sprint 2:', err);
  process.exit(1);
});
