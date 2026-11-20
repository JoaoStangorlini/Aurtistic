// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { AspectRatioKey, StudioStage, StudioActiveTab, StudioSlide, StudioLayer, StudioLayerFolder, StudioLayerFilterConfig, StudioDraft, StudioTemplate, StudioTextLayer, StudioGuideOverlayMode, StudioBrushKind, StudioBrushStroke, StudioDrawingLayer } from './types';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { saveDraftToIdb, getAllDraftsFromIdb, deleteDraftFromIdb, rehydrateDraft } from '@/lib/studio/studio-idb';
import { rehydrateStudioDraftAction } from '@/app/(dashboard)/organizacoes/studio-actions';
import { createDefaultSlide, adaptSlideLayersForAspect } from './studio-helpers';
import { clearStudioRenderCache } from '@/lib/studio/lut-processor';
import { enforceContiguousFolders, reorderContiguousFolderBlock, reorderSingleLayerStep } from '@/lib/studio/folder-utils';

const MAX_HISTORY_SNAPSHOTS = 40;
const ASSET_TOKEN_PREFIX = '__asset_';
const ASSET_TOKEN_SUFFIX = '__';

export type StudioCompareMode = 'off' | 'hold' | 'split';

export interface StudioHistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  slides: StudioSlide[];
}

function hashDataUrl(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(36)}_${value.length.toString(36)}`;
}

interface StudioContextValue {
  organizationId?: string | null;
  orgSlug?: string | null;
  stage: StudioStage;
  setStage: (s: StudioStage) => void;
  activeTab: StudioActiveTab;
  setActiveTab: (t: StudioActiveTab) => void;
  aspectRatio: AspectRatioKey;
  setAspectRatio: (a: AspectRatioKey) => void;
  adaptFormatTo: (newAspect: AspectRatioKey) => void;
  slides: StudioSlide[];
  activeSlideId: string;
  activeSlide: StudioSlide;
  setActiveSlideId: (id: string) => void;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  selectedLayer: StudioLayer | null;
  setSelectedLayerId: (id: string | null) => void;
  setSelectedLayerIds: (ids: string[]) => void;
  toggleLayerSelection: (id: string) => void;
  updateSlide: (slideId: string, patch: Partial<StudioSlide>) => void;
  addSlide: () => void;
  duplicateSlide: (slideId: string) => void;
  removeSlide: (slideId: string) => void;
  editingTextLayerId: string | null;
  setEditingTextLayerId: (id: string | null) => void;
  textEditorRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  insertTextSnippet: (prefix: string, suffix?: string, placeholder?: string, linePrefix?: string) => void;
  isBrushMode: boolean;
  setIsBrushMode: (v: boolean) => void;
  activeBrush: StudioBrushKind;
  setActiveBrush: (b: StudioBrushKind) => void;
  brushColor: string;
  setBrushColor: (c: string) => void;
  brushSize: number;
  setBrushSize: (s: number) => void;
  brushOpacity: number;
  setBrushOpacity: (o: number) => void;
  brushDrawerCollapsed: boolean;
  setBrushDrawerCollapsed: (v: boolean) => void;
  appendBrushStroke: (stroke: StudioBrushStroke, targetLayerId?: string) => void;
  undoLastBrushStroke: () => void;
  clearDrawingLayer: (layerId: string) => void;
  createNewDrawingLayer: () => void;
  addLayer: (layer: StudioLayer) => void;
  updateLayer: (layerId: string, patch: Partial<StudioLayer>) => void;
  updateLayersBatch: (patches: { id: string; patch: Partial<StudioLayer> }[]) => void;
  removeLayer: (layerId: string) => void;
  removeLayersBatch: (ids: string[]) => void;
  duplicateLayersBatch: (ids: string[], options?: { offsetX?: number; offsetY?: number; skipHistory?: boolean }) => string[];
  reorderLayers: (fromIdx: number, toIdx: number) => void;
  duplicateLayerWithMaskOnTop: (layerId: string) => void;
  duplicateLayer: (layerId: string) => void;
  copySelectedLayers: () => boolean;
  pasteClipboardLayers: () => string[];
  bringLayerForward: (layerId: string) => void;
  sendLayerBackward: (layerId: string) => void;
  centerLayerOnStage: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;
  resetLayerTransform: (layerId: string) => void;
  createFolder: (name?: string, color?: string) => string;
  updateFolder: (folderId: string, patch: Partial<StudioLayerFolder>) => void;
  deleteFolder: (folderId: string, deleteLayers?: boolean) => void;
  duplicateFolder: (folderId: string) => void;
  moveLayerToFolder: (layerId: string, folderId: string | null) => void;
  moveLayerStep: (layerId: string, direction: 'up' | 'down') => void;
  reorderFolderBlock: (folderId: string, direction: 'up' | 'down') => void;
  groupSelectedLayers: () => void;
  ungroupSelectedLayers: () => void;
  drafts: StudioDraft[];
  activeDraftSlot: 1 | 2 | 3 | null;
  loadDraft: (draft: StudioDraft) => void;
  loadTemplate: (template: StudioTemplate) => void;
  saveCurrentToDraftSlot: (slot: 1 | 2 | 3, title?: string) => void;
  deleteDraftSlot: (slot: 1 | 2 | 3) => void;
  resetToBlank: (aspect: AspectRatioKey) => void;
  maskModalLayerId: string | null;
  setMaskModalLayerId: (id: string | null) => void;
  activeOverlay: StudioGuideOverlayMode;
  setActiveOverlay: (ov: StudioGuideOverlayMode) => void;
  goldenSpiralQuadrant: 0 | 1 | 2 | 3;
  setGoldenSpiralQuadrant: React.Dispatch<React.SetStateAction<0 | 1 | 2 | 3>>;
  showCompositionTips: boolean;
  setShowCompositionTips: (show: boolean) => void;
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;
  isHandTool: boolean;
  setIsHandTool: (enabled: boolean) => void;
  viewportZoom: number;
  setViewportZoom: React.Dispatch<React.SetStateAction<number>>;
  viewportPan: { x: number; y: number };
  setViewportPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  resetViewport: () => void;
  canUndo: boolean;
  canRedo: boolean;
  historyPast: StudioHistoryEntry[];
  historyFuture: StudioHistoryEntry[];
  undo: () => void;
  redo: () => void;
  jumpToHistory: (target: 'past' | 'future', index: number) => void;
  commitHistorySnapshot: (previousSlides: StudioSlide[], label?: string) => void;
  beginGestureSnapshot: () => void;
  commitGestureSnapshot: (label?: string) => void;
  compareMode: StudioCompareMode;
  setCompareMode: (mode: StudioCompareMode) => void;
  compareSplitX: number;
  setCompareSplitX: (x: number) => void;
  isEyedropperActive: boolean;
  startEyedropper: (onPick?: (hex: string) => void) => void;
  cancelEyedropper: () => void;
  applyPickedEyedropperColor: (hex: string) => void;
  applyFiltersToAllSlides: (filters: StudioLayerFilterConfig, target?: 'layer' | 'global') => void;
  clearHistoryAndAssets: () => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  instagramPreviewOpen: boolean;
  setInstagramPreviewOpen: (open: boolean) => void;
  fillEventPlaceholders: (replacements: Record<string, string>) => void;
  activeSliderId: string | null;
  setActiveSliderId: (id: string | null) => void;
  helpMode: boolean;
  setHelpMode: (enabled: boolean) => void;
  lastSavedAt: string | null;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children, organizationId, orgSlug }: { children: React.ReactNode; organizationId?: string | null; orgSlug?: string | null }) {
  const { tokens } = useOrganizationBrand();
  const [stage, setStage] = useState<StudioStage>('launcher');
  const [activeTab, setActiveTab] = useState<StudioActiveTab>('images');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioKey>('1:1');
  const [slides, setSlides] = useState<StudioSlide[]>([createDefaultSlide('slide-1', '1:1', tokens)]);
  const [activeSlideId, setActiveSlideId] = useState<string>('slide-1');
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const selectedLayerId = selectedLayerIds.length > 0 ? selectedLayerIds[selectedLayerIds.length - 1] : null;
  const setSelectedLayerId = useCallback((id: string | null) => {
    setSelectedLayerIds(id ? [id] : []);
  }, []);
  const toggleLayerSelection = useCallback((id: string) => {
    setSelectedLayerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const [maskModalLayerId, setMaskModalLayerId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [activeDraftSlot, setActiveDraftSlot] = useState<1 | 2 | 3 | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<StudioGuideOverlayMode>('none');
  const [goldenSpiralQuadrant, setGoldenSpiralQuadrant] = useState<0 | 1 | 2 | 3>(0);
  const [showCompositionTips, setShowCompositionTips] = useState<boolean>(false);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [isHandTool, setIsHandTool] = useState<boolean>(false);
  const [viewportZoom, setViewportZoom] = useState<number>(1);
  const [viewportPan, setViewportPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeSliderId, setActiveSliderId] = useState<string | null>(null);
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [helpMode, setHelpMode] = useState<boolean>(false);
  const [isBrushMode, setIsBrushMode] = useState<boolean>(false);
  const [activeBrush, setActiveBrush] = useState<StudioBrushKind>('pen');
  const [brushColor, setBrushColor] = useState<string>('#FFCC00');
  const [brushSize, setBrushSize] = useState<number>(12);
  const [brushOpacity, setBrushOpacity] = useState<number>(100);
  const [brushDrawerCollapsed, setBrushDrawerCollapsed] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<StudioCompareMode>('off');
  const [compareSplitX, setCompareSplitX] = useState<number>(0.5);
  const [isEyedropperActive, setIsEyedropperActive] = useState<boolean>(false);
  const eyedropperCallbackRef = useRef<((hex: string) => void) | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);
  const [instagramPreviewOpen, setInstagramPreviewOpen] = useState<boolean>(false);
  const [historyPast, setHistoryPast] = useState<StudioHistoryEntry[]>([]);
  const [historyFuture, setHistoryFuture] = useState<StudioHistoryEntry[]>([]);
  const assetRegistryRef = useRef<Map<string, string>>(new Map());
  const clipboardRef = useRef<{ sourceSlideId: string; layers: StudioLayer[] } | null>(null);
  const pasteCountRef = useRef<number>(0);
  const slidesRef = useRef<StudioSlide[]>(slides);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  // Micro-blindagem 5C #4: ao ativar Mãozinha, desliga o Pincel automaticamente
  useEffect(() => {
    if (isHandTool) {
      setIsBrushMode(false);
    }
  }, [isHandTool]);

  const internAsset = useCallback((value: string | undefined): string | undefined => {
    if (!value || !value.startsWith('data:') || value.length < 128) return value;
    const token = `${ASSET_TOKEN_PREFIX}${hashDataUrl(value)}${ASSET_TOKEN_SUFFIX}`;
    if (!assetRegistryRef.current.has(token)) {
      assetRegistryRef.current.set(token, value);
    }
    return token;
  }, []);

  const resolveAsset = useCallback((value: string | undefined): string | undefined => {
    if (!value || !value.startsWith(ASSET_TOKEN_PREFIX)) return value;
    return assetRegistryRef.current.get(value) ?? value;
  }, []);

  const dehydrateSlideAssets = useCallback((sourceSlides: StudioSlide[]): StudioSlide[] => {
    const cloned = structuredClone(sourceSlides);
    return cloned.map((slide) => ({
      ...slide,
      layers: slide.layers.map((layer): StudioLayer => {
        if (layer.type === 'image') {
          return {
            ...layer,
            src: internAsset(layer.src) ?? layer.src,
            maskDataUrl: internAsset(layer.maskDataUrl),
          };
        }
        if (layer.type === 'logo') {
          return {
            ...layer,
            src: layer.src ? (internAsset(layer.src) ?? layer.src) : undefined,
            maskDataUrl: internAsset(layer.maskDataUrl),
          };
        }
        return layer;
      }),
    }));
  }, [internAsset]);

  const rehydrateSlideAssets = useCallback((storedSlides: StudioSlide[]): StudioSlide[] => {
    const cloned = structuredClone(storedSlides);
    return cloned.map((slide) => ({
      ...slide,
      layers: slide.layers.map((layer): StudioLayer => {
        if (layer.type === 'image') {
          return {
            ...layer,
            src: resolveAsset(layer.src) ?? layer.src,
            maskDataUrl: resolveAsset(layer.maskDataUrl),
          };
        }
        if (layer.type === 'logo') {
          return {
            ...layer,
            src: layer.src ? (resolveAsset(layer.src) ?? layer.src) : undefined,
            maskDataUrl: resolveAsset(layer.maskDataUrl),
          };
        }
        return layer;
      }),
    }));
  }, [resolveAsset]);

  // Descarte explícito de buffers Offscreen ao desmontar o Studio
  useEffect(() => {
    return () => {
      clearStudioRenderCache();
      assetRegistryRef.current.clear();
    };
  }, []);

  const resetViewport = useCallback(() => {
    setViewportZoom(1);
    setViewportPan({ x: 0, y: 0 });
  }, []);

  /**
   * Guardrail 4: Grava snapshot profundo (structuredClone + deduplicação de data: URLs)
   * no histórico apenas no commit (pointerup / ação discreta), nunca durante pointermove contínuo.
   */
  const gestureSnapshotRef = useRef<StudioSlide[] | null>(null);

  const makeHistoryEntry = useCallback((sourceSlides: StudioSlide[], label = 'Edição'): StudioHistoryEntry => ({
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    timestamp: Date.now(),
    slides: dehydrateSlideAssets(sourceSlides),
  }), [dehydrateSlideAssets]);

  const commitHistorySnapshot = useCallback((previousSlides: StudioSlide[], label = 'Edição') => {
    const entry = makeHistoryEntry(previousSlides, label);
    setHistoryPast((prev) => [...prev.slice(-(MAX_HISTORY_SNAPSHOTS - 1)), entry]);
    setHistoryFuture([]);
  }, [makeHistoryEntry]);

  const beginGestureSnapshot = useCallback(() => {
    gestureSnapshotRef.current = dehydrateSlideAssets(slidesRef.current);
  }, [dehydrateSlideAssets]);

  const commitGestureSnapshot = useCallback((label = 'Ajuste') => {
    if (!gestureSnapshotRef.current) return;
    const snap = gestureSnapshotRef.current;
    gestureSnapshotRef.current = null;
    const entry: StudioHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      timestamp: Date.now(),
      slides: snap,
    };
    setHistoryPast((prev) => [...prev.slice(-(MAX_HISTORY_SNAPSHOTS - 1)), entry]);
    setHistoryFuture([]);
  }, []);

  useEffect(() => {
    if (!activeSliderId) return;
    const handleWindowBlur = () => {
      setActiveSliderId(null);
      gestureSnapshotRef.current = null;
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [activeSliderId]);

  const undo = useCallback(() => {
    setHistoryPast((prev) => {
      if (prev.length === 0) return prev;
      const previousEntry = prev[prev.length - 1];
      const currentEntry = makeHistoryEntry(slidesRef.current, previousEntry.label);
      setHistoryFuture((f) => [currentEntry, ...f.slice(0, MAX_HISTORY_SNAPSHOTS - 1)]);
      setSlides(rehydrateSlideAssets(previousEntry.slides));
      return prev.slice(0, -1);
    });
  }, [makeHistoryEntry, rehydrateSlideAssets]);

  const redo = useCallback(() => {
    setHistoryFuture((prev) => {
      if (prev.length === 0) return prev;
      const [nextEntry, ...rest] = prev;
      const currentEntry = makeHistoryEntry(slidesRef.current, nextEntry.label);
      setHistoryPast((p) => [...p.slice(-(MAX_HISTORY_SNAPSHOTS - 1)), currentEntry]);
      setSlides(rehydrateSlideAssets(nextEntry.slides));
      return rest;
    });
  }, [makeHistoryEntry, rehydrateSlideAssets]);

  const jumpToHistory = useCallback((target: 'past' | 'future', index: number) => {
    if (target === 'past') {
      if (index < 0 || index >= historyPast.length) return;
      const targetEntry = historyPast[index];
      const trailingPast = historyPast.slice(index + 1);
      const currentEntry = makeHistoryEntry(slidesRef.current, targetEntry.label);
      setHistoryFuture((prevFuture) => [...trailingPast.reverse(), currentEntry, ...prevFuture].slice(0, MAX_HISTORY_SNAPSHOTS));
      setHistoryPast(historyPast.slice(0, index));
      setSlides(rehydrateSlideAssets(targetEntry.slides));
      return;
    }
    if (index < 0 || index >= historyFuture.length) return;
    const targetEntry = historyFuture[index];
    const precedingFuture = historyFuture.slice(0, index);
    const currentEntry = makeHistoryEntry(slidesRef.current, targetEntry.label);
    setHistoryPast((prevPast) => [...prevPast, currentEntry, ...precedingFuture].slice(-MAX_HISTORY_SNAPSHOTS));
    setHistoryFuture(historyFuture.slice(index + 1));
    setSlides(rehydrateSlideAssets(targetEntry.slides));
  }, [historyPast, historyFuture, makeHistoryEntry, rehydrateSlideAssets]);

  const startEyedropper = useCallback((onPick?: (hex: string) => void) => {
    eyedropperCallbackRef.current = onPick ?? null;
    setIsBrushMode(false);
    setEditingTextLayerId(null);
    setIsEyedropperActive(true);
  }, []);

  const cancelEyedropper = useCallback(() => {
    eyedropperCallbackRef.current = null;
    setIsEyedropperActive(false);
  }, []);

  const applyPickedEyedropperColor = useCallback((hex: string) => {
    const normalized = hex.toUpperCase();
    const customCallback = eyedropperCallbackRef.current;
    eyedropperCallbackRef.current = null;
    setIsEyedropperActive(false);
    if (customCallback) {
      customCallback(normalized);
      return;
    }
    const slide = slidesRef.current.find((s) => s.id === activeSlideId) || slidesRef.current[0];
    const currentLayer = slide?.layers.find((l) => l.id === selectedLayerId) || null;
    if (currentLayer && (currentLayer.type === 'text' || currentLayer.type === 'shape')) {
      commitHistorySnapshot(slidesRef.current, 'Conta-gotas');
      setSlides((prev) => prev.map((s) => (
        s.id === slide.id
          ? {
            ...s,
            layers: s.layers.map((l) => {
              if (l.id !== currentLayer.id) return l;
              if (l.type === 'text') return { ...l, color: normalized };
              if (l.type === 'shape') return { ...l, fill: normalized };
              return l;
            }),
          }
          : s
      )));
      return;
    }
    setBrushColor(normalized);
  }, [activeSlideId, selectedLayerId, commitHistorySnapshot]);

  const applyFiltersToAllSlides = useCallback((filters: StudioLayerFilterConfig, target: 'layer' | 'global' = 'layer') => {
    commitHistorySnapshot(slidesRef.current, 'Ajustes em todos os slides');
    const clonedFilters = structuredClone(filters);
    setSlides((prev) => prev.map((s) => ({
      ...s,
      globalFilters: target === 'global' ? structuredClone(clonedFilters) : s.globalFilters,
      layers: target === 'layer'
        ? s.layers.map((l) => (l.type === 'image' ? { ...l, filters: structuredClone(clonedFilters) } : l))
        : s.layers,
    })));
  }, [commitHistorySnapshot]);

  useEffect(() => {
    getAllDraftsFromIdb().then((local) => {
      if (local?.length) setDrafts(local);
    });
    const slug = orgSlug || tokens.themeId;
    fetch(`/api/studio/drafts?org=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.drafts) && data.drafts.length) {
          setDrafts(data.drafts.map(rehydrateDraft));
        }
      })
      .catch(() => {});
  }, [orgSlug, tokens.themeId]);

  const activeSlide = slides.find((s) => s.id === activeSlideId) || slides[0];
  const selectedLayer = activeSlide?.layers.find((l) => l.id === selectedLayerId) || null;

  const updateSlide = useCallback((id: string, patch: Partial<StudioSlide>) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const adaptFormatTo = useCallback((newAspect: AspectRatioKey) => {
    setAspectRatio(newAspect);
    setSlides((prev) => prev.map((s) => ({
      ...s,
      aspectRatio: newAspect,
      layers: adaptSlideLayersForAspect(s.layers, newAspect),
    })));
  }, []);

  const addSlide = useCallback(() => {
    const newSlide = { ...createDefaultSlide(`slide-${Date.now()}`, aspectRatio, tokens), title: `Tela ${slides.length + 1}` };
    setSlides((prev) => [...prev, newSlide]);
    setActiveSlideId(newSlide.id);
  }, [slides.length, aspectRatio, tokens]);

  const duplicateSlide = useCallback((slideId: string) => {
    const src = slidesRef.current.find((s) => s.id === slideId);
    if (!src) return;
    commitHistorySnapshot(slidesRef.current);
    const now = Date.now();
    const folderIdMap = new Map<string, string>();
    const newFolders = (src.folders || []).map((f, idx) => {
      const nextId = `folder-${now}-${idx}`;
      folderIdMap.set(f.id, nextId);
      return { ...f, id: nextId };
    });
    const newLayers = src.layers.map((l, idx) => ({
      ...l,
      id: `${l.type}-${now}-${idx}`,
      folderId: l.folderId ? (folderIdMap.get(l.folderId) ?? null) : null,
    })) as StudioLayer[];
    const cloned: StudioSlide = {
      ...src,
      id: `slide-${now}`,
      title: `${src.title} (Cópia)`,
      folders: newFolders,
      layers: newLayers,
    };
    setSlides((prev) => {
      const idx = prev.findIndex((s) => s.id === slideId);
      if (idx < 0) return [...prev, cloned];
      return [...prev.slice(0, idx + 1), cloned, ...prev.slice(idx + 1)];
    });
    setActiveSlideId(cloned.id);
  }, [commitHistorySnapshot]);

  const removeSlide = useCallback((id: string) => {
    setSlides((prev) => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((s) => s.id !== id);
      setActiveSlideId(filtered[0].id);
      return filtered;
    });
  }, []);

  const addLayer = useCallback((layer: StudioLayer) => {
    commitHistorySnapshot(slidesRef.current);
    updateSlide(activeSlide.id, { layers: [...activeSlide.layers, layer] });
    setSelectedLayerId(layer.id);
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const updateLayer = useCallback((id: string, patch: Partial<StudioLayer>) => {
    updateSlide(activeSlide.id, {
      layers: activeSlide.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as StudioLayer) : l)),
    });
  }, [activeSlide, updateSlide]);

  const updateLayersBatch = useCallback((patches: { id: string; patch: Partial<StudioLayer> }[]) => {
    if (patches.length === 0) return;
    const map = new Map(patches.map((p) => [p.id, p.patch]));
    setSlides((prev) =>
      prev.map((s) =>
        s.id === activeSlide.id
          ? {
              ...s,
              layers: s.layers.map((l) => {
                const p = map.get(l.id);
                return p ? ({ ...l, ...p } as StudioLayer) : l;
              }),
            }
          : s
      )
    );
  }, [activeSlide.id]);

  const removeLayer = useCallback((id: string) => {
    commitHistorySnapshot(slidesRef.current);
    updateSlide(activeSlide.id, { layers: activeSlide.layers.filter((l) => l.id !== id) });
    setSelectedLayerIds((prev) => prev.filter((x) => x !== id));
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const removeLayersBatch = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    commitHistorySnapshot(slidesRef.current);
    updateSlide(activeSlide.id, { layers: activeSlide.layers.filter((l) => !idSet.has(l.id)) });
    setSelectedLayerIds((prev) => prev.filter((x) => !idSet.has(x)));
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const duplicateLayersBatch = useCallback(
    (ids: string[], options?: { offsetX?: number; offsetY?: number; skipHistory?: boolean }) => {
      const targets = activeSlide.layers.filter((l) => ids.includes(l.id));
      if (targets.length === 0) return [];
      if (!options?.skipHistory) commitHistorySnapshot(slidesRef.current);
      const dx = options?.offsetX ?? 0.03;
      const dy = options?.offsetY ?? 0.03;
      const now = Date.now();
      const copies = targets.map((t, idx) => ({
        ...t,
        id: `${t.id}-copy-${now}-${idx}`,
        name: `${t.name} (Cópia)`,
        x: Math.min(0.95, t.x + dx),
        y: Math.min(0.95, t.y + dy),
      })) as StudioLayer[];
      updateSlide(activeSlide.id, { layers: [...activeSlide.layers, ...copies] });
      const newIds = copies.map((c) => c.id);
      setSelectedLayerIds(newIds);
      return newIds;
    },
    [activeSlide, updateSlide, commitHistorySnapshot]
  );

  const copySelectedLayers = useCallback((): boolean => {
    const ids = selectedLayerIds.length > 0 ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : [];
    const targets = activeSlide.layers.filter((l) => ids.includes(l.id));
    if (targets.length === 0) return false;
    clipboardRef.current = {
      sourceSlideId: activeSlide.id,
      layers: structuredClone(targets),
    };
    pasteCountRef.current = 0;
    return true;
  }, [activeSlide, selectedLayerId, selectedLayerIds]);

  const pasteClipboardLayers = useCallback((): string[] => {
    const clip = clipboardRef.current;
    if (!clip || clip.layers.length === 0) return [];
    pasteCountRef.current += 1;
    const offset = 0.025 * pasteCountRef.current;
    commitHistorySnapshot(slidesRef.current, 'Colar camada(s)');
    const validFolderIds = new Set((activeSlide.folders || []).map((f) => f.id));
    const now = Date.now();
    const pasted = clip.layers.map((orig, idx) => {
      const cloned = structuredClone(orig) as StudioLayer;
      const maxX = Math.max(0, 1 - Math.min(0.95, cloned.width));
      const maxY = Math.max(0, 1 - Math.min(0.95, cloned.height));
      return {
        ...cloned,
        id: `${cloned.type}-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        name: cloned.name.endsWith('(Cópia)') ? cloned.name : `${cloned.name} (Cópia)`,
        x: Math.max(0, Math.min(maxX, cloned.x + offset)),
        y: Math.max(0, Math.min(maxY, cloned.y + offset)),
        folderId: cloned.folderId && validFolderIds.has(cloned.folderId) ? cloned.folderId : null,
      } as StudioLayer;
    });
    const merged = enforceContiguousFolders([...activeSlide.layers, ...pasted], activeSlide.folders || []);
    updateSlide(activeSlide.id, { layers: merged });
    const newIds = pasted.map((p) => p.id);
    setSelectedLayerIds(newIds);
    return newIds;
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const reorderLayers = useCallback((from: number, to: number) => {
    commitHistorySnapshot(slidesRef.current);
    const next = [...activeSlide.layers];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const contiguous = enforceContiguousFolders(next, activeSlide.folders || []);
    updateSlide(activeSlide.id, { layers: contiguous });
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const createFolder = useCallback((name?: string, color = '#FFCC00') => {
    commitHistorySnapshot(slidesRef.current);
    const existing = activeSlide.folders || [];
    const newFolder: StudioLayerFolder = {
      id: `folder-${Date.now()}`,
      name: name || `Pasta ${existing.length + 1}`,
      color,
      collapsed: false,
      visible: true,
      locked: false,
    };
    updateSlide(activeSlide.id, { folders: [...existing, newFolder] });
    return newFolder.id;
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const updateFolder = useCallback((folderId: string, patch: Partial<StudioLayerFolder>) => {
    const existing = activeSlide.folders || [];
    updateSlide(activeSlide.id, {
      folders: existing.map((f) => (f.id === folderId ? { ...f, ...patch } : f)),
    });
    if (patch.visible === false || patch.locked === true) {
      const memberIds = new Set(
        activeSlide.layers.filter((l) => l.folderId === folderId).map((l) => l.id)
      );
      if (memberIds.size > 0) {
        setSelectedLayerIds((prev) => prev.filter((id) => !memberIds.has(id)));
      }
    }
  }, [activeSlide, updateSlide]);

  const insertTextSnippet = useCallback(
    (prefix: string, suffix = '', placeholder = '', linePrefix?: string) => {
      const targetId = editingTextLayerId || selectedLayerId;
      const targetLayer = activeSlide.layers.find((l) => l.id === targetId && l.type === 'text') as StudioTextLayer | undefined;
      if (!targetLayer) return;

      const el = textEditorRef.current;
      const currentText = targetLayer.text || '';
      const start = el ? el.selectionStart ?? currentText.length : currentText.length;
      const end = el ? el.selectionEnd ?? currentText.length : currentText.length;

      let nextText = currentText;
      let nextStart = start;
      let nextEnd = end;

      if (linePrefix) {
        const lineStart = currentText.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        nextText = currentText.slice(0, lineStart) + linePrefix + currentText.slice(lineStart);
        nextStart = start + linePrefix.length;
        nextEnd = end + linePrefix.length;
      } else {
        const selected = currentText.slice(start, end);
        const middle = selected || placeholder;
        nextText = currentText.slice(0, start) + prefix + middle + suffix + currentText.slice(end);
        if (selected) {
          nextStart = start + prefix.length;
          nextEnd = nextStart + selected.length;
        } else {
          nextStart = start + prefix.length;
          nextEnd = nextStart + middle.length;
        }
      }

      updateLayer(targetLayer.id, { text: nextText });
      if (el) {
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(nextStart, nextEnd);
        });
      }
    },
    [activeSlide.layers, editingTextLayerId, selectedLayerId, updateLayer]
  );

  const createNewDrawingLayer = useCallback(() => {
    commitHistorySnapshot(slidesRef.current);
    const count = activeSlide.layers.filter((l) => l.type === 'drawing').length + 1;
    const newLayer: StudioDrawingLayer = {
      id: `drawing-${Date.now()}`,
      type: 'drawing',
      name: `Desenho ${count}`,
      strokes: [],
      visible: true,
      locked: false,
      opacity: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
    };
    updateSlide(activeSlide.id, { layers: [...activeSlide.layers, newLayer] });
    setSelectedLayerId(newLayer.id);
  }, [activeSlide, updateSlide, commitHistorySnapshot, setSelectedLayerId]);

  const appendBrushStroke = useCallback(
    (stroke: StudioBrushStroke, targetLayerId?: string) => {
      commitHistorySnapshot(slidesRef.current);
      const existing =
        (targetLayerId
          ? activeSlide.layers.find((l) => l.id === targetLayerId && l.type === 'drawing' && !l.locked)
          : null) ||
        activeSlide.layers.find((l) => l.id === selectedLayerId && l.type === 'drawing' && !l.locked) ||
        [...activeSlide.layers].reverse().find((l) => l.type === 'drawing' && l.visible && !l.locked);

      if (existing && existing.type === 'drawing') {
        updateLayer(existing.id, { strokes: [...existing.strokes, stroke] } as Partial<StudioDrawingLayer>);
        setSelectedLayerId(existing.id);
      } else {
        const count = activeSlide.layers.filter((l) => l.type === 'drawing').length + 1;
        const newLayer: StudioDrawingLayer = {
          id: `drawing-${Date.now()}`,
          type: 'drawing',
          name: `Desenho ${count}`,
          strokes: [stroke],
          visible: true,
          locked: false,
          opacity: 1,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
        };
        updateSlide(activeSlide.id, { layers: [...activeSlide.layers, newLayer] });
        setSelectedLayerId(newLayer.id);
      }
    },
    [activeSlide, selectedLayerId, updateLayer, updateSlide, commitHistorySnapshot, setSelectedLayerId]
  );

  const undoLastBrushStroke = useCallback(() => {
    const target =
      (selectedLayer?.type === 'drawing' ? selectedLayer : null) ||
      ([...activeSlide.layers].reverse().find((l) => l.type === 'drawing') as StudioDrawingLayer | undefined);
    if (!target || target.strokes.length === 0) return;
    commitHistorySnapshot(slidesRef.current);
    updateLayer(target.id, { strokes: target.strokes.slice(0, -1) } as Partial<StudioDrawingLayer>);
  }, [activeSlide.layers, selectedLayer, updateLayer, commitHistorySnapshot]);

  const clearDrawingLayer = useCallback(
    (layerId: string) => {
      commitHistorySnapshot(slidesRef.current);
      updateLayer(layerId, { strokes: [] } as Partial<StudioDrawingLayer>);
    },
    [updateLayer, commitHistorySnapshot]
  );

  const deleteFolder = useCallback((folderId: string, deleteLayers = false) => {
    commitHistorySnapshot(slidesRef.current);
    const nextFolders = (activeSlide.folders || []).filter((f) => f.id !== folderId);
    const nextLayers = deleteLayers
      ? activeSlide.layers.filter((l) => l.folderId !== folderId)
      : activeSlide.layers.map((l) => (l.folderId === folderId ? { ...l, folderId: null } : l));
    updateSlide(activeSlide.id, { folders: nextFolders, layers: nextLayers });
    if (deleteLayers) {
      const removedIds = new Set(activeSlide.layers.filter((l) => l.folderId === folderId).map((l) => l.id));
      setSelectedLayerIds((prev) => prev.filter((id) => !removedIds.has(id)));
    }
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const duplicateFolder = useCallback((folderId: string) => {
    const existing = activeSlide.folders || [];
    const srcFolder = existing.find((f) => f.id === folderId);
    if (!srcFolder) return;
    commitHistorySnapshot(slidesRef.current);
    const now = Date.now();
    const newFolder: StudioLayerFolder = {
      ...srcFolder,
      id: `folder-${now}`,
      name: `${srcFolder.name} (Cópia)`,
    };
    const members = activeSlide.layers.filter((l) => l.folderId === folderId);
    const copiedMembers = members.map((m, idx) => ({
      ...m,
      id: `${m.id}-fcopy-${now}-${idx}`,
      folderId: newFolder.id,
      x: Math.min(0.95, m.x + 0.03),
      y: Math.min(0.95, m.y + 0.03),
    })) as StudioLayer[];
    const nextFolders = [...existing, newFolder];
    const nextLayers = enforceContiguousFolders([...activeSlide.layers, ...copiedMembers], nextFolders);
    updateSlide(activeSlide.id, { folders: nextFolders, layers: nextLayers });
    if (copiedMembers.length > 0) setSelectedLayerIds(copiedMembers.map((c) => c.id));
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const moveLayerToFolder = useCallback((layerId: string, folderId: string | null) => {
    commitHistorySnapshot(slidesRef.current);
    const next = activeSlide.layers.map((l) => (l.id === layerId ? ({ ...l, folderId } as StudioLayer) : l));
    const contiguous = enforceContiguousFolders(next, activeSlide.folders || []);
    updateSlide(activeSlide.id, { layers: contiguous });
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const moveLayerStep = useCallback((layerId: string, direction: 'up' | 'down') => {
    commitHistorySnapshot(slidesRef.current);
    const next = reorderSingleLayerStep(activeSlide.layers, activeSlide.folders || [], layerId, direction);
    updateSlide(activeSlide.id, { layers: next });
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const reorderFolderBlock = useCallback((folderId: string, direction: 'up' | 'down') => {
    commitHistorySnapshot(slidesRef.current);
    const next = reorderContiguousFolderBlock(activeSlide.layers, activeSlide.folders || [], folderId, direction);
    updateSlide(activeSlide.id, { layers: next });
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const groupSelectedLayers = useCallback(() => {
    if (selectedLayerIds.length < 2) return;
    commitHistorySnapshot(slidesRef.current);
    const existing = activeSlide.folders || [];
    const selectedSet = new Set(selectedLayerIds);
    const groupFolder: StudioLayerFolder = {
      id: `group-${Date.now()}`,
      name: `Grupo ${existing.filter((f) => f.isGroup).length + 1}`,
      color: '#00D4FF',
      collapsed: false,
      visible: true,
      locked: false,
      isGroup: true,
    };
    const nextFolders = [...existing, groupFolder];
    const tagged = activeSlide.layers.map((l) => (selectedSet.has(l.id) ? ({ ...l, folderId: groupFolder.id } as StudioLayer) : l));
    const contiguous = enforceContiguousFolders(tagged, nextFolders);
    updateSlide(activeSlide.id, { folders: nextFolders, layers: contiguous });
  }, [activeSlide, selectedLayerIds, updateSlide, commitHistorySnapshot]);

  const ungroupSelectedLayers = useCallback(() => {
    if (selectedLayerIds.length === 0) return;
    const selectedSet = new Set(selectedLayerIds);
    const folderIdsToRemove = new Set(
      activeSlide.layers.filter((l) => selectedSet.has(l.id) && l.folderId).map((l) => l.folderId!)
    );
    if (folderIdsToRemove.size === 0) return;
    commitHistorySnapshot(slidesRef.current);
    const nextFolders = (activeSlide.folders || []).filter((f) => !folderIdsToRemove.has(f.id));
    const nextLayers = activeSlide.layers.map((l) =>
      l.folderId && folderIdsToRemove.has(l.folderId) ? ({ ...l, folderId: null } as StudioLayer) : l
    );
    updateSlide(activeSlide.id, { folders: nextFolders, layers: nextLayers });
  }, [activeSlide, selectedLayerIds, updateSlide, commitHistorySnapshot]);

  const duplicateLayerWithMaskOnTop = useCallback((id: string) => {
    const target = activeSlide.layers.find((l) => l.id === id);
    if (!target) return;
    commitHistorySnapshot(slidesRef.current);
    const copy: StudioLayer = { ...target, id: `${target.id}-mask-top-${Date.now()}`, name: `${target.name} (Máscara Topo)`, filters: { ...(target.filters || { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0 }), targetMaskAreaOnly: true, isCutoutMask: true } };
    updateSlide(activeSlide.id, { layers: [...activeSlide.layers, copy] });
    setSelectedLayerId(copy.id);
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const duplicateLayer = useCallback((layerId: string) => {
    const target = activeSlide.layers.find((l) => l.id === layerId);
    if (!target) return;
    commitHistorySnapshot(slidesRef.current);
    const copy: StudioLayer = {
      ...target,
      id: `${target.type}-${Date.now()}`,
      name: `${target.name} (Cópia)`,
      x: Math.min(0.85, target.x + 0.04),
      y: Math.min(0.85, target.y + 0.04),
    };
    updateSlide(activeSlide.id, { layers: [...activeSlide.layers, copy] });
    setSelectedLayerId(copy.id);
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const bringLayerForward = useCallback((layerId: string) => {
    const idx = activeSlide.layers.findIndex((l) => l.id === layerId);
    if (idx === -1 || idx === activeSlide.layers.length - 1) return;
    commitHistorySnapshot(slidesRef.current);
    const next = [...activeSlide.layers];
    const [moved] = next.splice(idx, 1);
    next.push(moved);
    updateSlide(activeSlide.id, { layers: next });
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const sendLayerBackward = useCallback((layerId: string) => {
    const idx = activeSlide.layers.findIndex((l) => l.id === layerId);
    if (idx <= 0) return;
    commitHistorySnapshot(slidesRef.current);
    const next = [...activeSlide.layers];
    const [moved] = next.splice(idx, 1);
    next.unshift(moved);
    updateSlide(activeSlide.id, { layers: next });
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const centerLayerOnStage = useCallback((layerId: string) => {
    const target = activeSlide.layers.find((l) => l.id === layerId);
    if (!target) return;
    commitHistorySnapshot(slidesRef.current);
    updateSlide(activeSlide.id, {
      layers: activeSlide.layers.map((l) =>
        l.id === layerId
          ? { ...l, x: Math.max(0, (1 - l.width) / 2), y: Math.max(0, (1 - l.height) / 2) }
          : l
      ),
    });
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const toggleLayerLock = useCallback((layerId: string) => {
    const target = activeSlide.layers.find((l) => l.id === layerId);
    if (!target) return;
    commitHistorySnapshot(slidesRef.current);
    updateSlide(activeSlide.id, {
      layers: activeSlide.layers.map((l) =>
        l.id === layerId ? { ...l, locked: !l.locked } : l
      ),
    });
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const resetLayerTransform = useCallback((layerId: string) => {
    commitHistorySnapshot(slidesRef.current);
    updateSlide(activeSlide.id, {
      layers: activeSlide.layers.map((l) =>
        l.id === layerId
          ? { ...l, rotation: 0, x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
          : l
      ),
    });
  }, [activeSlide, updateSlide, commitHistorySnapshot]);

  const fillEventPlaceholders = useCallback((replacements: Record<string, string>) => {
    setSlides((prev) => prev.map((slide) => ({ ...slide, layers: slide.layers.map((layer) => { if (layer.type !== 'text') return layer; let txt = (layer as StudioTextLayer).text; for (const [k, v] of Object.entries(replacements)) { if (v) txt = txt.split(`{${k}}`).join(v); } return { ...layer, text: txt } as StudioTextLayer; }) })));
  }, []);

  const clearHistoryAndAssets = useCallback(() => {
    setHistoryPast([]);
    setHistoryFuture([]);
    gestureSnapshotRef.current = null;
    assetRegistryRef.current.clear();
  }, []);

  const loadDraft = useCallback((draft: StudioDraft) => {
    clearStudioRenderCache();
    clearHistoryAndAssets();
    const slug = orgSlug || tokens.themeId;
    const local = rehydrateDraft(draft);
    setSlides(local.slides);
    setAspectRatio(local.aspectRatio);
    setActiveDraftSlot(local.slotIndex);
    if (local.slides[0]) setActiveSlideId(local.slides[0].id);
    setSelectedLayerId(null);
    setStage('editor');
    rehydrateStudioDraftAction(draft, slug, organizationId || undefined).then((res) => {
      if (res?.ok && res.draft) setSlides(res.draft.slides);
    }).catch(() => {});
  }, [orgSlug, organizationId, tokens.themeId, clearHistoryAndAssets]);

  const loadTemplate = useCallback((tpl: StudioTemplate) => {
    clearStudioRenderCache();
    clearHistoryAndAssets();
    setSlides(tpl.slides);
    setAspectRatio(tpl.aspectRatio);
    setActiveDraftSlot(null);
    if (tpl.slides[0]) setActiveSlideId(tpl.slides[0].id);
    setSelectedLayerId(null);
    setStage('editor');
    const slug = orgSlug || tokens.themeId;
    rehydrateStudioDraftAction({ id: tpl.id, slotIndex: 1, title: tpl.title, aspectRatio: tpl.aspectRatio, updatedAt: '', slides: tpl.slides }, slug, organizationId || undefined).then((r) => { if (r?.ok && r.draft) setSlides(r.draft.slides); }).catch(() => {});
  }, [orgSlug, organizationId, tokens.themeId, clearHistoryAndAssets]);

  const saveCurrentToDraftSlot = useCallback((slot: 1 | 2 | 3, title?: string) => {
    const newDraft: StudioDraft = {
      id: `draft-slot-${slot}`,
      slotIndex: slot,
      title: title || `Rascunho ${slot} - ${new Date().toLocaleDateString('pt-BR')}`,
      aspectRatio,
      updatedAt: new Date().toISOString(),
      slides,
    };
    saveDraftToIdb(newDraft);
    const slug = orgSlug || tokens.themeId;
    fetch('/api/studio/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotIndex: slot, orgSlug: slug, draft: newDraft }),
    }).catch(() => {});
    setDrafts((prev) => {
      const filtered = prev.filter((d) => d.slotIndex !== slot);
      return [...filtered, newDraft].sort((a, b) => a.slotIndex - b.slotIndex).slice(0, 3);
    });
    setActiveDraftSlot(slot);
    setLastSavedAt(new Date().toISOString());
  }, [aspectRatio, slides, orgSlug, tokens.themeId]);

  const deleteDraftSlot = useCallback((slot: 1 | 2 | 3) => {
    deleteDraftFromIdb(slot);
    const slug = orgSlug || tokens.themeId;
    fetch(`/api/studio/drafts?slotIndex=${slot}&orgSlug=${encodeURIComponent(slug)}`, { method: 'DELETE' }).catch(() => {});
    setDrafts((prev) => prev.filter((d) => d.slotIndex !== slot));
    if (activeDraftSlot === slot) setActiveDraftSlot(null);
  }, [activeDraftSlot, orgSlug, tokens.themeId]);

  const resetToBlank = useCallback((aspect: AspectRatioKey) => {
    clearStudioRenderCache();
    clearHistoryAndAssets();
    setAspectRatio(aspect);
    const blank = createDefaultSlide(`slide-${Date.now()}`, aspect, tokens);
    setSlides([blank]);
    setActiveSlideId(blank.id);
    setSelectedLayerId(null);
    setActiveDraftSlot(null);
    setStage('editor');
  }, [tokens, clearHistoryAndAssets]);

  return (
    <StudioContext.Provider
      value={{
        organizationId, orgSlug, stage, setStage, activeTab, setActiveTab, aspectRatio, setAspectRatio, adaptFormatTo,
        slides, activeSlideId, activeSlide, setActiveSlideId,
        selectedLayerId, selectedLayerIds, selectedLayer, setSelectedLayerId, setSelectedLayerIds, toggleLayerSelection,
        updateSlide, addSlide, duplicateSlide, removeSlide,
        editingTextLayerId, setEditingTextLayerId, textEditorRef, insertTextSnippet,
        isBrushMode, setIsBrushMode, activeBrush, setActiveBrush, brushColor, setBrushColor,
        brushSize, setBrushSize, brushOpacity, setBrushOpacity, brushDrawerCollapsed, setBrushDrawerCollapsed,
        appendBrushStroke, undoLastBrushStroke, clearDrawingLayer, createNewDrawingLayer,
        addLayer, updateLayer, updateLayersBatch, removeLayer, removeLayersBatch, duplicateLayersBatch, reorderLayers, duplicateLayerWithMaskOnTop,
        duplicateLayer, copySelectedLayers, pasteClipboardLayers, bringLayerForward, sendLayerBackward, centerLayerOnStage, toggleLayerLock, resetLayerTransform,
        createFolder, updateFolder, deleteFolder, duplicateFolder, moveLayerToFolder, moveLayerStep, reorderFolderBlock, groupSelectedLayers, ungroupSelectedLayers,
        drafts, activeDraftSlot, loadDraft, loadTemplate, saveCurrentToDraftSlot, deleteDraftSlot, resetToBlank,
        maskModalLayerId, setMaskModalLayerId, activeOverlay, setActiveOverlay,
        goldenSpiralQuadrant, setGoldenSpiralQuadrant, showCompositionTips, setShowCompositionTips,
        snapEnabled, setSnapEnabled, isHandTool, setIsHandTool, viewportZoom, setViewportZoom,
        viewportPan, setViewportPan, resetViewport,
        canUndo: historyPast.length > 0, canRedo: historyFuture.length > 0, historyPast, historyFuture, undo, redo, jumpToHistory, commitHistorySnapshot,
        beginGestureSnapshot, commitGestureSnapshot,
        compareMode, setCompareMode, compareSplitX, setCompareSplitX,
        isEyedropperActive, startEyedropper, cancelEyedropper, applyPickedEyedropperColor,
        applyFiltersToAllSlides, clearHistoryAndAssets, shortcutsOpen, setShortcutsOpen, instagramPreviewOpen, setInstagramPreviewOpen,
        fillEventPlaceholders,
        activeSliderId, setActiveSliderId, helpMode, setHelpMode, lastSavedAt,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio deve ser usado dentro de um StudioProvider');
  return ctx;
}

export function useOptionalStudio() {
  return useContext(StudioContext);
}
