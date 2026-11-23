// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import type { UploadItem } from '@/lib/file-upload-helpers';
import { resolveItemTargetFolder } from '@/lib/file-upload-helpers';
import {
  createWebdavTokenDirect,
  downloadTenantFileResumable,
  getTenantFolderManifestDirect,
  uploadTenantFileSmart,
} from '@/lib/edge-client';
import { resolveClientEdgeServerUrl } from '@/lib/edge-urls';
import {
  cancelNativeTransfer,
  ensureAndroidDeviceCredential,
  enqueueNativeDownload,
  enqueueNativeUpload,
  getLanConfig,
  isAndroidNative,
  listNativeTransfers,
  pauseNativeTransfer,
  type PickedNativeFile,
  resolveOptimalServerUrl,
  resumeNativeTransfer,
} from '@/lib/native-bridge';
import {
  refreshTenantTicketAction,
  refreshOrganizationTicketAction,
  syncUserFileIndexAction,
  checkBackupHashesAction,
  recordBackupProxyMetadataAction,
} from '@/app/(dashboard)/servidor/actions';
import {
  computeFileSha256,
  hasProxySignatureMarker,
} from '@/lib/proxy-signature';
import { loadSmartBackupPreferences } from '@/components/galeria/SmartBackupSettingsModal';

export interface QueuedUploadItem {
  id: string;
  file: File;
  relativePath: string;
  targetFolder: string;
  status: 'idle' | 'uploading' | 'success' | 'error';
  phase?: 'uploading' | 'finalizing' | 'completed';
  resumeUploadId?: string;
  error?: string;
  progressPercent?: number;
}

export interface QueuedDownloadItem {
  id: string;
  relativePath: string;
  filename: string;
  sizeBytes: number;
  status: 'idle' | 'downloading' | 'paused' | 'verifying' | 'success' | 'error';
  progressPercent: number;
  loadedBytes: number;
  etag?: string | null;
  nativeManaged?: boolean;
  error?: string;
}

export interface UploadFinishedResults {
  successCount: number;
  errorCount: number;
  newUsedBytes?: number;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return 'Calculando...';
  }
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))} s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins} min ${secs} s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  return `${hours} h ${mins} min ${secs} s`;
}

export function formatSpeed(mbps: number): string {
  if (!mbps || mbps <= 0) return '0.0 Mbps';
  if (mbps < 0.1) {
    return `${(mbps * 1000).toFixed(0)} Kbps`;
  }
  return `${mbps.toFixed(1)} Mbps`;
}

interface VaultUploadContextType {
  queue: QueuedUploadItem[];
  isUploading: boolean;
  isMinimized: boolean;
  isModalOpen: boolean;
  currentFolder: string;
  overrideFolder: string | null;
  selectedOrgId: string | null;
  serverUrl?: string;
  activeTicket: string;
  lastCompletedUploadTime: number;
  lastUploadResults: UploadFinishedResults | null;
  totalFiles: number;
  completedFiles: number;
  errorFiles: number;
  idleFiles: number;
  activeItem?: QueuedUploadItem;
  totalBytes: number;
  uploadedBytes: number;
  overallPercent: number;
  uploadSpeedMbps: number;
  etaSeconds: number | null;
  enqueueItems: (
    items: UploadItem[],
    targetFolder?: string,
    orgId?: string | null
  ) => void;
  setOverrideFolder: (folder: string | null) => void;
  setCurrentFolder: (folder: string) => void;
  setSelectedOrgId: (orgId: string | null) => void;
  openModal: (
    items?: UploadItem[],
    targetFolder?: string,
    orgId?: string | null
  ) => void;
  closeModal: () => void;
  toggleMinimize: () => void;
  setIsMinimized: (val: boolean) => void;
  startUpload: () => Promise<void>;
  cancelUpload: (id: string) => void;
  cancelAll: () => void;
  retryFailed: () => void;
  removeItem: (id: string) => void;
  clearFinished: () => void;
  updateTicket: (ticket: string) => void;
  downloadQueue: QueuedDownloadItem[];
  isDownloading: boolean;
  enqueueNativeUploadFiles: (files: PickedNativeFile[], targetFolder?: string, orgId?: string | null) => Promise<number>;
  enqueueDownload: (file: { relativePath: string; name: string; sizeBytes?: number }) => void;
  enqueueFolderDownload: (folderPath: string) => Promise<void>;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  clearFinishedDownloads: () => void;
}

const VaultUploadContext = createContext<VaultUploadContextType | null>(null);

export function useVaultUpload(): VaultUploadContextType {
  const ctx = useContext(VaultUploadContext);
  if (!ctx) {
    throw new Error('useVaultUpload deve ser utilizado dentro de VaultUploadProvider');
  }
  return ctx;
}

interface VaultUploadProviderProps {
  children: React.ReactNode;
  initialVaultTicket?: string;
  serverUrl?: string;
}

export function VaultUploadProvider({
  children,
  initialVaultTicket = '',
  serverUrl,
}: VaultUploadProviderProps) {
  const [queue, setQueue] = useState<QueuedUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentFolder, setCurrentFolder] = useState('');
  const [overrideFolder, setOverrideFolder] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState(initialVaultTicket);
  const [lastCompletedUploadTime, setLastCompletedUploadTime] = useState(0);
  const [lastUploadResults, setLastUploadResults] = useState<UploadFinishedResults | null>(null);
  const [uploadSpeedMbps, setUploadSpeedMbps] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  const currentTicketRef = useRef(activeTicket);
  const lastTicketRefreshRef = useRef(Date.now());
  const cancelRequestedRef = useRef(false);
  const cancelledIdsRef = useRef<Set<string>>(new Set());
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeUploadIdRef = useRef<string | null>(null);
  const lastProgressUpdateRef = useRef(0);
  const speedSampleRef = useRef<{ time: number; loaded: number } | null>(null);
  const emaSpeedRef = useRef<number>(0);

  const [downloadQueue, setDownloadQueue] = useState<QueuedDownloadItem[]>([]);
  const downloadQueueRef = useRef<QueuedDownloadItem[]>([]);
  useEffect(() => {
    downloadQueueRef.current = downloadQueue;
  }, [downloadQueue]);
  const downloadControllersRef = useRef<Map<string, AbortController>>(new Map());
  const downloadBuffersRef = useRef<Map<string, { parts: Uint8Array[]; loadedBytes: number; etag: string | null }>>(new Map());

  useEffect(() => {
    if (initialVaultTicket && !activeTicket) {
      setActiveTicket(initialVaultTicket);
      currentTicketRef.current = initialVaultTicket;
    }
  }, [initialVaultTicket, activeTicket]);

  const updateTicket = useCallback((ticket: string) => {
    setActiveTicket(ticket);
    currentTicketRef.current = ticket;
    lastTicketRefreshRef.current = Date.now();
  }, []);

  // Nota: NÃO registramos beforeunload para não disparar o diálogo nativo do navegador
  // ("Atualizar o site?") durante uploads longos. O dock global persiste a fila via
  // estado React; apenas um reload forçado pelo usuário perderia o estado.

  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);

  // Quando o usuário navega entre rotas/abas com uploads ou fila ativa:
  // Fecha o modal em tela cheia e garante que o GlobalUploadDock permaneça visível no canto!
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      if (isUploading || queue.length > 0) {
        setIsModalOpen(false);
        setIsMinimized(true);
      }
    }
  }, [pathname, isUploading, queue.length]);


  // Garante ticket novo se passaram mais de 10 minutos ou se for forçado
  const ensureFreshTicket = useCallback(async (force = false): Promise<string> => {
    const elapsedMs = Date.now() - lastTicketRefreshRef.current;
    const isStale = force || elapsedMs > 10 * 60 * 1000 || !currentTicketRef.current;

    if (!isStale) {
      return currentTicketRef.current;
    }

    try {
      if (selectedOrgId) {
        const orgRes = await refreshOrganizationTicketAction({ organizationId: selectedOrgId });
        if (orgRes.ok && orgRes.session?.vaultTicket?.ticket) {
          const fresh = orgRes.session.vaultTicket.ticket;
          currentTicketRef.current = fresh;
          lastTicketRefreshRef.current = Date.now();
          setActiveTicket(fresh);
          return fresh;
        }
      }
      const refreshed = await refreshTenantTicketAction({
        purpose: 'vault',
        readOnly: false,
      });
      if (refreshed.ok && refreshed.ticket?.ticket) {
        currentTicketRef.current = refreshed.ticket.ticket;
        lastTicketRefreshRef.current = Date.now();
        setActiveTicket(refreshed.ticket.ticket);
        return refreshed.ticket.ticket;
      }
    } catch (e) {
      console.warn('[VaultUploadContext] Falha ao renovar ticket:', e);
    }
    return currentTicketRef.current;
  }, []);

  // Adiciona itens à fila
  const enqueueItems = useCallback(
    (items: UploadItem[], targetFolder?: string, orgId?: string | null) => {
      const baseFolder = (targetFolder ?? overrideFolder ?? currentFolder)
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');

      if (orgId !== undefined) {
        setSelectedOrgId(orgId);
      }

      setQueue((prev) => {
        const next = [...prev];
        for (const item of items) {
          const { targetFolder: resolvedTarget } = resolveItemTargetFolder(
            baseFolder,
            item.relativePath
          );
          const id = `${item.file.name}_${item.file.size}_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 7)}`;
          next.push({
            id,
            file: item.file,
            relativePath: item.relativePath,
            targetFolder: resolvedTarget,
            status: 'idle',
            progressPercent: 0,
          });
        }
        return next;
      });
    },
    [overrideFolder, currentFolder]
  );

  const handleSetOverrideFolder = useCallback((newFolder: string | null) => {
    const clean = typeof newFolder === 'string' ? newFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : null;
    setOverrideFolder(clean);
    if (clean !== null) {
      setQueue((prev) =>
        prev.map((item) => {
          if (item.status !== 'idle') return item;
          const { targetFolder } = resolveItemTargetFolder(clean, item.relativePath);
          return { ...item, targetFolder };
        })
      );
    }
  }, []);

  const openModal = useCallback(
    (items?: UploadItem[], targetFolder?: string, orgId?: string | null) => {
      if (targetFolder !== undefined) {
        const clean = targetFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        setCurrentFolder(clean);
        setOverrideFolder(clean);
      }
      if (orgId !== undefined) {
        setSelectedOrgId(orgId);
      }
      if (items && items.length > 0) {
        enqueueItems(items, targetFolder, orgId);
      }
      setIsModalOpen(true);
      setIsMinimized(false);
    },
    [enqueueItems]
  );

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const toggleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const cancelUpload = useCallback((id: string) => {
    cancelledIdsRef.current.add(id);
    if (activeUploadIdRef.current === id) {
      activeAbortControllerRef.current?.abort();
    }
    setQueue((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: 'error', error: 'Cancelado pelo usuário' } : it))
    );
  }, []);

  const cancelAll = useCallback(() => {
    cancelRequestedRef.current = true;
    activeAbortControllerRef.current?.abort();
    setQueue((prev) =>
      prev.map((it) =>
        it.status === 'uploading' || it.status === 'idle'
          ? { ...it, status: 'error', error: 'Upload cancelado' }
          : it
      )
    );
    setIsUploading(false);
  }, []);

  const retryFailed = useCallback(() => {
    if (isUploading) return;
    setQueue((prev) =>
      prev.map((it) => (it.status === 'error' ? { ...it, status: 'idle', error: undefined } : it))
    );
  }, [isUploading]);

  const removeItem = useCallback(
    (id: string) => {
      if (isUploading) return;
      setQueue((prev) => prev.filter((it) => it.id !== id));
    },
    [isUploading]
  );

  // Permite limpar itens concluídos mesmo durante upload ativo (não bloqueia a fila em progresso)
  const clearFinished = useCallback(() => {
    setQueue((prev) => prev.filter((it) => it.status !== 'success'));
  }, []);

  // Loop de Upload Sequencial com Trava Wi-Fi para Backup Automático e Proteção Anti-Loop
  const startUpload = useCallback(async (options?: { isAutoBackup?: boolean }) => {
    if (isUploading || queue.length === 0) return;

    // Trava Wi-Fi restrita exclusivamente a rotinas de backup automático de segundo plano (nunca bloqueia upload manual direto no Cofre)
    const backupPrefs = loadSmartBackupPreferences();
    if (options?.isAutoBackup && backupPrefs.wifiOnly && typeof navigator !== 'undefined') {
      const capPlugin = (window as any).Capacitor?.Plugins?.SmartBackup;
      if (capPlugin?.isUnmeteredWifi) {
        try {
          const wifiRes = await capPlugin.isUnmeteredWifi();
          if (wifiRes && wifiRes.unmeteredWifi === false) {
            alert('Sincronização em segundo plano pausada: conecte-se a uma rede Wi-Fi para enviar arquivos.');
            return;
          }
        } catch {}
      } else {
        const conn = (navigator as any).connection;
        if (
          !navigator.onLine ||
          conn?.saveData === true ||
          (conn?.type && conn.type !== 'wifi' && conn.type !== 'ethernet')
        ) {
          alert('Sincronização automática pausada: trava "Somente Wi-Fi" ativa.');
          return;
        }
      }
    }

    setIsUploading(true);
    const effectiveServerUrl = await resolveOptimalServerUrl(resolveClientEdgeServerUrl(serverUrl));
    cancelRequestedRef.current = false;
    cancelledIdsRef.current.clear();
    speedSampleRef.current = null;
    emaSpeedRef.current = 0;
    setUploadSpeedMbps(0);
    setEtaSeconds(null);

    await ensureFreshTicket(false);

    let successCount = 0;
    let errorCount = 0;
    let lastUsedBytes: number | undefined;

    const totalBatchBytes = queue.reduce((acc, item) => acc + item.file.size, 0);

    for (let i = 0; i < queue.length; i++) {
      if (cancelRequestedRef.current) break;
      const currentItem = queue[i];
      if (currentItem.status === 'success' || cancelledIdsRef.current.has(currentItem.id)) continue;

      const completedBytesBeforeThis = queue
        .slice(0, i)
        .reduce((acc, it) => acc + (it.status === 'success' ? it.file.size : 0), 0);

      // Proteção Anti-Loop: ignora proxy comprimido local ou hash já conhecido (somente <= 64 MB para evitar OOM)
      let itemSha256 = '';
      if (currentItem.file.size <= 64 * 1024 * 1024) {
        try {
          const isProxy = await hasProxySignatureMarker(currentItem.file);
          if (isProxy) {
            setQueue((prev) =>
              prev.map((it, idx) => (idx === i ? { ...it, status: 'success', progressPercent: 100 } : it))
            );
            successCount++;
            continue;
          }
          itemSha256 = await computeFileSha256(currentItem.file);
          const hashRes = await checkBackupHashesAction([itemSha256], selectedOrgId);
        if (hashRes.ok && hashRes.knownHashes.includes(itemSha256)) {
          setQueue((prev) =>
            prev.map((it, idx) => (idx === i ? { ...it, status: 'success', progressPercent: 100 } : it))
          );
          successCount++;
          continue;
        }
        } catch {}
      }

      setQueue((prev) =>
        prev.map((it, idx) =>
          idx === i ? { ...it, status: 'uploading', progressPercent: 0, error: undefined } : it
        )
      );

      let uploadSuccess = false;
      let attempt = 0;
      let lastErr: unknown;

      while (!uploadSuccess && attempt < 2 && !cancelRequestedRef.current && !cancelledIdsRef.current.has(currentItem.id)) {
        attempt++;
        const abortController = new AbortController();
        activeAbortControllerRef.current = abortController;
        activeUploadIdRef.current = currentItem.id;
        try {
          const ticketToUse = await ensureFreshTicket(attempt > 1);

          const mutation = await uploadTenantFileSmart({
            file: currentItem.file,
            folderPath: currentItem.targetFolder,
            ticket: ticketToUse,
            ensureFreshTicket,
            serverUrl: effectiveServerUrl,
            resumeUploadId: currentItem.resumeUploadId,
            signal: abortController.signal,
            onSessionCreated: (uploadId) => {
              setQueue((prev) =>
                prev.map((it, idx) => (idx === i ? { ...it, resumeUploadId: uploadId } : it))
              );
            },
            onPhaseChange: (phase) => {
              setQueue((prev) =>
                prev.map((it, idx) => (idx === i ? { ...it, phase } : it))
              );
            },
            onProgress: (pct, loadedBytes) => {
              const now = Date.now();
              const currentLoaded = loadedBytes ?? Math.round((currentItem.file.size * pct) / 100);
              const totalUploadedNow = completedBytesBeforeThis + currentLoaded;

              // Amostragem de velocidade (EMA) e estimativa de tempo restante (ETA)
              if (!speedSampleRef.current) {
                speedSampleRef.current = { time: now, loaded: totalUploadedNow };
              } else {
                const timeDelta = (now - speedSampleRef.current.time) / 1000;
                if (timeDelta >= 0.25) {
                  const bytesDelta = totalUploadedNow - speedSampleRef.current.loaded;
                  if (bytesDelta >= 0) {
                    const instantSpeed = bytesDelta / timeDelta;
                    const alpha = 0.25;
                    emaSpeedRef.current =
                      emaSpeedRef.current === 0
                        ? instantSpeed
                        : alpha * instantSpeed + (1 - alpha) * emaSpeedRef.current;
                    const mbps = (emaSpeedRef.current * 8) / 1_000_000;
                    setUploadSpeedMbps(mbps);
                    const remainingBytes = Math.max(0, totalBatchBytes - totalUploadedNow);
                    const eta =
                      emaSpeedRef.current > 512
                        ? Math.max(0, Math.round(remainingBytes / emaSpeedRef.current))
                        : null;
                    setEtaSeconds(eta);
                  }
                  speedSampleRef.current = { time: now, loaded: totalUploadedNow };
                }
              }

              if (now - lastProgressUpdateRef.current > 150 || pct === 100) {
                lastProgressUpdateRef.current = now;
                setQueue((prev) =>
                  prev.map((it, idx) => (idx === i ? { ...it, progressPercent: pct } : it))
                );
              }
            },
          });

          uploadSuccess = true;

          // Herança automática de dispositivo da pasta (.meta)
          let inheritedDevice: Record<string, unknown> = {};
          try {
            const metaKey = `aurtistic_vault_folder_meta_${selectedOrgId || 'personal'}`;
            const raw = typeof window !== 'undefined' ? localStorage.getItem(metaKey) : null;
            if (raw) {
              const map = JSON.parse(raw);
              const target = currentItem.targetFolder || '';
              // Procura se a pasta ou alguma ancestral tem deviceCategory
              if (map[target]?.deviceCategory) {
                inheritedDevice = {
                  deviceCategory: map[target].deviceCategory,
                  deviceName: map[target].deviceName,
                };
              }
            }
          } catch {}

          // Sincronização no Supabase
          try {
            const normTarget = (currentItem.targetFolder || '').toLowerCase();
            const isPortfolioFolder =
              normTarget === 'portfolio' ||
              normTarget.startsWith('portfolio/') ||
              normTarget === 'portifolio' ||
              normTarget.startsWith('portifolio/');
            const isCurriculumFolder =
              normTarget === 'curriculo' ||
              normTarget.startsWith('curriculo/');

            await syncUserFileIndexAction({
              mutation,
              ecosystemLinks: {
                ...(isPortfolioFolder ? { showInPortfolio: true, visibility: 'public' } : {}),
                ...(isCurriculumFolder ? { showInCurriculum: true, visibility: 'public' } : {}),
                ...(Object.keys(inheritedDevice).length > 0 ? { exifData: inheritedDevice } : {}),
              },
              organizationId: selectedOrgId || undefined,
            });
          } catch (syncErr) {
            console.warn('[VaultUploadContext] Aviso de sincronização no Supabase:', syncErr);
          }

          if (typeof mutation.total_used_bytes === 'number') {
            lastUsedBytes = mutation.total_used_bytes;
          }

          // Registro de hash + execução da política pós-backup após ACK verificado
          const verifiedSize = mutation.verifiedSizeBytes ?? currentItem.file.size;
          const ackSha = mutation.sha256 || itemSha256;
          if (mutation.item?.relativePath && ackSha && verifiedSize === currentItem.file.size) {
            void recordBackupProxyMetadataAction({
              relativePath: mutation.item.relativePath,
              contentHash: ackSha,
              originalSizeBytes: verifiedSize,
              deviceSource: (window as any).Capacitor?.isNativePlatform?.() ? 'mobile_android' : 'web',
            });

            const capPlugin = (window as any).Capacitor?.Plugins?.SmartBackup;
            const localUri = (currentItem as any).localUri as string | undefined;
            if (capPlugin && localUri) {
              if (backupPrefs.postBackupPolicy === 'delete_local' && capPlugin.deleteLocalFile) {
                void capPlugin.deleteLocalFile({ uri: localUri });
              } else if (
                backupPrefs.postBackupPolicy === 'replace_compressed' &&
                capPlugin.replaceWithCompressedProxy
              ) {
                void capPlugin
                  .replaceWithCompressedProxy({
                    uri: localUri,
                    originalSha256: ackSha,
                    originalSizeBytes: verifiedSize,
                    maxEdgePx: backupPrefs.compressedMaxEdgePx,
                    quality: Math.round(backupPrefs.compressedQuality * 100),
                  })
                  .then((proxyRes: any) => {
                    if (proxyRes?.compressedProxyHash && mutation.item?.relativePath) {
                      void recordBackupProxyMetadataAction({
                        relativePath: mutation.item.relativePath,
                        contentHash: ackSha,
                        originalSizeBytes: verifiedSize,
                        compressedProxyHash: proxyRes.compressedProxyHash,
                        isLocalCompressedProxy: true,
                        deviceSource: 'mobile_android',
                      });
                    }
                  })
                  .catch(() => {});
              }
            }
          }

          successCount++;
          setQueue((prev) =>
            prev.map((it, idx) =>
              idx === i ? { ...it, status: 'success', progressPercent: 100, error: undefined } : it
            )
          );
        } catch (err: unknown) {
          lastErr = err;
          const errMsg = err instanceof Error ? err.message : String(err);
          const isAuthError =
            errMsg.includes('401') ||
            errMsg.toLowerCase().includes('ticket') ||
            errMsg.toLowerCase().includes('expirado') ||
            errMsg.toLowerCase().includes('permissão');

          if (isAuthError && attempt < 2) {
            await ensureFreshTicket(true);
            continue;
          }
          break;
        } finally {
          activeAbortControllerRef.current = null;
          activeUploadIdRef.current = null;
        }
      }

      if (!uploadSuccess && !cancelRequestedRef.current) {
        errorCount++;
        const msg = lastErr instanceof Error ? lastErr.message : 'Falha no upload';
        setQueue((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: 'error', error: msg } : it))
        );
      }
    }

    setIsUploading(false);
    setUploadSpeedMbps(0);
    setEtaSeconds(null);
    speedSampleRef.current = null;
    emaSpeedRef.current = 0;
    const results: UploadFinishedResults = {
      successCount,
      errorCount,
      newUsedBytes: lastUsedBytes,
    };
    setLastUploadResults(results);
    setLastCompletedUploadTime(Date.now());
  }, [isUploading, queue, ensureFreshTicket, serverUrl, selectedOrgId]);

  // Métricas
  const totalFiles = queue.length;
  const completedFiles = queue.filter((i) => i.status === 'success').length;
  const errorFiles = queue.filter((i) => i.status === 'error').length;
  const idleFiles = queue.filter((i) => i.status === 'idle').length;
  const activeItem = queue.find((i) => i.status === 'uploading');

  const totalBytes = useMemo(() => queue.reduce((acc, i) => acc + i.file.size, 0), [queue]);
  const uploadedBytes = useMemo(() => {
    return queue.reduce((acc, i) => {
      if (i.status === 'success') return acc + i.file.size;
      if (i.status === 'uploading' && i.progressPercent) {
        return acc + Math.round((i.file.size * i.progressPercent) / 100);
      }
      return acc;
    }, 0);
  }, [queue]);

  const overallPercent = totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0;

  const runDownloadItem = useCallback(
    async (item: QueuedDownloadItem) => {
      const ctrl = new AbortController();
      downloadControllersRef.current.set(item.id, ctrl);
      const cached = downloadBuffersRef.current.get(item.id) || { parts: [], loadedBytes: 0, etag: null };
      downloadBuffersRef.current.set(item.id, cached);

      setDownloadQueue((prev) =>
        prev.map((d) => (d.id === item.id ? { ...d, status: 'downloading', error: undefined } : d))
      );

      try {
        const ticket = await ensureFreshTicket();
        const effectiveUrl = await resolveOptimalServerUrl(resolveClientEdgeServerUrl(serverUrl));
        const res = await downloadTenantFileResumable({
          relativePath: item.relativePath,
          ticket,
          ensureFreshTicket,
          serverUrl: effectiveUrl,
          signal: ctrl.signal,
          initialBytes: cached.loadedBytes,
          initialParts: cached.parts,
          initialEtag: cached.etag,
          onReset: () => {
            cached.parts = [];
            cached.loadedBytes = 0;
          },
          onMeta: ({ totalBytes, etag }) => {
            if (cached.etag && etag && cached.etag !== etag) {
              cached.parts = [];
              cached.loadedBytes = 0;
            }
            cached.etag = etag;
            setDownloadQueue((prev) =>
              prev.map((d) =>
                d.id === item.id ? { ...d, sizeBytes: totalBytes || d.sizeBytes, etag } : d
              )
            );
          },
          onProgress: (pct, loadedBytes, totalBytes, chunk, etag) => {
            if (etag && cached.etag && etag !== cached.etag) {
              cached.parts = [];
              cached.loadedBytes = 0;
            }
            if (etag) cached.etag = etag;
            if (chunk && chunk.byteLength > 0) {
              cached.parts.push(chunk);
              cached.loadedBytes = loadedBytes;
            }
            setDownloadQueue((prev) =>
              prev.map((d) =>
                d.id === item.id
                  ? {
                      ...d,
                      progressPercent: pct,
                      loadedBytes,
                      sizeBytes: totalBytes || d.sizeBytes,
                      status: pct >= 100 ? 'verifying' : 'downloading',
                    }
                  : d
              )
            );
          },
        });

        downloadBuffersRef.current.delete(item.id);
        downloadControllersRef.current.delete(item.id);

        if (typeof window !== 'undefined') {
          const url = URL.createObjectURL(res.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = item.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

        setDownloadQueue((prev) =>
          prev.map((d) =>
            d.id === item.id
              ? { ...d, status: 'success', progressPercent: 100, loadedBytes: res.totalBytes }
              : d
          )
        );
      } catch (err) {
        downloadControllersRef.current.delete(item.id);
        if (ctrl.signal.aborted) {
          return;
        }
        const msg = err instanceof Error ? err.message : 'Falha no download';
        setDownloadQueue((prev) =>
          prev.map((d) => (d.id === item.id ? { ...d, status: 'error', error: msg } : d))
        );
      }
    },
    [ensureFreshTicket, serverUrl]
  );

  const getCredentialScopeKey = useCallback(
    (orgIdOverride?: string | null) => {
      const org = orgIdOverride !== undefined ? orgIdOverride : selectedOrgId;
      return org ? `org:${org}` : 'personal';
    },
    [selectedOrgId]
  );

  const enqueueNativeUploadFiles = useCallback(
    async (files: PickedNativeFile[], targetFolder?: string, orgId?: string | null): Promise<number> => {
      if (!isAndroidNative() || !files || files.length === 0) return 0;
      const ticket = await ensureFreshTicket();
      const remoteUrl = resolveClientEdgeServerUrl(serverUrl);
      const scopeKey = getCredentialScopeKey(orgId);
      const okCred = await ensureAndroidDeviceCredential({
        credentialScopeKey: scopeKey,
        remoteServerUrl: remoteUrl,
        provisionToken: () =>
          createWebdavTokenDirect({
            ticket,
            serverUrl: remoteUrl,
            label: 'App Android (Segundo Plano)',
            readOnly: false,
            ttlDays: 90,
          }),
      });
      if (!okCred) return 0;

      const folder = String(targetFolder !== undefined ? targetFolder : overrideFolder || currentFolder || '')
        .replace(/^\/+|\/+$/g, '');
      const lanUrl = getLanConfig().lanServerUrl;
      let count = 0;
      for (const f of files) {
        const id = `nup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const relPath = folder ? `${folder}/${f.name}` : f.name;
        const ok = await enqueueNativeUpload({
          id,
          localUri: f.uri,
          relativePath: relPath,
          filename: f.name,
          totalSize: Math.max(0, Number(f.sizeBytes) || 0),
          credentialScopeKey: scopeKey,
          remoteServerUrl: remoteUrl,
          lanServerUrl: lanUrl,
          overwrite: false,
        });
        if (ok) count++;
      }
      return count;
    },
    [ensureFreshTicket, serverUrl, getCredentialScopeKey, overrideFolder, currentFolder]
  );

  // Polling leve para sincronizar progresso/pausa/PIN de transferências nativas no WorkManager
  useEffect(() => {
    if (!isAndroidNative()) return;
    const hasNative = downloadQueue.some((d) => d.nativeManaged && (d.status === 'downloading' || d.status === 'idle'));
    if (!hasNative) return;
    const timer = setInterval(async () => {
      const list = await listNativeTransfers().catch(() => []);
      if (list.length === 0) return;
      const byId = new Map(list.map((t) => [t.id, t]));
      for (const dl of downloadQueueRef.current) {
        if (!dl.nativeManaged) continue;
        const st = byId.get(dl.id) as (typeof list[number] & { errorCode?: string }) | undefined;
        if (!st) continue;
        if (st.state === 'failed' && st.errorCode === 'PIN_LOCKED') {
          // Pasta com PIN desbloqueada no app: fallback limpo para WebView usando x-tenant-ticket
          setDownloadQueue((prev) =>
            prev.map((d) => (d.id === dl.id ? { ...d, nativeManaged: false } : d))
          );
          void runDownloadItem(dl);
          continue;
        }
        setDownloadQueue((prev) =>
          prev.map((d) => {
            if (d.id !== dl.id) return d;
            const mappedStatus: QueuedDownloadItem['status'] =
              st.state === 'completed'
                ? 'success'
                : st.state === 'paused'
                  ? 'paused'
                  : st.state === 'failed'
                    ? 'error'
                    : st.state === 'running' || st.state === 'finalizing'
                      ? 'downloading'
                      : 'idle';
            return {
              ...d,
              status: mappedStatus,
              progressPercent: st.progressPercent ?? d.progressPercent,
              error: st.error || d.error,
            };
          })
        );
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [downloadQueue, runDownloadItem]);

  const enqueueDownload = useCallback(
    (file: { relativePath: string; name: string; sizeBytes?: number }) => {
      const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filename = file.name || file.relativePath.split('/').pop() || 'arquivo';
      const next: QueuedDownloadItem = {
        id,
        relativePath: file.relativePath,
        filename,
        sizeBytes: Math.max(0, Number(file.sizeBytes) || 0),
        status: 'idle',
        progressPercent: 0,
        loadedBytes: 0,
      };

      if (isAndroidNative()) {
        setDownloadQueue((prev) => [...prev, { ...next, nativeManaged: true, status: 'downloading' }]);
        void (async () => {
          try {
            const ticket = await ensureFreshTicket();
            const remoteUrl = resolveClientEdgeServerUrl(serverUrl);
            const scopeKey = getCredentialScopeKey();
            const okCred = await ensureAndroidDeviceCredential({
              credentialScopeKey: scopeKey,
              remoteServerUrl: remoteUrl,
              provisionToken: () =>
                createWebdavTokenDirect({
                  ticket,
                  serverUrl: remoteUrl,
                  label: 'App Android (Segundo Plano)',
                  readOnly: false,
                  ttlDays: 90,
                }),
            });
            if (okCred) {
              const parts = file.relativePath.split('/');
              parts.pop();
              const ok = await enqueueNativeDownload({
                id,
                relativePath: file.relativePath,
                filename,
                subfolder: parts.join('/'),
                sizeBytes: file.sizeBytes,
                credentialScopeKey: scopeKey,
                remoteServerUrl: remoteUrl,
                lanServerUrl: getLanConfig().lanServerUrl,
              });
              if (ok) return;
            }
          } catch {}
          setDownloadQueue((prev) => prev.map((d) => (d.id === id ? { ...d, nativeManaged: false } : d)));
          void runDownloadItem(next);
        })();
        return;
      }

      setDownloadQueue((prev) => [...prev, next]);
      void runDownloadItem(next);
    },
    [runDownloadItem, ensureFreshTicket, serverUrl, getCredentialScopeKey]
  );

  const enqueueFolderDownload = useCallback(
    async (folderPath: string) => {
      const ticket = await ensureFreshTicket();
      const effectiveUrl = await resolveOptimalServerUrl(resolveClientEdgeServerUrl(serverUrl));
      const manifest = await getTenantFolderManifestDirect({
        folder: folderPath,
        ticket,
        serverUrl: effectiveUrl,
        includeHash: false,
      });
      const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
      for (const f of manifest.files || []) {
        const fullRel = cleanFolder ? `${cleanFolder}/${f.relPath}` : f.relPath;
        const name = f.relPath.split('/').pop() || f.relPath;
        enqueueDownload({ relativePath: fullRel, name, sizeBytes: f.sizeBytes });
      }
    },
    [ensureFreshTicket, serverUrl, enqueueDownload]
  );

  const pauseDownload = useCallback((id: string) => {
    const target = downloadQueueRef.current.find((d) => d.id === id);
    if (target?.nativeManaged) {
      void pauseNativeTransfer(id);
    } else {
      const ctrl = downloadControllersRef.current.get(id);
      if (ctrl) ctrl.abort();
    }
    setDownloadQueue((prev) =>
      prev.map((d) => (d.id === id && d.status === 'downloading' ? { ...d, status: 'paused' } : d))
    );
  }, []);

  const resumeDownload = useCallback(
    (id: string) => {
      const item = downloadQueueRef.current.find((d) => d.id === id);
      if (!item) return;
      if (item.nativeManaged) {
        setDownloadQueue((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: 'downloading', error: undefined } : d))
        );
        void resumeNativeTransfer(id);
      } else {
        void runDownloadItem(item);
      }
    },
    [runDownloadItem]
  );

  const cancelDownload = useCallback((id: string) => {
    const target = downloadQueueRef.current.find((d) => d.id === id);
    if (target?.nativeManaged) {
      void cancelNativeTransfer(id);
    } else {
      const ctrl = downloadControllersRef.current.get(id);
      if (ctrl) ctrl.abort();
    }
    downloadControllersRef.current.delete(id);
    downloadBuffersRef.current.delete(id);
    setDownloadQueue((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const clearFinishedDownloads = useCallback(() => {
    setDownloadQueue((prev) => prev.filter((d) => d.status !== 'success'));
  }, []);

  const isDownloading = useMemo(
    () => downloadQueue.some((d) => d.status === 'downloading' || d.status === 'verifying'),
    [downloadQueue]
  );

  const value = useMemo(
    () => ({
      queue,
      isUploading,
      isMinimized,
      isModalOpen,
      currentFolder,
      overrideFolder,
      selectedOrgId,
      serverUrl,
      activeTicket,
      lastCompletedUploadTime,
      lastUploadResults,
      totalFiles,
      completedFiles,
      errorFiles,
      idleFiles,
      activeItem,
      totalBytes,
      uploadedBytes,
      overallPercent,
      uploadSpeedMbps,
      etaSeconds,
      enqueueItems,
      setOverrideFolder: handleSetOverrideFolder,
      setCurrentFolder,
      setSelectedOrgId,
      openModal,
      closeModal,
      toggleMinimize,
      setIsMinimized,
      startUpload,
      cancelUpload,
      cancelAll,
      retryFailed,
      removeItem,
      clearFinished,
      updateTicket,
      downloadQueue,
      isDownloading,
      enqueueNativeUploadFiles,
      enqueueDownload,
      enqueueFolderDownload,
      pauseDownload,
      resumeDownload,
      cancelDownload,
      clearFinishedDownloads,
    }),
    [
      queue,
      isUploading,
      isMinimized,
      isModalOpen,
      currentFolder,
      overrideFolder,
      selectedOrgId,
      serverUrl,
      activeTicket,
      lastCompletedUploadTime,
      lastUploadResults,
      totalFiles,
      completedFiles,
      errorFiles,
      idleFiles,
      activeItem,
      totalBytes,
      uploadedBytes,
      overallPercent,
      uploadSpeedMbps,
      etaSeconds,
      enqueueItems,
      handleSetOverrideFolder,
      openModal,
      closeModal,
      toggleMinimize,
      startUpload,
      cancelUpload,
      cancelAll,
      retryFailed,
      removeItem,
      clearFinished,
      updateTicket,
      downloadQueue,
      isDownloading,
      enqueueNativeUploadFiles,
      enqueueDownload,
      enqueueFolderDownload,
      pauseDownload,
      resumeDownload,
      cancelDownload,
      clearFinishedDownloads,
    ]
  );

  return <VaultUploadContext.Provider value={value}>{children}</VaultUploadContext.Provider>;
}

