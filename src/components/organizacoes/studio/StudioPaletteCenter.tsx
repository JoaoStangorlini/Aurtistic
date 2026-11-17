// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { getHarmonies, applyPaletteStyle, getContrastRatio, searchPaletteByKeyword } from '@/lib/studio/color-harmony';

export function StudioPaletteCenter({ onPickColor }: { onPickColor?: () => void }) {
  const { activeSlide, selectedLayer, updateLayer, updateSlide } = useStudio();
  const { tokens } = useOrganizationBrand();

  const [baseColor, setBaseColor] = useState<string>(tokens.primaryColor || '#00D4FF');
  const [harmonyType, setHarmonyType] = useState<'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'monochromatic'>('analogous');
  const [activeStyle, setActiveStyle] = useState<'normal' | 'neon' | 'pastel' | 'dark' | 'metallic' | 'earthy'>('normal');
  const [searchQuery, setSearchQuery] = useState('');

  const harmonies = getHarmonies(baseColor);
  let currentPalette = harmonies[harmonyType];

  if (activeStyle !== 'normal') {
    currentPalette = currentPalette.map((c) => applyPaletteStyle(c, activeStyle));
  }

  const searchResults = searchQuery.trim() ? searchPaletteByKeyword(searchQuery) : [];

  const handleApplyColor = (color: string) => {
    if (selectedLayer) {
      if (selectedLayer.type === 'text') {
        updateLayer(selectedLayer.id, { color });
      } else if (selectedLayer.type === 'shape') {
        updateLayer(selectedLayer.id, { fillColor: color });
      }
    } else {
      updateSlide(activeSlide.id, { backgroundColor: color });
    }
  };

  const contrastWhite = getContrastRatio(baseColor, '#ffffff').toFixed(1);
  const isAaa = Number(contrastWhite) >= 7.0;
  const isAa = Number(contrastWhite) >= 4.5;

  return (
    <div className="space-y-3.5 p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs">
      {/* Cabeçalho com Cor Base + Pipeta */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={baseColor}
            onChange={(e) => setBaseColor(e.target.value)}
            className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
          />
          <div>
            <span className="text-[10px] text-slate-400 block font-mono">COR BASE</span>
            <span className="font-mono text-white font-bold">{baseColor.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${isAaa ? 'bg-emerald-500/20 text-emerald-300' : isAa ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
            {isAaa ? 'WCAG AAA (7:1)' : isAa ? 'WCAG AA' : 'Baixo Contraste'}
          </span>
          {onPickColor && (
            <button
              type="button"
              onClick={onPickColor}
              title="Pipeta Eyedropper"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-300 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">colorize</span>
            </button>
          )}
        </div>
      </div>

      {/* Seletor de Harmonias */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
          Harmonias OKLCH
        </label>
        <div className="grid grid-cols-5 gap-1 text-[10px] font-bold">
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
              className={`py-1 rounded-md text-center cursor-pointer transition-all ${harmonyType === h.id ? 'bg-[#FFCC00] text-black' : 'bg-white/5 text-slate-400 hover:text-white'}`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chips de Cor da Harmonia */}
      <div className="flex items-center gap-2">
        {currentPalette.map((color, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleApplyColor(color)}
            className="flex-1 h-9 rounded-xl border border-white/20 shadow-sm transition-transform hover:scale-105 cursor-pointer relative group"
            style={{ backgroundColor: color }}
            title={`Aplicar ${color}`}
          >
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 text-[9px] font-mono text-white rounded-xl">
              Usar
            </span>
          </button>
        ))}
      </div>

      {/* Paleta Oficial da Organização */}
      <div className="pt-1 border-t border-white/10">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
          Identidade Visual Oficial ({tokens.displayName})
        </label>
        <div className="flex items-center gap-2">
          {[tokens.primaryColor, tokens.secondaryColor, tokens.tertiaryColor, tokens.containerColor, '#ffffff', '#07090e'].map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleApplyColor(c)}
              className="w-7 h-7 rounded-lg border border-white/20 hover:scale-110 transition-transform cursor-pointer"
              style={{ backgroundColor: c }}
              title={`Aplicar cor IDV ${c}`}
            />
          ))}
        </div>
      </div>

      {/* Busca Rápida de Cores */}
      <div className="pt-1">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar cores (ex: azul, dourado, show)..."
          className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/15 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-[#FFCC00]"
        />
        {searchResults.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            {searchResults.map((sc, si) => (
              <button
                key={si}
                type="button"
                onClick={() => handleApplyColor(sc)}
                className="w-7 h-7 rounded-lg border border-white/20 hover:scale-110 cursor-pointer"
                style={{ backgroundColor: sc }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

