// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS, type StudioSlide } from './types';
import { renderSlideToCanvas } from '@/lib/studio/canvas-renderer';
import { useOrganizationBrand } from '../OrganizationBrandProvider';

type ResizeHandleType = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  layerId: string;
}

export function StudioCanvasStage() {
  const {
    slides,
    activeSlide,
    aspectRatio,
    selectedLayerId,
    setSelectedLayerId,
    updateLayer,
    removeLayer,
    duplicateLayer,
    bringLayerForward,
    sendLayerBackward,
    centerLayerOnStage,
    toggleLayerLock,
    resetLayerTransform,
    activeOverlay,
    goldenSpiralQuadrant,
    showCompositionTips,
    snapEnabled,
    isHandTool,
    viewportZoom,
    setViewportZoom,
    viewportPan,
    setViewportPan,
    commitHistorySnapshot,
  } = useStudio();
  const { tokens } = useOrganizationBrand();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageOuterRef = useRef<HTMLDivElement | null>(null);

  // Estados de manipulação
  const [isDraggingBody, setIsDraggingBody] = useState(false);
  const [isPanningViewport, setIsPanningViewport] = useState(false);
  const [resizingHandle, setResizingHandle] = useState<ResizeHandleType | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});

  // Guardrail 4: Snapshot pré-gesto para commit no pointerup
  const gestureStartSlidesRef = useRef<StudioSlide[] | null>(null);
  const gestureMutatedRef = useRef<boolean>(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; origPanX: number; origPanY: number } | null>(null);

  // Menu Rápido Contextual
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    layerId: '',
  });

  // Refs de controle de ponteiro e long-press (Guardrail 3: 450ms com cancelamento > 8px)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pointerStartPosRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    rotation: number;
    aspectRatio: number;
  } | null>(null);

  const dims = ASPECT_DIMENSIONS[aspectRatio];
  const repaintRef = useRef<(() => void) | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const isInteractive = isDraggingBody || Boolean(resizingHandle) || isRotating;

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeSlide) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderSlideToCanvas(ctx, activeSlide, dims.width, dims.height, tokens, {
      onNeedRepaint: () => repaintRef.current?.(),
      interactive: isInteractive,
    });
  }, [activeSlide, dims.width, dims.height, tokens, isInteractive]);

  useEffect(() => {
    repaintRef.current = repaint;
  }, [repaint]);

  useEffect(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      repaint();
    });
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [repaint]);

  // Fecha o menu contextual no clique fora ou no Esc
  useEffect(() => {
    const handleClose = () => {
      if (contextMenu.isOpen) setContextMenu((prev) => ({ ...prev, isOpen: false }));
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu.isOpen]);

  // Cancela o long-press
  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Pointer Down no Canvas/Palco
  // ─────────────────────────────────────────────────────────────────────────────
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Fecha menu contextual pré-existente
    if (contextMenu.isOpen) {
      setContextMenu((prev) => ({ ...prev, isOpen: false }));
    }

    // Modo Visualização Livre (Hand Tool): arrasta o palco sem selecionar camadas
    if (isHandTool) {
      clearLongPress();
      setIsPanningViewport(true);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        origPanX: viewportPan.x,
        origPanY: viewportPan.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // Hit test do elemento superior para o inferior
    const reversed = [...activeSlide.layers].reverse();
    const hit = reversed.find(
      (l) =>
        l.visible &&
        clickX >= l.x &&
        clickX <= l.x + l.width &&
        clickY >= l.y &&
        clickY <= l.y + l.height
    );

    pointerStartPosRef.current = { clientX: e.clientX, clientY: e.clientY };

    if (hit) {
      setSelectedLayerId(hit.id);

      // Guardrail 3: Inicia timer de 450ms para Mobile Long-Press
      clearLongPress();
      longPressTimerRef.current = setTimeout(() => {
        setContextMenu({
          isOpen: true,
          x: e.clientX,
          y: e.clientY,
          layerId: hit.id,
        });
      }, 450);

      if (!hit.locked) {
        gestureStartSlidesRef.current = slides;
        gestureMutatedRef.current = false;
        setIsDraggingBody(true);
        dragStartRef.current = {
          startX: clickX,
          startY: clickY,
          origX: hit.x,
          origY: hit.y,
          origW: hit.width,
          origH: hit.height,
          rotation: hit.rotation || 0,
          aspectRatio: hit.width / Math.max(0.001, hit.height),
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    } else {
      setSelectedLayerId(null);
      clearLongPress();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Início de Arraste de Alça de Redimensionamento (8 Bolinhas)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: ResizeHandleType
  ) => {
    if (isHandTool) return;
    e.stopPropagation();
    clearLongPress();
    const selectedLayer = activeSlide.layers.find((l) => l.id === selectedLayerId);
    if (!selectedLayer || selectedLayer.locked) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    gestureStartSlidesRef.current = slides;
    gestureMutatedRef.current = false;
    setResizingHandle(handle);
    dragStartRef.current = {
      startX: (e.clientX - rect.left) / rect.width,
      startY: (e.clientY - rect.top) / rect.height,
      origX: selectedLayer.x,
      origY: selectedLayer.y,
      origW: selectedLayer.width,
      origH: selectedLayer.height,
      rotation: selectedLayer.rotation || 0,
      aspectRatio: selectedLayer.width / Math.max(0.001, selectedLayer.height),
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Início de Arraste da Haste de Rotação
  // ─────────────────────────────────────────────────────────────────────────────
  const handleRotationPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isHandTool) return;
    e.stopPropagation();
    clearLongPress();
    const selectedLayer = activeSlide.layers.find((l) => l.id === selectedLayerId);
    if (!selectedLayer || selectedLayer.locked) return;

    gestureStartSlidesRef.current = slides;
    gestureMutatedRef.current = false;
    setIsRotating(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Pointer Move (Manipulação Unificada: Mover, Escalar com Matriz Inversa e Girar)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Hand Tool Panning
    if (isHandTool && isPanningViewport && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setViewportPan({
        x: Math.max(-450, Math.min(450, panStartRef.current.origPanX + dx)),
        y: Math.max(-450, Math.min(450, panStartRef.current.origPanY + dy)),
      });
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !selectedLayerId) return;

    // Guardrail 3: Cancela o long-press se o ponteiro se mover mais de 8px
    if (pointerStartPosRef.current && longPressTimerRef.current) {
      const dist = Math.hypot(
        e.clientX - pointerStartPosRef.current.clientX,
        e.clientY - pointerStartPosRef.current.clientY
      );
      if (dist > 8) {
        clearLongPress();
      }
    }

    const curLayer = activeSlide.layers.find((l) => l.id === selectedLayerId);
    if (!curLayer || curLayer.locked) return;

    // 1. Rotação Interativa Contínua (Haste do Topo)
    if (isRotating) {
      const centerX = rect.left + (curLayer.x + curLayer.width / 2) * rect.width;
      const centerY = rect.top + (curLayer.y + curLayer.height / 2) * rect.height;
      const angleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      let angleDeg = Math.round((angleRad * 180) / Math.PI + 90);
      // Normalização modular estrita para [-180°, +180°]
      while (angleDeg > 180) angleDeg -= 360;
      while (angleDeg <= -180) angleDeg += 360;

      // Snapping magnético nos ângulos cardinais (-180, -90, 0, 90, 180)
      if (snapEnabled) {
        for (const snapAngle of [-180, -90, 0, 90, 180]) {
          if (Math.abs(angleDeg - snapAngle) <= 4) {
            angleDeg = snapAngle === -180 ? 180 : snapAngle;
            break;
          }
        }
      }
      gestureMutatedRef.current = true;
      updateLayer(selectedLayerId, { rotation: angleDeg });
      return;
    }

    // 2. Redimensionamento pelas 8 Bolinhas com Guardrail 2 (Transformação Inversa)
    if (resizingHandle && dragStartRef.current) {
      const curX = (e.clientX - rect.left) / rect.width;
      const curY = (e.clientY - rect.top) / rect.height;

      // Delta normalizado no palco
      const deltaScreenX = curX - dragStartRef.current.startX;
      const deltaScreenY = curY - dragStartRef.current.startY;

      // Guardrail 2: Multiplicação pela matriz de rotação inversa (-theta)
      const rad = ((dragStartRef.current.rotation || 0) * Math.PI) / 180;
      const cos = Math.cos(-rad);
      const sin = Math.sin(-rad);
      const localDx = deltaScreenX * cos - deltaScreenY * sin;
      const localDy = deltaScreenX * sin + deltaScreenY * cos;

      const { origX, origY, origW, origH, aspectRatio: layerAspect } = dragStartRef.current;
      let nextW = origW;
      let nextH = origH;
      let nextX = origX;
      let nextY = origY;

      // Escala por alça
      switch (resizingHandle) {
        case 'se': {
          // Canto inferior direito: escala proporcional
          nextW = Math.max(0.05, origW + localDx);
          nextH = nextW / layerAspect;
          break;
        }
        case 'sw': {
          // Canto inferior esquerdo: escala proporcional
          nextW = Math.max(0.05, origW - localDx);
          nextH = nextW / layerAspect;
          nextX = origX + (origW - nextW);
          break;
        }
        case 'ne': {
          // Canto superior direito: escala proporcional
          nextW = Math.max(0.05, origW + localDx);
          nextH = nextW / layerAspect;
          nextY = origY + (origH - nextH);
          break;
        }
        case 'nw': {
          // Canto superior esquerdo: escala proporcional
          nextW = Math.max(0.05, origW - localDx);
          nextH = nextW / layerAspect;
          nextX = origX + (origW - nextW);
          nextY = origY + (origH - nextH);
          break;
        }
        case 'e': {
          // Lateral direita: livre
          nextW = Math.max(0.04, origW + localDx);
          break;
        }
        case 'w': {
          // Lateral esquerda: livre
          nextW = Math.max(0.04, origW - localDx);
          nextX = origX + (origW - nextW);
          break;
        }
        case 's': {
          // Lateral inferior: livre
          nextH = Math.max(0.04, origH + localDy);
          break;
        }
        case 'n': {
          // Lateral superior: livre
          nextH = Math.max(0.04, origH - localDy);
          nextY = origY + (origH - nextH);
          break;
        }
      }

      // Compensa a deriva do centro quando o elemento está rotacionado (âncora oposta fixa)
      const shiftLocalX = (nextX + nextW / 2) - (origX + origW / 2);
      const shiftLocalY = (nextY + nextH / 2) - (origY + origH / 2);
      const cosFwd = Math.cos(rad);
      const sinFwd = Math.sin(rad);
      const worldShiftX = shiftLocalX * cosFwd - shiftLocalY * sinFwd;
      const worldShiftY = shiftLocalX * sinFwd + shiftLocalY * cosFwd;
      const finalX = (origX + origW / 2 + worldShiftX) - nextW / 2;
      const finalY = (origY + origH / 2 + worldShiftY) - nextH / 2;

      gestureMutatedRef.current = true;
      updateLayer(selectedLayerId, {
        x: Math.max(-0.2, Math.min(1.2, finalX)),
        y: Math.max(-0.2, Math.min(1.2, finalY)),
        width: Math.max(0.04, Math.min(1.5, nextW)),
        height: Math.max(0.04, Math.min(1.5, nextH)),
      });
      return;
    }

    // 3. Arraste do Corpo com Snaps Magnéticos
    if (isDraggingBody && dragStartRef.current) {
      const curX = (e.clientX - rect.left) / rect.width;
      const curY = (e.clientY - rect.top) / rect.height;

      let nextX = dragStartRef.current.origX + (curX - dragStartRef.current.startX);
      let nextY = dragStartRef.current.origY + (curY - dragStartRef.current.startY);

      const guides: { x?: number; y?: number } = {};
      if (snapEnabled) {
        const threshX = Math.min(0.012, Math.max(0.004, 7 / Math.max(1, rect.width)));
        const threshY = Math.min(0.012, Math.max(0.004, 7 / Math.max(1, rect.height)));
        const w = dragStartRef.current.origW;
        const h = dragStartRef.current.origH;

        const xTargets: number[] = [0, 0.5, 1, 0.05, 0.95];
        const yTargets: number[] =
          aspectRatio === '9:16' ? [0, 0.15, 0.5, 0.8, 1] : [0, 0.05, 0.5, 0.95, 1];

        for (const other of activeSlide.layers) {
          if (other.id === selectedLayerId || !other.visible) continue;
          xTargets.push(other.x, other.x + other.width / 2, other.x + other.width);
          yTargets.push(other.y, other.y + other.height / 2, other.y + other.height);
        }

        let bestDx = threshX;
        let snappedX = nextX;
        let guideX: number | undefined;
        for (const target of xTargets) {
          const candidates = [
            { dist: Math.abs(nextX - target), val: target },
            { dist: Math.abs(nextX + w / 2 - target), val: target - w / 2 },
            { dist: Math.abs(nextX + w - target), val: target - w },
          ];
          for (const c of candidates) {
            if (c.dist < bestDx) {
              bestDx = c.dist;
              snappedX = c.val;
              guideX = target;
            }
          }
        }

        let bestDy = threshY;
        let snappedY = nextY;
        let guideY: number | undefined;
        for (const target of yTargets) {
          const candidates = [
            { dist: Math.abs(nextY - target), val: target },
            { dist: Math.abs(nextY + h / 2 - target), val: target - h / 2 },
            { dist: Math.abs(nextY + h - target), val: target - h },
          ];
          for (const c of candidates) {
            if (c.dist < bestDy) {
              bestDy = c.dist;
              snappedY = c.val;
              guideY = target;
            }
          }
        }

        nextX = snappedX;
        nextY = snappedY;
        if (guideX !== undefined) guides.x = guideX;
        if (guideY !== undefined) guides.y = guideY;
      }

      gestureMutatedRef.current = true;
      setSnapGuides(guides);
      updateLayer(selectedLayerId, {
        x: Math.max(-0.2, Math.min(1.2, nextX)),
        y: Math.max(-0.2, Math.min(1.2, nextY)),
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Pointer Up / Cancel (Guardrail 4: Commit de Histórico apenas no pointerup)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleStagePointerUp = () => {
    clearLongPress();
    if (gestureMutatedRef.current && gestureStartSlidesRef.current) {
      commitHistorySnapshot(gestureStartSlidesRef.current);
    }
    gestureStartSlidesRef.current = null;
    gestureMutatedRef.current = false;
    setIsPanningViewport(false);
    panStartRef.current = null;
    setIsDraggingBody(false);
    setResizingHandle(null);
    setIsRotating(false);
    dragStartRef.current = null;
    pointerStartPosRef.current = null;
    setSnapGuides({});
  };

  // Context Menu acionado por botão direito no PC
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    clearLongPress();
    if (!selectedLayerId) return;
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      layerId: selectedLayerId,
    });
  };

  const selectedLayer = activeSlide.layers.find((l) => l.id === selectedLayerId);

  // Listener nativo wheel com { passive: false } para bloquear scroll da página no zoom
  useEffect(() => {
    const el = stageOuterRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!isHandTool && !e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setViewportZoom((z) => Math.max(0.5, Math.min(2.5, Number((z + delta).toFixed(2)))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isHandTool, setViewportZoom]);

  // Transformação SVG para os 4 quadrantes da Espiral de Fibonacci
  const spiralTransform =
    goldenSpiralQuadrant === 1
      ? 'scale(-1, 1) translate(-100, 0)'
      : goldenSpiralQuadrant === 2
        ? 'scale(-1, -1) translate(-100, -100)'
        : goldenSpiralQuadrant === 3
          ? 'scale(1, -1) translate(0, -100)'
          : undefined;

  const activeTipText =
    activeOverlay === 'thirds'
      ? 'Regra dos Terços: Posicione o sujeito ou texto principal em um dos 4 nós amarelos para leitura natural.'
      : activeOverlay === 'golden_spiral'
        ? 'Espiral de Fibonacci (φ): Conduza o olhar do espectador da borda aberta até o ponto focal da espiral.'
        : activeOverlay === 'golden_grid'
          ? 'Grade Harmônica (φ ≈ 1.618): Alinhe divisões de título e imagem nas linhas áureas de 38.2% e 61.8%.'
          : activeOverlay === 'diagonals'
            ? 'Diagonais & Centro: Use os eixos diagonais para criar dinamismo e simetria radial.'
            : activeOverlay === 'safe_area'
              ? 'Safe Area: Mantenha textos e logos dentro da área tracejada para evitar cortes pela interface do Instagram.'
              : 'Dica: Ative uma grade no menu Guias para alinhar elementos com equilíbrio áureo.';

  return (
    <div
      ref={stageOuterRef}
      className="relative flex flex-col items-center justify-center w-full h-full max-h-[70vh] p-2 select-none gap-2 touch-none overflow-hidden"
      onContextMenu={handleContextMenu}
      onTouchStart={(e) => {
        if (e.touches.length > 1) clearLongPress();
      }}
    >
      {/* Contêiner do Canvas com Guardrail 3 (touch-action: none e user-select: none) + Pan/Zoom */}
      <div
        ref={containerRef}
        className={`relative max-w-full max-h-full rounded-2xl overflow-hidden shadow-2xl border border-border-subtle touch-none select-none transition-shadow ${
          isHandTool
            ? isPanningViewport
              ? 'cursor-grabbing ring-2 ring-[#FFCC00]/60'
              : 'cursor-grab ring-1 ring-[#FFCC00]/30'
            : 'cursor-default'
        }`}
        style={{
          aspectRatio: dims.cssAspect,
          transform: `translate3d(${viewportPan.x}px, ${viewportPan.y}px, 0) scale(${viewportZoom})`,
          transformOrigin: 'center center',
        }}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
      >
        <canvas
          ref={canvasRef}
          width={dims.width}
          height={dims.height}
          className="w-full h-full object-contain block bg-[#07090e]"
        />

        {/* Linhas Guias Magnéticas */}
        {snapGuides.x !== undefined && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-[#00D4FF] z-30 pointer-events-none"
            style={{ left: `${snapGuides.x * 100}%` }}
          />
        )}
        {snapGuides.y !== undefined && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-[#00D4FF] z-30 pointer-events-none"
            style={{ top: `${snapGuides.y * 100}%` }}
          />
        )}

        {/* Safe Zones automáticas no 9:16 ou via Submenu 21 (Safe Area) */}
        {(aspectRatio === '9:16' || activeOverlay === 'safe_area') && (
          <div
            className={`absolute border border-dashed pointer-events-none z-20 ${
              activeOverlay === 'safe_area' ? 'border-emerald-400/75' : 'border-red-500/25'
            }`}
            style={
              aspectRatio === '9:16'
                ? { left: '5%', right: '5%', top: '15%', bottom: '20%' }
                : { left: '6%', right: '6%', top: '6%', bottom: '6%' }
            }
          >
            <span
              className={`text-[8px] font-mono font-bold px-1 py-0.5 rounded absolute top-1 left-1 ${
                activeOverlay === 'safe_area'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-red-400/50'
              }`}
            >
              {aspectRatio === '9:16' ? 'Safe Area Stories / Reels' : 'Safe Area Feed'}
            </span>
          </div>
        )}

        {/* Submenu 21.1: Regra dos Terços com 4 Nós de Força */}
        {activeOverlay === 'thirds' && (
          <div className="absolute inset-0 pointer-events-none z-20">
            <div className="absolute top-0 bottom-0 left-1/3 border-r border-dashed border-amber-300/60" />
            <div className="absolute top-0 bottom-0 left-2/3 border-r border-dashed border-amber-300/60" />
            <div className="absolute left-0 right-0 top-1/3 border-b border-dashed border-amber-300/60" />
            <div className="absolute left-0 right-0 top-2/3 border-b border-dashed border-amber-300/60" />
            {[
              { x: '33.333%', y: '33.333%' },
              { x: '66.666%', y: '33.333%' },
              { x: '33.333%', y: '66.666%' },
              { x: '66.666%', y: '66.666%' },
            ].map((node, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FFCC00] bg-[#FFCC00]/30 shadow-[0_0_8px_rgba(255,204,0,0.8)]"
                style={{ left: node.x, top: node.y }}
              />
            ))}
          </div>
        )}

        {/* Submenu 21.2: Diagonais & Centro Geométrico */}
        {activeOverlay === 'diagonals' && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none z-20"
          >
            <line x1="0" y1="0" x2="100" y2="100" stroke="#FFCC00" strokeOpacity="0.55" strokeWidth="0.45" strokeDasharray="2 1.5" />
            <line x1="100" y1="0" x2="0" y2="100" stroke="#FFCC00" strokeOpacity="0.55" strokeWidth="0.45" strokeDasharray="2 1.5" />
            <line x1="50" y1="0" x2="50" y2="100" stroke="#00D4FF" strokeOpacity="0.4" strokeWidth="0.35" strokeDasharray="1.5 1.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#00D4FF" strokeOpacity="0.4" strokeWidth="0.35" strokeDasharray="1.5 1.5" />
            <circle cx="50" cy="50" r="2.2" fill="none" stroke="#FFCC00" strokeWidth="0.6" />
          </svg>
        )}

        {/* Submenu 22.2: Grade Harmônica Fibonacci (phi ~ 1.618 -> 38.2% e 61.8%) */}
        {activeOverlay === 'golden_grid' && (
          <div className="absolute inset-0 pointer-events-none z-20">
            <div className="absolute top-0 bottom-0 left-[38.1966%] border-r border-[#FFCC00]/65" />
            <div className="absolute top-0 bottom-0 left-[61.8034%] border-r border-[#FFCC00]/65" />
            <div className="absolute left-0 right-0 top-[38.1966%] border-b border-[#FFCC00]/65" />
            <div className="absolute left-0 right-0 top-[61.8034%] border-b border-[#FFCC00]/65" />
            {[
              { x: '38.1966%', y: '38.1966%' },
              { x: '61.8034%', y: '38.1966%' },
              { x: '38.1966%', y: '61.8034%' },
              { x: '61.8034%', y: '61.8034%' },
            ].map((node, i) => (
              <div
                key={i}
                className="absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FFCC00] shadow-[0_0_8px_rgba(255,204,0,0.9)]"
                style={{ left: node.x, top: node.y }}
              />
            ))}
          </div>
        )}

        {/* Submenu 22.1: Espiral Áurea de Fibonacci (4 Quadrantes via goldenSpiralQuadrant) */}
        {activeOverlay === 'golden_spiral' && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none z-20"
          >
            <g transform={spiralTransform}>
              {/* Subdivisões Áureas */}
              <line x1="61.803" y1="0" x2="61.803" y2="100" stroke="#FFCC00" strokeOpacity="0.3" strokeWidth="0.35" />
              <line x1="61.803" y1="61.803" x2="100" y2="61.803" stroke="#FFCC00" strokeOpacity="0.3" strokeWidth="0.35" />
              <line x1="76.393" y1="61.803" x2="76.393" y2="100" stroke="#FFCC00" strokeOpacity="0.3" strokeWidth="0.35" />
              <line x1="61.803" y1="76.393" x2="76.393" y2="76.393" stroke="#FFCC00" strokeOpacity="0.3" strokeWidth="0.35" />
              {/* Espiral Áurea contínua (arcos de quarto de círculo nos retângulos de Fibonacci) */}
              <path
                d="M 0 100 A 61.803 100 0 0 1 61.803 0 A 38.197 61.803 0 0 1 100 61.803 A 23.607 38.197 0 0 1 76.393 100 A 14.590 23.607 0 0 1 61.803 76.393 A 9.017 14.590 0 0 1 70.820 61.803 A 5.573 9.017 0 0 1 76.393 70.820"
                fill="none"
                stroke="#FFCC00"
                strokeWidth="0.9"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 2px rgba(255,204,0,0.8))' }}
              />
              {/* Ponto Focal Áureo */}
              <circle cx="72.4" cy="72.4" r="1.8" fill="#FFCC00" />
            </g>
          </svg>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Bounding Box Interativa com 8 Alças ("Bolinhas") + Haste de Giro   */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {!isHandTool && selectedLayer && selectedLayer.visible && (
          <div
            className="absolute border-2 border-[#FFCC00] rounded-xs shadow-md z-40 pointer-events-auto"
            style={{
              left: `${selectedLayer.x * 100}%`,
              top: `${selectedLayer.y * 100}%`,
              width: `${selectedLayer.width * 100}%`,
              height: `${selectedLayer.height * 100}%`,
              transform: selectedLayer.rotation ? `rotate(${selectedLayer.rotation}deg)` : undefined,
              transformOrigin: 'center center',
            }}
          >
            {/* Header da Bounding Box: Nome + Mini-Ações (Duplicar / Deletar) */}
            <div className="absolute -top-7 left-0 flex items-center gap-1 z-50 pointer-events-auto">
              <div className="bg-[#FFCC00] text-[#121212] text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-sm whitespace-nowrap">
                <span className="truncate max-w-[110px]">{selectedLayer.name}</span>
                {selectedLayer.locked && (
                  <span className="material-symbols-outlined text-[11px]">lock</span>
                )}
              </div>

              {!selectedLayer.locked && (
                <div className="flex items-center gap-0.5 bg-black/80 rounded-md p-0.5 border border-white/20 shadow-sm">
                  <button
                    type="button"
                    title="Duplicar Camada (Ctrl+D)"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateLayer(selectedLayer.id);
                    }}
                    className="w-4.5 h-4.5 rounded text-white hover:text-[#FFCC00] flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">content_copy</span>
                  </button>
                  <button
                    type="button"
                    title="Deletar Camada (Del)"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLayer(selectedLayer.id);
                    }}
                    className="w-4.5 h-4.5 rounded text-white hover:text-red-400 flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">delete</span>
                  </button>
                </div>
              )}
            </div>

            {/* Haste Vertical de Rotação + Esfera de Giro */}
            {!selectedLayer.locked && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-50">
                <button
                  type="button"
                  onPointerDown={handleRotationPointerDown}
                  className="w-3.5 h-3.5 bg-[#FFCC00] rounded-full border-2 border-black shadow hover:scale-125 transition-transform cursor-grab active:cursor-grabbing flex items-center justify-center"
                  title="Arrastar para girar livremente"
                />
                <div className="w-0.5 h-3 bg-[#FFCC00]" />
              </div>
            )}

            {/* 8 Alças Circulares ("Bolinhas") de Redimensionamento */}
            {!selectedLayer.locked && (
              <>
                {/* 4 Cantos (Escala Proporcional) */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, 'nw')}
                  className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-[#FFCC00] rounded-full border border-black shadow-xs cursor-nwse-resize hover:scale-125 transition-transform pointer-events-auto"
                  title="Redimensionar Canto Noroeste"
                />
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, 'ne')}
                  className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-[#FFCC00] rounded-full border border-black shadow-xs cursor-nesw-resize hover:scale-125 transition-transform pointer-events-auto"
                  title="Redimensionar Canto Nordeste"
                />
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, 'sw')}
                  className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-[#FFCC00] rounded-full border border-black shadow-xs cursor-nesw-resize hover:scale-125 transition-transform pointer-events-auto"
                  title="Redimensionar Canto Sudoeste"
                />
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, 'se')}
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#FFCC00] rounded-full border border-black shadow-xs cursor-nwse-resize hover:scale-125 transition-transform pointer-events-auto"
                  title="Redimensionar Canto Sudeste"
                />

                {/* 4 Laterais (Escala Livre Uniaxis) */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, 'n')}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[#FFCC00] rounded-full border border-black shadow-xs cursor-ns-resize hover:scale-125 transition-transform pointer-events-auto"
                  title="Ajustar Altura Superior"
                />
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, 's')}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[#FFCC00] rounded-full border border-black shadow-xs cursor-ns-resize hover:scale-125 transition-transform pointer-events-auto"
                  title="Ajustar Altura Inferior"
                />
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, 'w')}
                  className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-2.5 bg-[#FFCC00] rounded-full border border-black shadow-xs cursor-ew-resize hover:scale-125 transition-transform pointer-events-auto"
                  title="Ajustar Largura Esquerda"
                />
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, 'e')}
                  className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 bg-[#FFCC00] rounded-full border border-black shadow-xs cursor-ew-resize hover:scale-125 transition-transform pointer-events-auto"
                  title="Ajustar Largura Direita"
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Menu Rápido Contextual Flutuante (Botão Direito no PC / 450ms Mobile)*/}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {contextMenu.isOpen && (
        <div
          className="fixed z-50 min-w-[190px] rounded-2xl bg-surface/95 border border-border-subtle p-1.5 shadow-2xl backdrop-blur-xl text-fg text-xs animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.min(window.innerWidth - 210, Math.max(10, contextMenu.x)),
            top: Math.min(window.innerHeight - 260, Math.max(10, contextMenu.y)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-fg-muted border-b border-border-subtle mb-1 flex items-center justify-between">
            <span>Ações Rápidas</span>
            <span className="material-symbols-outlined text-[13px] text-amber-500">flash_on</span>
          </div>

          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                duplicateLayer(contextMenu.layerId);
                setContextMenu((prev) => ({ ...prev, isOpen: false }));
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover hover:text-[#FFCC00] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">content_copy</span>
              <span>Duplicar Camada</span>
            </button>

            <button
              type="button"
              onClick={() => {
                bringLayerForward(contextMenu.layerId);
                setContextMenu((prev) => ({ ...prev, isOpen: false }));
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">flip_to_front</span>
              <span>Trazer para Frente</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sendLayerBackward(contextMenu.layerId);
                setContextMenu((prev) => ({ ...prev, isOpen: false }));
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">flip_to_back</span>
              <span>Enviar para Trás</span>
            </button>

            <button
              type="button"
              onClick={() => {
                centerLayerOnStage(contextMenu.layerId);
                setContextMenu((prev) => ({ ...prev, isOpen: false }));
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">filter_center_focus</span>
              <span>Centralizar no Palco</span>
            </button>

            <button
              type="button"
              onClick={() => {
                toggleLayerLock(contextMenu.layerId);
                setContextMenu((prev) => ({ ...prev, isOpen: false }));
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">
                {selectedLayer?.locked ? 'lock_open' : 'lock'}
              </span>
              <span>{selectedLayer?.locked ? 'Desbloquear' : 'Bloquear'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetLayerTransform(contextMenu.layerId);
                setContextMenu((prev) => ({ ...prev, isOpen: false }));
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">restart_alt</span>
              <span>Resetar Formato</span>
            </button>

            <div className="border-t border-border-subtle my-1" />

            <button
              type="button"
              onClick={() => {
                removeLayer(contextMenu.layerId);
                setContextMenu((prev) => ({ ...prev, isOpen: false }));
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer font-bold"
            >
              <span className="material-symbols-outlined text-[15px]">delete</span>
              <span>Deletar Elemento</span>
            </button>
          </div>
        </div>
      )}

      {/* Dicas Rápidas de Equilíbrio Visual (Submenu 22.3) */}
      {showCompositionTips && (
        <div className="px-3 py-1.5 rounded-xl bg-surface/95 border border-emerald-500/35 text-[11px] text-fg shadow-md backdrop-blur-md flex items-center gap-2 max-w-md text-center animate-in fade-in">
          <span className="material-symbols-outlined text-[15px] text-emerald-500 shrink-0">lightbulb</span>
          <span>{activeTipText}</span>
        </div>
      )}
    </div>
  );
}