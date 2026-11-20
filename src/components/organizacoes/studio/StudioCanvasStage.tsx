// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useEffect, useLayoutEffect, useCallback, useState, useMemo } from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS, type StudioDrawingLayer, type StudioLayer, type StudioSlide, type StudioTextLayer } from './types';
import { renderSlideToCanvas } from '@/lib/studio/canvas-renderer';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import {
  computeRotatedResize,
  computeSmartSpacing,
  getRotatedLayerAabb,
  isPointInRotatedLayer,
  rectsIntersect,
  stagePointToDrawingLayerLocal,
  type ResizeHandleType,
  type SmartSpacingGuide,
} from '@/lib/studio/stage-geometry';
import {
  isLayerEffectivelyLocked as checkLayerLocked,
  isLayerEffectivelyVisible as checkLayerVisible,
} from '@/lib/studio/folder-utils';
import { StudioInlineTextEditor } from './StudioInlineTextEditor';
import { drawSingleBrushStroke } from '@/lib/studio/drawing-renderer';
import { CANONICAL_RDP_EPSILON, simplifyStrokePoints } from '@/lib/studio/stroke-simplify';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  layerId: string | null;
  targetKind: 'layer' | 'slide-bg';
}

const IDV_COLOR_TAG_TEST_RE = /\[([rbgypcw]):([^\]]+)\]/i;
const IDV_COLOR_TAG_RE = /\[([rbgypcw]):([^\]]+)\]/gi;

interface MarqueeBox {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

interface ActivePointerInfo {
  clientX: number;
  clientY: number;
}

export function StudioCanvasStage() {
  const {
    slides,
    activeSlide,
    aspectRatio,
    selectedLayerId,
    selectedLayerIds,
    setSelectedLayerId,
    setSelectedLayerIds,
    toggleLayerSelection,
    updateLayer,
    updateLayersBatch,
    removeLayer,
    removeLayersBatch,
    duplicateLayer,
    duplicateLayersBatch,
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
    activeSliderId,
    updateSlide,
    editingTextLayerId,
    setEditingTextLayerId,
    isBrushMode,
    activeBrush,
    brushColor,
    brushSize,
    brushOpacity,
    setBrushDrawerCollapsed,
    appendBrushStroke,
    compareMode,
    compareSplitX,
    setCompareSplitX,
    isEyedropperActive,
    applyPickedEyedropperColor,
  } = useStudio();
  const { tokens } = useOrganizationBrand();

  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [eyedropperPreview, setEyedropperPreview] = useState<{ x: number; y: number; hex: string } | null>(null);

  useEffect(() => {
    if (!isEyedropperActive) setEyedropperPreview(null);
  }, [isEyedropperActive]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const brushOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageOuterRef = useRef<HTMLDivElement | null>(null);
  const isPaintingStrokeRef = useRef(false);
  const activeStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
  const activeStrokeSeedRef = useRef<number>(1337);

  // ResizeObserver: trava o palco em proporção exata 1:1 (zero letterbox)
  const dims = ASPECT_DIMENSIONS[aspectRatio];
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 360,
    height: Math.round((360 * dims.height) / dims.width),
  });

  useEffect(() => {
    const outer = stageOuterRef.current;
    if (!outer) return;

    const computeFit = () => {
      const style = window.getComputedStyle(outer);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const availW = Math.max(120, outer.clientWidth - padX);
      const availH = Math.max(120, outer.clientHeight - padY - (showCompositionTips ? 40 : 0));
      const targetRatio = dims.width / dims.height;

      let fitW = availW;
      let fitH = fitW / targetRatio;
      if (fitH > availH) {
        fitH = availH;
        fitW = fitH * targetRatio;
      }
      setStageSize({
        width: Math.max(120, Math.floor(fitW)),
        height: Math.max(120, Math.floor(fitH)),
      });
    };

    computeFit();
    const ro = new ResizeObserver(computeFit);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [dims.width, dims.height, showCompositionTips]);

  // Estados de manipulação
  const [isDraggingBody, setIsDraggingBody] = useState(false);
  const [isPanningViewport, setIsPanningViewport] = useState(false);
  const [resizingHandle, setResizingHandle] = useState<ResizeHandleType | null>(null);
  const [groupScalingCorner, setGroupScalingCorner] = useState<'nw' | 'ne' | 'se' | 'sw' | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});
  const [spacingGuides, setSpacingGuides] = useState<SmartSpacingGuide[]>([]);

  // Guardrails de histórico + ponteiros multi-touch
  const gestureStartSlidesRef = useRef<StudioSlide[] | null>(null);
  const gestureMutatedRef = useRef<boolean>(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; origPanX: number; origPanY: number } | null>(null);
  const activePointersRef = useRef<Map<number, ActivePointerInfo>>(new Map());
  const pinchStateRef = useRef<{
    targetLayerId: string | null;
    initDist: number;
    initAngle: number;
    origW: number;
    origH: number;
    origCx: number;
    origCy: number;
    origRotation: number;
    origZoom: number;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    layerId: null,
    targetKind: 'layer',
  });
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [clampedMenuPos, setClampedMenuPos] = useState<{ left: number; top: number }>({ left: 10, top: 10 });
  const [stripIdvTagsOnSolidColor, setStripIdvTagsOnSolidColor] = useState(true);
  const [contextColorNotice, setContextColorNotice] = useState<string | null>(null);
  const colorUndoBaseRef = useRef<StudioSlide[] | null>(null);
  const textOverflowCacheRef = useRef<Map<string, number>>(new Map());

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pointerStartPosRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origFontSize?: number;
    rotation: number;
    aspectRatio: number;
    groupOrigins?: Map<string, { x: number; y: number }>;
  } | null>(null);
  const groupScaleRef = useRef<{
    anchorX: number;
    anchorY: number;
    startDist: number;
    layers: { id: string; x: number; y: number; width: number; height: number; fontSize?: number }[];
  } | null>(null);

  const repaintRef = useRef<(() => void) | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isInteractive = isDraggingBody || Boolean(resizingHandle) || isRotating || Boolean(activeSliderId) || isDraggingSplit;

  const folderMaps = useMemo(() => {
    const folders = activeSlide.folders || [];
    const hidden = new Set(folders.filter((f) => !f.visible).map((f) => f.id));
    const locked = new Set(folders.filter((f) => f.locked).map((f) => f.id));
    const groups = new Set(folders.filter((f) => f.isGroup).map((f) => f.id));
    return { hidden, locked, groups };
  }, [activeSlide.folders]);

  const isLayerEffectivelyVisible = useCallback(
    (l: StudioLayer) => checkLayerVisible(l, activeSlide.folders),
    [activeSlide.folders]
  );

  const isLayerEffectivelyLocked = useCallback(
    (l: StudioLayer) => checkLayerLocked(l, activeSlide.folders),
    [activeSlide.folders]
  );

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeSlide) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const baseOpts = {
      onNeedRepaint: () => repaintRef.current?.(),
      interactive: isInteractive,
      editingTextLayerId,
      onTextHeightOverflow:
        !isInteractive && !editingTextLayerId
          ? (layerId: string, requiredNormHeight: number) => {
              const target = activeSlide.layers.find((l) => l.id === layerId && l.type === 'text') as StudioTextLayer | undefined;
              if (!target) return;
              const cacheKey = `${target.id}:${target.text}:${target.fontSize}:${target.width}`;
              const lastNotified = textOverflowCacheRef.current.get(cacheKey);
              if (lastNotified !== undefined && lastNotified >= requiredNormHeight) return;
              if (requiredNormHeight > target.height + 0.012) {
                textOverflowCacheRef.current.set(cacheKey, requiredNormHeight);
                updateLayer(layerId, { height: requiredNormHeight });
              }
            }
          : undefined,
    };
    if (compareMode === 'hold') {
      renderSlideToCanvas(ctx, activeSlide, dims.width, dims.height, tokens, {
        ...baseOpts,
        bypassPhotoFilters: true,
      });
      return;
    }
    if (compareMode === 'split') {
      renderSlideToCanvas(ctx, activeSlide, dims.width, dims.height, tokens, baseOpts);
      const splitPx = Math.max(0, Math.min(dims.width, Math.round(compareSplitX * dims.width)));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitPx, dims.height);
      ctx.clip();
      renderSlideToCanvas(ctx, activeSlide, dims.width, dims.height, tokens, {
        ...baseOpts,
        bypassPhotoFilters: true,
      });
      ctx.restore();
      return;
    }
    renderSlideToCanvas(ctx, activeSlide, dims.width, dims.height, tokens, baseOpts);
  }, [activeSlide, dims.width, dims.height, tokens, isInteractive, editingTextLayerId, compareMode, compareSplitX, updateLayer]);

  useEffect(() => {
    repaintRef.current = repaint;
  }, [repaint]);

  useEffect(() => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
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

  const flushPendingColorUndo = useCallback(() => {
    if (colorUndoBaseRef.current) {
      commitHistorySnapshot(colorUndoBaseRef.current, 'Cor rápida');
      colorUndoBaseRef.current = null;
    }
  }, [commitHistorySnapshot]);

  const applyQuickColor = useCallback(
    (
      hex: string,
      commitImmediately: boolean,
      targetKind: 'layer' | 'slide-bg',
      ctxLayer: StudioLayer | null
    ) => {
      if (commitImmediately) {
        commitHistorySnapshot(slides, 'Cor rápida');
        colorUndoBaseRef.current = null;
      } else if (!colorUndoBaseRef.current) {
        colorUndoBaseRef.current = slides;
      }

      if (targetKind === 'slide-bg') {
        updateSlide(activeSlide.id, { backgroundColor: hex, backgroundGradient: undefined });
        return;
      }
      if (!ctxLayer) return;

      if (ctxLayer.type === 'text') {
        const hadTags = IDV_COLOR_TAG_TEST_RE.test(ctxLayer.text || '');
        if (hadTags && stripIdvTagsOnSolidColor) {
          const cleanedText = (ctxLayer.text || '').replace(IDV_COLOR_TAG_RE, '$2');
          updateLayer(ctxLayer.id, { color: hex, text: cleanedText });
          if (commitImmediately) {
            setContextColorNotice('Tags de cor IDV removidas para aplicar cor sólida (Ctrl+Z desfaz).');
          }
        } else {
          updateLayer(ctxLayer.id, { color: hex });
        }
      } else if (ctxLayer.type === 'shape') {
        updateLayer(ctxLayer.id, { fillColor: hex });
      } else if (ctxLayer.type === 'logo') {
        updateLayer(ctxLayer.id, { tintColor: hex, monochrome: true });
      } else if (ctxLayer.type === 'math') {
        updateLayer(ctxLayer.id, { color: hex });
      } else if (ctxLayer.type === 'drawing') {
        const dl = ctxLayer as StudioDrawingLayer;
        updateLayer(dl.id, {
          strokes: dl.strokes.map((s) => (s.brush === 'eraser' ? s : { ...s, color: hex })),
        });
      }
    },
    [activeSlide.id, commitHistorySnapshot, slides, stripIdvTagsOnSolidColor, updateLayer, updateSlide]
  );

  useEffect(() => {
    if (!contextMenu.isOpen) {
      flushPendingColorUndo();
      setContextColorNotice(null);
      return;
    }
    const handleOutsidePointerDown = (e: PointerEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        flushPendingColorUndo();
        setContextMenu((prev) => ({ ...prev, isOpen: false }));
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        flushPendingColorUndo();
        setContextMenu((prev) => ({ ...prev, isOpen: false }));
      }
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu.isOpen, flushPendingColorUndo]);

  useLayoutEffect(() => {
    if (!contextMenu.isOpen || typeof window === 'undefined') return;
    const el = contextMenuRef.current;
    const rect = el?.getBoundingClientRect();
    const menuW = rect?.width || 228;
    const menuH = rect?.height || 340;
    setClampedMenuPos({
      left: Math.max(8, Math.min(window.innerWidth - menuW - 8, contextMenu.x)),
      top: Math.max(8, Math.min(window.innerHeight - menuH - 8, contextMenu.y)),
    });
  }, [contextMenu.isOpen, contextMenu.x, contextMenu.y, contextMenu.targetKind, contextMenu.layerId, contextColorNotice]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const toNormalizedCoords = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
      rect,
    };
  };

  // Inicializa gesto 2-dedos revertendo eventual micro-deslocamento do 1º dedo
  const enterTwoFingerPinch = useCallback(() => {
    clearLongPress();
    setIsDraggingBody(false);
    setResizingHandle(null);
    setGroupScalingCorner(null);
    groupScaleRef.current = null;
    setIsRotating(false);
    setMarquee(null);
    setSnapGuides({});
    setSpacingGuides([]);

    // Reverte micro-deslocamento acidental da transição 1 -> 2 dedos
    let baseSlide = activeSlide;
    if (gestureMutatedRef.current && gestureStartSlidesRef.current) {
      const reverted = gestureStartSlidesRef.current.find((s) => s.id === activeSlide.id);
      if (reverted) {
        baseSlide = reverted;
        updateSlide(activeSlide.id, { layers: reverted.layers });
        gestureMutatedRef.current = false;
      }
    } else if (!gestureStartSlidesRef.current) {
      gestureStartSlidesRef.current = slides;
    }

    const pts = Array.from(activePointersRef.current.values());
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    const dist = Math.max(10, Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY));
    const angle = Math.atan2(p2.clientY - p1.clientY, p2.clientX - p1.clientX);

    const target = !isHandTool && selectedLayerId
      ? baseSlide.layers.find((l) => l.id === selectedLayerId && !isLayerEffectivelyLocked(l))
      : null;

    pinchStateRef.current = {
      targetLayerId: target ? target.id : null,
      initDist: dist,
      initAngle: angle,
      origW: target?.width ?? 0,
      origH: target?.height ?? 0,
      origCx: target ? target.x + target.width / 2 : 0.5,
      origCy: target ? target.y + target.height / 2 : 0.5,
      origRotation: target?.rotation ?? 0,
      origZoom: viewportZoom,
    };
  }, [activeSlide, clearLongPress, isHandTool, selectedLayerId, slides, updateSlide, viewportZoom]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Pointer Down no Canvas/Palco
  // ─────────────────────────────────────────────────────────────────────────────
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (contextMenu.isOpen) {
      setContextMenu((prev) => ({ ...prev, isOpen: false }));
    }

    // Transição 1 -> 2 dedos: cancela traço acidental e entra em Pinça/Rotação nativa
    if (activePointersRef.current.size === 2) {
      if (isPaintingStrokeRef.current) {
        isPaintingStrokeRef.current = false;
        activeStrokePointsRef.current = [];
        const ov = brushOverlayRef.current;
        if (ov) ov.getContext('2d')?.clearRect(0, 0, ov.width, ov.height);
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      enterTwoFingerPinch();
      return;
    }
    if (activePointersRef.current.size > 2) return;

    // Modo Visualização Livre (Hand Tool)
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

    const norm = toNormalizedCoords(e.clientX, e.clientY);
    if (!norm) return;
    const { x: clickX, y: clickY } = norm;

    // Modo Conta-gotas (S2)
    if (isEyedropperActive) {
      e.preventDefault();
      e.stopPropagation();
      const canvas = canvasRef.current;
      let hex = '#FFFFFF';
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            const px = Math.max(0, Math.min(dims.width - 1, Math.round(clickX * dims.width)));
            const py = Math.max(0, Math.min(dims.height - 1, Math.round(clickY * dims.height)));
            const data = ctx.getImageData(px, py, 1, 1).data;
            hex = `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
          } catch {
            // Canvas taint fallback seguro
          }
        }
      }
      setEyedropperPreview(null);
      applyPickedEyedropperColor(hex);
      return;
    }

    // Modo Pincel 60fps no Overlay Canvas
    if (isBrushMode) {
      clearLongPress();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setBrushDrawerCollapsed(true);
      isPaintingStrokeRef.current = true;
      activeStrokePointsRef.current = [{ x: clickX, y: clickY }];
      activeStrokeSeedRef.current = (Date.now() ^ Math.floor(clickX * 9999)) >>> 0;
      const ov = brushOverlayRef.current;
      if (ov) {
        const oCtx = ov.getContext('2d');
        if (oCtx) {
          oCtx.clearRect(0, 0, ov.width, ov.height);
          drawSingleBrushStroke(
            oCtx,
            {
              id: 'preview',
              brush: activeBrush === 'eraser' ? 'pen' : activeBrush,
              color: activeBrush === 'eraser' ? 'rgba(255, 80, 80, 0.55)' : brushColor,
              size: brushSize,
              opacity: activeBrush === 'eraser' ? 0.65 : brushOpacity / 100,
              points: activeStrokePointsRef.current,
              seed: activeStrokeSeedRef.current,
            },
            ov.width,
            ov.height,
            ov.width / 1080
          );
        }
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Hit test considerando rotação e visibilidade da pasta
    const reversed = [...activeSlide.layers].reverse();
    const hit = reversed.find((l) => isLayerEffectivelyVisible(l) && isPointInRotatedLayer(clickX, clickY, l));
    pointerStartPosRef.current = { clientX: e.clientX, clientY: e.clientY };

    // Shift + Arrastar ou clique no vazio / camada ou pasta travada -> Caixa de Seleção (Marquee)
    if (!hit || isLayerEffectivelyLocked(hit) || (e.shiftKey && !selectedLayerIds.includes(hit.id))) {
      clearLongPress();
      if (e.shiftKey && hit && !isLayerEffectivelyLocked(hit)) {
        toggleLayerSelection(hit.id);
        return;
      }
      if (!e.shiftKey) setSelectedLayerIds([]);
      setMarquee({ startX: clickX, startY: clickY, curX: clickX, curY: clickY });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Alt + Arrastar -> Duplica camada(s) selecionada(s) instantaneamente
    if (e.altKey) {
      clearLongPress();
      gestureStartSlidesRef.current = slides;
      gestureMutatedRef.current = true;
      const idsToDup = selectedLayerIds.includes(hit.id) ? selectedLayerIds : [hit.id];
      const newIds = duplicateLayersBatch(idsToDup, { offsetX: 0, offsetY: 0, skipHistory: true });
      const groupOrigins = new Map<string, { x: number; y: number }>();
      for (const id of newIds) {
        const orig = activeSlide.layers.find((l) => idsToDup.includes(l.id));
        if (orig) groupOrigins.set(id, { x: hit.x, y: hit.y });
      }
      // Usa coordenadas originais dos alvos clonados
      const originMap = new Map<string, { x: number; y: number }>();
      idsToDup.forEach((origId, idx) => {
        const origLayer = activeSlide.layers.find((l) => l.id === origId);
        const cloneId = newIds[idx];
        if (origLayer && cloneId) originMap.set(cloneId, { x: origLayer.x, y: origLayer.y });
      });

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
        groupOrigins: originMap,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Seleção simples, grupo isGroup, ou preservação de grupo já selecionado
    let activeSelection = selectedLayerIds;
    if (!selectedLayerIds.includes(hit.id)) {
      if (hit.folderId && folderMaps.groups.has(hit.folderId)) {
        const groupIds = activeSlide.layers
          .filter((l) => l.folderId === hit.folderId && isLayerEffectivelyVisible(l) && !isLayerEffectivelyLocked(l))
          .map((l) => l.id);
        activeSelection = groupIds.length > 0 ? groupIds : [hit.id];
        setSelectedLayerIds(activeSelection);
      } else {
        activeSelection = [hit.id];
        setSelectedLayerId(hit.id);
      }
    }

    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, layerId: hit.id, targetKind: 'layer' });
    }, 450);

    gestureStartSlidesRef.current = slides;
    gestureMutatedRef.current = false;
    setIsDraggingBody(true);

    const groupOrigins = new Map<string, { x: number; y: number }>();
    for (const id of activeSelection) {
      const l = activeSlide.layers.find((item) => item.id === id);
      if (l && !l.locked) groupOrigins.set(id, { x: l.x, y: l.y });
    }

    dragStartRef.current = {
      startX: clickX,
      startY: clickY,
      origX: hit.x,
      origY: hit.y,
      origW: hit.width,
      origH: hit.height,
      rotation: hit.rotation || 0,
      aspectRatio: hit.width / Math.max(0.001, hit.height),
      groupOrigins,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: ResizeHandleType
  ) => {
    if (isHandTool) return;
    e.stopPropagation();
    clearLongPress();
    const targetLayer = activeSlide.layers.find((l) => l.id === selectedLayerId);
    if (!targetLayer || isLayerEffectivelyLocked(targetLayer)) return;

    const norm = toNormalizedCoords(e.clientX, e.clientY);
    if (!norm) return;

    gestureStartSlidesRef.current = slides;
    gestureMutatedRef.current = false;
    setResizingHandle(handle);
    dragStartRef.current = {
      startX: norm.x,
      startY: norm.y,
      origX: targetLayer.x,
      origY: targetLayer.y,
      origW: targetLayer.width,
      origH: targetLayer.height,
      origFontSize: targetLayer.type === 'text' ? targetLayer.fontSize : undefined,
      rotation: targetLayer.rotation || 0,
      aspectRatio: targetLayer.width / Math.max(0.001, targetLayer.height),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleRotationPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isHandTool) return;
    e.stopPropagation();
    clearLongPress();
    const targetLayer = activeSlide.layers.find((l) => l.id === selectedLayerId);
    if (!targetLayer || targetLayer.locked) return;

    gestureStartSlidesRef.current = slides;
    gestureMutatedRef.current = false;
    setIsRotating(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Pointer Move
  // ─────────────────────────────────────────────────────────────────────────────
  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    }

    // Pinça / Rotação com 2 dedos
    if (activePointersRef.current.size === 2 && pinchStateRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const [p1, p2] = pts;
      const dist = Math.max(10, Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY));
      const angle = Math.atan2(p2.clientY - p1.clientY, p2.clientX - p1.clientX);
      const st = pinchStateRef.current;

      if (st.targetLayerId) {
        const scale = Math.max(0.25, Math.min(3.5, dist / st.initDist));
        const nextW = Math.max(0.04, Math.min(1.5, st.origW * scale));
        const nextH = Math.max(0.04, Math.min(1.5, st.origH * scale));
        const deltaDeg = ((angle - st.initAngle) * 180) / Math.PI;
        let nextRot = Math.round(st.origRotation + deltaDeg);
        while (nextRot > 180) nextRot -= 360;
        while (nextRot <= -180) nextRot += 360;

        gestureMutatedRef.current = true;
        updateLayer(st.targetLayerId, {
          width: nextW,
          height: nextH,
          x: st.origCx - nextW / 2,
          y: st.origCy - nextH / 2,
          rotation: nextRot,
        });
      } else {
        const nextZoom = Math.max(0.5, Math.min(2.5, Number((st.origZoom * (dist / st.initDist)).toFixed(2))));
        setViewportZoom(nextZoom);
      }
      return;
    }

    if (isHandTool && isPanningViewport && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setViewportPan({
        x: Math.max(-450, Math.min(450, panStartRef.current.origPanX + dx)),
        y: Math.max(-450, Math.min(450, panStartRef.current.origPanY + dy)),
      });
      return;
    }

    const norm = toNormalizedCoords(e.clientX, e.clientY);
    if (!norm) return;
    const { x: curX, y: curY, rect } = norm;

    // Preview flutuante do Conta-gotas (S2)
    if (isEyedropperActive) {
      const canvas = canvasRef.current;
      let hex = '#FFFFFF';
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            const px = Math.max(0, Math.min(dims.width - 1, Math.round(curX * dims.width)));
            const py = Math.max(0, Math.min(dims.height - 1, Math.round(curY * dims.height)));
            const data = ctx.getImageData(px, py, 1, 1).data;
            hex = `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
          } catch {
            // Canvas taint fallback seguro
          }
        }
      }
      setEyedropperPreview({ x: curX, y: curY, hex });
      return;
    }

    // Pintura 60fps no Overlay Canvas (sem re-renderizar o slide inteiro)
    if (isBrushMode && isPaintingStrokeRef.current) {
      activeStrokePointsRef.current.push({ x: curX, y: curY });
      const ov = brushOverlayRef.current;
      if (ov) {
        const oCtx = ov.getContext('2d');
        if (oCtx) {
          oCtx.clearRect(0, 0, ov.width, ov.height);
          drawSingleBrushStroke(
            oCtx,
            {
              id: 'preview',
              brush: activeBrush === 'eraser' ? 'pen' : activeBrush,
              color: activeBrush === 'eraser' ? 'rgba(255, 80, 80, 0.55)' : brushColor,
              size: brushSize,
              opacity: activeBrush === 'eraser' ? 0.65 : brushOpacity / 100,
              points: activeStrokePointsRef.current,
              seed: activeStrokeSeedRef.current,
            },
            ov.width,
            ov.height,
            ov.width / 1080
          );
        }
      }
      return;
    }

    // Caixa de Seleção (Marquee)
    if (marquee) {
      const nextBox = { ...marquee, curX, curY };
      setMarquee(nextBox);
      const boxRect = {
        minX: Math.min(nextBox.startX, nextBox.curX),
        maxX: Math.max(nextBox.startX, nextBox.curX),
        minY: Math.min(nextBox.startY, nextBox.curY),
        maxY: Math.max(nextBox.startY, nextBox.curY),
      };
      const hitIds = activeSlide.layers
        .filter((l) => isLayerEffectivelyVisible(l) && !isLayerEffectivelyLocked(l) && rectsIntersect(boxRect, getRotatedLayerAabb(l)))
        .map((l) => l.id);
      setSelectedLayerIds(hitIds);
      return;
    }

    // Escala conjunta da Multi-Seleção
    if (groupScalingCorner && groupScaleRef.current) {
      const gs = groupScaleRef.current;
      const curDist = Math.max(0.03, Math.hypot(curX - gs.anchorX, curY - gs.anchorY));
      const scale = Math.max(0.2, Math.min(4, curDist / gs.startDist));
      const patches = gs.layers.map((item) => {
        const patch: Partial<StudioLayer> = {
          x: gs.anchorX + (item.x - gs.anchorX) * scale,
          y: gs.anchorY + (item.y - gs.anchorY) * scale,
          width: Math.max(0.03, item.width * scale),
          height: Math.max(0.03, item.height * scale),
        };
        if (item.fontSize !== undefined) {
          (patch as { fontSize?: number }).fontSize = Math.max(8, Math.round(item.fontSize * scale));
        }
        return { id: item.id, patch };
      });
      gestureMutatedRef.current = true;
      updateLayersBatch(patches);
      return;
    }

    if (!selectedLayerId) return;

    if (pointerStartPosRef.current && longPressTimerRef.current) {
      const dist = Math.hypot(
        e.clientX - pointerStartPosRef.current.clientX,
        e.clientY - pointerStartPosRef.current.clientY
      );
      if (dist > 8) clearLongPress();
    }

    const curLayer = activeSlide.layers.find((l) => l.id === selectedLayerId);
    if (!curLayer || isLayerEffectivelyLocked(curLayer)) return;

    // 1. Rotação Contínua (haste ancorada na base da caixa: +90° no atan2 corresponde a 0° de rotação)
    if (isRotating) {
      const centerX = rect.left + (curLayer.x + curLayer.width / 2) * rect.width;
      const centerY = rect.top + (curLayer.y + curLayer.height / 2) * rect.height;
      const angleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      let angleDeg = Math.round((angleRad * 180) / Math.PI - 90);
      while (angleDeg > 180) angleDeg -= 360;
      while (angleDeg <= -180) angleDeg += 360;

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

    // 2. Redimensionamento pelas 8 Bolinhas com Âncora Oposta Fixa
    if (resizingHandle && dragStartRef.current) {
      const result = computeRotatedResize({
        handle: resizingHandle,
        deltaScreenX: curX - dragStartRef.current.startX,
        deltaScreenY: curY - dragStartRef.current.startY,
        origX: dragStartRef.current.origX,
        origY: dragStartRef.current.origY,
        origW: dragStartRef.current.origW,
        origH: dragStartRef.current.origH,
        rotation: dragStartRef.current.rotation,
        layerAspect: dragStartRef.current.aspectRatio,
        freeAspect: e.shiftKey,
      });
      gestureMutatedRef.current = true;
      const isCorner = resizingHandle === 'nw' || resizingHandle === 'ne' || resizingHandle === 'se' || resizingHandle === 'sw';
      if (isCorner && curLayer.type === 'text' && dragStartRef.current.origFontSize && dragStartRef.current.origW > 0) {
        const scaledFont = Math.max(8, Math.round(dragStartRef.current.origFontSize * (result.width / dragStartRef.current.origW)));
        updateLayer(selectedLayerId, { ...result, fontSize: scaledFont } as Partial<StudioLayer>);
      } else {
        updateLayer(selectedLayerId, result);
      }
      return;
    }

    // 3. Arraste (Individual ou Grupo Multi-Selecionado) + Snaps Safe Area + Smart Spacing (px)
    if (isDraggingBody && dragStartRef.current) {
      const dx = curX - dragStartRef.current.startX;
      const dy = curY - dragStartRef.current.startY;
      const origins = dragStartRef.current.groupOrigins;

      if (origins && origins.size > 1) {
        const patches: { id: string; patch: Partial<StudioLayer> }[] = [];
        origins.forEach((orig, id) => {
          patches.push({
            id,
            patch: {
              x: Math.max(-0.2, Math.min(1.2, orig.x + dx)),
              y: Math.max(-0.2, Math.min(1.2, orig.y + dy)),
            },
          });
        });
        gestureMutatedRef.current = true;
        updateLayersBatch(patches);
        return;
      }

      let nextX = dragStartRef.current.origX + dx;
      let nextY = dragStartRef.current.origY + dy;
      const guides: { x?: number; y?: number } = {};
      let nextSpacing: SmartSpacingGuide[] = [];

      if (snapEnabled) {
        const w = dragStartRef.current.origW;
        const h = dragStartRef.current.origH;
        const threshX = Math.min(0.014, Math.max(0.004, 7 / Math.max(1, rect.width)));
        const threshY = Math.min(0.014, Math.max(0.004, 7 / Math.max(1, rect.height)));

        // Safe Area em todos os formatos (9:16 Stories/Reels e 1:1, 4:5, 16:9 Feed)
        const safeX = aspectRatio === '9:16' ? [0.05, 0.95] : [0.06, 0.94];
        const safeY = aspectRatio === '9:16' ? [0.15, 0.8] : [0.06, 0.94];
        const xTargets: number[] = [0, 0.5, 1, ...safeX];
        const yTargets: number[] = [0, 0.5, 1, ...safeY];

        const others = activeSlide.layers.filter((o) => o.id !== selectedLayerId && isLayerEffectivelyVisible(o));
        for (const other of others) {
          xTargets.push(other.x, other.x + other.width / 2, other.x + other.width);
          yTargets.push(other.y, other.y + other.height / 2, other.y + other.height);
        }

        let bestDx = threshX;
        let snappedX = nextX;
        let guideX: number | undefined;
        for (const target of xTargets) {
          for (const c of [
            { dist: Math.abs(nextX - target), val: target },
            { dist: Math.abs(nextX + w / 2 - target), val: target - w / 2 },
            { dist: Math.abs(nextX + w - target), val: target - w },
          ]) {
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
          for (const c of [
            { dist: Math.abs(nextY - target), val: target },
            { dist: Math.abs(nextY + h / 2 - target), val: target - h / 2 },
            { dist: Math.abs(nextY + h - target), val: target - h },
          ]) {
            if (c.dist < bestDy) {
              bestDy = c.dist;
              snappedY = c.val;
              guideY = target;
            }
          }
        }

        // Smart Spacing igual em px na escala canônica (1080px)
        const canonicalW = 1080;
        const canonicalH = Math.round((1080 * dims.height) / dims.width);
        const spacing = computeSmartSpacing({
          movingRect: { x: snappedX, y: snappedY, width: w, height: h },
          others,
          canonicalW,
          canonicalH,
        });
        if (spacing.snapX !== undefined) {
          snappedX = spacing.snapX;
          guideX = undefined;
        }
        if (spacing.snapY !== undefined) {
          snappedY = spacing.snapY;
          guideY = undefined;
        }
        nextSpacing = spacing.guides;

        nextX = snappedX;
        nextY = snappedY;
        if (guideX !== undefined) guides.x = guideX;
        if (guideY !== undefined) guides.y = guideY;
      }

      gestureMutatedRef.current = true;
      setSnapGuides(guides);
      setSpacingGuides(nextSpacing);
      updateLayer(selectedLayerId, {
        x: Math.max(-0.2, Math.min(1.2, nextX)),
        y: Math.max(-0.2, Math.min(1.2, nextY)),
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Pointer Up / Cancel (Transição 2 -> 1 dedo sem salto + Commit Undo)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);

    // Transição 2 -> 1 dedo: reseta âncora para o dedo restante sem salto
    if (activePointersRef.current.size === 1 && pinchStateRef.current) {
      pinchStateRef.current = null;
      const [rem] = Array.from(activePointersRef.current.values());
      if (isHandTool && rem) {
        setIsPanningViewport(true);
        panStartRef.current = {
          clientX: rem.clientX,
          clientY: rem.clientY,
          origPanX: viewportPan.x,
          origPanY: viewportPan.y,
        };
      } else if (rem && selectedLayerId) {
        const norm = toNormalizedCoords(rem.clientX, rem.clientY);
        const cur = activeSlide.layers.find((l) => l.id === selectedLayerId);
        if (norm && cur && !cur.locked) {
          setIsDraggingBody(true);
          dragStartRef.current = {
            startX: norm.x,
            startY: norm.y,
            origX: cur.x,
            origY: cur.y,
            origW: cur.width,
            origH: cur.height,
            rotation: cur.rotation || 0,
            aspectRatio: cur.width / Math.max(0.001, cur.height),
          };
        }
      }
      return;
    }

    if (activePointersRef.current.size === 0) {
      pinchStateRef.current = null;
    }

    if (isPaintingStrokeRef.current) {
      isPaintingStrokeRef.current = false;
      const rawPts = activeStrokePointsRef.current;
      activeStrokePointsRef.current = [];
      const ov = brushOverlayRef.current;
      if (ov) ov.getContext('2d')?.clearRect(0, 0, ov.width, ov.height);

      if (rawPts.length > 0) {
        const targetDrawing =
          (selectedLayerId
            ? activeSlide.layers.find((l) => l.id === selectedLayerId && l.type === 'drawing' && isLayerEffectivelyVisible(l) && !isLayerEffectivelyLocked(l))
            : null) ||
          [...activeSlide.layers].reverse().find((l) => l.type === 'drawing' && isLayerEffectivelyVisible(l) && !isLayerEffectivelyLocked(l));

        // Micro-blindagem 5C #3: borracha nunca cria camada de desenho vazia
        if (activeBrush === 'eraser' && !targetDrawing) {
          return;
        }

        const simplified = simplifyStrokePoints(rawPts, CANONICAL_RDP_EPSILON);
        // Micro-blindagem 5C #2: aplica transformada inversa em camadas movidas/rotacionadas/redimensionadas
        const mappedPts = targetDrawing
          ? simplified.map((p) => stagePointToDrawingLayerLocal(p.x, p.y, targetDrawing))
          : simplified;

        appendBrushStroke(
          {
            id: `stroke-${Date.now()}`,
            brush: activeBrush,
            color: brushColor,
            size: brushSize,
            opacity: brushOpacity / 100,
            points: mappedPts,
            seed: activeStrokeSeedRef.current,
          },
          targetDrawing?.id
        );
      }
      return;
    }

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
    setGroupScalingCorner(null);
    groupScaleRef.current = null;
    setIsRotating(false);
    setMarquee(null);
    dragStartRef.current = null;
    pointerStartPosRef.current = null;
    setSnapGuides({});
    setSpacingGuides([]);
  };

  // Micro-blindagem 5C #3: pointercancel limpa traço e ponteiros sem comitar desenho parcial
  const handleStagePointerCancel = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size === 0) pinchStateRef.current = null;
    if (isPaintingStrokeRef.current) {
      isPaintingStrokeRef.current = false;
      activeStrokePointsRef.current = [];
      const ov = brushOverlayRef.current;
      if (ov) ov.getContext('2d')?.clearRect(0, 0, ov.width, ov.height);
    }
    clearLongPress();
    gestureStartSlidesRef.current = null;
    gestureMutatedRef.current = false;
    setIsPanningViewport(false);
    panStartRef.current = null;
    setIsDraggingBody(false);
    setResizingHandle(null);
    setGroupScalingCorner(null);
    groupScaleRef.current = null;
    setIsRotating(false);
    setMarquee(null);
    dragStartRef.current = null;
    pointerStartPosRef.current = null;
    setSnapGuides({});
    setSpacingGuides([]);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    clearLongPress();
    const norm = toNormalizedCoords(e.clientX, e.clientY);
    if (!norm) return;
    const hit = [...activeSlide.layers]
      .reverse()
      .find((l) => isLayerEffectivelyVisible(l) && isPointInRotatedLayer(norm.x, norm.y, l));
    if (hit) {
      if (!selectedLayerIds.includes(hit.id)) {
        setSelectedLayerId(hit.id);
      }
      setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, layerId: hit.id, targetKind: 'layer' });
    } else {
      setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, layerId: null, targetKind: 'slide-bg' });
    }
  };

  const selectedLayer = selectedLayerIds.length === 1
    ? activeSlide.layers.find((l) => l.id === selectedLayerIds[0]) || null
    : null;

  const multiGroupBox = useMemo(() => {
    if (selectedLayerIds.length <= 1) return null;
    const items = activeSlide.layers.filter((l) => selectedLayerIds.includes(l.id) && isLayerEffectivelyVisible(l));
    if (items.length <= 1) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const item of items) {
      const aabb = getRotatedLayerAabb(item);
      if (aabb.minX < minX) minX = aabb.minX;
      if (aabb.maxX > maxX) maxX = aabb.maxX;
      if (aabb.minY < minY) minY = aabb.minY;
      if (aabb.maxY > maxY) maxY = aabb.maxY;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [activeSlide.layers, selectedLayerIds]);

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

  const invScale = 1 / Math.max(0.25, viewportZoom);
  const selectedPxW = selectedLayer ? selectedLayer.width * stageSize.width * viewportZoom : 0;
  const selectedPxH = selectedLayer ? selectedLayer.height * stageSize.height * viewportZoom : 0;
  const showEdgeMidpoints = selectedPxW >= 64 && selectedPxH >= 64;

  const ctxLayer = contextMenu.isOpen && contextMenu.targetKind === 'layer' && contextMenu.layerId
    ? activeSlide.layers.find((l) => l.id === contextMenu.layerId) || null
    : null;
  const ctxCanColorLayer = Boolean(ctxLayer && ctxLayer.type !== 'image');
  const ctxShowQuickColor = contextMenu.isOpen && (contextMenu.targetKind === 'slide-bg' || ctxCanColorLayer);
  const ctxHasIdvTags = Boolean(ctxLayer?.type === 'text' && IDV_COLOR_TAG_TEST_RE.test(ctxLayer.text || ''));
  const ctxTargetColor = (() => {
    if (!contextMenu.isOpen) return '#ffffff';
    if (contextMenu.targetKind === 'slide-bg') return activeSlide.backgroundColor || '#07090e';
    if (!ctxLayer) return '#ffffff';
    if (ctxLayer.type === 'text' || ctxLayer.type === 'math') return ctxLayer.color || '#ffffff';
    if (ctxLayer.type === 'shape') return ctxLayer.fillColor || '#ffffff';
    if (ctxLayer.type === 'logo') return ctxLayer.tintColor || '#ffffff';
    if (ctxLayer.type === 'drawing') {
      const firstStroke = (ctxLayer as StudioDrawingLayer).strokes.find((s) => s.brush !== 'eraser');
      return firstStroke?.color || '#FFCC00';
    }
    return '#ffffff';
  })();
  const ctxQuickSwatches = Array.from(
    new Set(
      [
        tokens.primaryColor,
        tokens.secondaryColor,
        tokens.tertiaryColor,
        tokens.containerColor,
        '#FFFFFF',
        '#07090E',
        '#FFCC00',
        '#00D4FF',
      ].filter(Boolean)
    )
  ).slice(0, 8);

  return (
    <div
      ref={stageOuterRef}
      className="relative flex flex-col items-center justify-center w-full h-full flex-1 min-h-0 p-2 sm:p-4 select-none gap-2 touch-none overflow-hidden rounded-2xl bg-[#dfe4ee] dark:bg-[#0c0f16] border border-border-subtle shadow-inner"
      onContextMenu={handleContextMenu}
      onTouchStart={(e) => {
        if (e.touches.length > 1) clearLongPress();
      }}
    >
      {/* Palco 1:1 com ResizeObserver (sem letterbox) */}
      <div
        ref={containerRef}
        data-stage-canvas="true"
        className={`relative shrink-0 touch-none select-none ${
          isHandTool
            ? isPanningViewport
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : isEyedropperActive || isBrushMode
              ? 'cursor-crosshair'
              : 'cursor-default'
        }`}
        style={{
          width: stageSize.width,
          height: stageSize.height,
          transform: `translate3d(${viewportPan.x}px, ${viewportPan.y}px, 0) scale(${viewportZoom})`,
          transformOrigin: 'center center',
        }}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerCancel}
        onDoubleClick={(e) => {
          if (isHandTool) return;
          const norm = toNormalizedCoords(e.clientX, e.clientY);
          if (!norm) return;
          const hit = [...activeSlide.layers].reverse().find(
            (l) => isLayerEffectivelyVisible(l) && isPointInRotatedLayer(norm.x, norm.y, l)
          );
          if (!hit) return;
          const isAlreadySingleSelected = selectedLayerIds.length === 1 && selectedLayerIds[0] === hit.id;
          if (hit.folderId && folderMaps.groups.has(hit.folderId) && !isAlreadySingleSelected) {
            setSelectedLayerId(hit.id);
            return;
          }
          if (hit.type === 'text' && !isLayerEffectivelyLocked(hit)) {
            setSelectedLayerId(hit.id);
            setEditingTextLayerId(hit.id);
          }
        }}
      >
        {/* Camada 1: Canvas + Guias internos com overflow-hidden */}
        <div
          className={`relative w-full h-full rounded-xl overflow-hidden shadow-[0_12px_36px_rgba(0,0,0,0.28)] ring-1 ${
            isHandTool ? 'ring-[#FFCC00]/50' : 'ring-black/15 dark:ring-white/15'
          }`}
        >
          <canvas
            ref={canvasRef}
            width={dims.width}
            height={dims.height}
            className="w-full h-full block bg-[#07090e]"
          />
          <canvas
            ref={brushOverlayRef}
            width={dims.width}
            height={dims.height}
            className="absolute inset-0 w-full h-full pointer-events-none z-35"
          />

          {/* S1: Divisor Interativo Antes / Depois (Split Wipe) */}
          {compareMode === 'split' && (
            <div
              role="slider"
              aria-label="Divisor Antes e Depois"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(compareSplitX * 100)}
              tabIndex={0}
              className="absolute inset-y-0 z-40 w-6 -ml-3 flex items-center justify-center cursor-ew-resize touch-none"
              style={{ left: `${compareSplitX * 100}%` }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                setIsDraggingSplit(true);
              }}
              onPointerMove={(e) => {
                if (!isDraggingSplit) return;
                e.stopPropagation();
                const norm = toNormalizedCoords(e.clientX, e.clientY);
                if (norm) setCompareSplitX(Math.max(0.05, Math.min(0.95, norm.x)));
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                setIsDraggingSplit(false);
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                setIsDraggingSplit(false);
              }}
            >
              <div className="h-full w-0.5 bg-[#FFCC00] shadow-[0_0_8px_rgba(0,0,0,0.8)]" />
              <div className="absolute top-3 px-2 py-0.5 rounded-full bg-black/80 border border-[#FFCC00]/60 text-[9px] font-black uppercase tracking-wider text-white whitespace-nowrap shadow-md">
                Antes | Depois
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#FFCC00] text-black flex items-center justify-center shadow-lg">
                <span className="material-symbols-outlined text-[14px]">drag_indicator</span>
              </div>
            </div>
          )}

          {/* Pílula indicadora "ORIGINAL (SEM FILTROS)" */}
          {compareMode === 'hold' && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full bg-black/85 border border-[#FFCC00]/70 text-[10px] font-black uppercase tracking-wider text-[#FFCC00] shadow-xl whitespace-nowrap">
              ORIGINAL (SEM FILTROS)
            </div>
          )}

          {/* S2: Lupa flutuante do Conta-gotas */}
          {isEyedropperActive && eyedropperPreview && (
            <div
              className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full mb-2 flex items-center gap-1.5 rounded-full border border-white/25 bg-black/90 px-2.5 py-1 text-[10px] font-mono font-bold text-white shadow-xl"
              style={{
                left: `${Math.max(12, Math.min(88, eyedropperPreview.x * 100))}%`,
                top: `${Math.max(12, eyedropperPreview.y * 100)}%`,
              }}
            >
              <span
                className="h-3 w-3 rounded-full border border-white/40 shrink-0"
                style={{ backgroundColor: eyedropperPreview.hex }}
              />
              <span>{eyedropperPreview.hex}</span>
            </div>
          )}

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

          {/* Smart Spacing Guides (linhas duplas + pill px na escala canônica 1080px) */}
          {spacingGuides.map((sg, idx) => (
            <div key={idx} className="absolute inset-0 pointer-events-none z-30">
              {sg.segments.map((seg, sIdx) => {
                const isX = sg.axis === 'x';
                const left = Math.min(seg.x1, seg.x2) * 100;
                const top = Math.min(seg.y1, seg.y2) * 100;
                const width = isX ? Math.abs(seg.x2 - seg.x1) * 100 : 0;
                const height = isX ? 0 : Math.abs(seg.y2 - seg.y1) * 100;
                const midX = ((seg.x1 + seg.x2) / 2) * 100;
                const midY = ((seg.y1 + seg.y2) / 2) * 100;
                return (
                  <React.Fragment key={sIdx}>
                    <div
                      className="absolute bg-[#FF2E7E]"
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        width: isX ? `${width}%` : '1.5px',
                        height: isX ? '1.5px' : `${height}%`,
                      }}
                    />
                    <span
                      className="absolute -translate-x-1/2 -translate-y-1/2 px-1 py-0.5 rounded bg-[#FF2E7E] text-white font-mono text-[9px] font-bold shadow"
                      style={{ left: `${midX}%`, top: `${midY}%` }}
                    >
                      {sg.pxLabel}px
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          ))}

          {/* Safe Zones */}
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

          {/* Regra dos Terços */}
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

          {/* Diagonais */}
          {activeOverlay === 'diagonals' && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none z-20">
              <line x1="0" y1="0" x2="100" y2="100" stroke="#FFCC00" strokeOpacity="0.55" strokeWidth="0.45" strokeDasharray="2 1.5" />
              <line x1="100" y1="0" x2="0" y2="100" stroke="#FFCC00" strokeOpacity="0.55" strokeWidth="0.45" strokeDasharray="2 1.5" />
              <line x1="50" y1="0" x2="50" y2="100" stroke="#00D4FF" strokeOpacity="0.4" strokeWidth="0.35" strokeDasharray="1.5 1.5" />
              <line x1="0" y1="50" x2="100" y2="50" stroke="#00D4FF" strokeOpacity="0.4" strokeWidth="0.35" strokeDasharray="1.5 1.5" />
              <circle cx="50" cy="50" r="2.2" fill="none" stroke="#FFCC00" strokeWidth="0.6" />
            </svg>
          )}

          {/* Grade Harmônica */}
          {activeOverlay === 'golden_grid' && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <div className="absolute top-0 bottom-0 left-[38.1966%] border-r border-[#FFCC00]/65" />
              <div className="absolute top-0 bottom-0 left-[61.8034%] border-r border-[#FFCC00]/65" />
              <div className="absolute left-0 right-0 top-[38.1966%] border-b border-[#FFCC00]/65" />
              <div className="absolute left-0 right-0 top-[61.8034%] border-b border-[#FFCC00]/65" />
            </div>
          )}

          {/* Espiral Áurea */}
          {activeOverlay === 'golden_spiral' && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none z-20">
              <g transform={spiralTransform}>
                <path
                  d="M 0 100 A 61.803 100 0 0 1 61.803 0 A 38.197 61.803 0 0 1 100 61.803 A 23.607 38.197 0 0 1 76.393 100 A 14.590 23.607 0 0 1 61.803 76.393 A 9.017 14.590 0 0 1 70.820 61.803 A 5.573 9.017 0 0 1 76.393 70.820"
                  fill="none"
                  stroke="#FFCC00"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                />
                <circle cx="72.4" cy="72.4" r="1.8" fill="#FFCC00" />
              </g>
            </svg>
          )}
        </div>

        {/* Camada 2: Overlay Interativo (overflow-visible para nunca cortar alças nas bordas) */}
        <div className="absolute inset-0 overflow-visible pointer-events-none z-40">
          {/* Caixa de Seleção Marquee */}
          {marquee && (
            <div
              className="absolute border border-[#00D4FF] bg-[#00D4FF]/15 rounded-xs pointer-events-none"
              style={{
                left: `${Math.min(marquee.startX, marquee.curX) * 100}%`,
                top: `${Math.min(marquee.startY, marquee.curY) * 100}%`,
                width: `${Math.abs(marquee.curX - marquee.startX) * 100}%`,
                height: `${Math.abs(marquee.curY - marquee.startY) * 100}%`,
              }}
            />
          )}

          {/* Bounding Box de Multi-Seleção + Barra Rápida (Alinhar, Duplicar, Deletar) + Escala Conjunta */}
          {!isHandTool && multiGroupBox && (
            <div
              className="absolute ring-2 ring-[#00D4FF] rounded-xs pointer-events-none"
              style={{
                left: `${multiGroupBox.x * 100}%`,
                top: `${multiGroupBox.y * 100}%`,
                width: `${multiGroupBox.width * 100}%`,
                height: `${multiGroupBox.height * 100}%`,
              }}
            >
              <div
                className="absolute -top-9 left-0 flex items-center gap-0.5 bg-black/90 text-white px-2 py-1 rounded-lg border border-white/20 shadow-xl pointer-events-auto"
                style={{ transform: `scale(${invScale})`, transformOrigin: 'bottom left' }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span className="text-[10px] font-bold text-[#00D4FF] mr-1">
                  {selectedLayerIds.length}
                </span>
                {(
                  [
                    { icon: 'align_horizontal_left', title: 'Alinhar à Esquerda', fn: (l: StudioLayer) => ({ x: multiGroupBox.x, y: l.y }) },
                    { icon: 'align_horizontal_center', title: 'Centralizar Horizontal', fn: (l: StudioLayer) => ({ x: multiGroupBox.x + (multiGroupBox.width - l.width) / 2, y: l.y }) },
                    { icon: 'align_horizontal_right', title: 'Alinhar à Direita', fn: (l: StudioLayer) => ({ x: multiGroupBox.x + multiGroupBox.width - l.width, y: l.y }) },
                    { icon: 'align_vertical_top', title: 'Alinhar ao Topo', fn: (l: StudioLayer) => ({ x: l.x, y: multiGroupBox.y }) },
                    { icon: 'align_vertical_center', title: 'Centralizar Vertical', fn: (l: StudioLayer) => ({ x: l.x, y: multiGroupBox.y + (multiGroupBox.height - l.height) / 2 }) },
                    { icon: 'align_vertical_bottom', title: 'Alinhar à Base', fn: (l: StudioLayer) => ({ x: l.x, y: multiGroupBox.y + multiGroupBox.height - l.height }) },
                  ] as const
                ).map((act) => (
                  <button
                    key={act.icon}
                    type="button"
                    title={act.title}
                    onClick={() => {
                      commitHistorySnapshot(slides);
                      const patches = activeSlide.layers
                        .filter((l) => selectedLayerIds.includes(l.id) && !l.locked)
                        .map((l) => ({ id: l.id, patch: act.fn(l) }));
                      updateLayersBatch(patches);
                    }}
                    className="p-0.5 hover:text-[#00D4FF] cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">{act.icon}</span>
                  </button>
                ))}
                <span className="w-px h-3.5 bg-white/20 mx-0.5" />
                <button
                  type="button"
                  title="Duplicar seleção"
                  onClick={() => duplicateLayersBatch(selectedLayerIds)}
                  className="p-0.5 hover:text-[#FFCC00] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                </button>
                <button
                  type="button"
                  title="Deletar seleção"
                  onClick={() => removeLayersBatch(selectedLayerIds)}
                  className="p-0.5 hover:text-red-400 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                </button>
              </div>

              {/* 4 Alças de Escala Proporcional Conjunta */}
              {(
                [
                  { id: 'nw' as const, left: '0%', top: '0%', ax: multiGroupBox.x + multiGroupBox.width, ay: multiGroupBox.y + multiGroupBox.height, cursor: 'cursor-nwse-resize' },
                  { id: 'ne' as const, left: '100%', top: '0%', ax: multiGroupBox.x, ay: multiGroupBox.y + multiGroupBox.height, cursor: 'cursor-nesw-resize' },
                  { id: 'sw' as const, left: '0%', top: '100%', ax: multiGroupBox.x + multiGroupBox.width, ay: multiGroupBox.y, cursor: 'cursor-nesw-resize' },
                  { id: 'se' as const, left: '100%', top: '100%', ax: multiGroupBox.x, ay: multiGroupBox.y, cursor: 'cursor-nwse-resize' },
                ]
              ).map((c) => (
                <div
                  key={c.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const norm = toNormalizedCoords(e.clientX, e.clientY);
                    if (!norm) return;
                    gestureStartSlidesRef.current = slides;
                    gestureMutatedRef.current = false;
                    setGroupScalingCorner(c.id);
                    groupScaleRef.current = {
                      anchorX: c.ax,
                      anchorY: c.ay,
                      startDist: Math.max(0.03, Math.hypot(norm.x - c.ax, norm.y - c.ay)),
                      layers: activeSlide.layers
                        .filter((l) => selectedLayerIds.includes(l.id) && !l.locked)
                        .map((l) => ({
                          id: l.id,
                          x: l.x,
                          y: l.y,
                          width: l.width,
                          height: l.height,
                          fontSize: l.type === 'text' ? l.fontSize : undefined,
                        })),
                    };
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  style={{ left: c.left, top: c.top, transform: `translate(-50%, -50%) scale(${invScale})` }}
                  className={`absolute w-7 h-7 flex items-center justify-center ${c.cursor} pointer-events-auto`}
                >
                  <span className="w-3 h-3 rounded-full bg-[#00D4FF] border border-black shadow-xs block" />
                </div>
              ))}
            </div>
          )}

          {/* Bounding Box Individual: ring-2 (sem shift), 8 bolinhas exatas e escala inversa */}
          {!isHandTool && selectedLayer && isLayerEffectivelyVisible(selectedLayer) && (
            <div
              className="absolute ring-2 ring-[#FFCC00] rounded-xs pointer-events-none"
              style={{
                left: `${selectedLayer.x * 100}%`,
                top: `${selectedLayer.y * 100}%`,
                width: `${selectedLayer.width * 100}%`,
                height: `${selectedLayer.height * 100}%`,
                transform: selectedLayer.rotation ? `rotate(${selectedLayer.rotation}deg)` : undefined,
                transformOrigin: 'center center',
              }}
            >
              {/* Header da Bounding Box */}
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute left-0 flex items-center gap-1 z-50 pointer-events-auto"
                style={{ bottom: 'calc(100% + 10px)', transform: `scale(${invScale})`, transformOrigin: 'bottom left' }}
              >
                <div className="bg-[#FFCC00] text-[#121212] text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-sm whitespace-nowrap">
                  <span className="truncate max-w-[110px]">{selectedLayer.name}</span>
                  {selectedLayer.locked && <span className="material-symbols-outlined text-[11px]">lock</span>}
                </div>
                {!isLayerEffectivelyLocked(selectedLayer) && (
                  <div className="flex items-center gap-0.5 bg-black/85 rounded-md p-0.5 border border-white/20 shadow-sm">
                    {selectedLayer.type === 'text' && editingTextLayerId !== selectedLayer.id && (
                      <button
                        type="button"
                        title="Editar Texto no Canvas"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTextLayerId(selectedLayer.id);
                        }}
                        className="px-1.5 h-5 rounded bg-[#FFCC00] text-black flex items-center gap-1 cursor-pointer transition-colors text-[10px] font-black"
                      >
                        <span className="material-symbols-outlined text-[13px]">edit</span>
                        <span>Editar</span>
                      </button>
                    )}
                    <button
                      type="button"
                      title="Duplicar Camada (Ctrl+D)"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateLayer(selectedLayer.id);
                      }}
                      className="px-1.5 h-5 rounded text-white hover:text-[#FFCC00] flex items-center gap-1 cursor-pointer transition-colors text-[10px] font-bold"
                    >
                      <span className="material-symbols-outlined text-[13px]">content_copy</span>
                      <span>Duplicar</span>
                    </button>
                    <button
                      type="button"
                      title="Deletar Camada (Del)"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLayer(selectedLayer.id);
                      }}
                      className="w-5 h-5 rounded text-white hover:text-red-400 flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-[13px]">delete</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Haste de Rotação na borda inferior (evita colisão com texto e header superior) */}
              {!selectedLayer.locked && (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute left-1/2 flex flex-col items-center pointer-events-auto z-50"
                  style={{ top: 'calc(100% + 10px)', transform: `translateX(-50%) scale(${invScale})`, transformOrigin: 'top center' }}
                >
                  <div className="w-0.5 h-3 bg-[#FFCC00]" />
                  <button
                    type="button"
                    onPointerDown={handleRotationPointerDown}
                    className="w-5 h-5 bg-[#FFCC00] text-black rounded-full border border-black shadow hover:scale-110 transition-transform cursor-grab active:cursor-grabbing flex items-center justify-center"
                    title="Arrastar para girar"
                  >
                    <span className="material-symbols-outlined text-[13px] font-bold">rotate_right</span>
                  </button>
                </div>
              )}

              {/* 8 Bolinhas Exatas nos 4 vértices e 4 metades das arestas (hitbox >= 28px) */}
              {!selectedLayer.locked && (
                <>
                  {(
                    [
                      { id: 'nw' as const, left: '0%', top: '0%', cursor: 'cursor-nwse-resize', corner: true },
                      { id: 'ne' as const, left: '100%', top: '0%', cursor: 'cursor-nesw-resize', corner: true },
                      { id: 'sw' as const, left: '0%', top: '100%', cursor: 'cursor-nesw-resize', corner: true },
                      { id: 'se' as const, left: '100%', top: '100%', cursor: 'cursor-nwse-resize', corner: true },
                      { id: 'n' as const, left: '50%', top: '0%', cursor: 'cursor-ns-resize', corner: false },
                      { id: 's' as const, left: '50%', top: '100%', cursor: 'cursor-ns-resize', corner: false },
                      { id: 'w' as const, left: '0%', top: '50%', cursor: 'cursor-ew-resize', corner: false },
                      { id: 'e' as const, left: '100%', top: '50%', cursor: 'cursor-ew-resize', corner: false },
                    ]
                  )
                    .filter((h) => h.corner || showEdgeMidpoints)
                    .map((h) => (
                      <div
                        key={h.id}
                        onPointerDown={(e) => handleHandlePointerDown(e, h.id)}
                        style={{ left: h.left, top: h.top, transform: `translate(-50%, -50%) scale(${invScale})` }}
                        className={`absolute ${h.cursor} w-7 h-7 flex items-center justify-center pointer-events-auto group`}
                      >
                        <span
                          className={`${
                            h.corner ? 'w-3 h-3' : 'w-2.5 h-2.5'
                          } bg-[#FFCC00] rounded-full border border-black shadow-xs group-hover:scale-125 transition-transform block`}
                        />
                      </div>
                    ))}
                </>
              )}
            </div>
          )}

          {/* Editor Inline de Texto Direto no Canvas (Fase 5A) */}
          {!isHandTool &&
            editingTextLayerId &&
            (() => {
              const editingLayer = activeSlide.layers.find(
                (l) => l.id === editingTextLayerId && l.type === 'text' && isLayerEffectivelyVisible(l) && !isLayerEffectivelyLocked(l)
              );
              if (!editingLayer || editingLayer.type !== 'text') return null;
              return (
                <StudioInlineTextEditor
                  layer={editingLayer}
                  stageWidth={stageSize.width}
                  canonicalWidth={dims.width}
                  onFinish={() => setEditingTextLayerId(null)}
                />
              );
            })()}
        </div>
      </div>

      {/* Menu Rápido Contextual (Camadas + Fundo do Slide + Cor Rápida) */}
      {contextMenu.isOpen && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 w-[232px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-2xl bg-surface/95 border border-border-subtle p-1.5 shadow-2xl backdrop-blur-xl text-fg text-xs animate-in fade-in zoom-in-95 duration-100"
            style={{ left: clampedMenuPos.left, top: clampedMenuPos.top }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-fg-muted border-b border-border-subtle mb-1 flex items-center justify-between">
              <span className="truncate">
                {contextMenu.targetKind === 'slide-bg' ? 'Fundo do Slide' : `Ações • ${ctxLayer?.name || 'Camada'}`}
              </span>
              <span className="material-symbols-outlined text-[13px] text-amber-500 shrink-0">flash_on</span>
            </div>

            {ctxShowQuickColor && (
              <div className="px-2 py-1.5 mb-1 rounded-xl bg-surface-hover/50 border border-border-subtle space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                    Cor Rápida
                  </span>
                  <label
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]"
                    title="Abrir seletor de cor do sistema"
                  >
                    <input
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(ctxTargetColor) ? ctxTargetColor : '#ffffff'}
                      onChange={(e) => applyQuickColor(e.target.value, false, contextMenu.targetKind, ctxLayer)}
                      onBlur={() => flushPendingColorUndo()}
                      className="w-3.5 h-3.5 rounded border-0 p-0 bg-transparent cursor-pointer"
                    />
                    <span>Seletor</span>
                  </label>
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                  {ctxQuickSwatches.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => applyQuickColor(hex, true, contextMenu.targetKind, ctxLayer)}
                      title={`Aplicar ${hex}`}
                      className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 cursor-pointer ${
                        ctxTargetColor.toLowerCase() === hex.toLowerCase()
                          ? 'ring-2 ring-[#FFCC00] border-black'
                          : 'border-white/25'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  {ctxLayer?.type === 'logo' && ctxLayer.monochrome && (
                    <button
                      type="button"
                      onClick={() => {
                        commitHistorySnapshot(slides, 'Cor oficial do selo');
                        updateLayer(ctxLayer.id, { monochrome: false });
                      }}
                      className="px-1.5 py-0.5 rounded-md bg-surface border border-border-subtle text-[9px] font-bold hover:border-[#FFCC00] cursor-pointer"
                    >
                      Original
                    </button>
                  )}
                </div>

                {ctxHasIdvTags && (
                  <label className="flex items-center gap-1.5 text-[10px] text-fg-secondary cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={stripIdvTagsOnSolidColor}
                      onChange={(e) => setStripIdvTagsOnSolidColor(e.target.checked)}
                      className="accent-[#FFCC00]"
                    />
                    <span className="leading-tight">Limpar tags multicoloridas IDV</span>
                  </label>
                )}

                {contextColorNotice && (
                  <p className="text-[9px] text-amber-600 dark:text-amber-300 leading-snug">
                    {contextColorNotice}
                  </p>
                )}
              </div>
            )}

            {contextMenu.targetKind === 'layer' && ctxLayer ? (
              <div className="space-y-0.5">
                {ctxLayer.type === 'text' && !isLayerEffectivelyLocked(ctxLayer) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTextLayerId(ctxLayer.id);
                      setContextMenu((p) => ({ ...p, isOpen: false }));
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover hover:text-[#FFCC00] cursor-pointer font-bold"
                  >
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                    <span>Editar Texto</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { duplicateLayer(ctxLayer.id); setContextMenu((p) => ({ ...p, isOpen: false })); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover hover:text-[#FFCC00] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">content_copy</span>
                  <span>Duplicar Camada</span>
                </button>
                <button
                  type="button"
                  onClick={() => { bringLayerForward(ctxLayer.id); setContextMenu((p) => ({ ...p, isOpen: false })); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">flip_to_front</span>
                  <span>Trazer para Frente</span>
                </button>
                <button
                  type="button"
                  onClick={() => { sendLayerBackward(ctxLayer.id); setContextMenu((p) => ({ ...p, isOpen: false })); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">flip_to_back</span>
                  <span>Enviar para Trás</span>
                </button>
                <button
                  type="button"
                  onClick={() => { centerLayerOnStage(ctxLayer.id); setContextMenu((p) => ({ ...p, isOpen: false })); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">filter_center_focus</span>
                  <span>Centralizar no Palco</span>
                </button>
                <button
                  type="button"
                  onClick={() => { toggleLayerLock(ctxLayer.id); setContextMenu((p) => ({ ...p, isOpen: false })); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">{ctxLayer.locked ? 'lock_open' : 'lock'}</span>
                  <span>{ctxLayer.locked ? 'Desbloquear' : 'Bloquear'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { resetLayerTransform(ctxLayer.id); setContextMenu((p) => ({ ...p, isOpen: false })); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg hover:bg-surface-hover cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                  <span>Resetar Formato</span>
                </button>
                <div className="border-t border-border-subtle my-1" />
                <button
                  type="button"
                  onClick={() => { removeLayer(ctxLayer.id); setContextMenu((p) => ({ ...p, isOpen: false })); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-red-500 hover:bg-red-500/10 cursor-pointer font-bold"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                  <span>Deletar Elemento</span>
                </button>
              </div>
            ) : (
              <div className="px-2 py-1 text-[10px] text-fg-muted">
                Clique em uma cor acima para alterar o fundo deste slide.
              </div>
            )}
          </div>
      )}

      {/* Dicas Rápidas de Equilíbrio Visual */}
      {showCompositionTips && (
        <div className="px-3 py-1.5 rounded-xl bg-surface/95 border border-emerald-500/35 text-[11px] text-fg shadow-md backdrop-blur-md flex items-center gap-2 max-w-md text-center animate-in fade-in">
          <span className="material-symbols-outlined text-[15px] text-emerald-500 shrink-0">lightbulb</span>
          <span>{activeTipText}</span>
        </div>
      )}
    </div>
  );
}
