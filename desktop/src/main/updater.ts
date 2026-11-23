// Este programa é um software livre (Licença AGPLv3)
import type { AppUpdater } from 'electron-updater';
import { PROD_APP_ORIGIN } from './security';

export interface AutoUpdateCheckOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

/**
 * Compara versões semânticas (ex.: "v1.2.0" vs "1.1.9").
 * Retorna true apenas se candidate > current.
 */
export function isNewerSemver(candidateRaw: string, currentRaw: string): boolean {
  const parse = (v: string): [number, number, number] | null => {
    const cleaned = String(v || '').trim().replace(/^(desktop-)?v/i, '').split('-')[0];
    const parts = cleaned.split('.').map((n) => Number.parseInt(n, 10));
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    return [parts[0], parts[1], parts[2]];
  };

  const cand = parse(candidateRaw);
  const curr = parse(currentRaw);
  if (!cand || !curr) return false;

  for (let i = 0; i < 3; i++) {
    if (cand[i] > curr[i]) return true;
    if (cand[i] < curr[i]) return false;
  }
  return false;
}

/**
 * Determina se o formato atual suporta auto-update nativo via electron-updater.
 * No Linux, apenas AppImage (process.env.APPIMAGE) suporta auto-update in-place;
 * pacotes .deb são atualizados via repositório APT (sudo apt update && sudo apt upgrade).
 */
export function isAutoUpdateSupported(opts: AutoUpdateCheckOptions = {}): boolean {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  if (platform === 'linux') {
    return Boolean(env.APPIMAGE && String(env.APPIMAGE).trim().length > 0);
  }
  return platform === 'win32' || platform === 'darwin';
}

export class DesktopUpdater {
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private lastNotifiedAptVersion: string | null = null;

  private getElectronApp(): typeof import('electron').app | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require('electron') as typeof import('electron')).app;
    } catch {
      return null;
    }
  }

  private getAutoUpdater(): AppUpdater | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require('electron-updater') as typeof import('electron-updater')).autoUpdater;
    } catch {
      return null;
    }
  }

  start(): void {
    const electronApp = this.getElectronApp();
    if (this.started || !electronApp?.isPackaged) return;
    this.started = true;

    if (isAutoUpdateSupported()) {
      const updater = this.getAutoUpdater();
      if (!updater) return;

      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = true;

      updater.on('update-downloaded', (info) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { Notification } = require('electron') as typeof import('electron');
          if (Notification.isSupported()) {
            const n = new Notification({
              title: 'Atualização do Aurtistic pronta',
              body: `Versão ${info.version} baixada e será aplicada ao reiniciar o app.`,
            });
            n.show();
          }
        } catch {
          // Ignora se Notification não estiver disponível.
        }
      });

      updater.on('error', () => {
        // Silencioso em offline/erro transitório para não atrapalhar o usuário.
      });
    }

    void this.checkNow();
    this.timer = setInterval(() => {
      void this.checkNow();
    }, 6 * 60 * 60 * 1000);
    this.timer.unref?.();
  }

  async checkNow(): Promise<void> {
    const electronApp = this.getElectronApp();
    if (!electronApp?.isPackaged) return;

    if (!isAutoUpdateSupported()) {
      await this.checkAptReleaseNotice(electronApp.getVersion());
      return;
    }

    const updater = this.getAutoUpdater();
    if (!updater) return;
    try {
      await updater.checkForUpdatesAndNotify();
    } catch {
      // Ignora falhas de rede durante checagem periódica.
    }
  }

  private async checkAptReleaseNotice(currentVersion: string): Promise<void> {
    try {
      const resp = await fetch(`${PROD_APP_ORIGIN}/api/app/desktop-release`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as { available?: boolean; version?: string };
      if (!data.available || !data.version) return;
      if (!isNewerSemver(data.version, currentVersion)) return;
      if (this.lastNotifiedAptVersion === data.version) return;
      this.lastNotifiedAptVersion = data.version;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Notification } = require('electron') as typeof import('electron');
      if (Notification.isSupported()) {
        const n = new Notification({
          title: `Nova versão do Aurtistic (${data.version})`,
          body: 'Atualize pelo APT: sudo apt update && sudo apt upgrade aurtistic',
        });
        n.show();
      }
    } catch {
      // Silencioso em offline/erro transitório.
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
