// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import type { StudioLogoLayer, LogoPreset } from './types';

export function StudioLayersPanel() {
  const {
    activeSlide,
    selectedLayerId,
    setSelectedLayerId,
    updateLayer,
    removeLayer,
    reorderLayers,
    duplicateLayerWithMaskOnTop,
    addLayer,
  } = useStudio();

  const [showLogoPresets, setShowLogoPresets] = useState(false);
  const layers = activeSlide.layers;

  const handleAddLogo = (preset: LogoPreset) => {
    const layer: StudioLogoLayer = {
      id: `logo-${Date.now()}`,
      type: 'logo',
      name: `Selo ${preset === 'show-da-fisica-tricolor' ? 'Show da Física' : preset === 'ifusp' ? 'IFUSP' : 'Logo Org'}`,
      preset,
      preserveAspect: true,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.05,
      y: 0.05,
      width: 0.22,
      height: 0.08,
      rotation: 0,
    };
    addLayer(layer);
    setShowLogoPresets(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          Pilha de Camadas ({layers.length})
        </label>
        <button
          type="button"
          onClick={() => setShowLogoPresets(!showLogoPresets)}
          className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold text-[10px] hover:bg-amber-400/30 flex items-center gap-1 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[13px]">verified</span>
          <span>+ Selo/Assinatura</span>
        </button>
      </div>

      {showLogoPresets && (
        <div className="p-2.5 rounded-xl bg-black/50 border border-amber-400/30 space-y-1.5 animate-in fade-in">
          <span className="text-[10px] text-slate-400 block font-bold uppercase">Escolha o Selo Oficial:</span>
          <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
            <button
              type="button"
              onClick={() => handleAddLogo('org-logo')}
              className="p-1.5 rounded bg-white/10 hover:bg-[#FFCC00] hover:text-black transition-all"
            >
              Logo da Org
            </button>
            <button
              type="button"
              onClick={() => handleAddLogo('show-da-fisica-tricolor')}
              className="p-1.5 rounded bg-white/10 hover:bg-[#FFCC00] hover:text-black transition-all"
            >
              Show Física
            </button>
            <button
              type="button"
              onClick={() => handleAddLogo('ifusp')}
              className="p-1.5 rounded bg-white/10 hover:bg-[#FFCC00] hover:text-black transition-all"
            >
              IFUSP
            </button>
          </div>
        </div>
      )}

      {layers.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-400">
          Nenhuma camada nesta tela.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
          {layers.map((layer, idx) => {
            const isSelected = layer.id === selectedLayerId;
            const isImage = layer.type === 'image';

            return (
              <div
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`p-2 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected ? 'border-[#FFCC00] bg-[#FFCC00]/10 shadow-xs' : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="material-symbols-outlined text-[16px] text-[#FFCC00] shrink-0">
                    {layer.type === 'image' ? 'photo' : layer.type === 'text' ? 'title' : layer.type === 'logo' ? 'verified' : layer.type === 'math' ? 'functions' : 'category'}
                  </span>
                  <span className="text-xs font-bold text-white truncate">{layer.name}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {isImage && (
                    <button
                      type="button"
                      onClick={() => duplicateLayerWithMaskOnTop(layer.id)}
                      title="✨ Duplicar com Máscara no Topo (Efeito Sanduíche)"
                      className="p-1 rounded-lg text-amber-300 hover:bg-amber-400/20"
                    >
                      <span className="material-symbols-outlined text-[15px]">layers_spark</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={idx === layers.length - 1}
                    onClick={() => reorderLayers(idx, idx + 1)}
                    className="p-1 rounded-md text-slate-400 hover:text-white disabled:opacity-20"
                    title="Subir Camada"
                  >
                    <span className="material-symbols-outlined text-[15px]">arrow_upward</span>
                  </button>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => reorderLayers(idx, idx - 1)}
                    className="p-1 rounded-md text-slate-400 hover:text-white disabled:opacity-20"
                    title="Descer Camada"
                  >
                    <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                    className={`p-1 rounded-md ${layer.visible ? 'text-slate-300 hover:text-white' : 'text-slate-600'}`}
                    title={layer.visible ? 'Ocultar' : 'Exibir'}
                  >
                    <span className="material-symbols-outlined text-[15px]">{layer.visible ? 'visibility' : 'visibility_off'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                    className={`p-1 rounded-md ${layer.locked ? 'text-amber-400' : 'text-slate-500 hover:text-white'}`}
                    title={layer.locked ? 'Desbloquear' : 'Bloquear'}
                  >
                    <span className="material-symbols-outlined text-[15px]">{layer.locked ? 'lock' : 'lock_open'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeLayer(layer.id)}
                    className="p-1 rounded-md text-red-400 hover:bg-red-500/20"
                    title="Excluir"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
