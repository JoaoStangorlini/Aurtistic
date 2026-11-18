// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
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

type EditionCategory = 'crop' | 'light' | 'color' | 'bokeh' | 'filters' | 'guides' | 'seals';

const CATEGORY_TABS: { id: EditionCategory; label: string; icon: string }[] = [
  { id: 'crop', label: 'Corte', icon: 'crop_rotate' },
  { id: 'light', label: 'Luz', icon: 'brightness_6' },
  { id: 'color', label: 'Cor', icon: 'palette' },
  { id: 'bokeh', label: 'Bokeh', icon: 'blur_on' },
  { id: 'filters', label: 'Filtros', icon: 'auto_awesome' },
  { id: 'guides', label: 'Guias', icon: 'architecture' },
  { id: 'seals', label: 'Selos', icon: 'verified' },
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

export function StudioEditionPanel() {
  const {
    activeSlide,
    selectedLayer,
    updateLayer,
    addLayer,
    updateSlide,
    centerLayerOnStage,
    resetLayerTransform,
    activeOverlay,
    setActiveOverlay,
    goldenSpiralQuadrant,
    setGoldenSpiralQuadrant,
    showCompositionTips,
    setShowCompositionTips,
  } = useStudio();
  const { tokens } = useOrganizationBrand();

  const [category, setCategory] = useState<EditionCategory>('crop');
  const [splitPicker, setSplitPicker] = useState<'highlights' | 'shadows' | 'seal' | null>(null);

  const currentFilters: StudioLayerFilterConfig =
    selectedLayer?.filters || activeSlide.globalFilters || DEFAULT_FILTERS;

  const handleFilterChange = <K extends keyof StudioLayerFilterConfig>(
    key: K,
    value: StudioLayerFilterConfig[K]
  ) => {
    const updated = { ...currentFilters, [key]: value };
    if (selectedLayer) {
      updateLayer(selectedLayer.id, { filters: updated });
    } else {
      updateSlide(activeSlide.id, { globalFilters: updated });
    }
  };

  const handleResetFilters = () => {
    if (selectedLayer) {
      updateLayer(selectedLayer.id, { filters: { ...DEFAULT_FILTERS } });
    } else {
      updateSlide(activeSlide.id, { globalFilters: { ...DEFAULT_FILTERS } });
    }
  };

  const selectedImage = selectedLayer?.type === 'image' ? (selectedLayer as StudioImageLayer) : null;
  const selectedLogo = selectedLayer?.type === 'logo' ? (selectedLayer as StudioLogoLayer) : null;

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
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-hover/50 border border-border-subtle text-xs">
        <div>
          <span className="text-fg-muted block text-[9px] uppercase font-bold tracking-wider">Alvo da Edição</span>
          <span className="font-bold text-fg truncate max-w-[180px] block">
            {selectedLayer ? `Camada: ${selectedLayer.name}` : 'Tela Global (Slide)'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleResetFilters}
          className="px-2.5 py-1 rounded-lg text-fg-muted hover:text-fg bg-surface border border-border-subtle text-[11px] font-bold flex items-center gap-1 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
          <span>Resetar</span>
        </button>
      </div>

      {/* Navegação das 7 Categorias (24 Submenus) */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setCategory(t.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              category === t.id
                ? 'bg-[#FFCC00] text-black shadow-xs'
                : 'bg-surface-hover/60 text-fg-secondary hover:text-fg border border-border-subtle'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* CATEGORIA A: Transformação, Geometria & Corte (Submenus 1–4 / 15 op) */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {category === 'crop' && (
        <div className="space-y-3 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          {!selectedLayer ? (
            <p className="text-fg-muted text-center py-4">Selecione uma camada no palco para ajustar geometria, rotação ou recorte.</p>
          ) : (
            <>
              {/* Submenu 1: Rotação & Orientação */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 1 • Rotação & Orientação</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-fg-secondary w-16">Ângulo:</span>
                  <input
                    type="range" min={-180} max={180} value={selectedLayer.rotation || 0}
                    onChange={(e) => updateLayer(selectedLayer.id, { rotation: Number(e.target.value) })}
                    className="flex-1 studio-range-slider"
                  />
                  <span className="font-mono text-[11px] font-bold w-10 text-right">{selectedLayer.rotation || 0}°</span>
                </div>
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
              </div>

              {/* Submenu 2: Alinhamento & Posição */}
              <div className="space-y-1.5 pt-2 border-t border-border-subtle">
                <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 2 • Alinhamento & Posição</span>
                <div className="grid grid-cols-3 gap-1">
                  <button type="button" onClick={() => updateLayer(selectedLayer.id, { x: 0 })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Esq</button>
                  <button type="button" onClick={() => updateLayer(selectedLayer.id, { x: (1 - selectedLayer.width) / 2 })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Centro H</button>
                  <button type="button" onClick={() => updateLayer(selectedLayer.id, { x: 1 - selectedLayer.width })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Dir</button>
                  <button type="button" onClick={() => updateLayer(selectedLayer.id, { y: 0 })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Topo</button>
                  <button type="button" onClick={() => centerLayerOnStage(selectedLayer.id)} className="py-1 rounded-lg bg-[#FFCC00]/20 text-amber-600 dark:text-[#FFCC00] border border-amber-400/40 text-[10px] font-bold cursor-pointer">Centralizar</button>
                  <button type="button" onClick={() => updateLayer(selectedLayer.id, { y: 1 - selectedLayer.height })} className="py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer hover:border-[#FFCC00]">Base</button>
                </div>
                {selectedImage && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => updateLayer(selectedImage.id, { aspectFit: 'contain' })}
                      className={`py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                        selectedImage.aspectFit === 'contain' ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle'
                      }`}
                    >
                      Encaixar (Fit)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateLayer(selectedImage.id, { aspectFit: 'cover' })}
                      className={`py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                        selectedImage.aspectFit !== 'contain' ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle'
                      }`}
                    >
                      Preencher (Cover)
                    </button>
                  </div>
                )}
              </div>

              {/* Submenu 3: Distorção & Perspectiva */}
              <div className="space-y-1.5 pt-2 border-t border-border-subtle">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">Submenu 3 • Distorção (Skew)</span>
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
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-fg-muted block">Skew X: {selectedLayer.skewX || 0}°</span>
                    <input
                      type="range" min={-45} max={45} value={selectedLayer.skewX || 0}
                      onChange={(e) => updateLayer(selectedLayer.id, { skewX: Number(e.target.value) })}
                      className="w-full studio-range-slider"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-fg-muted block">Skew Y: {selectedLayer.skewY || 0}°</span>
                    <input
                      type="range" min={-45} max={45} value={selectedLayer.skewY || 0}
                      onChange={(e) => updateLayer(selectedLayer.id, { skewY: Number(e.target.value) })}
                      className="w-full studio-range-slider"
                    />
                  </div>
                </div>
              </div>

              {/* Submenu 4: Recorte Livre / Crop Box (Guardrail 6: Separado de Frame Clip) */}
              {selectedImage && (
                <div className="space-y-2 pt-2 border-t border-border-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">Submenu 4 • Recorte (Crop Box)</span>
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
                  </div>
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
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-fg-muted block">Largura Corte: {Math.round((selectedImage.cropRect?.width ?? selectedImage.cropWidth ?? 1) * 100)}%</span>
                      <input
                        type="range" min={0.2} max={1} step={0.02}
                        value={selectedImage.cropRect?.width ?? selectedImage.cropWidth ?? 1}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          const base = selectedImage.cropRect || { active: true, aspect: 'free' as const, x: 0, y: 0, width: 1, height: 1 };
                          updateLayer(selectedImage.id, {
                            cropRect: { ...base, active: true, width: w, x: Math.min(base.x, 1 - w) },
                          });
                        }}
                        className="w-full studio-range-slider"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-muted block">Altura Corte: {Math.round((selectedImage.cropRect?.height ?? selectedImage.cropHeight ?? 1) * 100)}%</span>
                      <input
                        type="range" min={0.2} max={1} step={0.02}
                        value={selectedImage.cropRect?.height ?? selectedImage.cropHeight ?? 1}
                        onChange={(e) => {
                          const h = Number(e.target.value);
                          const base = selectedImage.cropRect || { active: true, aspect: 'free' as const, x: 0, y: 0, width: 1, height: 1 };
                          updateLayer(selectedImage.id, {
                            cropRect: { ...base, active: true, height: h, y: Math.min(base.y, 1 - h) },
                          });
                        }}
                        className="w-full studio-range-slider"
                      />
                    </div>
                  </div>
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
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* CATEGORIA B: Tom & Iluminação (Submenus 5–7 / 12 opções)              */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {category === 'light' && (
        <div className="space-y-2.5 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 5 • Exposição & Luz Básica</span>
          {[
            { key: 'exposure' as const, label: 'Exposição', min: -100, max: 100, def: 0, unit: '' },
            { key: 'brightness' as const, label: 'Brilho', min: 20, max: 200, def: 100, unit: '%' },
            { key: 'contrast' as const, label: 'Contraste', min: 20, max: 200, def: 100, unit: '%' },
            { key: 'luminance' as const, label: 'Luminância', min: -100, max: 100, def: 0, unit: '' },
          ].map((s) => (
            <div key={s.key}>
              <div className="flex justify-between text-[11px]">
                <span>{s.label}</span>
                <span className="font-mono font-bold">{currentFilters[s.key] ?? s.def}{s.unit}</span>
              </div>
              <input
                type="range" min={s.min} max={s.max} value={currentFilters[s.key] ?? s.def}
                onChange={(e) => handleFilterChange(s.key, Number(e.target.value))}
                className="w-full studio-range-slider"
              />
            </div>
          ))}

          <div className="pt-2 border-t border-border-subtle space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 6 • Dinâmica Tonal</span>
            {[
              { key: 'highlights' as const, label: 'Destaques (Highlights)', min: -100, max: 100 },
              { key: 'shadows' as const, label: 'Sombras (Shadows)', min: -100, max: 100 },
              { key: 'whitePoint' as const, label: 'Ponto Branco', min: -50, max: 50 },
              { key: 'blackPoint' as const, label: 'Ponto Negro', min: -50, max: 50 },
            ].map((s) => (
              <div key={s.key}>
                <div className="flex justify-between text-[11px]">
                  <span>{s.label}</span>
                  <span className="font-mono font-bold">{currentFilters[s.key] ?? 0}</span>
                </div>
                <input
                  type="range" min={s.min} max={s.max} value={currentFilters[s.key] ?? 0}
                  onChange={(e) => handleFilterChange(s.key, Number(e.target.value))}
                  className="w-full studio-range-slider"
                />
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-border-subtle space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 7 • Curvas Tonais Bézier</span>
            <StudioCurveEditor
              curves={currentFilters.curves}
              onChange={(nextCurves) => handleFilterChange('curves', nextCurves)}
            />
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* CATEGORIA C: Cor, Matiz & Temperatura (Submenus 8–10 / 11 opções)     */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {category === 'color' && (
        <div className="space-y-2.5 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">Submenu 8 • Balanço & Temperatura</span>
            <button
              type="button"
              onClick={() => {
                const updated = { ...currentFilters, temperature: 0, tint: 0 };
                if (selectedLayer) updateLayer(selectedLayer.id, { filters: updated });
                else updateSlide(activeSlide.id, { globalFilters: updated });
              }}
              className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-[10px] font-bold hover:border-[#FFCC00] cursor-pointer"
            >
              Auto WB
            </button>
          </div>
          <div>
            <div className="flex justify-between text-[11px]">
              <span>Temperatura (Azul ⇄ Amarelo)</span>
              <span className="font-mono font-bold">{currentFilters.temperature ?? 0}</span>
            </div>
            <input
              type="range" min={-50} max={50} value={currentFilters.temperature ?? 0}
              onChange={(e) => handleFilterChange('temperature', Number(e.target.value))}
              className="w-full studio-range-slider"
            />
          </div>
          <div>
            <div className="flex justify-between text-[11px]">
              <span>Matiz (Verde ⇄ Magenta)</span>
              <span className="font-mono font-bold">{currentFilters.tint ?? 0}</span>
            </div>
            <input
              type="range" min={-50} max={50} value={currentFilters.tint ?? 0}
              onChange={(e) => handleFilterChange('tint', Number(e.target.value))}
              className="w-full studio-range-slider"
            />
          </div>

          <div className="pt-2 border-t border-border-subtle space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">Submenu 9 • Intensidade Cromática</span>
              <button
                type="button"
                onClick={() => {
                  const nextBw = !currentFilters.bwDesaturate;
                  const updated = { ...currentFilters, bwDesaturate: nextBw, grayscale: nextBw ? 100 : 0 };
                  if (selectedLayer) updateLayer(selectedLayer.id, { filters: updated });
                  else updateSlide(activeSlide.id, { globalFilters: updated });
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                  currentFilters.bwDesaturate ? 'bg-[#FFCC00] text-black' : 'bg-surface border border-border-subtle'
                }`}
              >
                P&B (B&W)
              </button>
            </div>
            <div>
              <div className="flex justify-between text-[11px]">
                <span>Saturação Global</span>
                <span className="font-mono font-bold">{currentFilters.saturation ?? 100}%</span>
              </div>
              <input
                type="range" min={0} max={200} value={currentFilters.saturation ?? 100}
                onChange={(e) => handleFilterChange('saturation', Number(e.target.value))}
                className="w-full studio-range-slider"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px]">
                <span>Vibração Seletiva</span>
                <span className="font-mono font-bold">{currentFilters.vibrance ?? 0}</span>
              </div>
              <input
                type="range" min={-100} max={100} value={currentFilters.vibrance ?? 0}
                onChange={(e) => handleFilterChange('vibrance', Number(e.target.value))}
                className="w-full studio-range-slider"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border-subtle space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 10 • Colorir & Split Toning</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-fg-muted block">Hue Tint: {currentFilters.hueTint ?? 0}°</span>
                <input
                  type="range" min={0} max={360} value={currentFilters.hueTint ?? 0}
                  onChange={(e) => handleFilterChange('hueTint', Number(e.target.value))}
                  className="w-full studio-range-slider"
                />
              </div>
              <div>
                <span className="text-[10px] text-fg-muted block">Intensidade: {currentFilters.hueTintIntensity ?? 0}%</span>
                <input
                  type="range" min={0} max={100} value={currentFilters.hueTintIntensity ?? 0}
                  onChange={(e) => handleFilterChange('hueTintIntensity', Number(e.target.value))}
                  className="w-full studio-range-slider"
                />
              </div>
            </div>
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
            <div>
              <div className="flex justify-between text-[11px]">
                <span>Balanço de Transição</span>
                <span className="font-mono font-bold">{currentFilters.splitBalance ?? 0}</span>
              </div>
              <input
                type="range" min={-50} max={50} value={currentFilters.splitBalance ?? 0}
                onChange={(e) => handleFilterChange('splitBalance', Number(e.target.value))}
                className="w-full studio-range-slider"
              />
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* CATEGORIA D: Foco, Bokeh & Atmosfera Óptica (Submenus 11–12 / 7 op)   */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {category === 'bokeh' && (
        <div className="space-y-2.5 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">Submenu 11 • Desfoque Bokeh de Fundo</span>
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
          <div>
            <div className="flex justify-between text-[11px]">
              <span>Raio do Desfoque</span>
              <span className="font-mono font-bold">{currentFilters.bokehRadius ?? 18}px</span>
            </div>
            <input
              type="range" min={0} max={50} value={currentFilters.bokehRadius ?? 18}
              onChange={(e) => handleFilterChange('bokehRadius', Number(e.target.value))}
              className="w-full studio-range-slider"
            />
          </div>
          <div>
            <div className="flex justify-between text-[11px]">
              <span>Transição Feathering</span>
              <span className="font-mono font-bold">{currentFilters.bokehFeather ?? 60}px</span>
            </div>
            <input
              type="range" min={0} max={120} value={currentFilters.bokehFeather ?? 60}
              onChange={(e) => handleFilterChange('bokehFeather', Number(e.target.value))}
              className="w-full studio-range-slider"
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['radial', 'linear'] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                onClick={() => handleFilterChange('bokehShape', shape)}
                className={`py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                  (currentFilters.bokehShape || 'radial') === shape ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle'
                }`}
              >
                {shape === 'radial' ? 'Focal Radial' : 'Focal Linear'}
              </button>
            ))}
          </div>

          {/* Controle de Ponto Focal Móvel (Xf, Yf) */}
          <div className="p-2 rounded-xl bg-surface border border-border-subtle space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-fg-secondary">Ponto Focal (Xf, Yf)</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const updated = { ...currentFilters, bokehFocalX: 0.5, bokehFocalY: 0.5 };
                    if (selectedLayer) updateLayer(selectedLayer.id, { filters: updated });
                    else updateSlide(activeSlide.id, { globalFilters: updated });
                  }}
                  className="px-1.5 py-0.5 rounded bg-surface-hover text-[9px] font-bold cursor-pointer"
                >
                  Centro
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = { ...currentFilters, bokehFocalX: 0.333, bokehFocalY: 0.333 };
                    if (selectedLayer) updateLayer(selectedLayer.id, { filters: updated });
                    else updateSlide(activeSlide.id, { globalFilters: updated });
                  }}
                  className="px-1.5 py-0.5 rounded bg-surface-hover text-[9px] font-bold cursor-pointer"
                >
                  Terço NW
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-fg-muted block">Xf: {Math.round((currentFilters.bokehFocalX ?? 0.5) * 100)}%</span>
                <input
                  type="range" min={0} max={1} step={0.01} value={currentFilters.bokehFocalX ?? 0.5}
                  onChange={(e) => handleFilterChange('bokehFocalX', Number(e.target.value))}
                  className="w-full studio-range-slider"
                />
              </div>
              <div>
                <span className="text-[10px] text-fg-muted block">Yf: {Math.round((currentFilters.bokehFocalY ?? 0.5) * 100)}%</span>
                <input
                  type="range" min={0} max={1} step={0.01} value={currentFilters.bokehFocalY ?? 0.5}
                  onChange={(e) => handleFilterChange('bokehFocalY', Number(e.target.value))}
                  className="w-full studio-range-slider"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border-subtle space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 12 • Textura Óptica & Claridade</span>
            {[
              { key: 'grain' as const, label: 'Ruído / Granulação de Filme' },
              { key: 'vignette' as const, label: 'Vinheta Circular' },
              { key: 'clarity' as const, label: 'Nitidez / Claridade' },
            ].map((s) => (
              <div key={s.key}>
                <div className="flex justify-between text-[11px]">
                  <span>{s.label}</span>
                  <span className="font-mono font-bold">{currentFilters[s.key] ?? 0}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={currentFilters[s.key] ?? 0}
                  onChange={(e) => handleFilterChange(s.key, Number(e.target.value))}
                  className="w-full studio-range-slider"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* CATEGORIA E: Filtros Artísticos & Mistura (Submenus 13–14 / 10 op)    */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {category === 'filters' && (
        <div className="space-y-3 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 13 • Galeria de Filtros (8 Presets)</span>
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

          <div className="pt-2 border-t border-border-subtle space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 14 • Mixagem do Filtro</span>
            <div>
              <div className="flex justify-between text-[11px]">
                <span>Opacidade do Filtro</span>
                <span className="font-mono font-bold">{currentFilters.filterOpacity ?? 100}%</span>
              </div>
              <input
                type="range" min={0} max={100} value={currentFilters.filterOpacity ?? 100}
                onChange={(e) => handleFilterChange('filterOpacity', Number(e.target.value))}
                className="w-full studio-range-slider"
              />
            </div>
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
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* CATEGORIA H: Guias Geométricas & Áurea (Submenus 21–22 / Fonte Única) */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {category === 'guides' && (
        <div className="space-y-3 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">
            Submenus 21 & 22 • Guias & Proporção Áurea (Sincronizado com Barra Superior)
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'none' as const, label: 'Sem Guia' },
              { id: 'thirds' as const, label: 'Regra dos Terços' },
              { id: 'diagonals' as const, label: 'Diagonais & Centro' },
              { id: 'safe_area' as const, label: 'Safe Area' },
              { id: 'golden_spiral' as const, label: 'Espiral Fibonacci (φ)' },
              { id: 'golden_grid' as const, label: 'Grade Harmônica φ' },
            ].map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveOverlay(g.id)}
                className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold cursor-pointer ${
                  activeOverlay === g.id ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          {activeOverlay === 'golden_spiral' && (
            <button
              type="button"
              onClick={() => setGoldenSpiralQuadrant((q) => ((q + 1) % 4) as 0 | 1 | 2 | 3)}
              className="w-full py-1.5 rounded-xl bg-amber-400/20 text-amber-600 dark:text-[#FFCC00] border border-amber-400/40 font-bold text-[11px] cursor-pointer"
            >
              Girar Quadrante da Espiral (Atual: Q{goldenSpiralQuadrant + 1})
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCompositionTips(!showCompositionTips)}
            className={`w-full py-1.5 rounded-xl border font-bold text-[11px] cursor-pointer ${
              showCompositionTips ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'bg-surface border-border-subtle'
            }`}
          >
            Dicas de Equilíbrio Visual: {showCompositionTips ? 'ATIVAS' : 'INATIVAS'}
          </button>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* CATEGORIA I: Selos Oficiais & Marca d'Água (Submenus 23–24 / 5 op)    */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {category === 'seals' && (
        <div className="space-y-3 p-3 rounded-2xl bg-surface-hover/30 border border-border-subtle text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 23 • Selo Oficial da Organização</span>
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
              <div>
                <div className="flex justify-between text-[11px]">
                  <span>Tamanho do Selo</span>
                  <span className="font-mono font-bold">{Math.round(selectedLogo.width * 100)}%</span>
                </div>
                <input
                  type="range" min={0.08} max={0.5} step={0.01} value={selectedLogo.width}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    updateLayer(selectedLogo.id, { width: w, height: w * 0.6 });
                  }}
                  className="w-full studio-range-slider"
                />
              </div>
              <div className="pt-2 border-t border-border-subtle space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">Submenu 24 • Marca d&apos;Água & Transparência</span>
                <div>
                  <div className="flex justify-between text-[11px]">
                    <span>Opacidade do Selo</span>
                    <span className="font-mono font-bold">{Math.round((selectedLogo.opacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0.1} max={1} step={0.02} value={selectedLogo.opacity ?? 1}
                    onChange={(e) => updateLayer(selectedLogo.id, { opacity: Number(e.target.value) })}
                    className="w-full studio-range-slider"
                  />
                </div>
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
              </div>
            </>
          ) : (
            <p className="text-[11px] text-fg-muted text-center">Clique acima para inserir o selo ou selecione um selo já no palco.</p>
          )}
        </div>
      )}
    </div>
  );
}
