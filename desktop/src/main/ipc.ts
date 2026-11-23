// Este programa é um software livre (Licença AGPLv3)
import { dialog, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import {
  AuthorizedPathsRegistry,
  assertTrustedIpcSender,
  isAllowedLanUrl,
} from './security';
import type { DesktopCredentialStore } from './credentials';
import type { DesktopTransferEngine } from './transfer-engine';
import type { DesktopScheduler } from './scheduler';
import type { SyncMirrorCoordinator } from './sync-mirror';

export function registerDesktopIpcHandlers(deps: {
  isPackaged: boolean;
  getMainWindow: () => BrowserWindow | null;
  authorizedPaths: AuthorizedPathsRegistry;
  credentials: DesktopCredentialStore;
  transfers: DesktopTransferEngine;
  syncMirror: SyncMirrorCoordinator;
  scheduler: DesktopScheduler;
  onTrayRefresh: () => void;
}): void {
  const secOpts = { isPackaged: deps.isPackaged, allowDev: !deps.isPackaged };

  ipcMain.handle('aurtistic:probeLan', async (event, url: string) => {
    assertTrustedIpcSender(event, secOpts);
    if (!isAllowedLanUrl(url)) return { reachable: false };
    return deps.transfers.probeLan(url);
  });

  ipcMain.handle('aurtistic:getCredentialStatus', async (event) => {
    assertTrustedIpcSender(event, secOpts);
    return deps.credentials.getSecurityStatus();
  });

  ipcMain.handle(
    'aurtistic:saveCredential',
    async (event, input: { scopeKey: string; tokenId: string; secret: string }) => {
      assertTrustedIpcSender(event, secOpts);
      await deps.credentials.saveCredential(input.scopeKey, input.tokenId, input.secret);
      return { ok: true };
    }
  );

  ipcMain.handle('aurtistic:clearCredential', async (event, scopeKey: string) => {
    assertTrustedIpcSender(event, secOpts);
    await deps.credentials.clearCredential(scopeKey);
    return { ok: true };
  });

  ipcMain.handle('aurtistic:selectUploadFiles', async (event) => {
    assertTrustedIpcSender(event, secOpts);
    const win = deps.getMainWindow();
    const openOpts: Electron.OpenDialogOptions = {
      title: 'Selecionar arquivos para envio',
      properties: ['openFile', 'multiSelections'],
    };
    const res = win ? await dialog.showOpenDialog(win, openOpts) : await dialog.showOpenDialog(openOpts);
    if (res.canceled) return [];
    for (const f of res.filePaths) {
      deps.authorizedPaths.addAuthorizedFile(f);
    }
    return res.filePaths;
  });

  ipcMain.handle(
    'aurtistic:selectMirrorFolder',
    async (
      event,
      input: {
        remoteFolder: string;
        scopeKey: string;
        remoteServerUrl: string;
        lanServerUrl?: string;
      }
    ) => {
      assertTrustedIpcSender(event, secOpts);
      const win = deps.getMainWindow();
      const openOpts: Electron.OpenDialogOptions = {
        title: 'Escolher pasta local para espelhamento',
        properties: ['openDirectory', 'createDirectory'],
      };
      const res = win ? await dialog.showOpenDialog(win, openOpts) : await dialog.showOpenDialog(openOpts);
      if (res.canceled || !res.filePaths[0]) return null;
      const localDir = res.filePaths[0];
      deps.authorizedPaths.addAuthorizedDir(localDir);
      return deps.syncMirror.addFolder({
        localDir,
        remoteFolder: input.remoteFolder,
        scopeKey: input.scopeKey || 'personal',
        remoteServerUrl: input.remoteServerUrl,
        lanServerUrl: input.lanServerUrl,
      });
    }
  );

  ipcMain.handle('aurtistic:listMirrorFolders', async (event) => {
    assertTrustedIpcSender(event, secOpts);
    return deps.syncMirror.listFolders();
  });

  ipcMain.handle('aurtistic:removeMirrorFolder', async (event, id: string) => {
    assertTrustedIpcSender(event, secOpts);
    return { ok: await deps.syncMirror.removeFolder(id) };
  });

  ipcMain.handle('aurtistic:triggerMirrorSync', async (event, id: string) => {
    assertTrustedIpcSender(event, secOpts);
    return deps.syncMirror.syncFolderOnce(id);
  });

  ipcMain.handle('aurtistic:enqueueUpload', async (event, input) => {
    assertTrustedIpcSender(event, secOpts);
    const localPath = deps.authorizedPaths.assertAuthorizedPath(
      input.localPath || input.localUri,
      'upload'
    );
    await deps.transfers.enqueueUpload({
      id: input.id,
      scopeKey: input.credentialScopeKey || 'personal',
      remoteServerUrl: input.remoteServerUrl,
      lanServerUrl: input.lanServerUrl,
      relativePath: input.relativePath,
      localPath,
      overwrite: Boolean(input.overwrite),
    });
    deps.onTrayRefresh();
    return { ok: true };
  });

  ipcMain.handle('aurtistic:enqueueDownload', async (event, input) => {
    assertTrustedIpcSender(event, secOpts);
    const localPath = deps.authorizedPaths.assertAuthorizedPath(input.localPath, 'download');
    await deps.transfers.enqueueDownload({
      id: input.id,
      scopeKey: input.credentialScopeKey || 'personal',
      remoteServerUrl: input.remoteServerUrl,
      lanServerUrl: input.lanServerUrl,
      relativePath: input.relativePath,
      localPath,
      sizeBytes: input.sizeBytes,
    });
    deps.onTrayRefresh();
    return { ok: true };
  });

  ipcMain.handle('aurtistic:pauseTransfer', async (event, id: string) => {
    assertTrustedIpcSender(event, secOpts);
    const ok = await deps.transfers.pauseTransfer(id);
    deps.onTrayRefresh();
    return { ok };
  });

  ipcMain.handle('aurtistic:resumeTransfer', async (event, id: string) => {
    assertTrustedIpcSender(event, secOpts);
    const ok = await deps.transfers.resumeTransfer(id);
    deps.onTrayRefresh();
    return { ok };
  });

  ipcMain.handle('aurtistic:cancelTransfer', async (event, id: string) => {
    assertTrustedIpcSender(event, secOpts);
    const ok = await deps.transfers.cancelTransfer(id);
    deps.onTrayRefresh();
    return { ok };
  });

  ipcMain.handle('aurtistic:listTransfers', async (event) => {
    assertTrustedIpcSender(event, secOpts);
    return deps.transfers.listTransfers();
  });

  ipcMain.handle('aurtistic:syncAlarms', async (event, payload) => {
    assertTrustedIpcSender(event, secOpts);
    deps.scheduler.syncSelfCare(payload || {});
    return { ok: true };
  });

  ipcMain.handle('aurtistic:scheduleTaskNotifications', async (event, payload) => {
    assertTrustedIpcSender(event, secOpts);
    deps.scheduler.syncTasks(Array.isArray(payload) ? payload : []);
    return { ok: true };
  });
}
