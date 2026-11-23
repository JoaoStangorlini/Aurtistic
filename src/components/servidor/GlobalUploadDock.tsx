// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect } from 'react';
import { useVaultUpload, formatEta, formatSpeed } from '@/contexts/VaultUploadContext';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function GlobalUploadDock() {
  const {
    queue,
    isUploading,
    isMinimized,
    isModalOpen,
    activeItem,
    totalFiles,
    completedFiles,
    errorFiles,
    totalBytes,
    uploadedBytes,
    overallPercent,
    uploadSpeedMbps,
    etaSeconds,
    openModal,
    startUpload,
    cancelAll,
    clearFinished,
    downloadQueue,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    clearFinishedDownloads,
  } = useVaultUpload();

  // Mantém a tela ativa (Screen Wake Lock API) durante uploads ativos (minimizado ou no painel)
  useEffect(() => {
    if (!isUploading || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Ignora se o navegador/sistema negar o wake lock
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (sentinel) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [isUploading]);

  // Oculta se ambas as filas (upload e download) estiverem vazias ou se o modal já estiver aberto e maximizado
  if ((queue.length === 0 && downloadQueue.length === 0) || (isModalOpen && !isMinimized)) {
    return null;
  }

  const isAllDone = totalFiles > 0 && completedFiles === totalFiles;
  const hasErrors = errorFiles > 0;

  return (
    <aside
      aria-label="Upload em Segundo Plano"
      role="region"
      className="fixed bottom-20 md:bottom-4 right-4 z-[85] w-[92vw] sm:w-80 md:w-96 select-none transition-all duration-300 animate-in slide-in-from-bottom-4 ease-out"
    >
      <div className="bg-surface/95 backdrop-blur-xl border border-border-subtle hover:border-[var(--accent-primary)]/50 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] p-3 sm:p-3.5 text-fg">
        {/* Barra de Progresso Superior */}
        <div className="relative w-full h-1.5 bg-surface-hover rounded-full overflow-hidden mb-2.5">
          <div
            className={`h-full transition-all duration-200 ease-out ${
              hasErrors
                ? 'bg-rose-500'
                : isAllDone
                  ? 'bg-emerald-500'
                  : 'bg-[var(--accent-primary)]'
            }`}
            style={{ width: `${overallPercent}%` }}
          />
        </div>

        {/* Linha Principal: Ícone, Status e Controles */}
        <div className="flex items-center justify-between gap-2">
          <div
            onClick={() => openModal()}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1 group"
            title="Clique para expandir o gerenciador de uploads"
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                isUploading
                  ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                  : isAllDone
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : hasErrors
                      ? 'bg-rose-500/15 text-rose-500'
                      : 'bg-surface-hover text-fg-muted'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[18px] ${
                  isUploading ? 'animate-spin' : ''
                }`}
              >
                {isUploading
                  ? 'sync'
                  : isAllDone
                    ? 'check_circle'
                    : hasErrors
                      ? 'error'
                      : 'cloud_upload'}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-fg truncate">
                  {isUploading
                    ? activeItem?.phase === 'finalizing'
                      ? 'Finalizando e criptografando no servidor...'
                      : activeItem?.file.name || 'Enviando arquivos...'
                    : isAllDone
                      ? 'Uploads concluídos!'
                      : hasErrors
                        ? 'Envio com pendências'
                        : 'Pronto para enviar'}
                </span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-app border border-border-subtle shrink-0">
                  {overallPercent}%
                </span>
              </div>
              <div className="text-[10px] text-fg-muted font-mono flex items-center gap-1.5 mt-0.5">
                <span>
                  {completedFiles}/{totalFiles} arquivos
                </span>
                <span>•</span>
                <span>
                  {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
                </span>
                {isUploading && (
                  <>
                    <span>•</span>
                    <span className="text-[var(--accent-primary)] font-semibold">
                      {formatSpeed(uploadSpeedMbps)}
                    </span>
                    <span>•</span>
                    <span>
                      {formatEta(etaSeconds)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Botões de Ação Rápida */}
          <div className="flex items-center gap-1 shrink-0">
            {!isUploading && !isAllDone && (
              <button
                type="button"
                onClick={() => void startUpload()}
                className="p-1.5 rounded-lg bg-[var(--accent-primary)] text-white hover:brightness-110 transition-transform active:scale-95"
                title="Iniciar / Continuar envio"
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              </button>
            )}

            {isUploading && (
              <button
                type="button"
                onClick={cancelAll}
                className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                title="Cancelar todos os uploads"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              </button>
            )}

            {isAllDone && (
              <button
                type="button"
                onClick={clearFinished}
                className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
                title="Limpar concluídos"
              >
                <span className="material-symbols-outlined text-[16px]">done_all</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openModal()}
              className="p-1.5 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
              title="Expandir gerenciador completo"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_full</span>
            </button>
          </div>
        </div>

        {/* Fila de Downloads Resumíveis em Segundo Plano */}
        {downloadQueue.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-border-subtle space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-fg-muted">
              <span>Downloads ({downloadQueue.length})</span>
              {downloadQueue.some((d) => d.status === 'success') && (
                <button
                  type="button"
                  onClick={clearFinishedDownloads}
                  className="text-[10px] hover:text-fg cursor-pointer"
                >
                  Limpar concluídos
                </button>
              )}
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1.5">
              {downloadQueue.map((dl) => (
                <div key={dl.id} className="flex items-center justify-between gap-2 text-[11px] bg-app/70 px-2 py-1.5 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-fg truncate">{dl.filename}</p>
                    <p className="text-[10px] text-fg-muted font-mono">
                      {dl.status === 'downloading'
                        ? `Baixando ${dl.progressPercent}%`
                        : dl.status === 'verifying'
                          ? 'Verificando SHA-256...'
                          : dl.status === 'paused'
                            ? `Pausado (${dl.progressPercent}%)`
                            : dl.status === 'success'
                              ? 'Concluído'
                              : dl.status === 'error'
                                ? dl.error || 'Erro'
                                : 'Na fila'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {dl.status === 'downloading' && (
                      <button
                        type="button"
                        onClick={() => pauseDownload(dl.id)}
                        className="p-1 rounded hover:bg-surface-hover text-fg-muted hover:text-fg cursor-pointer"
                        title="Pausar download"
                      >
                        <span className="material-symbols-outlined text-[15px]">pause</span>
                      </button>
                    )}
                    {(dl.status === 'paused' || dl.status === 'error') && (
                      <button
                        type="button"
                        onClick={() => resumeDownload(dl.id)}
                        className="p-1 rounded hover:bg-surface-hover text-[var(--accent-primary)] cursor-pointer"
                        title="Retomar download"
                      >
                        <span className="material-symbols-outlined text-[15px]">play_arrow</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => cancelDownload(dl.id)}
                      className="p-1 rounded hover:bg-surface-hover text-rose-400 cursor-pointer"
                      title="Cancelar / Remover download"
                    >
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

