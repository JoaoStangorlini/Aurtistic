// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef } from 'react';
import { useStudio } from './StudioContext';
import type { StudioImageLayer } from './types';

export function StudioImagePanel() {
  const {
    activeSlide,
    selectedLayerId,
    setSelectedLayerId,
    addLayer,
    updateLayer,
    removeLayer,
    setMaskModalLayerId,
  } = useStudio();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const imageLayers = activeSlide.layers.filter((l) => l.type === 'image') as StudioImageLayer[];
  const selectedImageLayer = imageLayers.find((l) => l.id === selectedLayerId) || imageLayers[0] || null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    const count = imageLayers.length + 1;
    const newLayer: StudioImageLayer = {
      id: `img-${Date.now()}`,
      type: 'image',
      name: `Imagem ${count}`,
      src: blobUrl,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
      rotation: 0,
      zoom: 1,
      cropX: 0,
      cropY: 0,
      cropWidth: 1,
      cropHeight: 1,
      filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0 },
    };
    addLayer(newLayer);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Botões de Ação para Inserir Imagem */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#FFCC00] text-[#121212] font-bold text-xs hover:bg-[#FFD633] transition-all cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">upload_file</span>
          <span>Upload de Imagem</span>
        </button>
      </div>

      {/* Lista de Imagens Adicionadas */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          Imagens Nesta Tela ({imageLayers.length})
        </label>
        {imageLayers.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-400">
            Nenhuma imagem adicionada ainda. Faça upload para começar.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {imageLayers.map((img, idx) => {
              const isSelected = img.id === selectedImageLayer?.id;
              return (
                <div
                  key={img.id}
                  onClick={() => setSelectedLayerId(img.id)}
                  className={`p-2 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                    isSelected
                      ? 'border-[#FFCC00] bg-[#FFCC00]/10'
                      : 'border-white/10 bg-white/5 hover:border-white/25'
                  }`}
                >
                  <img src={img.src} alt={img.name} className="w-9 h-9 rounded-lg object-cover bg-black" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{img.name || `Imagem ${idx + 1}`}</p>
                    <span className="text-[10px] text-slate-400">Zoom: {img.zoom || 1}x</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Controles da Imagem Selecionada */}
      {selectedImageLayer && (
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">photo</span>
              {selectedImageLayer.name}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMaskModalLayerId(selectedImageLayer.id)}
                title="Pincel de Máscara"
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">brush</span>
                <span>Máscara</span>
              </button>
              <button
                type="button"
                onClick={() => removeLayer(selectedImageLayer.id)}
                title="Excluir Imagem"
                className="p-1 rounded-lg text-red-400 hover:bg-red-500/20"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </div>

          {/* Zoom Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Zoom</span>
              <span className="font-mono text-white font-bold">{selectedImageLayer.zoom.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={selectedImageLayer.zoom}
              onChange={(e) => updateLayer(selectedImageLayer.id, { zoom: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
          </div>

          {/* Rotação Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Rotação</span>
              <span className="font-mono text-white font-bold">{selectedImageLayer.rotation}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={selectedImageLayer.rotation}
              onChange={(e) => updateLayer(selectedImageLayer.id, { rotation: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
          </div>

          {/* Opacidade Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Opacidade</span>
              <span className="font-mono text-white font-bold">{Math.round(selectedImageLayer.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selectedImageLayer.opacity}
              onChange={(e) => updateLayer(selectedImageLayer.id, { opacity: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}

