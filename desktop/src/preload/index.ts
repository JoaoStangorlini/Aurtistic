// Este programa é um software livre (Licença AGPLv3)
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('aurtisticDesktop', {
  probeLan: (url: string) => ipcRenderer.invoke('aurtistic:probeLan', url),
  getCredentialStatus: () => ipcRenderer.invoke('aurtistic:getCredentialStatus'),
  saveCredential: (input: { scopeKey: string; tokenId: string; secret: string }) =>
    ipcRenderer.invoke('aurtistic:saveCredential', input),
  clearCredential: (scopeKey: string) => ipcRenderer.invoke('aurtistic:clearCredential', scopeKey),
  selectUploadFiles: () => ipcRenderer.invoke('aurtistic:selectUploadFiles'),
  selectMirrorFolder: (input: {
    remoteFolder: string;
    scopeKey: string;
    remoteServerUrl: string;
    lanServerUrl?: string;
  }) => ipcRenderer.invoke('aurtistic:selectMirrorFolder', input),
  listMirrorFolders: () => ipcRenderer.invoke('aurtistic:listMirrorFolders'),
  removeMirrorFolder: (id: string) => ipcRenderer.invoke('aurtistic:removeMirrorFolder', id),
  triggerMirrorSync: (id: string) => ipcRenderer.invoke('aurtistic:triggerMirrorSync', id),
  enqueueUpload: (input: unknown) => ipcRenderer.invoke('aurtistic:enqueueUpload', input),
  enqueueDownload: (input: unknown) => ipcRenderer.invoke('aurtistic:enqueueDownload', input),
  pauseTransfer: (id: string) => ipcRenderer.invoke('aurtistic:pauseTransfer', id),
  resumeTransfer: (id: string) => ipcRenderer.invoke('aurtistic:resumeTransfer', id),
  cancelTransfer: (id: string) => ipcRenderer.invoke('aurtistic:cancelTransfer', id),
  listTransfers: () => ipcRenderer.invoke('aurtistic:listTransfers'),
  syncAlarms: (payload: unknown) => ipcRenderer.invoke('aurtistic:syncAlarms', payload),
  scheduleTaskNotifications: (payload: unknown) =>
    ipcRenderer.invoke('aurtistic:scheduleTaskNotifications', payload),
  onTriggerEyeRest: (cb: () => void) => {
    ipcRenderer.on('aurtistic:trigger-eye-rest', cb);
    return () => ipcRenderer.removeListener('aurtistic:trigger-eye-rest', cb);
  },
  onQuickWater: (cb: () => void) => {
    ipcRenderer.on('aurtistic:quick-water', cb);
    return () => ipcRenderer.removeListener('aurtistic:quick-water', cb);
  },
  onToggleHyperfocus: (cb: () => void) => {
    ipcRenderer.on('aurtistic:toggle-hyperfocus', cb);
    return () => ipcRenderer.removeListener('aurtistic:toggle-hyperfocus', cb);
  },
});
