// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useStudio } from './StudioContext';
import type { StudioGuideOverlayMode } from './types';

const SUBMENU_21_GUIDES: { id: StudioGuideOverlayMode; label: string; icon: string; desc: string }[] = [
  { id: 'none', label: 'Sem Guia', icon: 'visibility_off', desc: 'Palco limpo' },
  { id: 'thirds', label: 'Regra dos Terços', icon: 'grid_3x3', desc: 'Grade 3×3 + 4 nós de força' },
  { id: 'diagonals', label: 'Diagonais & Centro', icon: 'close_fullscreen', desc: 'Eixos diagonais e cruzamento' },
  { id: 'safe_area', label: 'Margens Safe Area', icon: 'crop_free', desc: 'Área segura Stories/Feed' },
];

const SUBMENU_22_GOLDEN: { id: StudioGuideOverlayMode; label: string; icon: string; desc: string }[] = [
  { id: 'golden_spiral', label: 'Espiral de Fibonacci', icon: 'cyclone', desc: 'Espiral áurea φ (4 quadrantes)' },
  { id: 'golden_grid', label: 'Grade Harmônica φ', icon: 'view_quilt', desc: 'Divisão áurea 38.2% / 61.8%' },
];

export function StudioTopActionBar() {
  const {
    isHandTool,
    setIsHandTool,
    viewportZoom,
    setViewportZoom,
    resetViewport,
    snapEnabled,
    setSnapEnabled,
    canUndo,
    canRedo,
    undo,
    redo,
    activeOverlay,
    setActiveOverlay,
    goldenSpiralQuadrant,
    setGoldenSpiralQuadrant,
    showCompositionTips,
    setShowCompositionTips,
  } = useStudio();

  const [barPos, setBarPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingBar, setIsDraggingBar] = useState(false);
  const [guidesOpen, setGuidesOpen] = useState(false);

  const dragOriginRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fecha o menu de guias ao clicar fora
  useEffect(() => {
    if (!guidesOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setGuidesOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [guidesOpen]);

  const handleGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDraggingBar(true);
    dragOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: barPos.x,
      origY: barPos.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleGripPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingBar || !dragOriginRef.current) return;
    const dx = e.clientX - dragOriginRef.current.startX;
    const dy = e.clientY - dragOriginRef.current.startY;
    const barW = popoverRef.current?.offsetWidth ?? 320;
    const maxOffsetX = typeof window !== 'undefined' ? Math.max(40, (window.innerWidth - barW) / 2 - 12) : 240;
    const maxOffsetY = typeof window !== 'undefined' ? Math.max(80, window.innerHeight * 0.45) : 240;
    setBarPos({
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, dragOriginRef.current.origX + dx)),
      y: Math.max(-24, Math.min(maxOffsetY, dragOriginRef.current.origY + dy)),
    });
  };

  const handleGripPointerUp = () => {
    setIsDraggingBar(false);
    dragOriginRef.current = null;
  };

  const hasActiveGuide = activeOverlay !== 'none';

  return (
    <div
      className="relative z-30 flex items-center justify-center select-none pointer-events-none"
      style={{
        transform: `translate3d(${barPos.x}px, ${barPos.y}px, 0)`,
      }}
    >
      <div
        ref={popoverRef}
        className="pointer-events-auto relative flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-2xl bg-surface/95 border border-border-subtle shadow-xl backdrop-blur-md text-fg"
      >
        {/* Grip de Arraste Reposicionável */}
        <div
          role="slider"
          aria-label="Mover barra de ferramentas"
          aria-valuenow={Math.round(barPos.x)}
          tabIndex={0}
          title="Arraste para reposicionar a barra (duplo clique para centralizar)"
          onPointerDown={handleGripPointerDown}
          onPointerMove={handleGripPointerMove}
          onPointerUp={handleGripPointerUp}
          onPointerCancel={handleGripPointerUp}
          onDoubleClick={() => setBarPos({ x: 0, y: 0 })}
          className={`flex items-center justify-center px-1 py-1 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors touch-none ${
            isDraggingBar ? 'cursor-grabbing text-[#FFCC00]' : 'cursor-grab'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        </div>

        <span className="h-4 w-px bg-border-subtle" />

        {/* Modo Visualização Livre (Hand Tool / Pan & Zoom) */}
        <button
          type="button"
          onClick={() => setIsHandTool(!isHandTool)}
          title="Modo Visualização Livre (Hand Tool / Pan & Zoom)"
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
            isHandTool
              ? 'bg-[#FFCC00] text-black shadow-xs'
              : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">pan_tool</span>
          <span className="hidden sm:inline">Mão</span>
        </button>

        {/* Controles rápidos de Zoom (visíveis quando Hand Tool ativo ou zoom != 1) */}
        {(isHandTool || viewportZoom !== 1) && (
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-xl bg-surface-hover/70 border border-border-subtle text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setViewportZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
              title="Diminuir Zoom"
              className="px-1 hover:text-[#FFCC00] cursor-pointer font-bold"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetViewport}
              title="Resetar Zoom e Pan (100%)"
              className="px-1 font-bold text-fg hover:text-[#FFCC00] cursor-pointer"
            >
              {Math.round(viewportZoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setViewportZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
              title="Aumentar Zoom"
              className="px-1 hover:text-[#FFCC00] cursor-pointer font-bold"
            >
              +
            </button>
          </div>
        )}

        <span className="h-4 w-px bg-border-subtle" />

        {/* Histórico Undo / Redo (Commit Only) */}
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          title="Desfazer (Ctrl+Z)"
          className="inline-flex items-center justify-center p-1.5 rounded-xl text-fg-secondary hover:text-fg hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">undo</span>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          title="Refazer (Ctrl+Shift+Z)"
          className="inline-flex items-center justify-center p-1.5 rounded-xl text-fg-secondary hover:text-fg hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">redo</span>
        </button>

        <span className="h-4 w-px bg-border-subtle" />

        {/* Toggle Snaps Magnéticos */}
        <button
          type="button"
          onClick={() => setSnapEnabled(!snapEnabled)}
          title={snapEnabled ? 'Desativar Snaps Magnéticos' : 'Ativar Snaps Magnéticos'}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
            snapEnabled
              ? 'bg-[#00D4FF]/15 text-[#0088AA] dark:text-[#00D4FF] border border-[#00D4FF]/40'
              : 'text-fg-muted hover:text-fg hover:bg-surface-hover border border-transparent'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">
            {snapEnabled ? 'grid_on' : 'grid_off'}
          </span>
          <span className="hidden sm:inline">Snap {snapEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <span className="h-4 w-px bg-border-subtle" />

        {/* Menu Rápido de Guias de Composição & Proporção Áurea */}
        <button
          type="button"
          onClick={() => setGuidesOpen((v) => !v)}
          title="Guias Geométricas, Regra dos Terços e Proporção Áurea (Fibonacci)"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
            hasActiveGuide || guidesOpen
              ? 'bg-amber-400/20 text-amber-600 dark:text-[#FFCC00] border border-amber-400/40'
              : 'text-fg-secondary hover:text-fg hover:bg-surface-hover border border-transparent'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">architecture</span>
          <span>Guias</span>
          <span className="material-symbols-outlined text-[13px]">
            {guidesOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {/* Popover de Guias (Submenus 21 & 22 - Fonte Única de Estado) */}
        {guidesOpen && (
          <div className="absolute top-full right-0 mt-2 w-72 rounded-2xl bg-surface border border-border-subtle shadow-2xl p-3 space-y-3 z-50 text-fg animate-in fade-in zoom-in-95 duration-150">
            {/* Submenu 21 */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">
                Submenu 21 • Grades Geométricas
              </span>
              <div className="grid grid-cols-1 gap-1">
                {SUBMENU_21_GUIDES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveOverlay(g.id)}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-all cursor-pointer ${
                      activeOverlay === g.id
                        ? 'bg-[#FFCC00] text-black font-bold shadow-xs'
                        : 'hover:bg-surface-hover text-fg'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] shrink-0">{g.icon}</span>
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold block leading-tight">{g.label}</span>
                      <span
                        className={`text-[9px] block truncate ${
                          activeOverlay === g.id ? 'text-black/75' : 'text-fg-muted'
                        }`}
                      >
                        {g.desc}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border-subtle" />

            {/* Submenu 22 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">
                  Submenu 22 • Proporção Áurea (φ)
                </span>
                {activeOverlay === 'golden_spiral' && (
                  <button
                    type="button"
                    onClick={() => setGoldenSpiralQuadrant((q) => ((q + 1) % 4) as 0 | 1 | 2 | 3)}
                    title="Girar quadrante da Espiral de Fibonacci"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-600 dark:text-[#FFCC00] text-[9px] font-bold hover:bg-amber-400/30 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[12px]">rotate_right</span>
                    <span>Q{goldenSpiralQuadrant + 1}</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {SUBMENU_22_GOLDEN.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveOverlay(g.id)}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-all cursor-pointer ${
                      activeOverlay === g.id
                        ? 'bg-[#FFCC00] text-black font-bold shadow-xs'
                        : 'hover:bg-surface-hover text-fg'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] shrink-0">{g.icon}</span>
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold block leading-tight">{g.label}</span>
                      <span
                        className={`text-[9px] block truncate ${
                          activeOverlay === g.id ? 'text-black/75' : 'text-fg-muted'
                        }`}
                      >
                        {g.desc}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Dicas Rápidas de Equilíbrio Visual */}
              <button
                type="button"
                onClick={() => setShowCompositionTips(!showCompositionTips)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors cursor-pointer border ${
                  showCompositionTips
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                    : 'bg-surface-hover/50 border-border-subtle text-fg-secondary hover:text-fg'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px]">lightbulb</span>
                  <span>Dicas de Equilíbrio Visual</span>
                </span>
                <span className="text-[9px] font-mono uppercase">
                  {showCompositionTips ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

