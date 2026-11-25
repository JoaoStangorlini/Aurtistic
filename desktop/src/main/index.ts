// Este programa é um software livre (Licença AGPLv3)
import fs from 'node:fs';
import path from 'node:path';
import {
  BrowserWindow,
  Menu,
  Notification,
  app,
  powerMonitor,
  powerSaveBlocker,
  safeStorage,
  shell,
} from 'electron';
import { DesktopCredentialStore } from './credentials';
import { registerDesktopIpcHandlers } from './ipc';
import { DesktopScheduler } from './scheduler';
import {
  AuthorizedPathsRegistry,
  PROD_APP_ORIGIN,
  isAllowedAppNavigationUrl,
  isSafeExternalUrl,
} from './security';
import { SyncMirrorCoordinator } from './sync-mirror';
import { DesktopTransferEngine } from './transfer-engine';
import { DesktopTrayController } from './tray';
import { DesktopUpdater } from './updater';
import { mountLinuxVaultsOnStartup } from './vault-mount';

let mainWindow: BrowserWindow | null = null;
let powerSaveId: number | null = null;
let isQuitting = false;
let shutdownHook: (() => Promise<void>) | null = null;

const START_URL = process.env.AURTISTIC_DESKTOP_URL || PROD_APP_ORIGIN;

app.setName?.('Aurtistic');
if (process.platform === 'win32') {
  app.setAppUserModelId?.('com.aurtistic.desktop');
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

async function bootstrap(): Promise<void> {
  if (!gotSingleInstanceLock) return;

  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  } else {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }])
    );
  }

  const userDataDir = app.getPath('userData');
  const authorizedPaths = new AuthorizedPathsRegistry();
  authorizedPaths.addAuthorizedDir(app.getPath('downloads'));

  const credentials = new DesktopCredentialStore(userDataDir, {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    getBackendName: () => safeStorage.getSelectedStorageBackend?.() || 'os_native',
    encryptString: (plain) => safeStorage.encryptString(plain),
    decryptString: (cipher) => safeStorage.decryptString(cipher),
  });

  let trayCtrl: DesktopTrayController | null = null;
  const transfers = new DesktopTransferEngine({
    userDataDir,
    credentials,
    onProgress: () => trayCtrl?.refreshMenu(),
    onPowerSaveChanged: (active) => {
      if (active && powerSaveId === null) {
        powerSaveId = powerSaveBlocker.start('prevent-app-suspension');
      } else if (!active && powerSaveId !== null) {
        powerSaveBlocker.stop(powerSaveId);
        powerSaveId = null;
      }
    },
  });
  await transfers.init();

  const syncMirror = new SyncMirrorCoordinator({
    userDataDir,
    credentials,
    transfers,
    onFolderRegistered: (dir) => authorizedPaths.addAuthorizedDir(dir),
    onFolderRemoved: (dir) => authorizedPaths.removeAuthorizedDir(dir),
  });
  await syncMirror.init();

  const scheduler = new DesktopScheduler((evt) => {
    if (evt.kind === 'eye_rest_20_20_20' && evt.autoOpenOverlay && mainWindow) {
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.webContents.send('aurtistic:trigger-eye-rest');
      setTimeout(() => mainWindow?.setAlwaysOnTop(false), 22_000);
      return;
    }
    if (Notification.isSupported()) {
      const n = new Notification({ title: evt.title, body: evt.body });
      n.on('click', () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      n.show();
    }
  });
  scheduler.start();

  powerMonitor.on('resume', () => scheduler.handleSystemWake());
  powerMonitor.on('unlock-screen', () => scheduler.handleSystemWake());

  const updater = new DesktopUpdater();
  updater.start();

  // Monta cofres WebDAV configurados (Linux/GVFS) em segundo plano para aparecerem no gerenciador de arquivos
  void mountLinuxVaultsOnStartup();

  shutdownHook = async () => {
    updater.stop();
    scheduler.stop();
    await syncMirror.stopAll();
    await transfers.shutdown();
    if (powerSaveId !== null) {
      powerSaveBlocker.stop(powerSaveId);
      powerSaveId = null;
    }
    trayCtrl?.destroy();
  };

  trayCtrl = new DesktopTrayController({
    getMainWindow: () => mainWindow,
    getTransfers: () => transfers.listTransfers(),
    onQuickWater: () => mainWindow?.webContents.send('aurtistic:quick-water'),
    onQuickEyeRest: () => mainWindow?.webContents.send('aurtistic:trigger-eye-rest'),
    onToggleHyperfocus: () => mainWindow?.webContents.send('aurtistic:toggle-hyperfocus'),
    onQuit: () => {
      isQuitting = true;
      void shutdownHook?.();
    },
  });

  registerDesktopIpcHandlers({
    isPackaged: app.isPackaged,
    getMainWindow: () => mainWindow,
    authorizedPaths,
    credentials,
    transfers,
    syncMirror,
    scheduler,
    onTrayRefresh: () => trayCtrl?.refreshMenu(),
  });

  const iconFilename = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconCandidates = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', iconFilename),
    path.join(app.getAppPath(), 'build', iconFilename),
    path.join(__dirname, '../../build', iconFilename),
    path.join(process.resourcesPath || '', 'build', iconFilename),
  ];
  const windowIcon = iconCandidates.find((p) => p && fs.existsSync(p)) || iconCandidates[1];

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    title: 'Aurtistic',
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  const navSecOpts = { isPackaged: app.isPackaged, allowDev: !app.isPackaged };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const handleNavigationGuard = (event: { preventDefault: () => void }, targetUrl: string) => {
    if (!isAllowedAppNavigationUrl(targetUrl, navSecOpts) && !targetUrl.startsWith('file://')) {
      event.preventDefault();
      if (isSafeExternalUrl(targetUrl)) {
        void shell.openExternal(targetUrl);
      }
    }
  };
  mainWindow.webContents.on('will-navigate', handleNavigationGuard);
  mainWindow.webContents.on('will-redirect', handleNavigationGuard);

  mainWindow.webContents.on('did-fail-load', () => {
    void mainWindow?.loadFile(path.join(app.getAppPath(), 'src/renderer/offline.html'));
  });

  mainWindow.on('close', (e: { preventDefault: () => void }) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  trayCtrl.init();
  await mainWindow.webContents.session
    .clearStorageData({ storages: ['serviceworkers'] })
    .catch(() => {});
  await mainWindow.loadURL(START_URL);
}

app.whenReady().then(() => void bootstrap());

app.on('before-quit', () => {
  isQuitting = true;
  void shutdownHook?.();
});
