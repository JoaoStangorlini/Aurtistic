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
    <div className="space-y-4">
      {/* Alvo do Ajuste */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
            Alvo do Ajuste
          </span>
          <span className="font-bold text-white">
            {selectedLayer ? `Camada: ${selectedLayer.name}` : 'Tela Global'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-white/10 hover:bg-white/15 transition-all text-xs font-semibold flex items-center gap-1 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
          <span>Resetar</span>
        </button>
      </div>

      {/* Checkbox para mascaramento pontual */}
      {selectedLayer && selectedLayer.maskDataUrl && (
        <label className="flex items-center gap-2 p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-xs text-amber-200 cursor-pointer">
          <input
            type="checkbox"
            checked={!!currentFilters.targetMaskAreaOnly}
            onChange={(e) => handleFilterChange('targetMaskAreaOnly', e.target.checked)}
            className="rounded-sm accent-amber-400 cursor-pointer"
          />
          <span className="font-semibold">Editar apenas na área pintada com a máscara</span>
        </label>
      )}

      {/* Sliders Fotográficos */}
      <div className="space-y-3 p-3.5 rounded-2xl bg-white/5 border border-white/10">
        {/* Brilho */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium">Brilho</span>
            <span className="font-mono text-white font-bold">{currentFilters.brightness}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            value={currentFilters.brightness}
            onChange={(e) => handleFilterChange('brightness', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Contraste */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium">Contraste</span>
            <span className="font-mono text-white font-bold">{currentFilters.contrast}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            value={currentFilters.contrast}
            onChange={(e) => handleFilterChange('contrast', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Saturação */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium">Saturação</span>
            <span className="font-mono text-white font-bold">{currentFilters.saturation}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            value={currentFilters.saturation}
            onChange={(e) => handleFilterChange('saturation', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Desfoque */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium">Desfoque</span>
            <span className="font-mono text-white font-bold">{currentFilters.blur}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            value={currentFilters.blur}
            onChange={(e) => handleFilterChange('blur', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Preto e Branco */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium">Preto e Branco</span>
            <span className="font-mono text-white font-bold">{currentFilters.grayscale}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={currentFilters.grayscale}
            onChange={(e) => handleFilterChange('grayscale', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Sépia */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium">Sépia</span>
            <span className="font-mono text-white font-bold">{currentFilters.sepia}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={currentFilters.sepia}
            onChange={(e) => handleFilterChange('sepia', Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

