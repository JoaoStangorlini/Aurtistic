// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { exportSlideToBlob } from '@/lib/studio/studio-exporter';

interface StudioInstagramPreviewModalProps {
  open: boolean;
  onClose: () => void;
}

export function StudioInstagramPreviewModal({ open, onClose }: StudioInstagramPreviewModalProps) {
  const { slides, aspectRatio, orgSlug } = useStudio();
  const { tokens } = useOrganizationBrand();

  const [mode, setMode] = useState<'feed' | 'reels'>('feed');
  const [gridCrop, setGridCrop] = useState<'1:1' | '4:5'>('4:5');
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setPreviewUrls((prev) => {
        prev.forEach((u) => URL.revokeObjectURL(u));
        return [];
      });
      return;
    }

    let cancelled = false;
    const createdUrls: string[] = [];
    setLoading(true);
    setActiveIndex(0);

    (async () => {
      const reusableCanvas = document.createElement('canvas');
      for (let i = 0; i < slides.length; i++) {
        if (cancelled) break;
        const blob = await exportSlideToBlob(slides[i], aspectRatio, {
          format: 'webp',
          quality: 0.88,
          scale: 0.5,
          tokens,
          reusableCanvas,
        });
        if (blob && !cancelled) {
          createdUrls.push(URL.createObjectURL(blob));
        }
      }
      reusableCanvas.width = 0;
      reusableCanvas.height = 0;

      if (cancelled) {
        createdUrls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setPreviewUrls((prev) => {
        prev.forEach((u) => URL.revokeObjectURL(u));
        return createdUrls;
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [open, slides, aspectRatio, tokens]);

  if (!open) return null;

  const effectiveHandle = `@${(orgSlug || tokens.themeId || 'organizacao').toLowerCase()}`;
  const currentUrl = previewUrls[activeIndex] || previewUrls[0] || '';
  const coverUrl = previewUrls[0] || '';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Simulador de Feed e Reels do Instagram"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border-subtle bg-surface p-4 sm:p-5 text-fg shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-[#FFCC00]">
              <span className="material-symbols-outlined text-[18px]">smartphone</span>
            </span>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-fg">
                Simulador Instagram &amp; Reels
              </h2>
              <p className="text-[11px] text-fg-muted">
                Confira o recorte na grade 3×3 do perfil e a zona segura dos botões sobre o post.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-border-subtle bg-elevated p-1 text-xs">
              <button
                type="button"
                onClick={() => setMode('feed')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  mode === 'feed' ? 'bg-[#FFCC00] text-black' : 'text-fg-muted hover:text-fg'
                }`}
              >
                Feed 3×3 &amp; Swipe
              </button>
              <button
                type="button"
                onClick={() => setMode('reels')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  mode === 'reels' ? 'bg-[#FFCC00] text-black' : 'text-fg-muted hover:text-fg'
                }`}
              >
                Reels / Story
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar simulador"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-subtle bg-elevated text-fg-muted hover:text-fg cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {loading && previewUrls.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-fg-muted text-xs">
            <span className="material-symbols-outlined animate-spin text-[24px] text-[#FFCC00]">progress_activity</span>
            <span>Renderizando slides em alta fidelidade...</span>
          </div>
        ) : mode === 'feed' ? (
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Carrossel Swipe do Feed */}
            <div className="w-full md:flex-1 min-w-0 flex flex-col items-center gap-2">
              <div className="w-full max-w-[340px] mx-auto rounded-2xl border border-border-subtle bg-elevated overflow-hidden shadow-lg">
                {/* Topo do Post */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-black shrink-0"
                      style={{ backgroundColor: tokens.primaryColor || '#FFCC00' }}
                    >
                      {tokens.displayName.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-[11px] font-bold truncate">{effectiveHandle}</span>
                  </div>
                  <span className="text-[10px] font-mono text-fg-muted">
                    {activeIndex + 1}/{Math.max(1, previewUrls.length)}
                  </span>
                </div>

                {/* Área da Imagem */}
                <div className="relative bg-black flex items-center justify-center">
                  {currentUrl && (
                    <img
                      src={currentUrl}
                      alt={`Slide ${activeIndex + 1}`}
                      className="w-full max-h-[360px] object-contain"
                    />
                  )}
                  {previewUrls.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Slide anterior"
                        disabled={activeIndex === 0}
                        onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Próximo slide"
                        disabled={activeIndex >= previewUrls.length - 1}
                        onClick={() => setActiveIndex((i) => Math.min(previewUrls.length - 1, i + 1))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Ações + Bolinhas */}
                <div className="px-3 py-2 flex items-center justify-between border-t border-border-subtle">
                  <div className="flex items-center gap-2.5 text-fg-secondary">
                    <span className="material-symbols-outlined text-[18px]">favorite</span>
                    <span className="material-symbols-outlined text-[18px]">chat_bubble</span>
                    <span className="material-symbols-outlined text-[18px]">send</span>
                  </div>
                  {previewUrls.length > 1 && (
                    <div className="flex items-center gap-1">
                      {previewUrls.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          aria-label={`Ir para slide ${idx + 1}`}
                          onClick={() => setActiveIndex(idx)}
                          className={`h-1.5 rounded-full transition-all cursor-pointer ${
                            idx === activeIndex ? 'w-3 bg-[#FFCC00]' : 'w-1.5 bg-fg-muted/40'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  <span className="material-symbols-outlined text-[18px] text-fg-secondary">bookmark</span>
                </div>
              </div>
            </div>

            {/* Grade 3x3 do Perfil */}
            <div className="w-full md:flex-1 min-w-0 space-y-2.5">
              <div className="flex items-center justify-between gap-2 max-w-[320px] mx-auto md:mx-0">
                <span className="text-[11px] font-black uppercase tracking-wider text-fg-muted">
                  Grade 3×3 do Perfil ({gridCrop})
                </span>
                <div className="flex items-center gap-1 rounded-lg border border-border-subtle bg-elevated p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setGridCrop('4:5')}
                    className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                      gridCrop === '4:5' ? 'bg-[#FFCC00] text-black' : 'text-fg-muted'
                    }`}
                  >
                    4:5 Atual
                  </button>
                  <button
                    type="button"
                    onClick={() => setGridCrop('1:1')}
                    className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                      gridCrop === '1:1' ? 'bg-[#FFCC00] text-black' : 'text-fg-muted'
                    }`}
                  >
                    1:1 Clássico
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border-subtle bg-elevated p-1.5 w-full max-w-[320px] mx-auto md:mx-0">
                <div
                  className={`relative overflow-hidden rounded-lg bg-black ring-2 ring-[#FFCC00] ${
                    gridCrop === '1:1' ? 'aspect-square' : 'aspect-[4/5]'
                  }`}
                >
                  {coverUrl && (
                    <img
                      src={coverUrl}
                      alt="Capa na grade 3x3"
                      className="w-full h-full object-cover"
                    />
                  )}
                  {previewUrls.length > 1 && (
                    <span className="material-symbols-outlined absolute top-1 right-1 text-[14px] text-white drop-shadow">
                      filter_none
                    </span>
                  )}
                </div>
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg bg-surface-hover/70 border border-border-subtle/50 flex items-center justify-center text-[9px] text-fg-muted/50 ${
                      gridCrop === '1:1' ? 'aspect-square' : 'aspect-[4/5]'
                    }`}
                  >
                    Post #{idx + 2}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-fg-muted">
                O primeiro card destacado em amarelo mostra exatamente como a capa será recortada na grade do perfil.
              </p>
            </div>
          </div>
        ) : (
          /* Modo 2: Overlay Realista de Reels / Story */
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-[240px] sm:w-[270px] aspect-[9/16] rounded-[28px] border-4 border-border-subtle bg-black overflow-hidden shadow-2xl">
              {currentUrl && (
                <img
                  src={currentUrl}
                  alt={`Preview Reels Slide ${activeIndex + 1}`}
                  className="w-full h-full object-contain"
                />
              )}

              {/* Barra superior de Stories/Reels */}
              <div className="pointer-events-none absolute inset-x-3 top-2.5 flex flex-col gap-2">
                <div className="flex gap-1">
                  {previewUrls.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-0.5 flex-1 rounded-full ${
                        idx <= activeIndex ? 'bg-white' : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-white drop-shadow">
                  <span className="text-[11px] font-bold">Reels</span>
                  <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                </div>
              </div>

              {/* Pilha lateral direita realista (Curtir / Comentar / Enviar / Áudio) */}
              <div className="pointer-events-none absolute right-2.5 bottom-14 flex flex-col items-center gap-3 text-white drop-shadow">
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-[20px]">favorite</span>
                  <span className="text-[9px] font-bold">1,2k</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-[20px]">chat_bubble</span>
                  <span className="text-[9px] font-bold">48</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-[20px]">send</span>
                </div>
                <span className="material-symbols-outlined text-[18px]">more_vert</span>
                <div className="w-6 h-6 rounded-md border border-white/70 bg-black/60 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[13px]">music_note</span>
                </div>
              </div>

              {/* Rodapé esquerdo realista (Avatar + @org + legenda) */}
              <div className="pointer-events-none absolute left-3 right-12 bottom-3 space-y-1 text-white drop-shadow">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-black"
                    style={{ backgroundColor: tokens.primaryColor || '#FFCC00' }}
                  >
                    {tokens.displayName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="text-[11px] font-bold truncate">{effectiveHandle}</span>
                </div>
                <p className="text-[10px] text-white/90 line-clamp-2 leading-tight">
                  Confira se títulos, fórmulas LaTeX e selos ficam livres da área inferior e lateral.
                </p>
              </div>
            </div>

            {previewUrls.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                  className="px-2.5 py-1 rounded-lg border border-border-subtle bg-elevated text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  Anterior
                </button>
                <span className="text-xs font-mono text-fg-muted">
                  Tela {activeIndex + 1} de {previewUrls.length}
                </span>
                <button
                  type="button"
                  disabled={activeIndex >= previewUrls.length - 1}
                  onClick={() => setActiveIndex((i) => Math.min(previewUrls.length - 1, i + 1))}
                  className="px-2.5 py-1 rounded-lg border border-border-subtle bg-elevated text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  Próximo
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
