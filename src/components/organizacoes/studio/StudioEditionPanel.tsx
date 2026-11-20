// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import {
  DEFAULT_FILTERS,
  type ArtisticFilterPreset,
  type StudioBlendMode,
  type StudioImageLayer,
  type StudioLayerFilterConfig,
  type StudioLogoLayer,
} from './types';
import { StudioCurveEditor } from './StudioCurveEditor';
import { StudioProColorPicker } from './StudioProColorPicker';
import { StudioLiveSlider } from './StudioLiveSlider';
import { StudioHelpTooltip } from './StudioHelpTooltip';

type EditionCategory =
  | 'recorte'
  | 'geometria'
  | 'luz'
  | 'tons'
  | 'curvas'
  | 'temperatura'
  | 'saturacao'
  | 'tonalizacao'
  | 'bokeh'
  | 'textura'
  | 'filtros'
  | 'selos';

const CATEGORY_TABS: { id: EditionCategory; label: string; icon: string }[] = [
  { id: 'recorte', label: 'Recorte', icon: 'crop' },
  { id: 'geometria', label: 'Geometria', icon: 'crop_rotate' },
  { id: 'luz', label: 'Luz', icon: 'brightness_6' },
  { id: 'tons', label: 'Tons', icon: 'tonality' },
  { id: 'curvas', label: 'Curvas', icon: 'show_chart' },
  { id: 'temperatura', label: 'Temperatura', icon: 'thermostat' },
  { id: 'saturacao', label: 'Saturação', icon: 'palette' },
  { id: 'tonalizacao', label: 'Tonalização', icon: 'gradient' },
  { id: 'bokeh', label: 'Foco & Bokeh', icon: 'blur_on' },
  { id: 'textura', label: 'Textura', icon: 'grain' },
  { id: 'filtros', label: 'Filtros', icon: 'auto_awesome' },
  { id: 'selos', label: 'Selos', icon: 'verified' },
];

const ARTISTIC_PRESETS: { id: ArtisticFilterPreset; label: string; swatch: string }[] = [
  { id: 'original', label: 'Original', swatch: 'linear-gradient(135deg,#64748b,#94a3b8)' },
  { id: 'labdiv-clean', label: 'LabDiv Clean', swatch: 'linear-gradient(135deg,#1F9FCF,#FFCC00)' },
  { id: 'quantum-cyan', label: 'Física Cyan', swatch: 'linear-gradient(135deg,#0ea5e9,#0284c7)' },
  { id: 'tri-x-mono', label: 'Tri-X Mono', swatch: 'linear-gradient(135deg,#18181b,#d4d4d8)' },
  { id: 'sepia-vintage', label: 'Sépia Vintage', swatch: 'linear-gradient(135deg,#78350f,#d97706)' },
  { id: 'matrix-hs', label: 'Matrix HS', swatch: 'linear-gradient(135deg,#064e3b,#00FF66)' },
  { id: 'nature-editorial', label: 'Nature Editorial', swatch: 'linear-gradient(135deg,#15803d,#fbbf24)' },
  { id: 'dark-moody', label: 'Dark Moody', swatch: 'linear-gradient(135deg,#0f172a,#334155)' },
];

interface SingleSliderOption {
  key: string;
  id: string;
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  helpKey?: string;
  onChange: (val: number) => void;
}

function SingleSliderChipStrip({
  options,
  focusedKey,
  onSelectKey,
}: {
  options: SingleSliderOption[];
  focusedKey: string | null;
  onSelectKey: (key: string | null) => void;
}) {
  const activeOpt = options.find((o) => o.key === focusedKey) || null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
        {options.map((opt) => {
          const isFocused = opt.key === focusedKey;
          const isModified = Math.abs(opt.value - opt.defaultValue) > 0.001;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSelectKey(isFocused ? null : opt.key)}
              className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 border ${
                isFocused
                  ? 'bg-[#FFCC00] text-black border-[#FFCC00] shadow-xs'
                  : isModified
                    ? 'bg-amber-500/12 text-fg border-amber-500/40 hover:border-[#FFCC00]'
                    : 'bg-surface text-fg-secondary border-border-subtle hover:text-fg hover:border-[#FFCC00]/50'
              }`}
            >
              <span>{opt.label}</span>
              <span className={`font-mono text-[10px] ${isFocused ? 'text-black/80' : 'text-fg-muted'}`}>
                {opt.value}{opt.unit || ''}
              </span>
              {isModified && !isFocused && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {activeOpt && (
        <div className="p-2 rounded-xl bg-surface border border-border-subtle space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">
              Ajustando: {activeOpt.label}
            </span>
            <div className="flex items-center gap-1">
              {Math.abs(activeOpt.value - activeOpt.defaultValue) > 0.001 && (
                <button
                  type="button"
                  onClick={() => activeOpt.onChange(activeOpt.defaultValue)}
                  title="Resetar parâmetro para o padrão"
                  className="px-1.5 py-0.5 rounded-md bg-surface-hover text-[10px] font-bold text-fg-secondary hover:text-[#FFCC00] cursor-pointer"
                >
                  ↺
                </button>
              )}
              <button
                type="button"
                onClick={() => onSelectKey(null)}
                title="Recolher controle"
                className="px-1.5 py-0.5 rounded-md bg-surface-hover text-[10px] font-bold text-fg-muted hover:text-fg cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
          <StudioLiveSlider
            id={activeOpt.id}
            label={activeOpt.label}
            helpKey={activeOpt.helpKey}
            value={activeOpt.value}
            min={activeOpt.min}
            max={activeOpt.max}
            step={activeOpt.step}
            unit={activeOpt.unit}
            onChange={activeOpt.onChange}
          />
        </div>
      )}
    </div>
  );
}

export function StudioEditionPanel() {
  const {
    activeSlide,
    selectedLayer,
    updateLayer,
    addLayer,
    updateSlide,
    slides,
    applyFiltersToAllSlides,
    centerLayerOnStage,
    resetLayerTransform,
  } = useStudio();
  const { tokens } = useOrganizationBrand();

  const [category, setCategory] = useState<EditionCategory>('luz');
  const [focusedParamKey, setFocusedParamKey] = useState<string | null>(null);
  const [splitPicker, setSplitPicker] = useState<'highlights' | 'shadows' | 'seal' | null>(null);
  const [customPresets, setCustomPresets] = useState<Array<{ id: string; name: string; filters: StudioLayerFilterConfig }>>([]);
  const [recipeName, setRecipeName] = useState('');
  const [appliedAllNotice, setAppliedAllNotice] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('aurtistic_studio_custom_presets_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCustomPresets(parsed);
      }
    } catch {
      // Ignora erro de localStorage
    }
  }, []);

  const persistCustomPresets = (next: Array<{ id: string; name: string; filters: StudioLayerFilterConfig }>) => {
    setCustomPresets(next);
    try {
      localStorage.setItem('aurtistic_studio_custom_presets_v1', JSON.stringify(next));
    } catch {
      // Ignora erro de quota
    }
  };

  const handleSaveCustomPreset = () => {
    const clean = recipeName.trim() || `Receita ${customPresets.length + 1}`;
    const next = [
      { id: `preset-${Date.now()}`, name: clean, filters: structuredClone(currentFilters) },
      ...customPresets,
    ].slice(0, 12);
    persistCustomPresets(next);
    setRecipeName('');
  };

  // Alvo fotográfico: se a camada selecionada não for imagem, direciona para a foto principal do slide (ou globalFilters)
  const selectedImage = selectedLayer?.type === 'image' ? (selectedLayer as StudioImageLayer) : null;
  const photoTargetImage: StudioImageLayer | null =
    selectedImage ||
    (activeSlide.layers.find((l) => l.type === 'image' && l.visible) as StudioImageLayer | undefined) ||
    (activeSlide.layers.find((l) => l.type === 'image') as StudioImageLayer | undefined) ||
    null;
  const selectedLogo = selectedLayer?.type === 'logo' ? (selectedLayer as StudioLogoLayer) : null;

  const currentFilters: StudioLayerFilterConfig =
    photoTargetImage?.filters || activeSlide.globalFilters || DEFAULT_FILTERS;

  const handleApplyCustomPreset = (filters: StudioLayerFilterConfig) => {
    const cloned = structuredClone(filters);
    if (photoTargetImage) {
      updateLayer(photoTargetImage.id, { filters: cloned });
    } else {
      updateSlide(activeSlide.id, { globalFilters: cloned });
    }
  };

  const handleFilterChange = <K extends keyof StudioLayerFilterConfig>(
    key: K,
    value: StudioLayerFilterConfig[K]
  ) => {
    const updated = { ...currentFilters, [key]: value };
    if (photoTargetImage) {
      updateLayer(photoTargetImage.id, { filters: updated });
    } else {
      updateSlide(activeSlide.id, { globalFilters: updated });
    }
  };

  const handleResetFilters = () => {
    if (photoTargetImage) {
      updateLayer(photoTargetImage.id, { filters: { ...DEFAULT_FILTERS } });
    } else {
      updateSlide(activeSlide.id, { globalFilters: { ...DEFAULT_FILTERS } });
    }
  };

  const modifiedMap = useMemo<Record<EditionCategory, boolean>>(() => {
    const f = currentFilters;
    return {
      recorte: Boolean(
        selectedImage &&
          ((selectedImage.cropWidth ?? 1) < 0.99 ||
            (selectedImage.cropHeight ?? 1) < 0.99 ||
            selectedImage.cropRect?.active)
      ),
      geometria: Boolean(
        selectedLayer &&
          ((selectedLayer.rotation || 0) !== 0 ||
            selectedLayer.flipH ||
            selectedLayer.flipV ||
            (selectedLayer.skewX || 0) !== 0 ||
            (selectedLayer.skewY || 0) !== 0)
      ),
      luz:
        (f.exposure ?? 0) !== 0 ||
        (f.brightness ?? 100) !== 100 ||
        (f.contrast ?? 100) !== 100 ||
        (f.luminance ?? 0) !== 0,
      tons:
        (f.highlights ?? 0) !== 0 ||
        (f.shadows ?? 0) !== 0 ||
        (f.whitePoint ?? 0) !== 0 ||
        (f.blackPoint ?? 0) !== 0,
      curvas: Boolean(f.curves && Object.keys(f.curves).length > 0),
      temperatura: (f.temperature ?? 0) !== 0 || (f.tint ?? 0) !== 0,
      saturacao:
        Boolean(f.bwDesaturate) ||
        (f.saturation ?? 100) !== 100 ||
        (f.vibrance ?? 0) !== 0,
      tonalizacao:
        (f.hueTintIntensity ?? 0) > 0 || (f.splitBalance ?? 0) !== 0,
      bokeh: Boolean(f.bokehEnabled),
      textura: (f.grain ?? 0) > 0 || (f.vignette ?? 0) > 0 || (f.clarity ?? 0) > 0,
      filtros:
        Boolean(f.artisticFilter && f.artisticFilter !== 'original') ||
        (f.blendMode !== undefined && f.blendMode !== 'source-over'),
      selos: activeSlide.layers.some((l) => l.type === 'logo' && l.visible),
    };
  }, [currentFilters, selectedImage, selectedLayer, activeSlide.layers]);

  const handleInsertOfficialSeal = () => {
    const sealLayer: StudioLogoLayer = {
      id: `seal-${Date.now()}`,
      type: 'logo',
      name: `Selo ${tokens.badgeTag || 'Oficial'}`,
      preset: tokens.themeId === 'show-da-fisica' ? 'show-da-fisica-tricolor' : 'org-logo',
      preserveAspect: true,
      sealPosition: 'top-right',
      monochrome: false,
      visible: true,
      locked: false,
      opacity: 0.95,
      x: 0.76,
      y: 0.04,
      width: 0.2,
      height: 0.12,
      rotation: 0,
    };
    addLayer(sealLayer);
  };

  const applySealPosition = (pos: NonNullable<StudioLogoLayer['sealPosition']>) => {
    if (!selectedLogo) return;
    const coords: Record<NonNullable<StudioLogoLayer['sealPosition']>, { x: number; y: number }> = {
      'top-left': { x: 0.04, y: 0.04 },
      'top-right': { x: Math.max(0.04, 0.96 - selectedLogo.width), y: 0.04 },
      'bottom-left': { x: 0.04, y: Math.max(0.04, 0.96 - selectedLogo.height) },
      'bottom-right': { x: Math.max(0.04, 0.96 - selectedLogo.width), y: Math.max(0.04, 0.96 - selectedLogo.height) },
      center: { x: (1 - selectedLogo.width) / 2, y: (1 - selectedLogo.height) / 2 },
    };
    updateLayer(selectedLogo.id, { sealPosition: pos, ...coords[pos] });
  };

  return (
    <div className="space-y-3 text-fg">
      {/* Alvo + Reset */}
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-surface-hover/50 border border-border-subtle text-xs">
        <div className="min-w-0">
          <span className="text-fg-muted block text-[9px] uppercase font-bold tracking-wider">Alvo da Edição</span>
          <span className="font-bold text-fg truncate max-w-[210px] block">
            {photoTargetImage
              ? selectedImage
                ? `Foto: ${photoTargetImage.name}`
                : `Foto principal (${photoTargetImage.name})`
              : 'Slide global'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleResetFilters}
          className="px-2.5 py-1 rounded-lg text-fg-muted hover:text-fg bg-surface border border-border-subtle text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
          <span>Resetar</span>
        </button>
      </div>

      {/* Navegação dos 12 Subperfis Enxutos (sticky no topo ao rolar) */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-md pt-0.5 pb-1 -mx-1 px-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {CATEGORY_TABS.map((t) => {
          const isModified = modifiedMap[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setCategory(t.id);
                setFocusedParamKey(null);
              }}
              className={`relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                category === t.id
                  ? 'bg-[#FFCC00] text-black shadow-xs'
                  : 'bg-surface-hover/60 text-fg-secondary hover:text-fg border border-border-subtle'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
              <span>{t.label}</span>
              {isModified && (
                <span
                  aria-label="Subperfil modificado"
                  className={`w-1.5 h-1.5 rounded-full ${
                    category === t.id ? 'bg-black/70' : 'bg-amber-400'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 1. Recorte */}
      {category === 'recorte' && (
        <div className="space-y-2.5 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
              <span>Recorte (Crop Box)</span>
              <StudioHelpTooltip helpKey="edition.recorte" />
            </span>
            {selectedImage && (
              <button
                type="button"
                onClick={() =>
                  updateLayer(selectedImage.id, {
                    cropRect: {
                      active: !selectedImage.cropRect?.active,
                      aspect: selectedImage.cropRect?.aspect || 'free',
                      x: selectedImage.cropX ?? 0,
                      y: selectedImage.cropY ?? 0,
                      width: selectedImage.cropWidth ?? 1,
                      height: selectedImage.cropHeight ?? 1,
                    },
                  })
                }
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer ${
                  selectedImage.cropRect?.active ? 'bg-[#FFCC00] text-black' : 'bg-surface border border-border-subtle'
                }`}
              >
                {selectedImage.cropRect?.active ? 'Crop Ativo' : 'Ativar Crop Box'}
              </button>
            )}
          </div>

          {!selectedImage ? (
            <p className="text-fg-muted text-center py-4">Selecione uma imagem no palco para recortar.</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-1">
                {(['free', '1:1', '4:5', '16:9'] as const).map((asp) => (
                  <button
                    key={asp}
                    type="button"
                    onClick={() => {
                      const base = selectedImage.cropRect || { active: true, aspect: asp, x: 0, y: 0, width: 1, height: 1 };
                      const w = asp === 'free' ? base.width : asp === '16:9' ? 1 : asp === '4:5' ? 0.8 : 0.85;
                      const h = asp === 'free' ? base.height : asp === '16:9' ? 0.5625 : asp === '4:5' ? 1 : 0.85;
                      updateLayer(selectedImage.id, {
                        cropRect: { ...base, active: true, aspect: asp, x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h },
                      });
                    }}
                    className={`py-1 rounded text-[10px] font-bold cursor-pointer ${
                      selectedImage.cropRect?.aspect === asp ? 'bg-[#FFCC00] text-black' : 'bg-surface border border-border-subtle'
                    }`}
                  >
                    {asp === 'free' ? 'Livre' : asp}
                  </button>
                ))}
              </div>
              <SingleSliderChipStrip
                focusedKey={focusedParamKey}
                onSelectKey={setFocusedParamKey}
                options={[
                  {
                    key: 'crop-w',
                    id: 'crop-width',
                    label: 'Largura Corte',
                    value: Math.round((selectedImage.cropRect?.width ?? selectedImage.cropWidth ?? 1) * 100),
                    defaultValue: 100,
                    min: 20,
                    max: 100,
                    step: 2,
                    unit: '%',
                    onChange: (val) => {
                      const w = Number((val / 100).toFixed(2));
                      const base = selectedImage.cropRect || { active: true, aspect: 'free' as const, x: 0, y: 0, width: 1, height: 1 };
                      updateLayer(selectedImage.id, {
                        cropRect: { ...base, active: true, width: w, x: Math.min(base.x, 1 - w) },
                      });
                    },
                  },
                  {
                    key: 'crop-h',
                    id: 'crop-height',
                    label: 'Altura Corte',
                    value: Math.round((selectedImage.cropRect?.height ?? selectedImage.cropHeight ?? 1) * 100),
                    defaultValue: 100,
                    min: 20,
                    max: 100,
                    step: 2,
                    unit: '%',
                    onChange: (val) => {
                      const h = Number((val / 100).toFixed(2));
                      const base = selectedImage.cropRect || { active: true, aspect: 'free' as const, x: 0, y: 0, width: 1, height: 1 };
                      updateLayer(selectedImage.id, {
                        cropRect: { ...base, active: true, height: h, y: Math.min(base.y, 1 - h) },
                      });
                    },
                  },
                ]}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedImage.cropRect) return;
                    updateLayer(selectedImage.id, {
                      cropX: selectedImage.cropRect.x,
                      cropY: selectedImage.cropRect.y,
                      cropWidth: selectedImage.cropRect.width,
                      cropHeight: selectedImage.cropRect.height,
                      cropRect: { ...selectedImage.cropRect, active: false },
                    });
                  }}
                  className="flex-1 py-1.5 rounded-xl bg-[#FFCC00] text-black font-bold text-[11px] cursor-pointer"
                >
                  Aplicar Corte
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateLayer(selectedImage.id, {
                      cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1,
                      cropRect: { active: false, aspect: 'free', x: 0, y: 0, width: 1, height: 1 },
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-surface border border-border-subtle text-[11px] font-bold cursor-pointer"
                >
                  Resetar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. Geometria */}
      {category === 'geometria' && (
        <div className="space-y-3 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
              <span>Geometria & Alinhamento</span>
              <StudioHelpTooltip helpKey="edition.geometria" />
            </span>
            {selectedLayer && (
              <button
                type="button"
                onClick={() => {
                  resetLayerTransform(selectedLayer.id);
                  updateLayer(selectedLayer.id, { skewX: 0, skewY: 0, flipH: false, flipV: false });
                }}
                className="text-[10px] text-amber-500 font-bold cursor-pointer hover:underline"
              >
                Reset Geométrico
              </button>
            )}
          </div>

          {!selectedLayer ? (
            <p className="text-fg-muted text-center py-4">Selecione uma camada no palco para girar, alinhar ou inclinar.</p>
          ) : (
            <>
              <SingleSliderChipStrip
                focusedKey={focusedParamKey}
                onSelectKey={setFocusedParamKey}
                options={[
                  {
                    key: 'angle',
                    id: 'crop-rotation',
                    label: 'Ângulo',
                    value: selectedLayer.rotation || 0,
                    defaultValue: 0,
                    min: -180,
                    max: 180,
                    unit: '°',
                    onChange: (val) => updateLayer(selectedLayer.id, { rotation: val }),
                  },
                  {
                    key: 'skew-x',
                    id: 'crop-skew-x',
                    label: 'Skew X',
                    value: selectedLayer.skewX || 0,
                    defaultValue: 0,
                    min: -45,
                    max: 45,
                    unit: '°',
                    onChange: (val) => updateLayer(selectedLayer.id, { skewX: val }),
                  },
                  {
                    key: 'skew-y',
                    id: 'crop-skew-y',
                    label: 'Skew Y',
                    value: selectedLayer.skewY || 0,
                    defaultValue: 0,
                    min: -45,
                    max: 45,
                    unit: '°',
                    onChange: (val) => updateLayer(selectedLayer.id, { skewY: val }),
                  },
                ]}
              />
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    let next = (selectedLayer.rotation || 0) + 90;
                    if (next > 180) next -= 360;
                    updateLayer(selectedLayer.id, { rotation: next });
                  }}
                  className="py-1.5 rounded-lg bg-surface border border-border-subtle font-bold text-[10px] hover:border-[#FFCC00] cursor-pointer"
                >
                  +90°
                </button>
                <button
                  type="button"
                  onClick={() => updateLayer(selectedLayer.id, { flipH: !selectedLayer.flipH })}
                  className={`py-1.5 rounded-lg border font-bold text-[10px] cursor-pointer ${
                    selectedLayer.flipH ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle'
                  }`}
                >
                  Flip H
                </button>
                <button
                  type="button"
                  onClick={() => updateLayer(selectedLayer.id, { flipV: !selectedLayer.flipV })}
                  className={`py-1.5 rounded-lg border font-bold text-[10px] cursor-pointer ${
                    selectedLayer.flipV ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle'
                  }`}
                >
                  Flip V
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 pt-0.5">
                <button type="button" onClick={() => updateLayer(selectedLayer.id, { x: 0 })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Esq</button>
                <button type="button" onClick={() => updateLayer(selectedLayer.id, { x: (1 - selectedLayer.width) / 2 })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Centro H</button>
                <button type="button" onClick={() => updateLayer(selectedLayer.id, { x: 1 - selectedLayer.width })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Dir</button>
                <button type="button" onClick={() => updateLayer(selectedLayer.id, { y: 0 })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Topo</button>
                <button type="button" onClick={() => centerLayerOnStage(selectedLayer.id)} className="py-1 rounded-lg bg-[#FFCC00]/20 text-amber-600 dark:text-[#FFCC00] border border-amber-400/40 text-[10px] font-bold cursor-pointer">Centralizar</button>
                <button type="button" onClick={() => updateLayer(selectedLayer.id, { y: 1 - selectedLayer.height })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Base</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 3. Luz */}
      {category === 'luz' && (
        <div className="space-y-2 p-2.5 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <span>Luz & Exposição</span>
            <StudioHelpTooltip helpKey="edition.luz" />
          </span>
          <SingleSliderChipStrip
            focusedKey={focusedParamKey}
            onSelectKey={setFocusedParamKey}
            options={[
              { key: 'exposure', id: 'light-exposure', label: 'Exposição', value: currentFilters.exposure ?? 0, defaultValue: 0, min: -100, max: 100, helpKey: 'slider.exposure', onChange: (val) => handleFilterChange('exposure', val) },
              { key: 'brightness', id: 'light-brightness', label: 'Brilho', value: currentFilters.brightness ?? 100, defaultValue: 100, min: 20, max: 200, unit: '%', onChange: (val) => handleFilterChange('brightness', val) },
              { key: 'contrast', id: 'light-contrast', label: 'Contraste', value: currentFilters.contrast ?? 100, defaultValue: 100, min: 20, max: 200, unit: '%', helpKey: 'slider.contrast', onChange: (val) => handleFilterChange('contrast', val) },
              { key: 'luminance', id: 'light-luminance', label: 'Luminância', value: currentFilters.luminance ?? 0, defaultValue: 0, min: -100, max: 100, onChange: (val) => handleFilterChange('luminance', val) },
            ]}
          />
        </div>
      )}

      {/* 4. Tons */}
      {category === 'tons' && (
        <div className="space-y-2 p-2.5 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <span>Dinâmica Tonal</span>
            <StudioHelpTooltip helpKey="edition.tons" />
          </span>
          <SingleSliderChipStrip
            focusedKey={focusedParamKey}
            onSelectKey={setFocusedParamKey}
            options={[
              { key: 'highlights', id: 'tonal-highlights', label: 'Destaques', value: currentFilters.highlights ?? 0, defaultValue: 0, min: -100, max: 100, helpKey: 'slider.highlights', onChange: (val) => handleFilterChange('highlights', val) },
              { key: 'shadows', id: 'tonal-shadows', label: 'Sombras', value: currentFilters.shadows ?? 0, defaultValue: 0, min: -100, max: 100, helpKey: 'slider.shadows', onChange: (val) => handleFilterChange('shadows', val) },
              { key: 'whitePoint', id: 'tonal-whitePoint', label: 'Ponto Branco', value: currentFilters.whitePoint ?? 0, defaultValue: 0, min: -50, max: 50, onChange: (val) => handleFilterChange('whitePoint', val) },
              { key: 'blackPoint', id: 'tonal-blackPoint', label: 'Ponto Negro', value: currentFilters.blackPoint ?? 0, defaultValue: 0, min: -50, max: 50, onChange: (val) => handleFilterChange('blackPoint', val) },
            ]}
          />
        </div>
      )}

      {/* 5. Curvas */}
      {category === 'curvas' && (
        <div className="space-y-2 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <span>Curvas Tonais Bézier</span>
            <StudioHelpTooltip helpKey="edition.curvas" />
          </span>
          <StudioCurveEditor
            curves={currentFilters.curves}
            onChange={(nextCurves) => handleFilterChange('curves', nextCurves)}
          />
        </div>
      )}

      {/* 6. Temperatura */}
      {category === 'temperatura' && (
        <div className="space-y-2 p-2.5 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
              <span>Temperatura & Matiz</span>
              <StudioHelpTooltip helpKey="edition.temperatura" />
            </span>
            <button
              type="button"
              onClick={() => {
                const updated = { ...currentFilters, temperature: 0, tint: 0 };
                if (photoTargetImage) updateLayer(photoTargetImage.id, { filters: updated });
                else updateSlide(activeSlide.id, { globalFilters: updated });
              }}
              className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-[10px] font-bold hover:border-[#FFCC00] cursor-pointer"
            >
              Auto WB
            </button>
          </div>
          <SingleSliderChipStrip
            focusedKey={focusedParamKey}
            onSelectKey={setFocusedParamKey}
            options={[
              { key: 'temperature', id: 'color-temperature', label: 'Temperatura', value: currentFilters.temperature ?? 0, defaultValue: 0, min: -50, max: 50, helpKey: 'slider.temperature', onChange: (val) => handleFilterChange('temperature', val) },
              { key: 'tint', id: 'color-tint', label: 'Matiz', value: currentFilters.tint ?? 0, defaultValue: 0, min: -50, max: 50, helpKey: 'slider.tint', onChange: (val) => handleFilterChange('tint', val) },
            ]}
          />
        </div>
      )}

      {/* 7. Saturação */}
      {category === 'saturacao' && (
        <div className="space-y-2 p-2.5 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
              <span>Saturação & Vibração</span>
              <StudioHelpTooltip helpKey="edition.saturacao" />
            </span>
            <button
              type="button"
              onClick={() => {
                const nextBw = !currentFilters.bwDesaturate;
                const updated = { ...currentFilters, bwDesaturate: nextBw, grayscale: nextBw ? 100 : 0 };
                if (photoTargetImage) updateLayer(photoTargetImage.id, { filters: updated });
                else updateSlide(activeSlide.id, { globalFilters: updated });
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                currentFilters.bwDesaturate ? 'bg-[#FFCC00] text-black' : 'bg-surface border border-border-subtle'
              }`}
            >
              P&B (B&W)
            </button>
          </div>
          <SingleSliderChipStrip
            focusedKey={focusedParamKey}
            onSelectKey={setFocusedParamKey}
            options={[
              { key: 'saturation', id: 'color-saturation', label: 'Saturação', value: currentFilters.saturation ?? 100, defaultValue: 100, min: 0, max: 200, unit: '%', helpKey: 'slider.saturation', onChange: (val) => handleFilterChange('saturation', val) },
              { key: 'vibrance', id: 'color-vibrance', label: 'Vibração', value: currentFilters.vibrance ?? 0, defaultValue: 0, min: -100, max: 100, helpKey: 'slider.vibrance', onChange: (val) => handleFilterChange('vibrance', val) },
            ]}
          />
        </div>
      )}

      {/* 8. Tonalização */}
      {category === 'tonalizacao' && (
        <div className="space-y-2 p-2.5 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <span>Colorir & Split Toning</span>
            <StudioHelpTooltip helpKey="edition.tonalizacao" />
          </span>
          <SingleSliderChipStrip
            focusedKey={focusedParamKey}
            onSelectKey={setFocusedParamKey}
            options={[
              { key: 'hueTint', id: 'color-hue-tint', label: 'Hue Tint', value: currentFilters.hueTint ?? 0, defaultValue: 0, min: 0, max: 360, unit: '°', onChange: (val) => handleFilterChange('hueTint', val) },
              { key: 'hueTintIntensity', id: 'color-hue-intensity', label: 'Intensidade', value: currentFilters.hueTintIntensity ?? 0, defaultValue: 0, min: 0, max: 100, unit: '%', onChange: (val) => handleFilterChange('hueTintIntensity', val) },
              { key: 'splitBalance', id: 'color-split-balance', label: 'Balanço', value: currentFilters.splitBalance ?? 0, defaultValue: 0, min: -50, max: 50, onChange: (val) => handleFilterChange('splitBalance', val) },
            ]}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSplitPicker((p) => (p === 'highlights' ? null : 'highlights'))}
              className="flex-1 flex items-center gap-1.5 p-1.5 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer"
            >
              <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: currentFilters.splitHighlightsColor || '#FFCC00' }} />
              <span>Destaques</span>
            </button>
            <button
              type="button"
              onClick={() => setSplitPicker((p) => (p === 'shadows' ? null : 'shadows'))}
              className="flex-1 flex items-center gap-1.5 p-1.5 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer"
            >
              <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: currentFilters.splitShadowsColor || '#1F9FCF' }} />
              <span>Sombras</span>
            </button>
          </div>
          {splitPicker === 'highlights' && (
            <StudioProColorPicker
              color={currentFilters.splitHighlightsColor || '#FFCC00'}
              onChange={(hex) => handleFilterChange('splitHighlightsColor', hex)}
              label="Split Toning • Destaques"
            />
          )}
          {splitPicker === 'shadows' && (
            <StudioProColorPicker
              color={currentFilters.splitShadowsColor || '#1F9FCF'}
              onChange={(hex) => handleFilterChange('splitShadowsColor', hex)}
              label="Split Toning • Sombras"
            />
          )}
        </div>
      )}

      {/* 9. Foco & Bokeh */}
      {category === 'bokeh' && (
        <div className="space-y-2 p-2.5 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
              <span>Desfoque Bokeh</span>
              <StudioHelpTooltip helpKey="edition.bokeh" />
            </span>
            <button
              type="button"
              onClick={() => handleFilterChange('bokehEnabled', !currentFilters.bokehEnabled)}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer ${
                currentFilters.bokehEnabled ? 'bg-[#FFCC00] text-black' : 'bg-surface border border-border-subtle'
              }`}
            >
              {currentFilters.bokehEnabled ? 'Bokeh ON' : 'Ativar Bokeh'}
            </button>
          </div>
          <SingleSliderChipStrip
            focusedKey={focusedParamKey}
            onSelectKey={setFocusedParamKey}
            options={[
              { key: 'bokehRadius', id: 'bokeh-radius', label: 'Raio', value: currentFilters.bokehRadius ?? 18, defaultValue: 18, min: 0, max: 50, unit: 'px', helpKey: 'slider.blur', onChange: (val) => handleFilterChange('bokehRadius', val) },
              { key: 'bokehFeather', id: 'bokeh-feather', label: 'Transição', value: currentFilters.bokehFeather ?? 60, defaultValue: 60, min: 0, max: 120, unit: 'px', onChange: (val) => handleFilterChange('bokehFeather', val) },
              { key: 'bokehFocalX', id: 'bokeh-focal-x', label: 'Foco X', value: Math.round((currentFilters.bokehFocalX ?? 0.5) * 100), defaultValue: 50, min: 0, max: 100, unit: '%', onChange: (val) => handleFilterChange('bokehFocalX', Number((val / 100).toFixed(2))) },
              { key: 'bokehFocalY', id: 'bokeh-focal-y', label: 'Foco Y', value: Math.round((currentFilters.bokehFocalY ?? 0.5) * 100), defaultValue: 50, min: 0, max: 100, unit: '%', onChange: (val) => handleFilterChange('bokehFocalY', Number((val / 100).toFixed(2))) },
            ]}
          />
          <div className="grid grid-cols-4 gap-1">
            {(['radial', 'linear'] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                onClick={() => handleFilterChange('bokehShape', shape)}
                className={`py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                  (currentFilters.bokehShape || 'radial') === shape ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle'
                }`}
              >
                {shape === 'radial' ? 'Radial' : 'Linear'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const updated = { ...currentFilters, bokehFocalX: 0.5, bokehFocalY: 0.5 };
                if (photoTargetImage) updateLayer(photoTargetImage.id, { filters: updated });
                else updateSlide(activeSlide.id, { globalFilters: updated });
              }}
              className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer"
            >
              Centro
            </button>
            <button
              type="button"
              onClick={() => {
                const updated = { ...currentFilters, bokehFocalX: 0.333, bokehFocalY: 0.333 };
                if (photoTargetImage) updateLayer(photoTargetImage.id, { filters: updated });
                else updateSlide(activeSlide.id, { globalFilters: updated });
              }}
              className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer"
            >
              Terço NW
            </button>
          </div>
        </div>
      )}

      {/* 10. Textura */}
      {category === 'textura' && (
        <div className="space-y-2 p-2.5 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <span>Textura Óptica & Vinheta</span>
            <StudioHelpTooltip helpKey="edition.textura" />
          </span>
          <SingleSliderChipStrip
            focusedKey={focusedParamKey}
            onSelectKey={setFocusedParamKey}
            options={[
              { key: 'clarity', id: 'texture-clarity', label: 'Nitidez', value: currentFilters.clarity ?? 0, defaultValue: 0, min: 0, max: 100, unit: '%', helpKey: 'slider.clarity', onChange: (val) => handleFilterChange('clarity', val) },
              { key: 'grain', id: 'texture-grain', label: 'Granulação', value: currentFilters.grain ?? 0, defaultValue: 0, min: 0, max: 100, unit: '%', helpKey: 'slider.grain', onChange: (val) => handleFilterChange('grain', val) },
              { key: 'vignette', id: 'texture-vignette', label: 'Vinheta', value: currentFilters.vignette ?? 0, defaultValue: 0, min: 0, max: 100, unit: '%', helpKey: 'slider.vignette', onChange: (val) => handleFilterChange('vignette', val) },
            ]}
          />
        </div>
      )}

      {/* 11. Filtros */}
      {category === 'filtros' && (
        <div className="space-y-3 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <span>Filtros & Blend</span>
            <StudioHelpTooltip helpKey="edition.filtros" />
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {ARTISTIC_PRESETS.map((p) => {
              const active = (currentFilters.artisticFilter || 'original') === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleFilterChange('artisticFilter', p.id)}
                  className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                    active ? 'border-[#FFCC00] bg-[#FFCC00]/15 font-bold' : 'border-border-subtle bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <span className="w-full h-6 rounded-lg block border border-white/15" style={{ background: p.swatch }} />
                  <span className="text-[9px] truncate max-w-full">{p.label}</span>
                </button>
              );
            })}
          </div>
          <SingleSliderChipStrip
            focusedKey={focusedParamKey}
            onSelectKey={setFocusedParamKey}
            options={[
              { key: 'filterOpacity', id: 'filter-opacity', label: 'Opacidade do Filtro', value: currentFilters.filterOpacity ?? 100, defaultValue: 100, min: 0, max: 100, unit: '%', onChange: (val) => handleFilterChange('filterOpacity', val) },
            ]}
          />
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                { id: 'source-over', label: 'Normal' },
                { id: 'multiply', label: 'Multiply' },
                { id: 'screen', label: 'Screen' },
                { id: 'overlay', label: 'Overlay' },
                { id: 'soft-light', label: 'Soft Light' },
              ] as { id: StudioBlendMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleFilterChange('blendMode', m.id)}
                className={`py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                  (currentFilters.blendMode || 'source-over') === m.id
                    ? 'bg-[#FFCC00] text-black border-[#FFCC00]'
                    : 'bg-surface border-border-subtle'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* S5: Minhas Receitas Próprias (localStorage) */}
          <div className="pt-2 border-t border-border-subtle space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">
              Minhas Receitas
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="Nome da receita..."
                maxLength={28}
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-surface border border-border-subtle text-[11px] text-fg focus:outline-none focus:border-[#FFCC00]"
              />
              <button
                type="button"
                onClick={handleSaveCustomPreset}
                className="shrink-0 px-2.5 py-1.5 rounded-xl bg-[#FFCC00] text-black text-[10px] font-black hover:bg-[#FFD633] cursor-pointer"
              >
                Salvar
              </button>
            </div>
            {customPresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-[10px]"
                  >
                    <button
                      type="button"
                      onClick={() => handleApplyCustomPreset(preset.filters)}
                      className="font-bold text-fg hover:text-[#FFCC00] cursor-pointer"
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover receita ${preset.name}`}
                      onClick={() => persistCustomPresets(customPresets.filter((p) => p.id !== preset.id))}
                      className="text-fg-muted hover:text-red-400 cursor-pointer leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* S5: Aplicar ajuste a todos os slides do carrossel */}
          <button
            type="button"
            onClick={() => {
              applyFiltersToAllSlides(currentFilters, photoTargetImage ? 'layer' : 'global');
              setAppliedAllNotice(true);
              setTimeout(() => setAppliedAllNotice(false), 2200);
            }}
            className="w-full py-2 px-3 rounded-xl border border-[#FFCC00]/40 bg-[#FFCC00]/10 hover:bg-[#FFCC00]/20 text-[11px] font-bold text-[#FFCC00] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
            <span>
              {appliedAllNotice
                ? `Aplicado aos ${slides.length} slides!`
                : `Aplicar este ajuste a todos os slides (${slides.length})`}
            </span>
          </button>
        </div>
      )}

      {/* 12. Selos */}
      {category === 'selos' && (
        <div className="space-y-3 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <span>Selos & Marca d&apos;Água</span>
            <StudioHelpTooltip helpKey="edition.selos" />
          </span>
          <button
            type="button"
            onClick={handleInsertOfficialSeal}
            className="w-full py-2 px-3 rounded-xl bg-[#FFCC00] text-black font-bold text-xs hover:bg-[#FFD633] flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">verified</span>
            <span>Inserir Selo Oficial em 1-Clique</span>
          </button>

          {selectedLogo ? (
            <>
              <div className="grid grid-cols-3 gap-1">
                {(['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => applySealPosition(pos)}
                    className={`py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                      selectedLogo.sealPosition === pos ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              <SingleSliderChipStrip
                focusedKey={focusedParamKey}
                onSelectKey={setFocusedParamKey}
                options={[
                  {
                    key: 'sealWidth',
                    id: 'seal-width',
                    label: 'Tamanho',
                    value: Math.round(selectedLogo.width * 100),
                    defaultValue: 20,
                    min: 8,
                    max: 50,
                    step: 1,
                    unit: '%',
                    onChange: (val) => {
                      const w = Number((val / 100).toFixed(2));
                      updateLayer(selectedLogo.id, { width: w, height: w * 0.6 });
                    },
                  },
                  {
                    key: 'sealOpacity',
                    id: 'seal-opacity',
                    label: 'Opacidade',
                    value: Math.round((selectedLogo.opacity ?? 1) * 100),
                    defaultValue: 95,
                    min: 10,
                    max: 100,
                    step: 2,
                    unit: '%',
                    onChange: (val) => updateLayer(selectedLogo.id, { opacity: Number((val / 100).toFixed(2)) }),
                  },
                ]}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateLayer(selectedLogo.id, { monochrome: !selectedLogo.monochrome })}
                  className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold cursor-pointer ${
                    selectedLogo.monochrome ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle'
                  }`}
                >
                  {selectedLogo.monochrome ? 'Modo Monocromático' : 'Colorido Oficial'}
                </button>
                <button
                  type="button"
                  onClick={() => setSplitPicker((p) => (p === 'seal' ? null : 'seal'))}
                  className="px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span className="w-3 h-3 rounded-full border border-border-subtle" style={{ backgroundColor: selectedLogo.tintColor || '#ffffff' }} />
                  <span>Cor</span>
                </button>
              </div>
              {splitPicker === 'seal' && (
                <StudioProColorPicker
                  color={selectedLogo.tintColor || '#ffffff'}
                  onChange={(hex) => updateLayer(selectedLogo.id, { tintColor: hex, monochrome: true })}
                  label="Cor Monocromática do Selo"
                />
              )}
            </>
          ) : (
            <p className="text-[11px] text-fg-muted text-center">Clique acima para inserir o selo ou selecione um selo já no palco.</p>
          )}
        </div>
      )}
    </div>
  );
}
