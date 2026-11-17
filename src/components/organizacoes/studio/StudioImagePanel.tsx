// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import type { StudioImageLayer } from './types';
import { getStudioGalleryMediaAction, type StudioGalleryMediaItem } from '@/app/(dashboard)/organizacoes/studio-actions';

export function StudioImagePanel() {
  const { activeSlide, selectedLayerId, setSelectedLayerId, addLayer, updateLayer, removeLayer, setMaskModalLayerId } = useStudio();
  const { tokens } = useOrganizationBrand();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<StudioGalleryMediaItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  const imageLayers = activeSlide.layers.filter((l) => l.type === 'image') as StudioImageLayer[];
  const selectedImageLayer = imageLayers.find((l) => l.id === selectedLayerId) || imageLayers[0] || null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    createAndAddImageLayer(blobUrl, `Upload ${imageLayers.length + 1}`);
    e.target.value = '';
  };

  const createAndAddImageLayer = (src: string, name: string, vaultRelativePath?: string) => {
    const newLayer: StudioImageLayer = {
      id: `img-${Date.now()}`,
      type: 'image',
      name,
      src,
      vaultRelativePath,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0, zoom: 1,
      cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1,
      filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0 },
    };
    addLayer(newLayer);
  };

  const handleOpenVault = async () => {
    setGalleryOpen(true);
    setGalleryLoading(true);
    try {
      const res = await getStudioGalleryMediaAction({ orgSlug: tokens.themeId });
      if (res.ok && res.items) setGalleryItems(res.items);
    } catch {
      // Falha silenciosa
    } finally {
      setGalleryLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Botões de Ação */}
      <div className="flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#FFCC00] text-[#121212] font-bold text-xs hover:bg-[#FFD633] transition-all cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">upload_file</span>
          <span>Upload</span>
        </button>
        <button
          type="button"
          onClick={handleOpenVault}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/20 bg-white/5 text-white font-bold text-xs hover:bg-white/10 transition-all cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">folder_shared</span>
          <span>Cofre da Org</span>
        </button>
      </div>

      {/* Lista de Imagens */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          Imagens Nesta Tela ({imageLayers.length})
        </label>
        {imageLayers.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-400">
            Nenhuma imagem adicionada. Faça upload ou selecione do cofre.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {imageLayers.map((img, idx) => (
              <div
                key={img.id}
                onClick={() => setSelectedLayerId(img.id)}
                className={`p-2 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                  img.id === selectedImageLayer?.id ? 'border-[#FFCC00] bg-[#FFCC00]/10' : 'border-white/10 bg-white/5 hover:border-white/25'
                }`}
              >
                <img src={img.src} alt={img.name} className="w-9 h-9 rounded-lg object-cover bg-black" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{img.name || `Imagem ${idx + 1}`}</p>
                  <span className="text-[10px] text-slate-400">Zoom: {img.zoom || 1}x</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controles da Imagem Selecionada */}
      {selectedImageLayer && (
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate max-w-[150px]">
              <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">photo</span>
              {selectedImageLayer.name}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMaskModalLayerId(selectedImageLayer.id)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">brush</span>
                <span>Máscara</span>
              </button>
              <button
                type="button"
                onClick={() => removeLayer(selectedImageLayer.id)}
                className="p-1 rounded-lg text-red-400 hover:bg-red-500/20 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Zoom</span>
              <span className="font-mono text-white font-bold">{selectedImageLayer.zoom.toFixed(1)}x</span>
            </div>
            <input
              type="range" min={1} max={3} step={0.1} value={selectedImageLayer.zoom}
              onChange={(e) => updateLayer(selectedImageLayer.id, { zoom: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Rotação</span>
              <span className="font-mono text-white font-bold">{selectedImageLayer.rotation}°</span>
            </div>
            <input
              type="range" min={0} max={360} step={5} value={selectedImageLayer.rotation}
              onChange={(e) => updateLayer(selectedImageLayer.id, { rotation: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Opacidade</span>
              <span className="font-mono text-white font-bold">{Math.round(selectedImageLayer.opacity * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05} value={selectedImageLayer.opacity}
              onChange={(e) => updateLayer(selectedImageLayer.id, { opacity: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Modal do Cofre da Organização */}
      {galleryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0f172a] border border-white/15 rounded-3xl p-5 max-w-xl w-full shadow-2xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[#FFCC00]">folder_shared</span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cofre de Mídia da Organização</h3>
              </div>
              <button type="button" onClick={() => setGalleryOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-[260px] max-h-[420px] pr-1 scrollbar-thin">
              {galleryLoading ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-400 font-mono animate-pulse">Carregando acervo do Cofre...</div>
              ) : galleryItems.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                  <span className="material-symbols-outlined text-[32px] text-slate-600">image_not_supported</span>
                  <span>Nenhuma mídia encontrada no cofre desta organização.</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                  {galleryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        createAndAddImageLayer(item.streamUrl || item.thumbUrl, item.label || item.fileName, item.relativePath);
                        setGalleryOpen(false);
                      }}
                      className="group relative rounded-xl overflow-hidden border border-white/10 hover:border-[#FFCC00] bg-black/40 text-left transition-all"
                    >
                      <img src={item.thumbUrl} alt={item.fileName} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform" />
                      <div className="p-1.5 bg-black/60 backdrop-blur-xs">
                        <p className="text-[10px] font-bold text-white truncate">{item.label || item.fileName}</p>
                        {item.category && <span className="text-[9px] text-[#FFCC00] block truncate">{item.category}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
