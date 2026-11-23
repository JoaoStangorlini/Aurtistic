// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const express = require('../servidor/node_modules/express');

// Simula ambiente mínimo de browser antes de importar edge-client / native-bridge (sem DOM completo)
if (!globalThis.window) {
  const store = new Map();
  globalThis.window = {
    location: { protocol: 'http:' },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    addEventListener: () => {},
  };
}

// Carrega helpers TypeScript simples compilados ou testa contrato HTTP + lógica pura equivalente
// Nota: Node ESM não executa .ts diretamente sem loader; validamos tanto via ts transpiler do Next/TypeScript quanto contrato HTTP real!
import fs from 'node:fs';
import ts from 'typescript';

function loadTsModule(relPath) {
  const fullPath = new URL(`../${relPath}`, import.meta.url).pathname;
  const source = fs.readFileSync(fullPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const mod = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === './edge-urls') {
      return loadTsModule('src/lib/edge-urls.ts');
    }
    if (specifier === '@/types') return {};
    return require(specifier);
  };
  const fn = new Function('exports', 'require', 'module', compiled);
  fn(mod.exports, localRequire, mod);
  return mod.exports;
}

const edgeClient = loadTsModule('src/lib/edge-client.ts');
const nativeBridge = loadTsModule('src/lib/native-bridge.ts');

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function run() {
  // 1. selectAdaptiveChunkSize
  assert.equal(edgeClient.selectAdaptiveChunkSize('http://192.168.0.100:8080'), 32 * 1024 * 1024);
  assert.equal(edgeClient.selectAdaptiveChunkSize('https://storage.hublabdiv.com.br'), 16 * 1024 * 1024);

  // 2. isAllowedLanUrl
  assert.equal(nativeBridge.isAllowedLanUrl('http://192.168.1.50:8080'), true);
  assert.equal(nativeBridge.isAllowedLanUrl('http://10.0.0.5:8080'), true);
  assert.equal(nativeBridge.isAllowedLanUrl('http://172.16.0.10:8080'), true);
  assert.equal(nativeBridge.isAllowedLanUrl('https://storage.hublabdiv.com.br'), true);
  assert.equal(nativeBridge.isAllowedLanUrl('http://evil-public.com:8080'), false);

  // 3. Servidor HTTP simulando /chunked/* (retomada + 202 polling) e /stream (Range + If-Range -> 200)
  const app = express();
  app.use(express.json());

  const receivedChunks = new Map([[0, Buffer.from('AAAA')]]); // Chunk 0 já recebido (simula retomada)
  let pollCount = 0;
  let serverFileBuf = Buffer.from('0123456789ABCDEF'); // 16 bytes
  let serverEtag = '"v1-16"';

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'aurtistic-edge' }));

  app.get('/api/tenant/upload/chunked/:id/status', (req, res) => {
    if (req.query.afterComplete === '1' || pollCount >= 2) {
      return res.json({
        ok: true,
        state: 'completed',
        success: true,
        item: { name: 'big.bin', relativePath: 'Projetos/big.bin', sizeBytes: 8 },
        total_used_bytes: 8,
      });
    }
    if (pollCount > 0) {
      pollCount++;
      return res.json({ ok: true, state: 'finalizing' });
    }
    return res.json({
      ok: true,
      state: 'uploading',
      chunkSize: 4,
      totalChunks: 2,
      uploadedChunks: Array.from(receivedChunks.keys()),
    });
  });

  app.put('/api/tenant/upload/chunked/:id/:idx', (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      assert.equal(req.headers['x-chunk-sha256'], sha256Hex(body));
      receivedChunks.set(Number(req.params.idx), body);
      res.json({ ok: true });
    });
  });

  app.post('/api/tenant/upload/chunked/:id/complete', (_req, res) => {
    pollCount = 1;
    res.status(202).json({
      ok: true,
      state: 'finalizing',
      pollUrl: '/api/tenant/upload/chunked/sess-resume/status',
    });
  });

  app.head('/api/tenant/stream', (_req, res) => {
    res.setHeader('Content-Length', String(serverFileBuf.length));
    res.setHeader('ETag', serverEtag);
    res.setHeader('X-Plaintext-Sha256', sha256Hex(serverFileBuf));
    res.status(200).end();
  });

  app.get('/api/tenant/stream', (req, res) => {
    const range = req.headers.range;
    const ifRange = req.headers['if-range'];
    if (range && (!ifRange || ifRange === serverEtag)) {
      const m = /^bytes=(\d+)-(\d+)$/.exec(String(range));
      const start = Number(m[1]);
      const end = Math.min(Number(m[2]), serverFileBuf.length - 1);
      res.status(206);
      res.setHeader('ETag', serverEtag);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${serverFileBuf.length}`);
      res.setHeader('Content-Length', String(end - start + 1));
      return res.end(serverFileBuf.subarray(start, end + 1));
    }
    // If-Range divergente -> 200 completo com novo arquivo
    res.status(200);
    res.setHeader('ETag', serverEtag);
    res.setHeader('Content-Length', String(serverFileBuf.length));
    return res.end(serverFileBuf);
  });

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // A. Retomada de upload chunked + polling 202 -> completed
    const fileData = new Uint8Array(Buffer.from('AAAABBBB'));
    const fakeFile = new File([fileData], 'big.bin', { type: 'application/octet-stream' });
    const phases = [];
    const upRes = await edgeClient.uploadTenantFileChunked({
      file: fakeFile,
      folderPath: 'Projetos',
      ticket: 'tkt',
      serverUrl: baseUrl,
      resumeUploadId: 'sess-resume',
      onPhaseChange: (p) => phases.push(p),
    });
    assert.equal(upRes.success, true);
    assert.ok(phases.includes('finalizing'));
    assert.ok(phases.includes('completed'));
    assert.equal(receivedChunks.get(1).toString('utf8'), 'BBBB');

    // B. Download em fatias Range 206 + validação SHA-256
    const dl1 = await edgeClient.downloadTenantFileResumable({
      relativePath: 'Projetos/big.bin',
      ticket: 'tkt',
      serverUrl: baseUrl,
      partSizeBytes: 6,
    });
    assert.equal(Buffer.from(await dl1.blob.arrayBuffer()).toString('utf8'), '0123456789ABCDEF');

    // C. Retomada com If-Range divergente -> 200 reseta parcial e baixa novo conteúdo íntegro
    serverFileBuf = Buffer.from('NOVO_CONTEUDO_V2');
    serverEtag = '"v2-16"';
    let resetTriggered = false;
    const dl2 = await edgeClient.downloadTenantFileResumable({
      relativePath: 'Projetos/big.bin',
      ticket: 'tkt',
      serverUrl: baseUrl,
      partSizeBytes: 6,
      initialBytes: 6,
      initialParts: [new Uint8Array(Buffer.from('012345'))],
      initialEtag: '"v1-16"',
      onReset: () => {
        resetTriggered = true;
      },
    });
    assert.equal(resetTriggered, true, 'Deve resetar parcial quando ETag/If-Range divergir');
    assert.equal(Buffer.from(await dl2.blob.arrayBuffer()).toString('utf8'), 'NOVO_CONTEUDO_V2');

    // D. probeLanServer / resolveOptimalServerUrl com fallback offline
    await nativeBridge.setLanConfig({ lanServerUrl: baseUrl, autoDetectLan: true });
    const resolvedOnline = await nativeBridge.resolveOptimalServerUrl('https://storage.hublabdiv.com.br');
    assert.equal(resolvedOnline, baseUrl);

    await nativeBridge.setLanConfig({ lanServerUrl: 'http://127.0.0.1:59999', autoDetectLan: true });
    const resolvedOffline = await nativeBridge.resolveOptimalServerUrl('https://storage.hublabdiv.com.br');
    assert.equal(resolvedOffline, 'https://storage.hublabdiv.com.br');

    // E. Detecção precisa da plataforma e visibilidade do botão adaptativo na Navbar
    assert.equal(
      nativeBridge.detectClientPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }),
      'ios'
    );
    assert.equal(
      nativeBridge.detectClientPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }),
      'ios',
      'iPadOS em modo desktop deve ser detectado como ios'
    );
    assert.equal(
      nativeBridge.detectClientPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 }),
      'android',
      'Android não deve cair no fallback linux'
    );
    assert.equal(
      nativeBridge.detectClientPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 }),
      'windows'
    );
    assert.equal(
      nativeBridge.detectClientPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Ubuntu/24.04', platform: 'Linux x86_64', maxTouchPoints: 0 }),
      'linux'
    );
    assert.equal(
      nativeBridge.detectClientPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', platform: 'MacIntel', maxTouchPoints: 0 }),
      'macos'
    );
    assert.equal(
      nativeBridge.detectClientPlatform({ userAgent: 'Mozilla/5.0 (Darwin; Custom)', platform: 'Darwin', maxTouchPoints: 0 }),
      'unknown',
      'Darwin não deve dar falso positivo em windows'
    );
    assert.equal(
      nativeBridge.detectClientPlatform({ userAgent: 'CustomBrowser/1.0', platform: 'Plan9', maxTouchPoints: 0 }),
      'unknown'
    );

    assert.equal(
      nativeBridge.shouldShowNavbarDownloadButton({ hasDesktopBridge: true, isCapacitorNative: false, isStandaloneDisplayMode: false, isNavigatorStandalone: false }),
      false
    );
    assert.equal(
      nativeBridge.shouldShowNavbarDownloadButton({ hasDesktopBridge: false, isCapacitorNative: true, isStandaloneDisplayMode: false, isNavigatorStandalone: false }),
      false
    );
    assert.equal(
      nativeBridge.shouldShowNavbarDownloadButton({ hasDesktopBridge: false, isCapacitorNative: false, isStandaloneDisplayMode: true, isNavigatorStandalone: false }),
      false
    );
    assert.equal(
      nativeBridge.shouldShowNavbarDownloadButton({ hasDesktopBridge: false, isCapacitorNative: false, isStandaloneDisplayMode: false, isNavigatorStandalone: true }),
      false
    );
    assert.equal(
      nativeBridge.shouldShowNavbarDownloadButton({ hasDesktopBridge: false, isCapacitorNative: false, isStandaloneDisplayMode: false, isNavigatorStandalone: false }),
      true
    );

    console.log('ALL_TRANSFER_CLIENT_TESTS_PASSED');
  } finally {
    await new Promise((r) => server.close(r));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
