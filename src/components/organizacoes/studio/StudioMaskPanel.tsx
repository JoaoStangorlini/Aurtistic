// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import { StudioLiveSlider } from './StudioLiveSlider';
import { StudioHelpTooltip } from './StudioHelpTooltip';
import type { StudioImageLayer, StudioMaskPresetConfig } from './types';
import {
  extractBoardOrNotebookWriting2D,
  loadImageElement,
  removeSolidBackground2D,
} from '@/lib/studio/background-removal';

type MaskSubTab = 'shapes' | 'gradient' | 'brush' | 'removeBg';

const MASK_SUBTABS: { id: MaskSubTab; label: string; icon: string; helpKey: string }[] = [
  { id: 'shapes', label: 'Formas', icon: 'shapes', helpKey: 'masks.shapes' },
  { id: 'gradient', label: 'Gradiente', icon: 'gradient', helpKey: 'masks.gradient' },
  { id: 'brush', label: 'Pincel', icon: 'brush', helpKey: 'masks.brush' },
  { id: 'removeBg', label: 'Remover Fundo', icon: 'auto_fix_high', helpKey: 'masks.removeBg' },
];

const SHAPE_PRESETS: { id: StudioMaskPresetConfig['shape']; label: string; icon: string }[] = [
  { id: 'none', label: 'Nenhuma', icon: 'block' },
  { id: 'circle', label: 'Círculo', icon: 'circle' },
  { id: 'oval', label: 'Oval', icon: 'egg' },
  { id: 'rounded', label: 'Arredond.', icon: 'rounded_corner' },
  { id: 'hexagon', label: 'Hexágono', icon: 'hexagon' },
  { id: 'star', label: 'Estrela', icon: 'star' },
  { id: 'arch', label: 'Arco', icon: 'door_front' },
];

export function StudioMaskPanel() {
  const {
    activeSlide,
    selectedLayer,
    updateLayer,
    setMaskModalLayerId,
    duplicateLayerWithMaskOnTop,
    commitHistorySnapshot,
    slides,
  } = useStudio();

  const [subTab, setSubTab] = useState<MaskSubTab>('shapes');
  const [focusedMaskSlider, setFocusedMaskSlider] = useState<string | null>(null);
  const [tolerance, setTolerance] = useState(38);
  const [bgFeather, setBgFeather] = useState(14);
  const [sampleMode, setSampleMode] = useState<'edges' | 'corners'>('edges');
  const [boardMode, setBoardMode] = useState<'dark-board' | 'light-paper'>('dark-board');
  const [boardThreshold, setBoardThreshold] = useState(128);
  const [boardContrast, setBoardContrast] = useState(1.8);
  const [processing, setProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const selectedImage =
    selectedLayer?.type === 'image'
      ? (selectedLayer as StudioImageLayer)
      : (activeSlide.layers.find((l) => l.type === 'image') as StudioImageLayer | undefined) || null;

  if (!selectedImage) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-border-subtle text-center text-xs text-fg-muted">
        Adicione ou selecione uma imagem no palco para aplicar máscaras, gradientes ou remover o fundo.
      </div>
    );
  }

  const preset: StudioMaskPresetConfig = selectedImage.maskPreset || {
    shape: 'none',
    feather: 0,
    invert: false,
    angle: 180,
    position: 50,
  };

  const updatePreset = (patch: Partial<StudioMaskPresetConfig>) => {
    updateLayer(selectedImage.id, {
      maskPreset: { ...preset, ...patch },
    });
  };

  const handleRunSolidBgRemoval = async () => {
    setProcessing(true);
    setStatusMsg(null);
    try {
      const src = selectedImage.resolvedUrl || selectedImage.src;
      const img = await loadImageElement(src);
      const res = removeSolidBackground2D(img, { tolerance, feather: bgFeather, sampleMode });
      if (!res.ok) {
        setStatusMsg(res.error);
      } else {
        commitHistorySnapshot(slides);
        updateLayer(selectedImage.id, {
          maskDataUrl: res.maskDataUrl,
          filters: {
            ...(selectedImage.filters || {
              brightness: 100,
              contrast: 100,
              saturation: 100,
              blur: 0,
              grayscale: 0,
              sepia: 0,
              overlayDark: 0,
              temperature: 0,
              vignette: 0,
            }),
            isCutoutMask: true,
            targetMaskAreaOnly: false,
          },
        });
        setStatusMsg('Fundo sólido removido! Você pode refinar pelo Pincel de Máscara.');
      }
    } catch (err) {
      setStatusMsg((err as Error).message || 'Erro ao processar imagem.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRunBoardExtraction = async () => {
    setProcessing(true);
    setStatusMsg(null);
    try {
      const src = selectedImage.resolvedUrl || selectedImage.src;
      const img = await loadImageElement(src);
      const res = extractBoardOrNotebookWriting2D(img, {
        mode: boardMode,
        threshold: boardThreshold,
        contrast: boardContrast,
      });
      if (!res.ok) {
        setStatusMsg(res.error);
      } else {
        commitHistorySnapshot(slides);
        updateLayer(selectedImage.id, {
          maskDataUrl: res.maskDataUrl,
          filters: {
            ...(selectedImage.filters || {
              brightness: 100,
              contrast: 100,
              saturation: 100,
              blur: 0,
              grayscale: 0,
              sepia: 0,
              overlayDark: 0,
              temperature: 0,
              vignette: 0,
            }),
            isCutoutMask: true,
            targetMaskAreaOnly: false,
          },
        });
        setStatusMsg('Escrita extraída com fundo transparente!');
      }
    } catch (err) {
      setStatusMsg((err as Error).message || 'Erro ao extrair escrita.');
    } finally {
      setProcessing(false);
    }
  };

  const activeMeta = MASK_SUBTABS.find((t) => t.id === subTab)!;

  return (
    <div className="space-y-3 text-fg text-xs">
      {/* 4 Subperfis Enxutos (sticky no topo ao rolar) */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-md pt-0.5 pb-1 -mx-1 px-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {MASK_SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSubTab(t.id);
              setFocusedMaskSlider(null);
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              subTab === t.id
                ? 'bg-[#FFCC00] text-black shadow-xs'
                : 'bg-surface-hover/60 text-fg-secondary hover:text-fg border border-border-subtle'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="p-3 rounded-2xl bg-surface-hover/40 border border-border-subtle space-y-3">
        <div className="flex items-center justify-between border-b border-border-subtle pb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <span>{activeMeta.label}</span>
            <StudioHelpTooltip helpKey={activeMeta.helpKey} />
          </span>
          <span className="text-[10px] text-fg-muted truncate max-w-[140px]">{selectedImage.name}</span>
        </div>

        {/* 1. Formas */}
        {subTab === 'shapes' && (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              {SHAPE_PRESETS.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => updatePreset({ shape: sp.id })}
                  className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 text-[10px] font-bold cursor-pointer transition-all ${
                    preset.shape === sp.id
                      ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                      : 'bg-surface border-border-subtle text-fg-secondary hover:text-fg'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{sp.icon}</span>
                  <span className="truncate max-w-full">{sp.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setFocusedMaskSlider((k) => (k === 'shape-feather' ? null : 'shape-feather'))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap cursor-pointer shrink-0 ${
                  focusedMaskSlider === 'shape-feather'
                    ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                    : 'bg-surface text-fg-secondary border-border-subtle hover:border-[#FFCC00]/50'
                }`}
              >
                <span>Suavidade</span>
                <span className="font-mono text-[10px] opacity-80">{preset.feather || 0}px</span>
              </button>
              <button
                type="button"
                onClick={() => updatePreset({ invert: !preset.invert })}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap cursor-pointer shrink-0 ${
                  preset.invert
                    ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                    : 'bg-surface text-fg-secondary border-border-subtle'
                }`}
              >
                <span>Inverter</span>
              </button>
            </div>
            {focusedMaskSlider === 'shape-feather' && (
              <div className="p-2 rounded-xl bg-surface border border-border-subtle">
                <StudioLiveSlider
                  id="mask-shape-feather"
                  label="Suavidade (Feather)"
                  value={preset.feather || 0}
                  min={0}
                  max={80}
                  unit="px"
                  onChange={(val) => updatePreset({ feather: val })}
                />
              </div>
            )}
          </div>
        )}

        {/* 2. Gradiente */}
        {subTab === 'gradient' && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => updatePreset({ shape: 'linear-fade' })}
                className={`py-1.5 rounded-xl border font-bold text-[11px] cursor-pointer ${
                  preset.shape === 'linear-fade'
                    ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                    : 'bg-surface border-border-subtle text-fg-secondary'
                }`}
              >
                Fade Linear
              </button>
              <button
                type="button"
                onClick={() => updatePreset({ shape: 'radial-fade' })}
                className={`py-1.5 rounded-xl border font-bold text-[11px] cursor-pointer ${
                  preset.shape === 'radial-fade'
                    ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                    : 'bg-surface border-border-subtle text-fg-secondary'
                }`}
              >
                Fade Radial
              </button>
              <button
                type="button"
                onClick={() => updatePreset({ invert: !preset.invert })}
                className={`py-1.5 rounded-xl border font-bold text-[11px] cursor-pointer ${
                  preset.invert
                    ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                    : 'bg-surface border-border-subtle text-fg-secondary'
                }`}
              >
                Inverter
              </button>
            </div>

            {/* Faixa horizontal fina (1 linha) para trocar entre Ângulo, Posição e Suavidade em 1 clique */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {preset.shape === 'linear-fade' && (
                <button
                  type="button"
                  onClick={() => setFocusedMaskSlider((k) => (k === 'grad-angle' ? null : 'grad-angle'))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap cursor-pointer shrink-0 ${
                    focusedMaskSlider === 'grad-angle'
                      ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                      : 'bg-surface text-fg-secondary border-border-subtle'
                  }`}
                >
                  <span>Ângulo</span>
                  <span className="font-mono text-[10px] opacity-80">{preset.angle ?? 180}°</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setFocusedMaskSlider((k) => (k === 'grad-pos' ? null : 'grad-pos'))}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap cursor-pointer shrink-0 ${
                  focusedMaskSlider === 'grad-pos'
                    ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                    : 'bg-surface text-fg-secondary border-border-subtle'
                }`}
              >
                <span>Posição</span>
                <span className="font-mono text-[10px] opacity-80">{preset.position ?? 50}%</span>
              </button>
              <button
                type="button"
                onClick={() => setFocusedMaskSlider((k) => (k === 'grad-feather' ? null : 'grad-feather'))}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap cursor-pointer shrink-0 ${
                  focusedMaskSlider === 'grad-feather'
                    ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                    : 'bg-surface text-fg-secondary border-border-subtle'
                }`}
              >
                <span>Suavidade</span>
                <span className="font-mono text-[10px] opacity-80">{preset.feather || 20}px</span>
              </button>
            </div>

            {focusedMaskSlider === 'grad-angle' && preset.shape === 'linear-fade' && (
              <div className="p-2 rounded-xl bg-surface border border-border-subtle">
                <StudioLiveSlider
                  id="mask-grad-angle"
                  label="Ângulo"
                  value={preset.angle ?? 180}
                  min={0}
                  max={360}
                  unit="°"
                  onChange={(val) => updatePreset({ angle: val })}
                />
              </div>
            )}
            {focusedMaskSlider === 'grad-pos' && (
              <div className="p-2 rounded-xl bg-surface border border-border-subtle">
                <StudioLiveSlider
                  id="mask-grad-pos"
                  label="Posição da Transição"
                  value={preset.position ?? 50}
                  min={10}
                  max={90}
                  unit="%"
                  onChange={(val) => updatePreset({ position: val })}
                />
              </div>
            )}
            {focusedMaskSlider === 'grad-feather' && (
              <div className="p-2 rounded-xl bg-surface border border-border-subtle">
                <StudioLiveSlider
                  id="mask-grad-feather"
                  label="Suavidade"
                  value={preset.feather || 20}
                  min={0}
                  max={80}
                  unit="px"
                  onChange={(val) => updatePreset({ feather: val })}
                />
              </div>
            )}
          </div>
        )}

        {/* 3. Pincel */}
        {subTab === 'brush' && (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setMaskModalLayerId(selectedImage.id)}
              className="w-full py-2.5 rounded-xl bg-[#FFCC00] text-black font-black text-xs hover:bg-[#FFD633] flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">brush</span>
              <span>Abrir Pincel de Máscara</span>
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  updateLayer(selectedImage.id, {
                    filters: {
                      ...(selectedImage.filters || {
                        brightness: 100, contrast: 100, saturation: 100, blur: 0,
                        grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0,
                      }),
                      isCutoutMask: true,
                      targetMaskAreaOnly: false,
                    },
                  })
                }
                className={`py-1.5 rounded-xl border text-[10px] font-bold cursor-pointer ${
                  selectedImage.filters?.isCutoutMask !== false
                    ? 'bg-[#FFCC00]/20 border-[#FFCC00] text-amber-700 dark:text-[#FFCC00]'
                    : 'bg-surface border-border-subtle text-fg-secondary'
                }`}
              >
                Recorte Total
              </button>
              <button
                type="button"
                onClick={() =>
                  updateLayer(selectedImage.id, {
                    filters: {
                      ...(selectedImage.filters || {
                        brightness: 100, contrast: 100, saturation: 100, blur: 0,
                        grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0,
                      }),
                      isCutoutMask: false,
                      targetMaskAreaOnly: true,
                    },
                  })
                }
                className={`py-1.5 rounded-xl border text-[10px] font-bold cursor-pointer ${
                  selectedImage.filters?.isCutoutMask === false
                    ? 'bg-[#FFCC00]/20 border-[#FFCC00] text-amber-700 dark:text-[#FFCC00]'
                    : 'bg-surface border-border-subtle text-fg-secondary'
                }`}
              >
                Edição Seletiva
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => duplicateLayerWithMaskOnTop(selectedImage.id)}
                className="py-1.5 px-2 rounded-xl bg-surface border border-border-subtle hover:border-[#FFCC00] text-[10px] font-bold cursor-pointer"
              >
                Efeito Sanduíche
              </button>
              <button
                type="button"
                onClick={() =>
                  updateLayer(selectedImage.id, {
                    maskDataUrl: undefined,
                    maskPreset: { shape: 'none', feather: 0, invert: false },
                  })
                }
                className="py-1.5 px-2 rounded-xl bg-surface border border-border-subtle hover:border-red-500 text-red-400 text-[10px] font-bold cursor-pointer"
              >
                Limpar Máscara
              </button>
            </div>
          </div>
        )}

        {/* 4. Remover Fundo & Preset Lousa/Caderno */}
        {subTab === 'removeBg' && (
          <div className="space-y-3">
            {/* Fundo Sólido */}
            <div className="p-2.5 rounded-xl bg-surface border border-border-subtle space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">
                  Fundo Sólido Instantâneo
                </span>
                <div className="flex gap-1 text-[9px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSampleMode('edges')}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${sampleMode === 'edges' ? 'bg-[#FFCC00] text-black' : 'bg-surface-hover text-fg-muted'}`}
                  >
                    Bordas
                  </button>
                  <button
                    type="button"
                    onClick={() => setSampleMode('corners')}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${sampleMode === 'corners' ? 'bg-[#FFCC00] text-black' : 'bg-surface-hover text-fg-muted'}`}
                  >
                    Cantos
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setFocusedMaskSlider((k) => (k === 'bg-tol' ? null : 'bg-tol'))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap cursor-pointer shrink-0 ${
                    focusedMaskSlider === 'bg-tol'
                      ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                      : 'bg-surface-hover text-fg-secondary border-border-subtle'
                  }`}
                >
                  <span>Tolerância</span>
                  <span className="font-mono text-[10px] opacity-80">{tolerance}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFocusedMaskSlider((k) => (k === 'bg-feather' ? null : 'bg-feather'))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap cursor-pointer shrink-0 ${
                    focusedMaskSlider === 'bg-feather'
                      ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                      : 'bg-surface-hover text-fg-secondary border-border-subtle'
                  }`}
                >
                  <span>Suavidade</span>
                  <span className="font-mono text-[10px] opacity-80">{bgFeather}</span>
                </button>
              </div>
              {focusedMaskSlider === 'bg-tol' && (
                <StudioLiveSlider
                  id="bg-tolerance"
                  label="Tolerância"
                  value={tolerance}
                  min={5}
                  max={110}
                  transparentScrub={false}
                  onChange={setTolerance}
                />
              )}
              {focusedMaskSlider === 'bg-feather' && (
                <StudioLiveSlider
                  id="bg-feather"
                  label="Suavidade"
                  value={bgFeather}
                  min={0}
                  max={40}
                  transparentScrub={false}
                  onChange={setBgFeather}
                />
              )}
              <button
                type="button"
                disabled={processing}
                onClick={handleRunSolidBgRemoval}
                className="w-full py-2 rounded-xl bg-[#FFCC00] text-black font-bold text-xs hover:bg-[#FFD633] disabled:opacity-50 cursor-pointer"
              >
                {processing ? 'Processando...' : 'Remover Fundo Sólido'}
              </button>
            </div>

            {/* Preset Extrair Escrita de Lousa / Caderno */}
            <div className="p-2.5 rounded-xl bg-surface border border-border-subtle space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">
                Extrair Escrita de Lousa / Caderno
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setBoardMode('dark-board');
                    setBoardThreshold(128);
                  }}
                  className={`py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                    boardMode === 'dark-board' ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface-hover border-border-subtle'
                  }`}
                >
                  Lousa Escura (Giz)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBoardMode('light-paper');
                    setBoardThreshold(155);
                  }}
                  className={`py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                    boardMode === 'light-paper' ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface-hover border-border-subtle'
                  }`}
                >
                  Papel Branco (Caneta)
                </button>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setFocusedMaskSlider((k) => (k === 'board-thresh' ? null : 'board-thresh'))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap cursor-pointer shrink-0 ${
                    focusedMaskSlider === 'board-thresh'
                      ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                      : 'bg-surface-hover text-fg-secondary border-border-subtle'
                  }`}
                >
                  <span>Limiar</span>
                  <span className="font-mono text-[10px] opacity-80">{boardThreshold}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFocusedMaskSlider((k) => (k === 'board-contrast' ? null : 'board-contrast'))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap cursor-pointer shrink-0 ${
                    focusedMaskSlider === 'board-contrast'
                      ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                      : 'bg-surface-hover text-fg-secondary border-border-subtle'
                  }`}
                >
                  <span>Contraste</span>
                  <span className="font-mono text-[10px] opacity-80">{boardContrast}</span>
                </button>
              </div>
              {focusedMaskSlider === 'board-thresh' && (
                <StudioLiveSlider
                  id="board-threshold"
                  label="Limiar"
                  value={boardThreshold}
                  min={40}
                  max={220}
                  transparentScrub={false}
                  onChange={setBoardThreshold}
                />
              )}
              {focusedMaskSlider === 'board-contrast' && (
                <StudioLiveSlider
                  id="board-contrast"
                  label="Contraste"
                  value={boardContrast}
                  min={1}
                  max={3.5}
                  step={0.1}
                  transparentScrub={false}
                  onChange={setBoardContrast}
                />
              )}
              <button
                type="button"
                disabled={processing}
                onClick={handleRunBoardExtraction}
                className="w-full py-2 rounded-xl bg-[#00D4FF] text-black font-bold text-xs hover:brightness-110 disabled:opacity-50 cursor-pointer"
              >
                {processing ? 'Extraindo...' : 'Extrair Escrita Transparente'}
              </button>
            </div>

            {statusMsg && (
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-300 leading-snug">
                {statusMsg}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
