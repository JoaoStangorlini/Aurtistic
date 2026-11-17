// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import { useStudio } from './StudioContext';
import { DEFAULT_FILTERS, type StudioLayerFilterConfig } from './types';

export function StudioEditionPanel() {
  const { activeSlide, selectedLayer, updateLayer, updateSlide } = useStudio();

  const currentFilters: StudioLayerFilterConfig =
    selectedLayer?.filters || activeSlide.globalFilters || DEFAULT_FILTERS;

  const handleFilterChange = (key: keyof StudioLayerFilterConfig, value: number | boolean) => {
    const updated = { ...currentFilters, [key]: value };
    if (selectedLayer) {
      updateLayer(selectedLayer.id, { filters: updated });
    } else {
      updateSlide(activeSlide.id, { globalFilters: updated });
    }
  };

  const handleReset = () => {
    if (selectedLayer) {
      updateLayer(selectedLayer.id, { filters: { ...DEFAULT_FILTERS } });
    } else {
      updateSlide(activeSlide.id, { globalFilters: { ...DEFAULT_FILTERS } });
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Alvo do Ajuste */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs">
        <div>
          <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Alvo</span>
          <span className="font-bold text-white truncate max-w-[140px] block">
            {selectedLayer ? `Camada: ${selectedLayer.name}` : 'Tela Global'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="px-2 py-1 rounded-lg text-slate-300 hover:text-white bg-white/10 hover:bg-white/15 text-xs font-semibold flex items-center gap-1 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
          <span>Resetar</span>
        </button>
      </div>

      {/* Checkbox para mascaramento pontual */}
      {selectedLayer && selectedLayer.maskDataUrl && (
        <label className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-xs text-amber-200 cursor-pointer">
          <input
            type="checkbox"
            checked={!!currentFilters.targetMaskAreaOnly}
            onChange={(e) => handleFilterChange('targetMaskAreaOnly', e.target.checked)}
            className="rounded-sm accent-amber-400 cursor-pointer"
          />
          <span className="font-semibold text-[11px]">Aplicar apenas na área mascarada</span>
        </label>
      )}

      {/* Sliders Fotográficos */}
      <div className="space-y-2.5 p-3 rounded-2xl bg-white/5 border border-white/10 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
        {/* Overlay Dark */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Escurecer / Overlay</span>
            <span className="font-mono text-amber-300 font-bold text-[11px]">{currentFilters.overlayDark ?? 0}%</span>
          </div>
          <input
            type="range" min={0} max={85} value={currentFilters.overlayDark ?? 0}
            onChange={(e) => handleFilterChange('overlayDark', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Temperatura */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Temperatura (Frio ⇄ Quente)</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.temperature ?? 0}</span>
          </div>
          <input
            type="range" min={-50} max={50} value={currentFilters.temperature ?? 0}
            onChange={(e) => handleFilterChange('temperature', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Vinheta */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Vinheta (Borda Escura)</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.vignette ?? 0}%</span>
          </div>
          <input
            type="range" min={0} max={100} value={currentFilters.vignette ?? 0}
            onChange={(e) => handleFilterChange('vignette', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Exposição */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Exposição</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.exposure ?? 100}%</span>
          </div>
          <input
            type="range" min={50} max={180} value={currentFilters.exposure ?? 100}
            onChange={(e) => handleFilterChange('exposure', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Vibrance */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Vibração / Cor Viva</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.vibrance ?? 100}%</span>
          </div>
          <input
            type="range" min={50} max={180} value={currentFilters.vibrance ?? 100}
            onChange={(e) => handleFilterChange('vibrance', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Brilho */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Brilho</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.brightness}%</span>
          </div>
          <input
            type="range" min={0} max={200} value={currentFilters.brightness}
            onChange={(e) => handleFilterChange('brightness', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Contraste */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Contraste</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.contrast}%</span>
          </div>
          <input
            type="range" min={0} max={200} value={currentFilters.contrast}
            onChange={(e) => handleFilterChange('contrast', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Saturação */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Saturação</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.saturation}%</span>
          </div>
          <input
            type="range" min={0} max={200} value={currentFilters.saturation}
            onChange={(e) => handleFilterChange('saturation', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Desfoque */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Desfoque</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.blur}px</span>
          </div>
          <input
            type="range" min={0} max={30} value={currentFilters.blur}
            onChange={(e) => handleFilterChange('blur', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* P&B */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Preto e Branco</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.grayscale}%</span>
          </div>
          <input
            type="range" min={0} max={100} value={currentFilters.grayscale}
            onChange={(e) => handleFilterChange('grayscale', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Sépia */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium text-[11px]">Sépia</span>
            <span className="font-mono text-white font-bold text-[11px]">{currentFilters.sepia}%</span>
          </div>
          <input
            type="range" min={0} max={100} value={currentFilters.sepia}
            onChange={(e) => handleFilterChange('sepia', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
