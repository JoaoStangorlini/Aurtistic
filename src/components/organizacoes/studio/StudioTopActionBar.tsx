// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useStudio } from './StudioContext';
import { StudioDesignAssistant } from './StudioDesignAssistant';
import { StudioHelpTooltip } from './StudioHelpTooltip';
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
    historyPast,
    historyFuture,
    undo,
    redo,
    jumpToHistory,
    compareMode,
    setCompareMode,
    shortcutsOpen,
    setShortcutsOpen,
    instagramPreviewOpen,
    setInstagramPreviewOpen,
    activeOverlay,
    setActiveOverlay,
    goldenSpiralQuadrant,
    setGoldenSpiralQuadrant,
    showCompositionTips,
    setShowCompositionTips,
    helpMode,
    setHelpMode,
  } = useStudio();

  const [barPos, setBarPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingBar, setIsDraggingBar] = useState(false);
  type ActiveTopPopover = 'none' | 'guides' | 'more' | 'timeline' | 'wcag';
  const [activePopover, setActivePopover] = useState<ActiveTopPopover>('none');

  const dragOriginRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const originalPressStartRef = useRef<number | null>(null);
  const wasActiveOnDownRef = useRef<boolean>(false);
  const isHoldingOriginalRef = useRef<boolean>(false);

  // Fecha menus de guias/Mais/WCAG/Timeline ao clicar fora
  useEffect(() => {
    if (activePopover === 'none') return;
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopover('none');
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [activePopover]);

  // Scroll horizontal suave por roda do mouse no feed quando houver overflow (sem interferir no zoom do palco)
  useEffect(() => {
    const el = feedScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 2) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft += delta;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Garante soltura de "Segurar p/ Original" caso o ponteiro seja solto fora ou perca foco
  useEffect(() => {
    const releaseIfHolding = () => {
      if (!isHoldingOriginalRef.current || originalPressStartRef.current === null) return;
      const elapsed = Date.now() - originalPressStartRef.current;
      isHoldingOriginalRef.current = false;
      originalPressStartRef.current = null;
      if (elapsed >= 220) {
        setCompareMode('off');
      }
    };
    window.addEventListener('pointercancel', releaseIfHolding);
    window.addEventListener('blur', releaseIfHolding);
    return () => {
      window.removeEventListener('pointercancel', releaseIfHolding);
      window.removeEventListener('blur', releaseIfHolding);
    };
  }, [setCompareMode]);

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
        className="pointer-events-auto relative max-w-[calc(100vw-1rem)]"
      >
        <div className="flex items-center gap-1 px-1.5 py-1.5 rounded-2xl bg-surface/95 border border-border-subtle shadow-xl backdrop-blur-md text-fg">
          {/* Feed Horizontal Deslizável */}
          <div
            ref={feedScrollRef}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 px-0.5"
          >
          {/* Grip de Arraste Reposicionável (apenas Desktop md+) */}
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
            className={`hidden md:flex shrink-0 items-center justify-center px-1 py-1 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors touch-none ${
              isDraggingBar ? 'cursor-grabbing text-[#FFCC00]' : 'cursor-grab'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
          </div>

          <span className="hidden md:block h-4 w-px bg-border-subtle shrink-0" />

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
          className="inline-flex items-center justify-center p-1.5 rounded-xl text-fg-secondary hover:text-fg hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">redo</span>
        </button>

        <span className="h-4 w-px bg-border-subtle shrink-0" />

        {/* Comparador Antes / Depois (Clique rápido = toggle; Segurar >=220ms = restaura ao soltar) */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              wasActiveOnDownRef.current = compareMode === 'hold';
              originalPressStartRef.current = Date.now();
              isHoldingOriginalRef.current = true;
              setCompareMode('hold');
            }}
            onPointerUp={() => {
              const start = originalPressStartRef.current;
              const wasActive = wasActiveOnDownRef.current;
              isHoldingOriginalRef.current = false;
              originalPressStartRef.current = null;
              const elapsed = start ? Date.now() - start : 0;
              if (elapsed >= 220) {
                setCompareMode('off');
              } else {
                setCompareMode(wasActive ? 'off' : 'hold');
              }
            }}
            onPointerCancel={() => {
              isHoldingOriginalRef.current = false;
              originalPressStartRef.current = null;
              setCompareMode('off');
            }}
            title="Clique para alternar ou segure para ver original sem filtros"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer touch-none ${
              compareMode === 'hold'
                ? 'bg-[#FFCC00] text-black shadow-xs'
                : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">visibility</span>
            <span className="hidden md:inline">Original</span>
          </button>
          <button
            type="button"
            onClick={() => setCompareMode(compareMode === 'split' ? 'off' : 'split')}
            title="Dividir tela Antes / Depois"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
              compareMode === 'split'
                ? 'bg-[#FFCC00] text-black shadow-xs'
                : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">compare</span>
            <span className="hidden lg:inline">Dividir</span>
          </button>
          <StudioHelpTooltip helpKey="topbar.compare" />
        </div>

        <span className="h-4 w-px bg-border-subtle shrink-0" />

        {/* Toggle Snaps Magnéticos */}
        <button
          type="button"
          onClick={() => setSnapEnabled(!snapEnabled)}
          title={snapEnabled ? 'Desativar Snaps Magnéticos' : 'Ativar Snaps Magnéticos'}
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
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

        <span className="h-4 w-px bg-border-subtle shrink-0" />

        {/* Menu Rápido de Guias de Composição & Proporção Áurea */}
        <button
          type="button"
          onClick={() => setActivePopover((p) => (p === 'guides' ? 'none' : 'guides'))}
          title="Guias Geométricas, Regra dos Terços e Proporção Áurea (Fibonacci)"
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
            hasActiveGuide || activePopover === 'guides'
              ? 'bg-amber-400/20 text-amber-600 dark:text-[#FFCC00] border border-amber-400/40'
              : 'text-fg-secondary hover:text-fg hover:bg-surface-hover border border-transparent'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">architecture</span>
          <span>Guias</span>
          <span className="material-symbols-outlined text-[13px]">
            {activePopover === 'guides' ? 'expand_less' : 'expand_more'}
          </span>
        </button>
          </div>

          <span className="h-4 w-px bg-border-subtle shrink-0" />

          {/* Botão fixo "Mais" fora do overflow-x-auto */}
          <button
            type="button"
            onClick={() => setActivePopover((p) => (p === 'more' ? 'none' : 'more'))}
            title="Mais ferramentas (Linha do Tempo, WCAG, IG Preview, Atalhos, Ajuda)"
            className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
              activePopover === 'more' || activePopover === 'timeline' || activePopover === 'wcag'
                ? 'bg-[#FFCC00] text-black shadow-xs'
                : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">more_horiz</span>
            <span className="hidden sm:inline">Mais</span>
          </button>
        </div>

        {/* Popover "Mais" (ancorado fora do overflow-x-auto; abre popovers irmãos sem aninhamento) */}
        {activePopover === 'more' && (
          <div className="absolute top-full right-0 mt-2 w-60 max-w-[calc(100vw-1rem)] rounded-2xl bg-surface border border-border-subtle shadow-2xl p-2 space-y-1 z-50 text-fg animate-in fade-in zoom-in-95 duration-150">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted px-2 py-1 block border-b border-border-subtle">
              Mais Ferramentas
            </span>
            <button
              type="button"
              onClick={() => setActivePopover('timeline')}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-[11px] font-bold hover:bg-surface-hover cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-amber-500">history</span>
                <span>Linha do Tempo</span>
              </span>
              {(historyPast.length > 0 || historyFuture.length > 0) && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-hover text-fg-muted">
                  {historyPast.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActivePopover('wcag')}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-[11px] font-bold hover:bg-surface-hover cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-emerald-500">contrast</span>
              <span>Contraste WCAG & Dicas</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInstagramPreviewOpen(!instagramPreviewOpen);
                setActivePopover('none');
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-[11px] font-bold hover:bg-surface-hover cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#00D4FF]">smartphone</span>
                <span>Simulador IG & Reels</span>
              </span>
              {instagramPreviewOpen && <span className="w-2 h-2 rounded-full bg-[#FFCC00]" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setShortcutsOpen(!shortcutsOpen);
                setActivePopover('none');
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-[11px] font-bold hover:bg-surface-hover cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-fg-secondary">keyboard</span>
              <span>Atalhos de Teclado (?)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setHelpMode(!helpMode);
                setActivePopover('none');
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-[11px] font-bold hover:bg-surface-hover cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-accent-primary">help</span>
                <span>Modo Ajuda (?)</span>
              </span>
              <span className={`text-[9px] font-mono uppercase ${helpMode ? 'text-[#FFCC00]' : 'text-fg-muted'}`}>
                {helpMode ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        )}

        {/* Popover de Timeline Visual Nomeada (fora do overflow-x-auto) */}
        {activePopover === 'timeline' && (
          <div className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-1rem)] rounded-2xl bg-surface border border-border-subtle shadow-2xl p-3 space-y-2 z-50 text-fg animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border-subtle pb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">
                Linha do Tempo ({historyPast.length + 1 + historyFuture.length})
              </span>
              <button
                type="button"
                onClick={() => setActivePopover('none')}
                className="p-0.5 rounded-lg text-fg-muted hover:text-fg cursor-pointer"
                aria-label="Fechar linha do tempo"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
              {historyPast.length === 0 && historyFuture.length === 0 && (
                <p className="text-[11px] text-fg-muted py-2 text-center">Nenhuma edição registrada ainda.</p>
              )}
              {historyPast.map((entry, idx) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    jumpToHistory('past', idx);
                    setActivePopover('none');
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors cursor-pointer"
                >
                  <span className="truncate">{idx + 1}. {entry.label}</span>
                  <span className="shrink-0 font-mono text-[9px] text-fg-muted">
                    {new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </button>
              ))}
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-[#FFCC00]/15 border border-[#FFCC00]/40 text-[11px] font-bold text-[#FFCC00]">
                <span>Estado Atual</span>
                <span className="text-[9px] uppercase tracking-wider">Ativo</span>
              </div>
              {historyFuture.map((entry, idx) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    jumpToHistory('future', idx);
                    setActivePopover('none');
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] text-fg-muted/80 hover:bg-surface-hover hover:text-fg transition-colors cursor-pointer"
                >
                  <span className="truncate italic">↷ {entry.label}</span>
                  <span className="shrink-0 font-mono text-[9px]">
                    {new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popover de Guias (Submenus 21 & 22 - Fonte Única de Estado) */}
        {activePopover === 'guides' && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-0 mt-2 w-72 max-w-[calc(100vw-1rem)] rounded-2xl bg-surface border border-border-subtle shadow-2xl p-3 space-y-3 z-50 text-fg animate-in fade-in zoom-in-95 duration-150">
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

        {/* Popover WCAG & Mini-Curso */}
        {activePopover === 'wcag' && (
          <div className="absolute top-full right-0 mt-2 w-[320px] sm:w-[360px] max-w-[calc(100vw-1rem)] max-h-[65vh] overflow-y-auto rounded-2xl bg-surface border border-border-subtle shadow-2xl p-3 z-50 text-fg animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-subtle">
              <span className="text-[11px] font-black uppercase tracking-wider text-fg">
                Contraste WCAG & Boas Práticas
              </span>
              <button
                type="button"
                onClick={() => setActivePopover('none')}
                className="p-1 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover cursor-pointer"
                aria-label="Fechar assistente WCAG"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            <StudioDesignAssistant />
          </div>
        )}
      </div>
    </div>
  );
}

