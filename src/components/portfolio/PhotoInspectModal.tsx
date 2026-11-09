// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/portfolio/PhotoInspectModal.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { UserFileIndexRow } from '@/types';
import { buildTenantStreamUrl, buildTenantThumbUrl, formatStorageBytes } from '@/lib/edge-urls';
import { updateFileEcosystemLinksAction } from '@/app/(dashboard)/servidor/actions';

export interface PhotoInspectItem extends UserFileIndexRow {
  itemTicket?: string;
  signedThumbUrl?: string;
  signedStreamUrl?: string;
}

export interface PhotoInspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: PhotoInspectItem[];
  initialIndex?: number;
  serverUrl?: string;
  isOwner?: boolean;
  onItemUpdated?: (updated: PhotoInspectItem) => void;
}

export function PhotoInspectModal({
  isOpen,
  onClose,
  items,
  initialIndex = 0,
  serverUrl,
  isOwner = false,
  onItemUpdated,
}: PhotoInspectModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showExifPanel, setShowExifPanel] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  // Sincroniza índice ao abrir modal
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);
  if (isOpen !== prevIsOpen || initialIndex !== prevInitialIndex) {
    setPrevIsOpen(isOpen);
    setPrevInitialIndex(initialIndex);
    if (isOpen) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
    }
  }

  const currentItem = items[currentIndex];

  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, items.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  // Navegação fluida por teclado (Setas, Espaço, ESC)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName) || target.isContentEditable);
      if (isTyping) return;

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key.toLowerCase() === 'i') {
        setShowExifPanel((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  // Navegação por Swipe em dispositivos móveis
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diffX = touchStartXRef.current - e.changedTouches[0].clientX;
    if (diffX > 50) {
      handleNext();
    } else if (diffX < -50) {
      handlePrev();
    }
    touchStartXRef.current = null;
  };

  const handleToggleFavorite = async () => {
    if (!currentItem || !isOwner || isTogglingFavorite) return;
    setIsTogglingFavorite(true);
    const nextFav = !currentItem.is_favorite;

    try {
      const res = await updateFileEcosystemLinksAction({
        relativePath: currentItem.relative_path,
        filename: currentItem.filename,
        mimeType: currentItem.mime_type,
        sizeBytes: currentItem.size_bytes,
        patch: {
          isFavorite: nextFav,
        },
      });

      if (res.ok) {
        const updated: PhotoInspectItem = {
          ...currentItem,
          is_favorite: nextFav,
        };
        onItemUpdated?.(updated);
      }
    } catch (err) {
      console.warn('[PhotoInspectModal] Falha ao alternar favorito:', err);
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  if (!isOpen || !currentItem) return null;

  const ticket = currentItem.itemTicket || '';
  const streamUrl =
    currentItem.signedStreamUrl ||
    buildTenantStreamUrl(currentItem.relative_path, ticket, { serverUrl });
  const thumbUrl =
    currentItem.signedThumbUrl ||
    buildTenantThumbUrl(currentItem.relative_path, ticket, { serverUrl });

  const exif = currentItem.exif_data || {};
  const hasExif = Object.keys(exif).length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inspeção de Fotografia"
      data-darkroom="true"
      className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md flex flex-col select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Barra de Ferramentas Superior */}
      <header className="h-14 px-4 bg-surface/90 border-b border-border-subtle flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono font-bold text-[#FFCC00] bg-[#FFCC00]/10 px-2 py-0.5 rounded border border-[#FFCC00]/20 shrink-0">
            {currentIndex + 1} / {items.length}
          </span>
          <h2 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
            {currentItem.title || currentItem.filename}
          </h2>
          {currentItem.album && (
            <span className="hidden sm:inline-block text-[11px] text-fg-secondary bg-surface px-2 py-0.5 rounded-full border border-border-subtle">
              📁 {currentItem.album}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Alternar Favorito (se for proprietário) */}
          {isOwner && (
            <button
              type="button"
              onClick={handleToggleFavorite}
              disabled={isTogglingFavorite}
              title={currentItem.is_favorite ? 'Remover dos Favoritos' : 'Marcar como Favorito'}
              className={`p-2 rounded-lg transition-colors ${
                currentItem.is_favorite
                  ? 'bg-[#FFCC00]/20 text-[#FFCC00]'
                  : 'bg-surface text-fg-muted hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {currentItem.is_favorite ? 'star' : 'star_border'}
              </span>
            </button>
          )}

          {/* Alternar Painel EXIF */}
          <button
            type="button"
            onClick={() => setShowExifPanel((prev) => !prev)}
            title="Informações EXIF da Câmera (Tecla I)"
            className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold ${
              showExifPanel
                ? 'bg-[#9D4EDD] text-white'
                : 'bg-surface text-fg-secondary hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">info</span>
            <span className="hidden md:inline">EXIF</span>
          </button>

          {/* Download Original */}
          <a
            href={streamUrl}
            download={currentItem.filename}
            title="Baixar Fotografia Original"
            className="p-2 bg-surface hover:bg-surface-hover text-fg-secondary hover:text-[#FFCC00] rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
          </a>

          {/* Fechar */}
          <button
            type="button"
            onClick={onClose}
            title="Fechar (ESC)"
            className="p-2 bg-surface hover:bg-red-500/20 text-fg-secondary hover:text-red-400 rounded-lg transition-colors ml-2"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </header>

      {/* Área Central: Foto em Proporção Passe-Partout 100% Original + Painel Lateral */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Botão Anterior (Desktop) */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Foto anterior"
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-[#FFCC00] text-white hover:text-black items-center justify-center backdrop-blur-sm transition-all border border-white/10"
          >
            <span className="material-symbols-outlined text-[32px]">chevron_left</span>
          </button>
        )}

        {/* Viewport da Fotografia */}
        <div className="flex-1 flex items-center justify-center p-2 sm:p-6 overflow-hidden relative">
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={currentItem.relative_path}
              src={streamUrl}
              alt={currentItem.title || currentItem.filename}
              className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl transition-transform duration-300"
              onError={(e) => {
                const target = e.currentTarget;
                if (thumbUrl && target.src !== thumbUrl) {
                  target.src = thumbUrl;
                } else if (!target.dataset.fallback) {
                  target.dataset.fallback = 'true';
                  const safeTitle = encodeURIComponent((currentItem.title || currentItem.filename || 'Fotografia').slice(0, 30));
                  const safeAlbum = encodeURIComponent((currentItem.album || 'Acervo').slice(0, 25));
                  target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%"><rect width="600" height="400" fill="%23141422" rx="14"/><rect x="10" y="10" width="580" height="380" fill="none" stroke="rgba(245,158,11,0.2)" stroke-width="1.5" stroke-dasharray="6 4" rx="10"/><g transform="translate(300, 160)" text-anchor="middle"><circle cx="0" cy="0" r="44" fill="%231b1b2a" stroke="%23f59e0b" stroke-width="2.2"/><path d="M-18 -8 L-12 -16 L12 -16 L18 -8 L24 -8 C26.2 -8 28 -6.2 28 -4 L28 18 C28 20.2 26.2 22 24 22 L-24 22 C-26.2 22 -28 20.2 -28 18 L-28 -4 C-28 -6.2 -26.2 -8 -24 -8 Z" fill="none" stroke="%23f59e0b" stroke-width="2.5" stroke-linejoin="round"/><circle cx="0" cy="7" r="9" fill="none" stroke="%23f59e0b" stroke-width="2.5"/><circle cx="16" cy="-2" r="2.5" fill="%23f59e0b"/><text y="74" fill="%23f1f5f9" font-family="system-ui, sans-serif" font-size="16" font-weight="600">${safeTitle}</text><text y="96" fill="%2394a3b8" font-family="system-ui, sans-serif" font-size="12">${safeAlbum} • HD USB em Espera</text></g></svg>`;
                }
              }}
            />
          </div>
        </div>

        {/* Botão Próximo (Desktop) */}
        {currentIndex < items.length - 1 && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Próxima foto"
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-[#FFCC00] text-white hover:text-black items-center justify-center backdrop-blur-sm transition-all border border-white/10"
          >
            <span className="material-symbols-outlined text-[32px]">chevron_right</span>
          </button>
        )}

        {/* Painel Lateral de Metadados EXIF e Informações */}
        {showExifPanel && (
          <aside className="w-80 sm:w-96 bg-surface border-l border-border-subtle p-5 overflow-y-auto shrink-0 animate-fade-in flex flex-col justify-between z-30">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FFCC00] text-[20px]">
                    photo_camera
                  </span>
                  Dados da Fotografia
                </h3>
                <button
                  type="button"
                  onClick={() => setShowExifPanel(false)}
                  className="text-fg-muted hover:text-white"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Informações Básicas */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-fg-muted">Arquivo</span>
                  <span className="text-white font-mono truncate max-w-[180px]">
                    {currentItem.filename}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-subtle">
                  <span className="text-fg-muted">Tamanho</span>
                  <span className="text-white font-mono">
                    {formatStorageBytes(currentItem.size_bytes)}
                  </span>
                </div>
                {currentItem.album && (
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="text-fg-muted">Álbum</span>
                    <span className="text-[#FFCC00] font-bold">{currentItem.album}</span>
                  </div>
                )}
                {currentItem.category && (
                  <div className="flex justify-between py-1 border-b border-border-subtle">
                    <span className="text-fg-muted">Categoria</span>
                    <span className="text-white">{currentItem.category}</span>
                  </div>
                )}
              </div>

              {/* Metadados EXIF Reais */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[#FFCC00] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">tune</span>
                  Parâmetros de Exposição (EXIF)
                </h4>

                {hasExif ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Boolean(exif.camera || exif.model) && (
                      <div className="bg-surface p-2.5 rounded-lg border border-border-subtle col-span-2">
                        <span className="text-[10px] text-fg-muted block">Câmera</span>
                        <span className="font-bold text-white">
                          {String(exif.camera || exif.model)}
                        </span>
                      </div>
                    )}
                    {Boolean(exif.lens) && (
                      <div className="bg-surface p-2.5 rounded-lg border border-border-subtle col-span-2">
                        <span className="text-[10px] text-fg-muted block">Lente</span>
                        <span className="font-bold text-white">{String(exif.lens)}</span>
                      </div>
                    )}
                    {Boolean(exif.focalLength) && (
                      <div className="bg-surface p-2 rounded-lg border border-border-subtle">
                        <span className="text-[10px] text-fg-muted block">Distância Focal</span>
                        <span className="font-bold text-white">{String(exif.focalLength)}</span>
                      </div>
                    )}
                    {Boolean(exif.fNumber || exif.aperture) && (
                      <div className="bg-surface p-2 rounded-lg border border-border-subtle">
                        <span className="text-[10px] text-fg-muted block">Abertura</span>
                        <span className="font-bold text-[#FFCC00]">
                          {String(exif.fNumber || exif.aperture)}
                        </span>
                      </div>
                    )}
                    {Boolean(exif.exposureTime || exif.shutterSpeed) && (
                      <div className="bg-surface p-2 rounded-lg border border-border-subtle">
                        <span className="text-[10px] text-fg-muted block">Velocidade</span>
                        <span className="font-bold text-white">
                          {String(exif.exposureTime || exif.shutterSpeed)}
                        </span>
                      </div>
                    )}
                    {Boolean(exif.iso) && (
                      <div className="bg-surface p-2 rounded-lg border border-border-subtle">
                        <span className="text-[10px] text-fg-muted block">ISO</span>
                        <span className="font-bold text-white">{String(exif.iso)}</span>
                      </div>
                    )}
                    {Boolean(exif.dateTaken) && (
                      <div className="bg-surface p-2.5 rounded-lg border border-border-subtle col-span-2">
                        <span className="text-[10px] text-fg-muted block">Data da Captura</span>
                        <span className="font-mono text-white">
                          {new Date(String(exif.dateTaken)).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-fg-muted bg-surface p-3 rounded-lg border border-border-subtle">
                    Metadados EXIF não disponíveis para este arquivo.
                  </p>
                )}
              </div>

              {/* Tags */}
              {Array.isArray(currentItem.tags) && currentItem.tags.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
                    Tags
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {currentItem.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-surface-hover border border-border-strong text-[#FFCC00] rounded text-[11px]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border-subtle text-[11px] text-fg-muted text-center">
              Dica: Use as setas do teclado (← →) ou deslize o dedo para navegar.
            </div>
          </aside>
        )}
      </div>

      {/* Miniaturas de Navegação Rápida no Rodapé */}
      <footer className="h-16 bg-surface/90 border-t border-border-subtle px-4 flex items-center justify-center gap-2 overflow-x-auto shrink-0 z-20">
        {items.map((it, idx) => {
          const isSelected = idx === currentIndex;
          const itThumb =
            it.signedThumbUrl ||
            buildTenantThumbUrl(it.relative_path, it.itemTicket || '', { serverUrl });

          return (
            <button
              key={it.relative_path}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-11 w-11 rounded-md overflow-hidden shrink-0 border transition-all ${
                isSelected
                  ? 'border-[#FFCC00] scale-110 shadow-lg shadow-[#FFCC00]/20'
                  : 'border-border-subtle opacity-60 hover:opacity-100'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={itThumb}
                alt={it.title || it.filename}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          );
        })}
      </footer>
    </div>
  );
}

