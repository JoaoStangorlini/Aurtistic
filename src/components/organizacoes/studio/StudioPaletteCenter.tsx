// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { getHarmonies, applyPaletteStyle, getContrastRatio, searchPaletteByKeyword } from '@/lib/studio/color-harmony';
import { StudioHelpTooltip } from './StudioHelpTooltip';
import type { StudioDrawingLayer } from './types';

const IDV_COLOR_TAG_RE = /\[([rbgypcw]):([^\]]+)\]/gi;

export function StudioPaletteCenter({ onPickColor }: { onPickColor?: () => void }) {
  const {
    activeSlide,
    selectedLayer,
    updateLayer,
    updateSlide,
    slides,
    commitHistorySnapshot,
    isEyedropperActive,
    startEyedropper,
    cancelEyedropper,
    isBrushMode,
    setBrushColor,
  } = useStudio();
  const { tokens } = useOrganizationBrand();

  const [baseColor, setBaseColor] = useState<string>(tokens.primaryColor || '#00D4FF');
  const [harmonyType, setHarmonyType] = useState<'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'monochromatic'>('analogous');
  const [activeStyle, setActiveStyle] = useState<'normal' | 'neon' | 'pastel' | 'dark' | 'metallic' | 'earthy'>('normal');
  const [targetOverride, setTargetOverride] = useState<'auto' | 'layer' | 'slide-bg' | 'brush'>('auto');
  const [showWheel, setShowWheel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[][]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('aurtistic_studio_fav_palettes');
      if (saved) setFavorites(JSON.parse(saved));
    } catch {}
  }, []);

  const toggleFavorite = (palette: string[]) => {
    try {
      const exists = favorites.some((f) => JSON.stringify(f) === JSON.stringify(palette));
      const next = exists
        ? favorites.filter((f) => JSON.stringify(f) !== JSON.stringify(palette))
        : [palette, ...favorites].slice(0, 5);
      setFavorites(next);
      localStorage.setItem('aurtistic_studio_fav_palettes', JSON.stringify(next));
    } catch {}
  };

  const harmonies = getHarmonies(baseColor);
  let currentPalette = harmonies[harmonyType];

  if (activeStyle !== 'normal') {
    currentPalette = currentPalette.map((c) => applyPaletteStyle(c, activeStyle));
  }

  const searchResults = searchQuery.trim() ? searchPaletteByKeyword(searchQuery) : [];

  const resolvedTarget: 'layer' | 'slide-bg' | 'brush' =
    targetOverride !== 'auto'
      ? targetOverride
      : isBrushMode
        ? 'brush'
        : selectedLayer && selectedLayer.type !== 'image'
          ? 'layer'
          : 'slide-bg';

  const handleApplyColor = (color: string) => {
    setBaseColor(color);
    if (resolvedTarget === 'brush') {
      setBrushColor(color);
      return;
    }
    if (resolvedTarget === 'layer' && selectedLayer && selectedLayer.type !== 'image') {
      commitHistorySnapshot(slides, 'Cor da paleta');
      if (selectedLayer.type === 'text') {
        const hasTags = IDV_COLOR_TAG_RE.test(selectedLayer.text || '');
        IDV_COLOR_TAG_RE.lastIndex = 0;
        updateLayer(selectedLayer.id, {
          color,
          ...(hasTags ? { text: (selectedLayer.text || '').replace(IDV_COLOR_TAG_RE, '$2') } : {}),
        });
      } else if (selectedLayer.type === 'shape') {
        updateLayer(selectedLayer.id, { fillColor: color });
      } else if (selectedLayer.type === 'logo') {
        updateLayer(selectedLayer.id, { tintColor: color, monochrome: true });
      } else if (selectedLayer.type === 'math') {
        updateLayer(selectedLayer.id, { color });
      } else if (selectedLayer.type === 'drawing') {
        const dl = selectedLayer as StudioDrawingLayer;
        updateLayer(dl.id, {
          strokes: dl.strokes.map((s) => (s.brush === 'eraser' ? s : { ...s, color })),
        });
      }
      return;
    }
    commitHistorySnapshot(slides, 'Cor de fundo do slide');
    updateSlide(activeSlide.id, { backgroundColor: color, backgroundGradient: undefined });
  };

  const contrastWhite = getContrastRatio(baseColor, '#ffffff').toFixed(1);
  const isAaa = Number(contrastWhite) >= 7.0;
  const isAa = Number(contrastWhite) >= 4.5;

  const officialSwatches = Array.from(
    new Set([tokens.primaryColor, tokens.secondaryColor, tokens.tertiaryColor, tokens.containerColor, '#FFFFFF', '#07090E'].filter(Boolean))
  );

  return (
    <div className="space-y-2.5 p-2.5 rounded-2xl bg-surface-hover/40 border border-border-subtle text-xs">
      {/* Barra rápida de Alvo + Ações */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-surface rounded-xl p-0.5 border border-border-subtle">
          {(
            [
              { id: 'auto' as const, label: resolvedTarget === 'brush' ? 'Auto (Pincel)' : resolvedTarget === 'layer' ? `Auto (${selectedLayer?.name?.slice(0, 10) || 'Camada'})` : 'Auto (Fundo)' },
              { id: 'layer' as const, label: 'Elemento' },
              { id: 'slide-bg' as const, label: 'Fundo' },
              { id: 'brush' as const, label: 'Pincel' },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTargetOverride(t.id)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                targetOverride === t.id ? 'bg-[#FFCC00] text-black' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${isAaa ? 'bg-emerald-500/20 text-emerald-500' : isAa ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300' : 'bg-red-500/20 text-red-400'}`}>
            {isAaa ? 'AAA' : isAa ? 'AA' : 'Baixo'}
          </span>
          <button
            type="button"
            onClick={async () => {
              if (onPickColor) {
                onPickColor();
                return;
              }
              if (isEyedropperActive) {
                cancelEyedropper();
                return;
              }
              if (typeof window !== 'undefined' && 'EyeDropper' in window) {
                try {
                  const eyeDropper = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
                  const res = await eyeDropper.open();
                  if (res?.sRGBHex) handleApplyColor(res.sRGBHex.toUpperCase());
                  return;
                } catch (err) {
                  if (err instanceof DOMException && err.name === 'AbortError') return;
                }
              }
              startEyedropper((hex) => handleApplyColor(hex));
            }}
            title="Pipeta Eyedropper (I)"
            className={`p-1 rounded-lg cursor-pointer transition-colors ${
              isEyedropperActive ? 'bg-[#FFCC00] text-black' : 'bg-surface border border-border-subtle text-amber-600 dark:text-amber-300'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">colorize</span>
          </button>
          <button
            type="button"
            onClick={() => setShowWheel((v) => !v)}
            className={`px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
              showWheel ? 'bg-[#FFCC00] text-black border-[#FFCC00]' : 'bg-surface border-border-subtle text-fg-secondary'
            }`}
          >
            Seletor
          </button>
        </div>
      </div>

      {/* Seletor expandido apenas sob demanda */}
      {showWheel && (
        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface border border-border-subtle">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(baseColor) ? baseColor : '#00D4FF'}
              onChange={(e) => handleApplyColor(e.target.value)}
              className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
            />
            <span className="font-mono text-fg font-bold">{baseColor.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-1">
            {(['normal', 'neon', 'pastel', 'dark'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setActiveStyle(st)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase cursor-pointer ${
                  activeStyle === st ? 'bg-[#FFCC00] text-black' : 'bg-surface-hover text-fg-muted'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Faixa 1: Identidade Oficial + Neutros */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[9px] font-black uppercase tracking-wider text-fg-muted shrink-0 mr-1">
          IDV:
        </span>
        {officialSwatches.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleApplyColor(c)}
            className="w-6 h-6 rounded-full border border-white/25 hover:scale-110 transition-transform cursor-pointer shrink-0"
            style={{ backgroundColor: c }}
            title={`Aplicar cor IDV ${c}`}
          />
        ))}
      </div>

      {/* Faixa 2: Harmonias OKLCH em chips limpos */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'analogous', label: 'Análoga' },
                { id: 'complementary', label: 'Compl.' },
                { id: 'triadic', label: 'Triádica' },
                { id: 'tetradic', label: 'Tetra' },
                { id: 'monochromatic', label: 'Mono' },
              ] as const
            ).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setHarmonyType(h.id)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap cursor-pointer ${
                  harmonyType === h.id ? 'bg-[#FFCC00] text-black' : 'bg-surface text-fg-muted hover:text-fg'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <StudioHelpTooltip helpKey="palette.harmony" />
            <button
              type="button"
              onClick={() => toggleFavorite(currentPalette)}
              className="p-0.5 text-amber-600 dark:text-amber-300 cursor-pointer"
              title="Favoritar paleta"
            >
              <span className="material-symbols-outlined text-[14px]">
                {favorites.some((f) => JSON.stringify(f) === JSON.stringify(currentPalette)) ? 'star' : 'star_border'}
              </span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {currentPalette.map((color, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleApplyColor(color)}
              className="flex-1 h-7 rounded-xl border border-white/20 shadow-xs hover:scale-105 transition-transform cursor-pointer"
              style={{ backgroundColor: color }}
              title={`Aplicar ${color}`}
            />
          ))}
        </div>
      </div>

      {/* Busca rápida compacta */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar cor (azul, dourado, show)..."
          className="flex-1 min-w-0 px-2.5 py-1 rounded-xl bg-surface border border-border-subtle text-[11px] text-fg placeholder-fg-muted focus:outline-none focus:border-[#FFCC00]"
        />
        {searchResults.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            {searchResults.slice(0, 4).map((sc, si) => (
              <button
                key={si}
                type="button"
                onClick={() => handleApplyColor(sc)}
                className="w-5 h-5 rounded-md border border-white/20 cursor-pointer"
                style={{ backgroundColor: sc }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

