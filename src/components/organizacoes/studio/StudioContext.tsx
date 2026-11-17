// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AspectRatioKey, StudioStage, StudioActiveTab, StudioSlide, StudioLayer, StudioDraft, StudioTemplate, StudioTextLayer } from './types';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { saveDraftToIdb, getAllDraftsFromIdb, deleteDraftFromIdb, rehydrateDraft } from '@/lib/studio/studio-idb';
import { rehydrateStudioDraftAction } from '@/app/(dashboard)/organizacoes/studio-actions';
import { createDefaultSlide, adaptSlideLayersForAspect } from './studio-helpers';

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
  deleteDraftSlot: (slot: 1 | 2 | 3) => void;
  resetToBlank: (aspect: AspectRatioKey) => void;
  maskModalLayerId: string | null;
  setMaskModalLayerId: (id: string | null) => void;
  activeOverlay: 'none' | 'thirds' | 'golden' | 'diagonals';
  setActiveOverlay: (ov: 'none' | 'thirds' | 'golden' | 'diagonals') => void;
  fillEventPlaceholders: (replacements: Record<string, string>) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

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
    const copy: StudioLayer = { ...target, id: `${target.id}-mask-top-${Date.now()}`, name: `${target.name} (Máscara Topo)`, filters: { ...(target.filters || { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0 }), targetMaskAreaOnly: true, isCutoutMask: true } };
    updateSlide(activeSlide.id, { layers: [...activeSlide.layers, copy] });
    setSelectedLayerId(copy.id);
  }, [activeSlide, updateSlide]);

  const fillEventPlaceholders = useCallback((replacements: Record<string, string>) => {
    setSlides((prev) => prev.map((slide) => ({ ...slide, layers: slide.layers.map((layer) => { if (layer.type !== 'text') return layer; let txt = (layer as StudioTextLayer).text; for (const [k, v] of Object.entries(replacements)) { if (v) txt = txt.split(`{${k}}`).join(v); } return { ...layer, text: txt } as StudioTextLayer; }) })));
  }, []);

  const loadDraft = useCallback((draft: StudioDraft) => {
    const slug = orgSlug || tokens.themeId;
    const local = rehydrateDraft(draft);
    setSlides(local.slides);
    setAspectRatio(local.aspectRatio);
    setActiveDraftSlot(local.slotIndex);
    if (local.slides[0]) setActiveSlideId(local.slides[0].id);
    setSelectedLayerId(null);
    setStage('editor');
    rehydrateStudioDraftAction(draft, slug).then((res) => {
      if (res?.ok && res.draft) setSlides(res.draft.slides);
    }).catch(() => {});
  }, [orgSlug, tokens.themeId]);

  const loadTemplate = useCallback((tpl: StudioTemplate) => {
    setSlides(tpl.slides);
    setAspectRatio(tpl.aspectRatio);
    setActiveDraftSlot(null);
    if (tpl.slides[0]) setActiveSlideId(tpl.slides[0].id);
    setSelectedLayerId(null);
    setStage('editor');
    const slug = orgSlug || tokens.themeId;
    rehydrateStudioDraftAction({ id: tpl.id, slotIndex: 1, title: tpl.title, aspectRatio: tpl.aspectRatio, updatedAt: '', slides: tpl.slides }, slug).then((r) => { if (r?.ok && r.draft) setSlides(r.draft.slides); }).catch(() => {});
  }, [orgSlug, tokens.themeId]);

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
  }, [aspectRatio, slides, orgSlug, tokens.themeId]);

  const deleteDraftSlot = useCallback((slot: 1 | 2 | 3) => {
    deleteDraftFromIdb(slot);
    const slug = orgSlug || tokens.themeId;
    fetch(`/api/studio/drafts?slotIndex=${slot}&orgSlug=${encodeURIComponent(slug)}`, { method: 'DELETE' }).catch(() => {});
    setDrafts((prev) => prev.filter((d) => d.slotIndex !== slot));
    if (activeDraftSlot === slot) setActiveDraftSlot(null);
  }, [activeDraftSlot, orgSlug, tokens.themeId]);

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
        drafts, activeDraftSlot, loadDraft, loadTemplate, saveCurrentToDraftSlot, deleteDraftSlot, resetToBlank,
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
