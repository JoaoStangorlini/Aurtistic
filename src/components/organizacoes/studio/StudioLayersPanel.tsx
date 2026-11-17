// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import { useStudio } from './StudioContext';

export function StudioLayersPanel() {
  const {
    activeSlide,
    selectedLayerId,
    setSelectedLayerId,
    updateLayer,
    removeLayer,
    reorderLayers,
    duplicateLayerWithMaskOnTop,
  } = useStudio();

  // Lista com ordem de exibição visual (topo primeiro)
  const layers = activeSlide.layers;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          Pilha de Camadas Z-Index ({layers.length})
        </label>
        <span className="text-[10px] text-slate-500 font-mono">Topo = Primeiro a renderizar por cima</span>
      </div>

      {layers.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-400">
          Nenhuma camada nesta tela.
        </div>
      ) : (
        <div className="space-y-1.5">
          {layers.map((layer, idx) => {
            const isSelected = layer.id === selectedLayerId;
            const isImage = layer.type === 'image';

            return (
              <div
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`p-2 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'border-[#FFCC00] bg-[#FFCC00]/10 shadow-xs'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                {/* Ícone e Nome da Camada */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="material-symbols-outlined text-[16px] text-[#FFCC00] shrink-0">
                    {layer.type === 'image' ? 'photo' : layer.type === 'text' ? 'title' : 'category'}
                  </span>
                  <span className="text-xs font-bold text-white truncate">{layer.name}</span>
                </div>

                {/* Ações da Camada */}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Duplicar com Máscara no Topo para Efeito Sanduíche */}
                  {isImage && (
                    <button
                      type="button"
                      onClick={() => duplicateLayerWithMaskOnTop(layer.id)}
                      title="✨ Duplicar Camada com Máscara no Topo (Efeito Sanduíche)"
                      className="p-1 rounded-lg text-amber-300 hover:bg-amber-400/20 text-xs font-bold"
                    >
                      <span className="material-symbols-outlined text-[15px]">layers_spark</span>
                    </button>
                  )}

                  {/* Reordenação: Subir / Descer */}
                  <button
                    type="button"
                    disabled={idx === layers.length - 1}
                    onClick={() => reorderLayers(idx, idx + 1)}
                    title="Mover para cima"
                    className="p-1 rounded-md text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    <span className="material-symbols-outlined text-[15px]">arrow_upward</span>
                  </button>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => reorderLayers(idx, idx - 1)}
                    title="Mover para baixo"
                    className="p-1 rounded-md text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
                  </button>

                  {/* Visibilidade */}
                  <button
                    type="button"
                    onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                    title={layer.visible ? 'Ocultar camada' : 'Exibir camada'}
                    className={`p-1 rounded-md ${layer.visible ? 'text-slate-300 hover:text-white' : 'text-slate-600'}`}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {layer.visible ? 'visibility' : 'visibility_off'}
                    </span>
                  </button>

                  {/* Bloqueio */}
                  <button
                    type="button"
                    onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                    title={layer.locked ? 'Desbloquear camada' : 'Bloquear camada'}
                    className={`p-1 rounded-md ${layer.locked ? 'text-amber-400' : 'text-slate-500 hover:text-white'}`}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {layer.locked ? 'lock' : 'lock_open'}
                    </span>
                  </button>

                  {/* Excluir */}
                  <button
                    type="button"
                    onClick={() => removeLayer(layer.id)}
                    title="Excluir camada"
                    className="p-1 rounded-md text-red-400 hover:bg-red-500/20"
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

