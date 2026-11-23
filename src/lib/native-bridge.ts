// Este programa é um software livre (Licença AGPLv3)
'use client';

export type ClientPlatform = 'android' | 'desktop' | 'web';
export type DetectedOsPlatform = 'ios' | 'android' | 'windows' | 'linux' | 'macos' | 'unknown';

export interface LanConfig {
  lanServerUrl: string;
  autoDetectLan: boolean;
}

export interface NativeTransferEnqueueUploadInput {
  id: string;
  localUri: string;
  relativePath: string;
  filename: string;
  totalSize: number;
  credentialScopeKey: string;
  remoteServerUrl: string;
  lanServerUrl?: string;
  overwrite?: boolean;
}

export interface NativeTransferEnqueueDownloadInput {
  id: string;
  relativePath: string;
  filename: string;
  subfolder?: string;
  sizeBytes?: number;
  credentialScopeKey: string;
  remoteServerUrl: string;
  lanServerUrl?: string;
}

export interface NativeTransferStatus {
  id: string;
  direction: 'upload' | 'download';
  state: 'queued' | 'running' | 'finalizing' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progressPercent: number;
  loadedBytes: number;
  totalBytes: number;
  error?: string;
}

export interface DesktopMirrorFolderItem {
  id: string;
  localDir: string;
  remoteFolder: string;
  scopeKey: string;
  status: 'idle' | 'syncing' | 'paused_missing_root' | 'pin_locked' | 'error';
  lastSyncAt?: number;
  lastError?: string;
}

export interface DesktopCredentialSecurityStatus {
  secureAvailable: boolean;
  backend: string;
  reason?: string;
}

interface AurtisticDesktopBridge {
  probeLan?: (url: string) => Promise<{ reachable: boolean; latencyMs?: number }>;
  getCredentialStatus?: () => Promise<DesktopCredentialSecurityStatus>;
  saveCredential?: (input: { scopeKey: string; tokenId: string; secret: string }) => Promise<{ ok: boolean }>;
  clearCredential?: (scopeKey: string) => Promise<{ ok: boolean }>;
  selectUploadFiles?: () => Promise<string[]>;
  selectMirrorFolder?: (input: {
    remoteFolder: string;
    scopeKey: string;
    remoteServerUrl: string;
    lanServerUrl?: string;
  }) => Promise<DesktopMirrorFolderItem | null>;
  listMirrorFolders?: () => Promise<DesktopMirrorFolderItem[]>;
  removeMirrorFolder?: (id: string) => Promise<{ ok: boolean }>;
  triggerMirrorSync?: (id: string) => Promise<{ ok: boolean; status: string; actionsCount: number; error?: string }>;
  enqueueUpload?: (input: NativeTransferEnqueueUploadInput) => Promise<{ ok: boolean }>;
  enqueueDownload?: (input: NativeTransferEnqueueDownloadInput) => Promise<{ ok: boolean }>;
  pauseTransfer?: (id: string) => Promise<{ ok: boolean }>;
  resumeTransfer?: (id: string) => Promise<{ ok: boolean }>;
  cancelTransfer?: (id: string) => Promise<{ ok: boolean }>;
  listTransfers?: () => Promise<NativeTransferStatus[]>;
  syncAlarms?: (payload: unknown) => Promise<{ ok: boolean }>;
  scheduleTaskNotifications?: (payload: unknown) => Promise<{ ok: boolean }>;
  onTriggerEyeRest?: (cb: () => void) => () => void;
  onQuickWater?: (cb: () => void) => () => void;
  onToggleHyperfocus?: (cb: () => void) => () => void;
}

const LAN_CONFIG_STORAGE_KEY = 'aurtistic_lan_config_v1';
const LAN_PROBE_CACHE_MS = 30_000;
let cachedLanProbe: { url: string; reachable: boolean; checkedAt: number } | null = null;
let netListenersBound = false;

export function invalidateLanProbeCache(): void {
  cachedLanProbe = null;
}

function bindNetworkInvalidationListeners(): void {
  if (netListenersBound || typeof window === 'undefined') return;
  netListenersBound = true;
  window.addEventListener('online', invalidateLanProbeCache);
  window.addEventListener('offline', invalidateLanProbeCache);
  const conn = (navigator as unknown as { connection?: { addEventListener?: (t: string, fn: () => void) => void } }).connection;
  conn?.addEventListener?.('change', invalidateLanProbeCache);
}

export function isAllowedLanUrl(rawUrl: string): boolean {
  const clean = String(rawUrl || '').trim();
  if (!clean) return false;
  try {
    const u = new URL(clean);
    if (u.protocol === 'https:') return true;
    if (u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.local') ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    );
  } catch {
    return false;
  }
}

function getWindowAny(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  return window as unknown as Record<string, unknown>;
}

export function getPlatform(): ClientPlatform {
  const win = getWindowAny();
  if (!win) return 'web';
  if (win.aurtisticDesktop) return 'desktop';
  const cap = win.Capacitor as { isNativePlatform?: () => boolean } | undefined;
  if (cap?.isNativePlatform?.()) return 'android';
  return 'web';
}

export function isDesktopApp(): boolean {
  return getPlatform() === 'desktop';
}

export function isAndroidNative(): boolean {
  return getPlatform() === 'android';
}

export function isWebDesktopBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (getPlatform() !== 'web') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isMobileUa = /android|iphone|ipad|ipod|mobile|opera mini|iemobile/.test(ua);
  return !isMobileUa;
}

export function detectClientPlatform(input?: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}): DetectedOsPlatform {
  const ua = String(
    input?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  );
  const plat = String(
    input?.platform ?? (typeof navigator !== 'undefined' ? navigator.platform : '')
  );
  const touchPoints = Number(
    input?.maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0)
  );

  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintel/i.test(plat) && touchPoints > 1) return 'ios';
  if (/android/i.test(ua)) return 'android';
  const platOrUa = `${plat} ${ua}`;
  if (/windows|win32|win64|wow64|\bwin\b/i.test(platOrUa)) return 'windows';
  if (/linux/i.test(platOrUa)) return 'linux';
  if (/mac/i.test(platOrUa)) return 'macos';
  return 'unknown';
}

export function shouldShowNavbarDownloadButton(input?: {
  hasDesktopBridge?: boolean;
  isCapacitorNative?: boolean;
  isStandaloneDisplayMode?: boolean;
  isNavigatorStandalone?: boolean;
}): boolean {
  const hasWindow = typeof window !== 'undefined';
  const win = getWindowAny();
  const hasDesktop =
    input?.hasDesktopBridge !== undefined ? input.hasDesktopBridge : Boolean(win?.aurtisticDesktop);
  const isCapNative =
    input?.isCapacitorNative !== undefined
      ? input.isCapacitorNative
      : Boolean((win?.Capacitor as { isNativePlatform?: () => boolean } | undefined)?.isNativePlatform?.());
  const isStandaloneDisplay =
    input?.isStandaloneDisplayMode !== undefined
      ? input.isStandaloneDisplayMode
      : Boolean(hasWindow && window.matchMedia?.('(display-mode: standalone)')?.matches);
  const isNavStandalone =
    input?.isNavigatorStandalone !== undefined
      ? input.isNavigatorStandalone
      : Boolean(
          typeof navigator !== 'undefined' &&
            (navigator as unknown as { standalone?: boolean }).standalone
        );

  return !(hasDesktop || isCapNative || isStandaloneDisplay || isNavStandalone);
}

export function getLanConfig(): LanConfig {
  if (typeof window === 'undefined') {
    return { lanServerUrl: '', autoDetectLan: true };
  }
  try {
    const raw = window.localStorage.getItem(LAN_CONFIG_STORAGE_KEY);
    if (!raw) return { lanServerUrl: '', autoDetectLan: true };
    const parsed = JSON.parse(raw) as Partial<LanConfig>;
    return {
      lanServerUrl: String(parsed.lanServerUrl || '').trim().replace(/\/+$/, ''),
      autoDetectLan: parsed.autoDetectLan !== false,
    };
  } catch {
    return { lanServerUrl: '', autoDetectLan: true };
  }
}

export async function setLanConfig(next: Partial<LanConfig>): Promise<LanConfig> {
  const current = getLanConfig();
  const rawUrl =
    next.lanServerUrl !== undefined
      ? String(next.lanServerUrl || '').trim().replace(/\/+$/, '')
      : current.lanServerUrl;
  const cleanUrl = rawUrl && !isAllowedLanUrl(rawUrl) ? '' : rawUrl;
  const merged: LanConfig = {
    lanServerUrl: cleanUrl,
    autoDetectLan: next.autoDetectLan !== undefined ? Boolean(next.autoDetectLan) : current.autoDetectLan,
  };
  invalidateLanProbeCache();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LAN_CONFIG_STORAGE_KEY, JSON.stringify(merged));
    } catch {}
  }
  const plugin = getVaultTransferPlugin();
  if (plugin?.setLanConfig) {
    try {
      await plugin.setLanConfig(merged);
    } catch {}
  }
  return merged;
}

function getVaultTransferPlugin(): Record<string, (...args: unknown[]) => Promise<unknown>> | null {
  const win = getWindowAny();
  const cap = win?.Capacitor as { Plugins?: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> } | undefined;
  return cap?.Plugins?.VaultTransfer ?? null;
}

function getDesktopBridge(): AurtisticDesktopBridge | null {
  const win = getWindowAny();
  return (win?.aurtisticDesktop as AurtisticDesktopBridge | undefined) ?? null;
}

/**
 * Testa se o servidor LAN configurado está acessível sem lançar erro se o usuário
 * estiver fora de casa ou se o WebView HTTPS bloquear Mixed Content.
 */
export async function probeLanServer(
  lanServerUrl?: string,
  timeoutMs = 1500
): Promise<{ reachable: boolean; url?: string }> {
  bindNetworkInvalidationListeners();
  const clean = String(lanServerUrl || getLanConfig().lanServerUrl || '').trim().replace(/\/+$/, '');
  if (!clean || !isAllowedLanUrl(clean)) return { reachable: false };

  if (cachedLanProbe && cachedLanProbe.url === clean && Date.now() - cachedLanProbe.checkedAt < LAN_PROBE_CACHE_MS) {
    return { reachable: cachedLanProbe.reachable, url: clean };
  }

  const record = (reachable: boolean) => {
    cachedLanProbe = { url: clean, reachable, checkedAt: Date.now() };
    return { reachable, url: clean };
  };

  const desktop = getDesktopBridge();
  if (desktop?.probeLan) {
    try {
      const res = await desktop.probeLan(clean);
      return record(Boolean(res?.reachable));
    } catch {
      return record(false);
    }
  }

  const plugin = getVaultTransferPlugin();
  if (plugin?.probeLan) {
    try {
      const res = (await plugin.probeLan({ serverUrl: clean, timeoutMs })) as { reachable?: boolean };
      return record(Boolean(res?.reachable));
    } catch {
      return record(false);
    }
  }

  // Na Web pura, evita Mixed Content quando página está em HTTPS e LAN é HTTP
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && clean.startsWith('http://')) {
    return record(false);
  }

  try {
    const res = await fetch(`${clean}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return record(false);
    const data = (await res.json().catch(() => null)) as { ok?: boolean; service?: string } | null;
    return record(Boolean(data?.ok === true && data?.service === 'aurtistic-edge'));
  } catch {
    return record(false);
  }
}

export interface PickedNativeFile {
  uri: string;
  name: string;
  sizeBytes: number;
}

export async function pickNativeUploadFiles(): Promise<PickedNativeFile[]> {
  const plugin = getVaultTransferPlugin();
  if (!plugin?.pickFilesForUpload) return [];
  const res = (await plugin.pickFilesForUpload()) as { files?: PickedNativeFile[] };
  return Array.isArray(res?.files) ? res.files : [];
}

export async function hasAndroidDeviceCredential(credentialScopeKey: string): Promise<boolean> {
  const plugin = getVaultTransferPlugin();
  if (!plugin?.hasDeviceCredential) return false;
  try {
    const res = (await plugin.hasDeviceCredential({ credentialScopeKey })) as { hasCredential?: boolean };
    return Boolean(res?.hasCredential);
  } catch {
    return false;
  }
}

export async function ensureAndroidDeviceCredential(input: {
  credentialScopeKey: string;
  remoteServerUrl: string;
  provisionToken: () => Promise<{ tokenId: string; secret: string }>;
}): Promise<boolean> {
  if (!isAndroidNative()) return false;
  if (await hasAndroidDeviceCredential(input.credentialScopeKey)) {
    return true;
  }
  try {
    const created = await input.provisionToken();
    return await saveAndroidDeviceCredential({
      credentialScopeKey: input.credentialScopeKey,
      tokenId: created.tokenId,
      secret: created.secret,
      remoteServerUrl: input.remoteServerUrl,
    });
  } catch {
    return false;
  }
}

export async function resolveOptimalServerUrl(remoteServerUrl: string): Promise<string> {
  const cfg = getLanConfig();
  if (cfg.autoDetectLan && cfg.lanServerUrl) {
    const probe = await probeLanServer(cfg.lanServerUrl, 1200);
    if (probe.reachable && probe.url) {
      return probe.url;
    }
  }
  return remoteServerUrl.replace(/\/+$/, '');
}

export async function saveAndroidDeviceCredential(input: {
  credentialScopeKey: string;
  tokenId: string;
  secret: string;
  remoteServerUrl: string;
  lanServerUrl?: string;
}): Promise<boolean> {
  const plugin = getVaultTransferPlugin();
  if (!plugin?.saveDeviceCredential) return false;
  try {
    await plugin.saveDeviceCredential(input);
    return true;
  } catch {
    return false;
  }
}

export async function clearAndroidDeviceCredential(credentialScopeKey: string): Promise<boolean> {
  const plugin = getVaultTransferPlugin();
  if (!plugin?.clearDeviceCredential) return false;
  try {
    await plugin.clearDeviceCredential({ credentialScopeKey });
    return true;
  } catch {
    return false;
  }
}

export async function enqueueNativeUpload(input: NativeTransferEnqueueUploadInput): Promise<boolean> {
  const desktop = getDesktopBridge();
  if (desktop?.enqueueUpload) {
    const res = await desktop.enqueueUpload(input);
    return Boolean(res?.ok);
  }
  const plugin = getVaultTransferPlugin();
  if (plugin?.enqueueUpload) {
    const res = (await plugin.enqueueUpload(input)) as { ok?: boolean };
    return Boolean(res?.ok);
  }
  return false;
}

export async function enqueueNativeDownload(input: NativeTransferEnqueueDownloadInput): Promise<boolean> {
  const desktop = getDesktopBridge();
  if (desktop?.enqueueDownload) {
    const res = await desktop.enqueueDownload(input);
    return Boolean(res?.ok);
  }
  const plugin = getVaultTransferPlugin();
  if (plugin?.enqueueDownload) {
    const res = (await plugin.enqueueDownload(input)) as { ok?: boolean };
    return Boolean(res?.ok);
  }
  return false;
}

export async function pauseNativeTransfer(id: string): Promise<boolean> {
  const desktop = getDesktopBridge();
  if (desktop?.pauseTransfer) {
    const res = await desktop.pauseTransfer(id);
    return Boolean(res?.ok);
  }
  const plugin = getVaultTransferPlugin();
  if (plugin?.pauseTransfer) {
    const res = (await plugin.pauseTransfer({ id })) as { ok?: boolean };
    return Boolean(res?.ok);
  }
  return false;
}

export async function resumeNativeTransfer(id: string): Promise<boolean> {
  const desktop = getDesktopBridge();
  if (desktop?.resumeTransfer) {
    const res = await desktop.resumeTransfer(id);
    return Boolean(res?.ok);
  }
  const plugin = getVaultTransferPlugin();
  if (plugin?.resumeTransfer) {
    const res = (await plugin.resumeTransfer({ id })) as { ok?: boolean };
    return Boolean(res?.ok);
  }
  return false;
}

export async function cancelNativeTransfer(id: string): Promise<boolean> {
  const desktop = getDesktopBridge();
  if (desktop?.cancelTransfer) {
    const res = await desktop.cancelTransfer(id);
    return Boolean(res?.ok);
  }
  const plugin = getVaultTransferPlugin();
  if (plugin?.cancelTransfer) {
    const res = (await plugin.cancelTransfer({ id })) as { ok?: boolean };
    return Boolean(res?.ok);
  }
  return false;
}

export async function listNativeTransfers(): Promise<NativeTransferStatus[]> {
  const desktop = getDesktopBridge();
  if (desktop?.listTransfers) {
    return desktop.listTransfers();
  }
  const plugin = getVaultTransferPlugin();
  if (plugin?.listTransfers) {
    const res = (await plugin.listTransfers()) as { transfers?: NativeTransferStatus[] };
    return Array.isArray(res?.transfers) ? res.transfers : [];
  }
  return [];
}

export async function scheduleTaskNotifications(payload: unknown): Promise<void> {
  const desktop = getDesktopBridge();
  if (desktop?.scheduleTaskNotifications) {
    await desktop.scheduleTaskNotifications(payload).catch(() => {});
  }
}

export async function syncSelfCareAlarms(payload: unknown): Promise<void> {
  const desktop = getDesktopBridge();
  if (desktop?.syncAlarms) {
    await desktop.syncAlarms(payload).catch(() => {});
  }
}

export async function getDesktopCredentialStatus(): Promise<DesktopCredentialSecurityStatus | null> {
  const desktop = getDesktopBridge();
  if (!desktop?.getCredentialStatus) return null;
  return desktop.getCredentialStatus().catch(() => null);
}

export async function saveDesktopCredential(input: {
  scopeKey: string;
  tokenId: string;
  secret: string;
}): Promise<{ ok: boolean; error?: string }> {
  const desktop = getDesktopBridge();
  if (!desktop?.saveCredential) return { ok: false, error: 'Bridge Desktop indisponível.' };
  try {
    return await desktop.saveCredential(input);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Falha ao salvar no safeStorage.' };
  }
}

export async function selectDesktopMirrorFolder(input: {
  remoteFolder: string;
  scopeKey: string;
  remoteServerUrl: string;
  lanServerUrl?: string;
}): Promise<DesktopMirrorFolderItem | null> {
  const desktop = getDesktopBridge();
  if (!desktop?.selectMirrorFolder) return null;
  return desktop.selectMirrorFolder(input);
}

export async function listDesktopMirrorFolders(): Promise<DesktopMirrorFolderItem[]> {
  const desktop = getDesktopBridge();
  if (!desktop?.listMirrorFolders) return [];
  return desktop.listMirrorFolders().catch(() => []);
}

export async function removeDesktopMirrorFolder(id: string): Promise<boolean> {
  const desktop = getDesktopBridge();
  if (!desktop?.removeMirrorFolder) return false;
  const res = await desktop.removeMirrorFolder(id).catch(() => ({ ok: false }));
  return Boolean(res?.ok);
}

export async function triggerDesktopMirrorSync(id: string) {
  const desktop = getDesktopBridge();
  if (!desktop?.triggerMirrorSync) return null;
  return desktop.triggerMirrorSync(id);
}

export function subscribeDesktopEvents(handlers: {
  onTriggerEyeRest?: () => void;
  onQuickWater?: () => void;
  onToggleHyperfocus?: () => void;
}): () => void {
  const desktop = getDesktopBridge();
  if (!desktop) return () => {};
  const unsubs: Array<() => void> = [];
  if (handlers.onTriggerEyeRest && desktop.onTriggerEyeRest) {
    unsubs.push(desktop.onTriggerEyeRest(handlers.onTriggerEyeRest));
  }
  if (handlers.onQuickWater && desktop.onQuickWater) {
    unsubs.push(desktop.onQuickWater(handlers.onQuickWater));
  }
  if (handlers.onToggleHyperfocus && desktop.onToggleHyperfocus) {
    unsubs.push(desktop.onToggleHyperfocus(handlers.onToggleHyperfocus));
  }
  return () => {
    for (const fn of unsubs) fn();
  };
}
