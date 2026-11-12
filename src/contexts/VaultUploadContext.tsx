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
import { uploadTenantFileDirect } from '@/lib/edge-client';
import {
  refreshTenantTicketAction,
  syncUserFileIndexAction,
} from '@/app/(dashboard)/servidor/actions';

export interface QueuedUploadItem {
  id: string;
  file: File;
  relativePath: string;
  targetFolder: string;
  status: 'idle' | 'uploading' | 'success' | 'error';
  error?: string;
  progressPercent?: number;
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
  const lastProgressUpdateRef = useRef(0);
  const speedSampleRef = useRef<{ time: number; loaded: number } | null>(null);
  const emaSpeedRef = useRef<number>(0);

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
    const clean = newFolder ? newFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : null;
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
    setQueue((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: 'error', error: 'Cancelado pelo usuário' } : it))
    );
  }, []);

  const cancelAll = useCallback(() => {
    cancelRequestedRef.current = true;
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

  // Loop de Upload Sequencial
  const startUpload = useCallback(async () => {
    if (isUploading || queue.length === 0) return;
    setIsUploading(true);
    cancelRequestedRef.current = false;
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
      if (currentItem.status === 'success') continue;

      const completedBytesBeforeThis = queue
        .slice(0, i)
        .reduce((acc, it) => acc + (it.status === 'success' ? it.file.size : 0), 0);

      setQueue((prev) =>
        prev.map((it, idx) =>
          idx === i ? { ...it, status: 'uploading', progressPercent: 0, error: undefined } : it
        )
      );

      let uploadSuccess = false;
      let attempt = 0;
      let lastErr: unknown;

      while (!uploadSuccess && attempt < 2 && !cancelRequestedRef.current) {
        attempt++;
        try {
          const ticketToUse = await ensureFreshTicket(attempt > 1);

          const mutation = await uploadTenantFileDirect({
            file: currentItem.file,
            folderPath: currentItem.targetFolder,
            ticket: ticketToUse,
            serverUrl,
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
    ]
  );

  return <VaultUploadContext.Provider value={value}>{children}</VaultUploadContext.Provider>;
}

