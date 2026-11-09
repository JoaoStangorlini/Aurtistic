// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { UserFileIndexRow } from '@/types';
import { buildTenantThumbUrl, buildTenantStreamUrl, formatStorageBytes } from '@/lib/edge-urls';
import {
  verifySharePinAction,
  refreshShareTicketAction,
  submitClientProofingAction,
  getShareLinkZipUrlAction,
} from '@/app/s/[token]/actions';

export interface ProofingPhotoItem extends UserFileIndexRow {
  itemTicket?: string;
  signedThumbUrl?: string;
  signedStreamUrl?: string;
}

export interface ClientProofingViewProps {
  token: string;
  albumTitle: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  hasPin: boolean;
  allowDownload: boolean;
  mode?: 'view' | 'proofing' | 'upload_only';
  expiresAt?: string | null;
  initialFiles?: ProofingPhotoItem[];
  initialSelectedPaths?: string[];
  isAlreadySubmitted?: boolean;
  submittedAt?: string | null;
  serverUrl?: string;
}

export function ClientProofingView({
  token,
  albumTitle,
  creatorName,
  creatorAvatarUrl,
  hasPin,
  allowDownload,
  mode = 'proofing',
  expiresAt,
  initialFiles = [],
  initialSelectedPaths = [],
  isAlreadySubmitted = false,
  submittedAt,
  serverUrl,
}: ClientProofingViewProps) {
  // Estado de Bloqueio por PIN
  const [isUnlocked, setIsUnlocked] = useState(!hasPin);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Acervo de fotos e seleções
  const [files, setFiles] = useState<ProofingPhotoItem[]>(initialFiles);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    new Set(initialSelectedPaths)
  );
  const [activeFilter, setActiveFilter] = useState<'all' | 'selected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Lightbox / Inspeção
  const [inspectIndex, setInspectIndex] = useState<number | null>(null);

  // Modal de Submissão
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientFeedback, setClientFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(isAlreadySubmitted);
  const [submissionFeedbackMsg, setSubmissionFeedbackMsg] = useState<string | null>(null);

  // Download ZIP
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  // Renovação periódica silenciosa da sessão anônima
  useEffect(() => {
    if (!isUnlocked) return;

    const interval = setInterval(async () => {
      try {
        const res = await refreshShareTicketAction(token, pinInput.trim() || undefined);
        if (res.ok && res.ticket) {
          setFiles((prev) =>
            prev.map((f) => ({
              ...f,
              itemTicket: res.ticket,
            }))
          );
        }
      } catch {}
    }, 10 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshShareTicketAction(token, pinInput.trim() || undefined).then((res) => {
          if (res.ok && res.ticket) {
            setFiles((prev) =>
              prev.map((f) => ({
                ...f,
                itemTicket: res.ticket,
              }))
            );
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isUnlocked, token, pinInput]);

  // Validação do PIN
  const handleUnlockPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput.trim()) {
      setPinError('Informe o PIN de acesso.');
      return;
    }

    setIsVerifyingPin(true);
    setPinError(null);

    try {
      const res = await verifySharePinAction(token, pinInput.trim());
      if (res.ok && res.files) {
        setFiles(res.files);
        setIsUnlocked(true);
      } else {
        setPinError(res.error || 'PIN incorreto. Tente novamente.');
      }
    } catch {
      setPinError('Falha de conexão ao validar PIN.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Toggle de Seleção
  const toggleSelectPhoto = (relPath: string) => {
    if (mode === 'view' || isSubmitted) return;
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) {
        next.delete(relPath);
      } else {
        next.add(relPath);
      }
      return next;
    });
  };

  // Download do ZIP da pasta (total ou seletivo)
  const handleDownloadZip = async (selective = false) => {
    setIsDownloadingZip(true);
    setZipError(null);
    try {
      const pathsToDownload =
        selective && selectedPaths.size > 0 ? Array.from(selectedPaths) : undefined;
      const res = await getShareLinkZipUrlAction(
        token,
        pinInput.trim() || undefined,
        pathsToDownload
      );
      if (res.ok && res.zipUrl) {
        window.open(res.zipUrl, '_blank');
      } else {
        setZipError(res.error || 'Não foi possível gerar o download.');
      }
    } catch {
      setZipError('Erro de comunicação com o servidor de download.');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Submissão da Seleção de Prova
  const handleSubmitProofing = async () => {
    if (selectedPaths.size === 0) return;
    setIsSubmitting(true);
    setSubmissionFeedbackMsg(null);

    try {
      const res = await submitClientProofingAction(
        token,
        clientName,
        clientFeedback,
        Array.from(selectedPaths),
        pinInput.trim() || undefined
      );

      if (res.ok) {
        setIsSubmitted(true);
        setIsSubmitModalOpen(false);
        setSubmissionFeedbackMsg(
          `Sua seleção com ${res.selectedCount || selectedPaths.size} fotos foi enviada com sucesso para ${creatorName}!`
        );
      } else {
        setSubmissionFeedbackMsg(res.error || 'Erro ao registrar seleção.');
      }
    } catch {
      setSubmissionFeedbackMsg('Falha de rede ao enviar seleção.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Itens filtrados para exibição
  const displayedFiles = useMemo(() => {
    return files.filter((item) => {
      if (activeFilter === 'selected' && !selectedPaths.has(item.relative_path)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.filename.toLowerCase().includes(q);
        const matchesTitle = item.title?.toLowerCase().includes(q) || false;
        if (!matchesName && !matchesTitle) return false;
      }
      return true;
    });
  }, [files, activeFilter, selectedPaths, searchQuery]);

  // Navegação no Lightbox
  const currentInspectItem = inspectIndex !== null ? displayedFiles[inspectIndex] : null;

  const handlePrevInspect = useCallback(() => {
    if (inspectIndex !== null && inspectIndex > 0) {
      setInspectIndex(inspectIndex - 1);
    }
  }, [inspectIndex]);

  const handleNextInspect = useCallback(() => {
    if (inspectIndex !== null && inspectIndex < displayedFiles.length - 1) {
      setInspectIndex(inspectIndex + 1);
    }
  }, [inspectIndex, displayedFiles.length]);

  useEffect(() => {
    if (inspectIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInspectIndex(null);
      if (e.key === 'ArrowLeft') handlePrevInspect();
      if (e.key === 'ArrowRight') handleNextInspect();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspectIndex, handlePrevInspect, handleNextInspect]);

  // TELA 1: BLOQUEIO POR PIN
  if (!isUnlocked && hasPin) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[#FFCC00]/10 border border-[#FFCC00]/30 flex items-center justify-center mx-auto text-[#FFCC00]">
            <span className="material-symbols-outlined text-[36px]">lock</span>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-mono text-[#FFCC00] uppercase tracking-wider">
              Álbum Protegido
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-fg font-['Bukra']">
              {albumTitle}
            </h1>
            <p className="text-xs text-fg-secondary">
              Criado por <strong className="text-fg">{creatorName}</strong>
            </p>
          </div>

          <form onSubmit={handleUnlockPin} className="space-y-4">
            <div className="space-y-1 text-left">
              <label htmlFor="pin-input" className="text-xs text-fg-secondary font-medium">
                PIN de Acesso
              </label>
              <input
                id="pin-input"
                type="password"
                inputMode="numeric"
                maxLength={12}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Digite o código PIN"
                className="w-full bg-app border border-border-subtle focus:border-[#FFCC00] rounded-xl px-4 py-3 text-center text-lg tracking-widest text-fg focus:outline-none transition-colors"
                autoFocus
              />
            </div>

            {pinError && (
              <p className="text-xs text-[#FF6B6B] bg-[#93000A]/20 border border-[#FF6B6B]/30 rounded-lg p-2.5">
                {pinError}
              </p>
            )}

            <button
              type="submit"
              disabled={isVerifyingPin || !pinInput.trim()}
              className="w-full py-3 bg-[#FFCC00] hover:bg-[#e6b800] disabled:opacity-50 text-[#121212] font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#FFCC00]/10"
            >
              {isVerifyingPin ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">
                    progress_activity
                  </span>
                  Verificando PIN...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">lock_open</span>
                  Destrancar Álbum
                </>
              )}
            </button>
          </form>

          <p className="text-[11px] text-fg-muted">
            Acesso confidencial para seleção e aprovação de fotografias.
          </p>
        </div>
      </div>
    );
  }

  // TELA 2: PORTAL DE PROVAS & GALERIA PASSE-PARTOUT
  return (
    <div className="min-h-screen bg-app text-fg-secondary">
      {/* Banner de Status de Submissão com Botão de Reedição */}
      {isSubmitted && mode === 'proofing' && (
        <div className="bg-[#FFCC00]/10 border-b border-[#FFCC00]/30 px-4 py-3 text-center text-xs text-[#FFCC00] flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>
              {submissionFeedbackMsg ||
                `Seleção de ${selectedPaths.size} fotos finalizada em ${
                  submittedAt ? new Date(submittedAt).toLocaleDateString('pt-BR') : 'recente'
                }.`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsSubmitted(false);
              setSubmissionFeedbackMsg(null);
            }}
            className="px-2.5 py-1 bg-surface-hover hover:bg-[#333333] text-[#FFCC00] hover:text-fg rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">edit</span>
            Editar Seleção Enviada
          </button>
        </div>
      )}

      {/* Header Fixo / Barra de Controle Superior */}
      <header className="sticky top-0 z-30 bg-app/95 backdrop-blur-md border-b border-border-subtle px-4 py-3 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Identificação do Álbum & Fotógrafo */}
          <div className="flex items-center gap-3">
            {creatorAvatarUrl ? (
              <img
                src={creatorAvatarUrl}
                alt={creatorName}
                className="w-10 h-10 rounded-full object-cover border border-[#FFCC00]"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-surface border border-border-subtle flex items-center justify-center text-[#FFCC00] font-bold text-sm">
                {creatorName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-fg font-['Bukra']">
                  {albumTitle}
                </h1>
                {hasPin && (
                  <span
                    title="Acesso Protegido por PIN"
                    className="material-symbols-outlined text-[15px] text-fg-secondary"
                  >
                    lock
                  </span>
                )}
              </div>
              <p className="text-xs text-fg-secondary">
                Por <strong className="text-fg">{creatorName}</strong> • {files.length} fotos
                {expiresAt && (
                  <span className="ml-2 text-[11px] text-fg-muted">
                    (válido até {new Date(expiresAt).toLocaleDateString('pt-BR')})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Ações e Controles */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Filtros: Todas vs Aprovadas (Oculta se mode === 'view') */}
            {mode === 'proofing' && (
              <div className="flex items-center bg-surface border border-border-subtle rounded-xl p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeFilter === 'all'
                      ? 'bg-surface-hover text-fg font-bold'
                      : 'text-fg-secondary hover:text-fg'
                  }`}
                >
                  Todas ({files.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('selected')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                    activeFilter === 'selected'
                      ? 'bg-[#FFCC00] text-[#121212] font-bold'
                      : 'text-fg-secondary hover:text-fg'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">check_circle</span>
                  Aprovadas ({selectedPaths.size})
                </button>
              </div>
            )}

            {/* Botão de Download ZIP (Total ou Seletivo) */}
            {allowDownload && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleDownloadZip(false)}
                  disabled={isDownloadingZip}
                  title="Baixar todas as fotos do álbum"
                  className="px-3 py-2 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">cloud_download</span>
                  <span className="hidden sm:inline">Baixar ZIP</span>
                </button>

                {mode === 'proofing' && selectedPaths.size > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleDownloadZip(true)}
                    disabled={isDownloadingZip}
                    title="Baixar apenas as fotos selecionadas"
                    className="px-3 py-2 bg-[#FFCC00]/15 hover:bg-[#FFCC00]/25 text-[#FFCC00] border border-[#FFCC00]/30 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">download_done</span>
                    <span className="hidden sm:inline">Aprovadas ({selectedPaths.size})</span>
                  </button>
                )}
              </div>
            )}

            {/* Botão de Submissão da Seleção (Apenas mode === 'proofing') */}
            {mode === 'proofing' && (
              !isSubmitted ? (
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(true)}
                  disabled={selectedPaths.size === 0}
                  className="px-4 py-2 bg-[#FFCC00] hover:bg-[#e6b800] disabled:opacity-40 text-[#121212] font-bold rounded-xl text-xs transition-all flex items-center gap-2 shadow-md shadow-[#FFCC00]/10"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  Enviar Seleção ({selectedPaths.size})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsSubmitted(false);
                    setSubmissionFeedbackMsg(null);
                  }}
                  className="px-3 py-2 bg-surface-hover hover:bg-[#333333] text-[#FFCC00] border border-[#FFCC00]/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Clique para editar suas fotos selecionadas"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  Editar Seleção
                </button>
              )
            )}
          </div>
        </div>
      </header>

      {/* Mensagem de Erro de Download (se houver) */}
      {zipError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-4">
          <div className="p-3 bg-[#93000a]/20 border border-[#93000a] text-[#ffdad6] rounded-xl text-xs flex items-center justify-between">
            <span>{zipError}</span>
            <button
              type="button"
              onClick={() => setZipError(null)}
              className="text-[#ffdad6] hover:text-fg"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo Principal: Grid Passe-Partout Sem Cortes */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        {/* Barra de Busca de Arquivos */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome do arquivo..."
              className="w-full bg-surface border border-border-subtle focus:border-[#FFCC00] rounded-xl pl-9 pr-4 py-2 text-xs text-fg focus:outline-none transition-colors"
            />
          </div>

          <div className="text-xs text-fg-muted">
            Exibindo <strong>{displayedFiles.length}</strong> de {files.length} fotos
          </div>
        </div>

        {/* Grade de Fotos */}
        {displayedFiles.length === 0 ? (
          <div className="p-16 text-center bg-surface border border-border-subtle rounded-2xl space-y-3">
            <span className="material-symbols-outlined text-[48px] text-fg-muted">
              photo_library
            </span>
            <h3 className="text-sm font-bold text-fg">Nenhuma foto encontrada</h3>
            <p className="text-xs text-fg-muted">
              {activeFilter === 'selected'
                ? 'Você ainda não marcou nenhuma foto como aprovada.'
                : 'Não há fotografias correspondentes ao filtro atual.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {displayedFiles.map((item, index) => {
              const isSelected = selectedPaths.has(item.relative_path);
              const thumbUrl =
                item.signedThumbUrl ||
                buildTenantThumbUrl(item.relative_path, item.itemTicket || '', { serverUrl });

              return (
                <div
                  key={item.relative_path}
                  className={`group relative bg-surface rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col ${
                    isSelected
                      ? 'border-[#FFCC00] shadow-lg shadow-[#FFCC00]/10 ring-1 ring-[#FFCC00]'
                      : 'border-border-subtle hover:border-[#4A4A4A]'
                  }`}
                >
                  {/* Passe-Partout 4:3 Box com object-contain */}
                  <div
                    onClick={() => setInspectIndex(index)}
                    className="relative w-full aspect-[4/3] bg-[#101010] flex items-center justify-center p-2.5 cursor-pointer overflow-hidden"
                  >
                    <img
                      src={thumbUrl}
                      alt={item.title || item.filename}
                      loading="lazy"
                      className="max-w-full max-h-full w-auto h-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                    />

                    {/* Botão de Inspeção Rápida */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <span className="px-3 py-1.5 bg-app/80 backdrop-blur-md rounded-full text-xs font-bold text-fg flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        Ver Detalhes
                      </span>
                    </div>

                    {/* Badge de Seleção Superior (Apenas em modo proofing) */}
                    {mode === 'proofing' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectPhoto(item.relative_path);
                        }}
                        disabled={isSubmitted}
                        aria-label={isSelected ? 'Desmarcar foto' : 'Aprovar foto'}
                        className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-[#FFCC00] text-[#121212] shadow-md shadow-[#FFCC00]/30 scale-105'
                            : 'bg-app/70 text-fg-secondary hover:text-fg hover:bg-app'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {isSelected ? 'check' : 'check'}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Rodapé do Card com Nome e Ação */}
                  <div className="p-3 bg-surface flex items-center justify-between gap-2 border-t border-border-subtle">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-fg truncate">
                        {item.title || item.filename}
                      </p>
                      <p className="text-[11px] text-fg-muted font-mono">
                        {formatStorageBytes(item.size_bytes)}
                      </p>
                    </div>

                    {mode === 'proofing' && (
                      <button
                        type="button"
                        onClick={() => toggleSelectPhoto(item.relative_path)}
                        disabled={isSubmitted}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-[#FFCC00]/20 text-[#FFCC00] hover:bg-[#FFCC00]/30'
                            : 'bg-surface-hover text-fg-secondary hover:text-fg'
                        }`}
                      >
                        {isSelected ? 'Aprovada' : 'Aprovar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* MODAL 1: LIGHTBOX DE INSPEÇÃO COMPLETA */}
      {inspectIndex !== null && currentInspectItem && (
        <div data-darkroom="true" className="fixed inset-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-xl flex flex-col">
          {/* Topo do Lightbox */}
          <header className="h-14 border-b border-border-subtle px-4 sm:px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs text-fg-secondary font-mono">
                {inspectIndex + 1} / {displayedFiles.length}
              </span>
              <h2 className="text-sm font-bold text-fg truncate">
                {currentInspectItem.title || currentInspectItem.filename}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {mode === 'proofing' && (
                <button
                  type="button"
                  onClick={() => toggleSelectPhoto(currentInspectItem.relative_path)}
                  disabled={isSubmitted}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    selectedPaths.has(currentInspectItem.relative_path)
                      ? 'bg-[#FFCC00] text-[#121212]'
                      : 'bg-surface-hover text-fg hover:bg-[#353535]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  {selectedPaths.has(currentInspectItem.relative_path) ? 'Aprovada' : 'Aprovar'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setInspectIndex(null)}
                className="p-1.5 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
                title="Fechar (Esc)"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </header>

          {/* Área Central da Imagem Full-Res */}
          <div className="flex-1 relative flex items-center justify-center p-4 select-none">
            {/* Botão Anterior */}
            {inspectIndex > 0 && (
              <button
                type="button"
                onClick={handlePrevInspect}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-surface/80 hover:bg-surface-hover text-fg flex items-center justify-center transition-colors shadow-lg"
              >
                <span className="material-symbols-outlined text-[24px]">arrow_back</span>
              </button>
            )}

            <img
              src={
                currentInspectItem.signedStreamUrl ||
                buildTenantStreamUrl(
                  currentInspectItem.relative_path,
                  currentInspectItem.itemTicket || '',
                  { serverUrl }
                )
              }
              alt={currentInspectItem.title || currentInspectItem.filename}
              className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl"
            />

            {/* Botão Próximo */}
            {inspectIndex < displayedFiles.length - 1 && (
              <button
                type="button"
                onClick={handleNextInspect}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-surface/80 hover:bg-surface-hover text-fg flex items-center justify-center transition-colors shadow-lg"
              >
                <span className="material-symbols-outlined text-[24px]">arrow_forward</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRMAÇÃO E ENVIO DA SELEÇÃO */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[11px] font-mono text-[#FFCC00] uppercase tracking-wider">
                  Finalizar Prova
                </span>
                <h3 className="text-xl font-bold text-fg font-['Bukra']">
                  Enviar Seleção de Fotos
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                className="text-fg-muted hover:text-fg p-1 rounded"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-4 bg-surface-hover rounded-xl border border-border-subtle space-y-1 text-xs">
              <p className="text-fg font-semibold">
                Você selecionou <strong className="text-[#FFCC00]">{selectedPaths.size}</strong> de{' '}
                {files.length} fotos.
              </p>
              <p className="text-fg-secondary">
                Ao confirmar, {creatorName} receberá uma notificação direta no painel do Aurtistic
                com a relação dos arquivos aprovados para tratamento ou entrega.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="client-name" className="text-xs text-fg-secondary font-medium">
                  Seu Nome ou Razão Social
                </label>
                <input
                  id="client-name"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: Ana Clara ou Casal Silva"
                  className="w-full bg-app border border-border-subtle focus:border-[#FFCC00] rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="client-feedback" className="text-xs text-fg-secondary font-medium">
                  Observações / Feedback Adicional (opcional)
                </label>
                <textarea
                  id="client-feedback"
                  rows={3}
                  value={clientFeedback}
                  onChange={(e) => setClientFeedback(e.target.value)}
                  placeholder="Ex: Gostamos muito da foto 04 e 09! Se puder ajustar a iluminação de fundo na 14..."
                  className="w-full bg-app border border-border-subtle focus:border-[#FFCC00] rounded-xl p-3 text-xs text-fg focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>

            {submissionFeedbackMsg && (
              <p className="text-xs text-[#FF6B6B] bg-[#93000A]/20 border border-[#FF6B6B]/30 rounded-lg p-2.5">
                {submissionFeedbackMsg}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-surface-hover hover:bg-[#333333] text-fg-secondary hover:text-fg rounded-xl text-xs font-semibold transition-colors"
              >
                Voltar e Revisar
              </button>

              <button
                type="button"
                onClick={handleSubmitProofing}
                disabled={isSubmitting || selectedPaths.size === 0}
                className="px-5 py-2.5 bg-[#FFCC00] hover:bg-[#e6b800] disabled:opacity-50 text-[#121212] font-bold rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-[#FFCC00]/10"
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">
                      progress_activity
                    </span>
                    Enviando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">send</span>
                    Confirmar Envio
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

