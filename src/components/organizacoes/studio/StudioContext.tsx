// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AspectRatioKey, StudioStage, StudioActiveTab, StudioSlide, StudioLayer, StudioDraft, StudioTemplate, StudioTextLayer } from './types';
import { useOrganizationBrand } from '../OrganizationBrandProvider';

interface StudioContextValue {
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
  selectedLayer: StudioLayer | null;
  setSelectedLayerId: (id: string | null) => void;
  updateSlide: (slideId: string, patch: Partial<StudioSlide>) => void;
  addSlide: () => void;
  removeSlide: (slideId: string) => void;
  addLayer: (layer: StudioLayer) => void;
  updateLayer: (layerId: string, patch: Partial<StudioLayer>) => void;
  removeLayer: (layerId: string) => void;
  reorderLayers: (fromIdx: number, toIdx: number) => void;
  duplicateLayerWithMaskOnTop: (layerId: string) => void;
  drafts: StudioDraft[];
  activeDraftSlot: 1 | 2 | 3 | null;
  loadDraft: (draft: StudioDraft) => void;
  loadTemplate: (template: StudioTemplate) => void;
  saveCurrentToDraftSlot: (slot: 1 | 2 | 3, title?: string) => void;
  resetToBlank: (aspect: AspectRatioKey) => void;
  maskModalLayerId: string | null;
  setMaskModalLayerId: (id: string | null) => void;
  activeOverlay: 'none' | 'thirds' | 'golden' | 'diagonals';
  setActiveOverlay: (ov: 'none' | 'thirds' | 'golden' | 'diagonals') => void;
  fillEventPlaceholders: (replacements: Record<string, string>) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

function createDefaultSlide(id: string, aspect: AspectRatioKey, brand: ReturnType<typeof useOrganizationBrand>['tokens']): StudioSlide {
  return {
    id,
    title: 'Tela 1',
    aspectRatio: aspect,
    backgroundColor: brand.bgApp || '#07090e',
    globalFilters: { brightness: 100, contrast: 105, saturation: 105, blur: 0, grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0 },
    showBrandBadge: true,
    brandBadgeText: brand.badgeTag,
    layers: [
      {
        id: `text-${Date.now()}-title`,
        type: 'text',
        name: 'Título Principal',
        visible: true,
        locked: false,
        opacity: 1,
        x: 0.1, y: 0.12, width: 0.8, height: 0.2, rotation: 0,
        text: brand.defaultPostTitle || 'NOVIDADE NA EQUIPE',
        fontFamily: brand.fontDisplay,
        fontSize: 64,
        color: brand.textPrimary || '#ffffff',
        align: 'center',
        bold: true,
        italic: false,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    ],
  };
}

export function StudioProvider({ children, orgSlug }: { children: React.ReactNode; orgSlug?: string | null }) {
  const { tokens } = useOrganizationBrand();
  const [stage, setStage] = useState<StudioStage>('launcher');
  const [activeTab, setActiveTab] = useState<StudioActiveTab>('images');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioKey>('1:1');
  const [slides, setSlides] = useState<StudioSlide[]>([createDefaultSlide('slide-1', '1:1', tokens)]);
  const [activeSlideId, setActiveSlideId] = useState<string>('slide-1');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [maskModalLayerId, setMaskModalLayerId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [activeDraftSlot, setActiveDraftSlot] = useState<1 | 2 | 3 | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<'none' | 'thirds' | 'golden' | 'diagonals'>('none');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`aurtistic_studio_drafts_${orgSlug || tokens.themeId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setDrafts(parsed.slice(0, 3));
      }
    } catch {}
  }, [orgSlug, tokens.themeId]);

  const activeSlide = slides.find((s) => s.id === activeSlideId) || slides[0];
  const selectedLayer = activeSlide?.layers.find((l) => l.id === selectedLayerId) || null;

  const updateSlide = useCallback((id: string, patch: Partial<StudioSlide>) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const adaptFormatTo = useCallback((newAspect: AspectRatioKey) => {
    setAspectRatio(newAspect);
    setSlides((prev) => prev.map((s) => ({ ...s, aspectRatio: newAspect })));
  }, []);

  const addSlide = useCallback(() => {
    const newSlide = { ...createDefaultSlide(`slide-${Date.now()}`, aspectRatio, tokens), title: `Tela ${slides.length + 1}` };
    setSlides((prev) => [...prev, newSlide]);
    setActiveSlideId(newSlide.id);
  }, [slides.length, aspectRatio, tokens]);

  const removeSlide = useCallback((id: string) => {
    setSlides((prev) => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((s) => s.id !== id);
      setActiveSlideId(filtered[0].id);
      return filtered;
    });
  }, []);

  const addLayer = useCallback((layer: StudioLayer) => {
    updateSlide(activeSlide.id, { layers: [...activeSlide.layers, layer] });
    setSelectedLayerId(layer.id);
  }, [activeSlide, updateSlide]);

  const updateLayer = useCallback((id: string, patch: Partial<StudioLayer>) => {
    updateSlide(activeSlide.id, {
      layers: activeSlide.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as StudioLayer) : l)),
    });
  }, [activeSlide, updateSlide]);

  const removeLayer = useCallback((id: string) => {
    updateSlide(activeSlide.id, { layers: activeSlide.layers.filter((l) => l.id !== id) });
    if (selectedLayerId === id) setSelectedLayerId(null);
  }, [activeSlide, selectedLayerId, updateSlide]);

  const reorderLayers = useCallback((from: number, to: number) => {
    const next = [...activeSlide.layers];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateSlide(activeSlide.id, { layers: next });
  }, [activeSlide, updateSlide]);

  const duplicateLayerWithMaskOnTop = useCallback((id: string) => {
    const target = activeSlide.layers.find((l) => l.id === id);
    if (!target) return;
    const copy: StudioLayer = {
      ...target,
      id: `${target.id}-mask-top-${Date.now()}`,
      name: `${target.name} (Máscara Topo)`,
      filters: { ...(target.filters || { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0 }), targetMaskAreaOnly: true, isCutoutMask: true },
    };
    updateSlide(activeSlide.id, { layers: [...activeSlide.layers, copy] });
    setSelectedLayerId(copy.id);
  }, [activeSlide, updateSlide]);

  const fillEventPlaceholders = useCallback((replacements: Record<string, string>) => {
    setSlides((prev) => prev.map((slide) => ({
      ...slide,
      layers: slide.layers.map((layer) => {
        if (layer.type !== 'text') return layer;
        let txt = (layer as StudioTextLayer).text;
        for (const [k, v] of Object.entries(replacements)) {
          if (v) txt = txt.split(`{${k}}`).join(v);
        }
        return { ...layer, text: txt } as StudioTextLayer;
      }),
    })));
  }, []);

  const loadDraft = useCallback((draft: StudioDraft) => {
    setSlides(draft.slides);
    setAspectRatio(draft.aspectRatio);
    setActiveDraftSlot(draft.slotIndex);
    if (draft.slides[0]) setActiveSlideId(draft.slides[0].id);
    setSelectedLayerId(null);
    setStage('editor');
  }, []);

  const loadTemplate = useCallback((tpl: StudioTemplate) => {
    setSlides(tpl.slides);
    setAspectRatio(tpl.aspectRatio);
    setActiveDraftSlot(null);
    if (tpl.slides[0]) setActiveSlideId(tpl.slides[0].id);
    setSelectedLayerId(null);
    setStage('editor');
  }, []);

  const saveCurrentToDraftSlot = useCallback((slot: 1 | 2 | 3, title?: string) => {
    const newDraft: StudioDraft = {
      id: `draft-slot-${slot}`,
      slotIndex: slot,
      title: title || `Rascunho ${slot} - ${new Date().toLocaleDateString('pt-BR')}`,
      aspectRatio,
      updatedAt: new Date().toISOString(),
      slides,
    };
    setDrafts((prev) => {
      const filtered = prev.filter((d) => d.slotIndex !== slot);
      const updated = [...filtered, newDraft].sort((a, b) => a.slotIndex - b.slotIndex).slice(0, 3);
      try {
        localStorage.setItem(`aurtistic_studio_drafts_${orgSlug || tokens.themeId}`, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setActiveDraftSlot(slot);
  }, [aspectRatio, slides, orgSlug, tokens.themeId]);

  const resetToBlank = useCallback((aspect: AspectRatioKey) => {
    setAspectRatio(aspect);
    const blank = createDefaultSlide(`slide-${Date.now()}`, aspect, tokens);
    setSlides([blank]);
    setActiveSlideId(blank.id);
    setSelectedLayerId(null);
    setActiveDraftSlot(null);
    setStage('editor');
  }, [tokens]);

  return (
    <StudioContext.Provider
      value={{
        orgSlug, stage, setStage, activeTab, setActiveTab, aspectRatio, setAspectRatio, adaptFormatTo,
        slides, activeSlideId, activeSlide, setActiveSlideId, selectedLayerId, selectedLayer, setSelectedLayerId,
        updateSlide, addSlide, removeSlide, addLayer, updateLayer, removeLayer, reorderLayers, duplicateLayerWithMaskOnTop,
        drafts, activeDraftSlot, loadDraft, loadTemplate, saveCurrentToDraftSlot, resetToBlank,
        maskModalLayerId, setMaskModalLayerId, activeOverlay, setActiveOverlay, fillEventPlaceholders,
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
