// Este programa é um software livre (Licença AGPLv3)
declare module 'electron' {
  export interface IpcMainInvokeEvent {
    senderFrame?: { url?: string } | null;
  }
  export interface IpcMainEvent {
    senderFrame?: { url?: string } | null;
  }
  export const ipcMain: {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => any): void;
  };
  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: Record<string, unknown>): void;
  };
  export const ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, listener: (event: any, ...args: any[]) => void): void;
    removeListener(channel: string, listener: (...args: any[]) => void): void;
  };
  export class BrowserWindow {
    constructor(options?: any);
    webContents: {
      setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' | 'allow' }): void;
      on(event: string, listener: (...args: any[]) => void): void;
      send(channel: string, ...args: any[]): void;
    };
    show(): void;
    hide(): void;
    focus(): void;
    setAlwaysOnTop(flag: boolean, level?: string): void;
    loadURL(url: string): Promise<void>;
    loadFile(filePath: string): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
  }
  export class Tray {
    constructor(image: any);
    setToolTip(tip: string): void;
    setContextMenu(menu: any): void;
    on(event: string, listener: () => void): void;
    destroy(): void;
  }
  export class Notification {
    constructor(options: { title: string; body: string });
    static isSupported(): boolean;
    on(event: string, listener: () => void): void;
    show(): void;
  }
  export const Menu: { buildFromTemplate(template: any[]): any };
  export const nativeImage: {
    createEmpty(): any;
    createFromPath(imagePath: string): any;
  };
  export const dialog: {
    showOpenDialog(win: BrowserWindow | undefined | null, options: any): Promise<{ canceled: boolean; filePaths: string[] }>;
    showSaveDialog(win: BrowserWindow | undefined | null, options: any): Promise<{ canceled: boolean; filePath?: string }>;
  };
  export const powerMonitor: {
    on(event: 'resume' | 'unlock-screen' | 'suspend' | 'lock-screen', listener: () => void): void;
  };
  export const app: {
    isPackaged: boolean;
    setName?(name: string): void;
    setAppUserModelId?(id: string): void;
    requestSingleInstanceLock(): boolean;
    getPath(name: string): string;
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    quit(): void;
  };
  export const powerSaveBlocker: {
    start(type: string): number;
    stop(id: number): void;
  };
  export const safeStorage: {
    isEncryptionAvailable(): boolean;
    getSelectedStorageBackend?: () => string;
    encryptString(plain: string): Buffer;
    decryptString(cipher: Buffer): string;
  };
  export const shell: {
    openExternal(url: string): Promise<void>;
  };
}
