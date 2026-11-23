// Este programa é um software livre (Licença AGPLv3)
import fs from 'node:fs';
import path from 'node:path';
import { Menu, Tray, app, nativeImage } from 'electron';
import type { BrowserWindow } from 'electron';
import type { DesktopTransferItem } from './transfer-engine';

function resolveTrayIcon(): Electron.NativeImage {
  const relFile =
    process.platform === 'darwin'
      ? path.join('build', 'trayTemplate.png')
      : process.platform === 'win32'
        ? path.join('build', 'icon.ico')
        : path.join('build', 'tray.png');

  const candidates = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', relFile),
    path.join(app.getAppPath(), relFile),
    path.join(__dirname, '../../', relFile),
    path.join(process.resourcesPath || '', relFile),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) {
        if (process.platform === 'darwin') img.setTemplateImage(true);
        return img;
      }
    }
  }
  return nativeImage.createEmpty();
}

export interface TrayControllerOptions {
  getMainWindow: () => BrowserWindow | null;
  getTransfers: () => DesktopTransferItem[];
  onQuickWater: () => void;
  onQuickEyeRest: () => void;
  onToggleHyperfocus: () => void;
  onQuit: () => void;
}

export class DesktopTrayController {
  private tray: Tray | null = null;
  private readonly opts: TrayControllerOptions;

  constructor(opts: TrayControllerOptions) {
    this.opts = opts;
  }

  init(): void {
    if (this.tray) return;
    const icon = resolveTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('Aurtistic Desktop');
    this.tray.on('click', () => {
      const win = this.opts.getMainWindow();
      if (win) {
        win.show();
        win.focus();
      }
    });
    this.refreshMenu();
  }

  refreshMenu(): void {
    if (!this.tray) return;
    const transfers = this.opts.getTransfers();
    const active = transfers.filter((t) => t.state === 'running' || t.state === 'finalizing' || t.state === 'queued');
    const summaryLabel =
      active.length > 0
        ? `Transferências ativas: ${active.length} (${active[0].progressPercent}%)`
        : 'Cofre sincronizado (fila ociosa)';

    const menu = Menu.buildFromTemplate([
      {
        label: 'Abrir Aurtistic',
        click: () => {
          const win = this.opts.getMainWindow();
          win?.show();
          win?.focus();
        },
      },
      { label: summaryLabel, enabled: false },
      { type: 'separator' },
      { label: '+1 Copo de Água', click: () => this.opts.onQuickWater() },
      { label: 'Iniciar Pausa Visual 20-20-20', click: () => this.opts.onQuickEyeRest() },
      { label: 'Alternar Modo Hiperfoco', click: () => this.opts.onToggleHyperfocus() },
      { type: 'separator' },
      {
        label: 'Sair do Aurtistic',
        click: () => {
          this.opts.onQuit();
          app.quit();
        },
      },
    ]);
    this.tray.setContextMenu(menu);
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
