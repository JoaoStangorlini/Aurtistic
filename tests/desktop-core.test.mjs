// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const express = require('../servidor/node_modules/express');

const security = require('../desktop/dist/main/security.js');
const { DesktopCredentialStore } = require('../desktop/dist/main/credentials.js');
const { DesktopTransferEngine } = require('../desktop/dist/main/transfer-engine.js');
const {
  hasInvalidWindowsSegment,
  planSyncActions,
  scanLocalMirrorFolder,
  shouldIgnoreSyncFilename,
  SyncMirrorCoordinator,
  SyncStateStore,
} = require('../desktop/dist/main/sync-mirror.js');
const { DesktopScheduler } = require('../desktop/dist/main/scheduler.js');

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function run() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aurt-desktop-test-'));

  try {
    // 0. Smoke check de entrypoints compilados no desktop/package.json
    const deskPkg = JSON.parse(fs.readFileSync(path.resolve('desktop/package.json'), 'utf8'));
    assert.equal(deskPkg.main, 'dist/main/index.js');
    assert.equal(fs.existsSync(path.resolve('desktop', deskPkg.main)), true);
    assert.equal(fs.existsSync(path.resolve('desktop/dist/preload/index.js')), true);

    // 1. Segurança IPC, localhost bloqueado em produção (isPackaged: true) e confinamento de caminhos
    assert.equal(security.isTrustedAppUrl('https://aurtistic.vercel.app/servidor', { isPackaged: true, allowDev: true }), true);
    assert.equal(security.isTrustedAppUrl('http://localhost:3000/servidor', { isPackaged: true, allowDev: true }), false);
    assert.equal(security.isTrustedAppUrl('http://localhost:3000/servidor', { isPackaged: false, allowDev: true }), true);
    assert.equal(security.isAllowedAppNavigationUrl('https://xyz.supabase.co/auth/v1/callback', { isPackaged: true }), true);
    assert.equal(security.isAllowedAppNavigationUrl('https://hub-lab-div.vercel.app/auth/sso/authorize?next=%2Flabdiv', { isPackaged: true }), true);
    assert.equal(security.isAllowedAppNavigationUrl('https://hublabdiv.com.br/auth/sso/authorize', { isPackaged: true }), true);
    assert.equal(security.isAllowedAppNavigationUrl('https://evil.com', { isPackaged: true }), false);

    assert.throws(
      () => security.assertTrustedIpcSender({ senderFrame: { url: 'http://localhost:3000' } }, { isPackaged: true, allowDev: true }),
      /origem não confiável/
    );

    const authPaths = new security.AuthorizedPathsRegistry();
    const allowedDir = path.join(tmpRoot, 'allowed_mirror');
    fs.mkdirSync(allowedDir, { recursive: true });
    authPaths.addAuthorizedDir(allowedDir);
    assert.equal(authPaths.isAuthorizedPath(path.join(allowedDir, 'sub/foto.jpg')), true);
    assert.throws(() => authPaths.assertAuthorizedPath('/etc/passwd', 'upload'), /Confinamento IPC/);

    // 2. Credenciais: recusa basic_text no Linux e armazenamento cifrado por escopo
    const basicTextStore = new DesktopCredentialStore(tmpRoot, {
      isAvailable: () => true,
      getBackendName: () => 'basic_text',
      encryptString: (p) => Buffer.from(p),
      decryptString: (b) => b.toString(),
    });
    assert.equal(basicTextStore.getSecurityStatus().secureAvailable, false);
    await assert.rejects(() => basicTextStore.saveCredential('personal', 'wd_x', 'sec'), /basic_text recusado/);

    const cipherStub = {
      isAvailable: () => true,
      getBackendName: () => 'gnome_libsecret',
      encryptString: (plain) => Buffer.from(plain.split('').reverse().join(''), 'utf8'),
      decryptString: (buf) => buf.toString('utf8').split('').reverse().join(''),
    };
    const credStore = new DesktopCredentialStore(tmpRoot, cipherStub);
    await credStore.saveCredential('personal', 'wd_p1', 'segredo_pessoal_123');
    await credStore.saveCredential('org:labdiv', 'wd_o1', 'segredo_org_456');

    const rawCredFile = fs.readFileSync(path.join(tmpRoot, 'credentials.enc.json'), 'utf8');
    assert.equal(rawCredFile.includes('segredo_pessoal_123'), false);
    assert.equal(rawCredFile.includes('segredo_org_456'), false);
    assert.equal((await credStore.getCredential('org:labdiv')).secret, 'segredo_org_456');

    // 3. probeLan validando identidade do Edge Server + pós-crash recovery + streaming transfer
    await credStore.saveCredential('personal', 'wd_desk', 'sec_desk');
    const app = express();
    app.use(express.json());
    const uploadedChunks = new Map();
    let pollCounter = 0;
    let dlPayload = Buffer.from('NOVO_CONTEUDO_DESKTOP');
    let dlEtag = '"etag-v2"';

    app.get('/api/health', (req, res) => {
      // Probe nunca deve enviar credencial Authorization!
      assert.equal(req.headers.authorization, undefined);
      res.json({ ok: true, service: 'aurtistic-edge' });
    });
    app.post('/api/tenant/upload/chunked/init', (_req, res) => {
      res.status(201).json({ ok: true, uploadId: 'desk-up-1', chunkSize: 5, totalChunks: 2 });
    });
    app.put('/api/tenant/upload/chunked/:id/:idx', (req, res) => {
      const parts = [];
      req.on('data', (c) => parts.push(c));
      req.on('end', () => {
        const b = Buffer.concat(parts);
        assert.equal(req.headers['x-chunk-sha256'], sha256Hex(b));
        uploadedChunks.set(Number(req.params.idx), b);
        res.json({ ok: true });
      });
    });
    app.post('/api/tenant/upload/chunked/:id/complete', (_req, res) => {
      pollCounter = 1;
      res.status(202).json({ ok: true, state: 'finalizing', pollUrl: '/api/tenant/upload/chunked/desk-up-1/status' });
    });
    app.get('/api/tenant/upload/chunked/:id/status', (_req, res) => {
      if (pollCounter >= 2) return res.json({ ok: true, state: 'completed' });
      pollCounter++;
      return res.json({ ok: true, state: 'finalizing' });
    });
    app.head('/api/tenant/stream', (_req, res) => {
      res.setHeader('Content-Length', String(dlPayload.length));
      res.setHeader('ETag', dlEtag);
      res.setHeader('X-Plaintext-Sha256', sha256Hex(dlPayload));
      res.status(200).end();
    });
    app.get('/api/tenant/stream', (req, res) => {
      const ifRange = req.headers['if-range'];
      if (req.headers.range && (!ifRange || ifRange === dlEtag)) {
        const m = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range));
        const s = Number(m[1]);
        const e = Math.min(Number(m[2]), dlPayload.length - 1);
        res.status(206);
        res.setHeader('ETag', dlEtag);
        return res.end(dlPayload.subarray(s, e + 1));
      }
      res.status(200);
      res.setHeader('ETag', dlEtag);
      return res.end(dlPayload);
    });

    // Servidor falso na LAN respondendo 200 OK sem ser o Edge Aurtistic -> deve ser rejeitado!
    const fakeSrv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'router-admin' }));
    });
    await new Promise((r) => fakeSrv.listen(0, '127.0.0.1', r));
    const fakeUrl = `http://127.0.0.1:${fakeSrv.address().port}`;

    const httpSrv = http.createServer(app);
    await new Promise((r) => httpSrv.listen(0, '127.0.0.1', r));
    const baseUrl = `http://127.0.0.1:${httpSrv.address().port}`;

    try {
      const engine = new DesktopTransferEngine({ userDataDir: tmpRoot, credentials: credStore });
      assert.equal((await engine.probeLan(baseUrl)).reachable, true);
      assert.equal((await engine.probeLan(fakeUrl)).reachable, false);

      // Simula fila pós-crash (item preso em 'running' volta para 'queued')
      fs.writeFileSync(
        path.join(tmpRoot, 'transfer-queue.json'),
        JSON.stringify([{ id: 'crash-1', direction: 'download', state: 'running', scopeKey: 'personal', remoteServerUrl: baseUrl, relativePath: 'a', localPath: path.join(allowedDir, 'a'), filename: 'a', totalBytes: 1, loadedBytes: 0, progressPercent: 50, createdAt: 1, updatedAt: 1 }])
      );
      await engine.init();
      assert.equal(engine.listTransfers()[0].state, 'queued');

      const srcUploadPath = path.join(allowedDir, 'upload_src.bin');
      fs.writeFileSync(srcUploadPath, Buffer.from('HELLO_DESK'));
      const upJob = await engine.enqueueUpload({
        scopeKey: 'personal',
        remoteServerUrl: baseUrl,
        relativePath: 'Projetos/upload_src.bin',
        localPath: srcUploadPath,
      });

      const dlDestPath = path.join(allowedDir, 'dl_out.bin');
      fs.writeFileSync(`${dlDestPath}.part`, Buffer.from('VELHO_PARCIAL'));
      fs.writeFileSync(`${dlDestPath}.part.meta.json`, JSON.stringify({ etag: '"etag-antigo"' }));
      const dlJob = await engine.enqueueDownload({
        scopeKey: 'personal',
        remoteServerUrl: baseUrl,
        relativePath: 'Projetos/dl_out.bin',
        localPath: dlDestPath,
        sizeBytes: dlPayload.length,
      });

      for (let i = 0; i < 60; i++) {
        const list = engine.listTransfers();
        if (list.find((x) => x.id === upJob.id)?.state === 'completed' && list.find((x) => x.id === dlJob.id)?.state === 'completed') break;
        await new Promise((r) => setTimeout(r, 30));
      }
      assert.equal(fs.readFileSync(dlDestPath, 'utf8'), 'NOVO_CONTEUDO_DESKTOP');
      await engine.shutdown();
    } finally {
      await new Promise((r) => httpSrv.close(r));
      await new Promise((r) => fakeSrv.close(r));
    }

    // 4. sync-mirror: symlinks ignorados, pasta desmontada (ENOENT) pausada, Windows names e conflitos
    assert.equal(hasInvalidWindowsSegment('Projetos/CON.txt'), true);
    assert.equal(hasInvalidWindowsSegment('Projetos/normal.txt'), false);
    assert.equal(shouldIgnoreSyncFilename('file.part'), true);

    const symlinkTarget = path.join(tmpRoot, 'outside.txt');
    fs.writeFileSync(symlinkTarget, 'fora');
    fs.symlinkSync(symlinkTarget, path.join(allowedDir, 'link_perigoso.txt'));
    const scanned = await scanLocalMirrorFolder(allowedDir);
    assert.equal(scanned.some((f) => f.relPath === 'link_perigoso.txt'), false, 'Symlinks nunca devem ser seguidos');

    const engineForMirror = new DesktopTransferEngine({ userDataDir: tmpRoot, credentials: credStore });
    const coord = new SyncMirrorCoordinator({
      userDataDir: tmpRoot,
      credentials: credStore,
      transfers: engineForMirror,
    });
    const missingFolder = await coord.addFolder({
      localDir: path.join(tmpRoot, 'pasta_desmontada_inexistente'),
      remoteFolder: 'Projetos',
      scopeKey: 'personal',
      remoteServerUrl: 'https://storage.hublabdiv.com.br',
    });
    const syncMissingRes = await coord.syncFolderOnce(missingFolder.id);
    assert.equal(syncMissingRes.status, 'paused_missing_root');
    await coord.stopAll();

    // 5. Scheduler wake handling (sem rajada após suspensão)
    const fired = [];
    const scheduler = new DesktopScheduler((e) => fired.push(e));
    const now = Date.now();
    scheduler.syncSelfCare({
      configs: [{ id: 'w1', key: 'hydration', name: 'Água', description: 'Beber', enabled: true, intervalMinutes: 30, nextTriggerTimestamp: now - 3 * 3600 * 1000 }],
    });
    scheduler.handleSystemWake(now);
    assert.equal(scheduler.tick(now).length, 0, 'Após suspensão longa, handleSystemWake avança o ciclo sem rajada');

    // 6. Paridade de contrato preload/bridge
    const preloadSrc = fs.readFileSync(path.resolve('desktop/src/preload/index.ts'), 'utf8');
    for (const method of ['probeLan', 'getCredentialStatus', 'saveCredential', 'selectMirrorFolder', 'listMirrorFolders', 'enqueueUpload', 'enqueueDownload', 'listTransfers', 'syncAlarms', 'onTriggerEyeRest']) {
      assert.ok(preloadSrc.includes(`${method}:`), `Preload deve expor ${method}`);
    }

    // 7. Auto-update condicional (.deb vs .AppImage vs Windows/macOS) e paridade de empacotamento
    const { isAutoUpdateSupported, isNewerSemver } = require('../desktop/dist/main/updater.js');
    assert.equal(isAutoUpdateSupported({ platform: 'linux', env: {} }), false, '.deb no Linux não deve usar electron-updater');
    assert.equal(isAutoUpdateSupported({ platform: 'linux', env: { APPIMAGE: '/tmp/Aurtistic.AppImage' } }), true, '.AppImage deve usar electron-updater');
    assert.equal(isAutoUpdateSupported({ platform: 'win32', env: {} }), true);
    assert.equal(isAutoUpdateSupported({ platform: 'darwin', env: {} }), true);
    assert.equal(isNewerSemver('desktop-v1.0.1', '1.0.0'), true);
    assert.equal(isNewerSemver('v1.0.0', '1.0.0'), false);
    assert.equal(isNewerSemver('v1.0.0', '1.2.0'), false);

    const builderYml = fs.readFileSync(path.resolve('desktop/electron-builder.yml'), 'utf8');
    assert.ok(builderYml.includes('packageName: aurtistic'));
    assert.ok(builderYml.includes('StartupWMClass: Aurtistic'));
    assert.ok(builderYml.includes('src/renderer/offline.html'));
    assert.ok(builderYml.includes('asarUnpack:'));
    assert.ok(builderYml.includes('target: zip'));
    assert.ok(builderYml.includes('provider: github'));
    assert.ok(builderYml.includes('Aurtistic-Setup-${version}.${ext}'));
    assert.ok(builderYml.includes('aurtistic_${version}_${arch}.${ext}'));
    assert.ok(builderYml.includes('Aurtistic-${version}-${arch}.${ext}'));

    const releaseRouteSrc = fs.readFileSync(path.resolve('src/app/api/app/desktop-release/route.ts'), 'utf8');
    assert.ok(releaseRouteSrc.includes('signed-by=/usr/share/keyrings/aurtistic.gpg'));
    assert.ok(releaseRouteSrc.includes('${aptRepoUrl} ./'));
    assert.ok(releaseRouteSrc.includes(".endsWith('.exe')"));
    assert.ok(releaseRouteSrc.includes(".endsWith('.deb')"));
    assert.ok(releaseRouteSrc.includes(".endsWith('.appimage')"));
    assert.ok(releaseRouteSrc.includes(".endsWith('.dmg')"));

    // 8. Descoberta e parse de scripts de montagem WebDAV (Linux/GVFS)
    const {
      parseVaultMountScript,
      discoverLinuxVaultMountTargets,
    } = require('../desktop/dist/main/vault-mount.js');
    const parsedTarget = parseVaultMountScript(`#!/usr/bin/env bash
DAV_URI="davs://wd_88119aaba518@storage.hublabdiv.com.br/webdav/cofre"
MOUNT_LINK="/home/user/Cofre-Aurtistic-Pessoal"
`);
    assert.deepEqual(parsedTarget, {
      davUri: 'davs://wd_88119aaba518@storage.hublabdiv.com.br/webdav/cofre',
      mountLink: '/home/user/Cofre-Aurtistic-Pessoal',
      host: 'storage.hublabdiv.com.br',
    });
    assert.equal(parseVaultMountScript('DAV_URI="https://not-dav.example.com"'), null);

    const fakeBin = path.join(tmpRoot, 'local-bin');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.writeFileSync(
      path.join(fakeBin, 'abrir-cofre-aurtistic-pessoal.sh'),
      'DAV_URI="davs://wd_test@storage.hublabdiv.com.br/webdav/cofre"\nMOUNT_LINK="/tmp/cofre-link"\n'
    );
    fs.writeFileSync(path.join(fakeBin, 'outro-script.sh'), 'DAV_URI="davs://ignored@example.com/dav"\n');
    const discovered = await discoverLinuxVaultMountTargets(fakeBin);
    assert.equal(discovered.length, 1);
    assert.equal(discovered[0].host, 'storage.hublabdiv.com.br');

    console.log('ALL_DESKTOP_CORE_TESTS_PASSED');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
