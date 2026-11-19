// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import type { StudioImageLayer, StudioVaultRef } from './types';
import { StudioVaultBrowserModal, type VaultBrowserSelectedItem } from './StudioVaultBrowserModal';

export function StudioImagePanel() {
  const { orgSlug, organizationId, activeSlide, selectedLayerId, setSelectedLayerId, addLayer, updateLayer, removeLayer, setMaskModalLayerId } = useStudio();
  const { tokens } = useOrganizationBrand();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [galleryOpen, setGalleryOpen] = useState(false);

  const imageLayers = activeSlide.layers.filter((l) => l.type === 'image') as StudioImageLayer[];
  const selectedImageLayer = imageLayers.find((l) => l.id === selectedLayerId) || imageLayers[0] || null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      createAndAddImageLayer(dataUrl, `Upload ${imageLayers.length + 1}`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const createAndAddImageLayer = (src: string, name: string, vaultRelativePath?: string, vaultRef?: StudioVaultRef) => {
    const newLayer: StudioImageLayer = {
      id: `img-${Date.now()}`,
      type: 'image',
      name,
      src,
      resolvedUrl: src,
      vaultRelativePath,
      vaultRef,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0, zoom: 1,
      cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1,
      filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0 },
    };
    addLayer(newLayer);
  };

  const handleOpenVault = () => {
    setGalleryOpen(true);
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
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-border-subtle bg-app text-fg font-bold text-xs hover:bg-surface-hover transition-all cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">folder_shared</span>
          <span>Cofre Pessoal / Org</span>
        </button>
      </div>

      {/* Lista de Imagens */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider block">
          Imagens Nesta Tela ({imageLayers.length})
        </label>
        {imageLayers.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-border-subtle text-center text-xs text-fg-muted">
            Nenhuma imagem adicionada. Faça upload ou selecione do cofre.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {imageLayers.map((img, idx) => (
              <div
                key={img.id}
                onClick={() => setSelectedLayerId(img.id)}
                className={`p-2 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                  img.id === selectedImageLayer?.id ? 'border-[#FFCC00] bg-[#FFCC00]/10' : 'border-border-subtle bg-elevated/60 hover:border-border-strong'
                }`}
              >
                <img src={img.src} alt={img.name} crossOrigin="anonymous" className="w-9 h-9 rounded-lg object-cover bg-black" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-fg truncate">{img.name || `Imagem ${idx + 1}`}</p>
                  <span className="text-[10px] text-fg-muted">Zoom: {img.zoom || 1}x</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controles da Imagem Selecionada */}
      {selectedImageLayer && (
        <div className="p-3.5 rounded-2xl bg-elevated/60 border border-border-subtle space-y-3.5">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2">
            <span className="text-xs font-bold text-fg flex items-center gap-1.5 truncate max-w-[150px]">
              <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">photo</span>
              {selectedImageLayer.name}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMaskModalLayerId(selectedImageLayer.id)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-400/20 text-amber-700 dark:text-amber-300 hover:bg-amber-400/30 flex items-center gap-1 cursor-pointer"
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
              <span className="text-fg-muted">Zoom</span>
              <span className="font-mono text-fg font-bold">{selectedImageLayer.zoom.toFixed(1)}x</span>
            </div>
            <input
              type="range" min={1} max={3} step={0.1} value={selectedImageLayer.zoom}
              onChange={(e) => updateLayer(selectedImageLayer.id, { zoom: Number(e.target.value) })}
              className="w-full studio-range-slider"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-fg-muted">Rotação</span>
              <span className="font-mono text-fg font-bold">{selectedImageLayer.rotation}°</span>
            </div>
            <input
              type="range" min={0} max={360} step={5} value={selectedImageLayer.rotation}
              onChange={(e) => updateLayer(selectedImageLayer.id, { rotation: Number(e.target.value) })}
              className="w-full studio-range-slider"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-fg-muted">Opacidade</span>
              <span className="font-mono text-fg font-bold">{Math.round(selectedImageLayer.opacity * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05} value={selectedImageLayer.opacity}
              onChange={(e) => updateLayer(selectedImageLayer.id, { opacity: Number(e.target.value) })}
              className="w-full studio-range-slider"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-fg-muted">Enquadramento</span>
              <span className="font-mono text-fg font-bold">{selectedImageLayer.aspectFit || 'cover'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {(['cover', 'contain', 'custom'] as const).map((fit) => (
                <button
                  key={fit}
                  type="button"
                  onClick={() => updateLayer(selectedImageLayer.id, { aspectFit: fit })}
                  className={`flex-1 py-1 rounded-lg text-[11px] font-bold capitalize transition-all cursor-pointer ${
                    (selectedImageLayer.aspectFit || 'cover') === fit ? 'bg-[#FFCC00] text-black' : 'bg-elevated text-fg-secondary hover:text-fg'
                  }`}
                >
                  {fit === 'cover' ? 'Preencher' : fit === 'contain' ? 'Ajustar' : 'Livre'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-fg-muted">Offset X</span>
                <span className="font-mono text-fg text-[11px]">{Math.round((selectedImageLayer.offsetX || 0) * 100)}%</span>
              </div>
              <input
                type="range" min={-0.5} max={0.5} step={0.01} value={selectedImageLayer.offsetX || 0}
                onChange={(e) => updateLayer(selectedImageLayer.id, { offsetX: Number(e.target.value) })}
                className="w-full studio-range-slider"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-fg-muted">Offset Y</span>
                <span className="font-mono text-fg text-[11px]">{Math.round((selectedImageLayer.offsetY || 0) * 100)}%</span>
              </div>
              <input
                type="range" min={-0.5} max={0.5} step={0.01} value={selectedImageLayer.offsetY || 0}
                onChange={(e) => updateLayer(selectedImageLayer.id, { offsetY: Number(e.target.value) })}
                className="w-full studio-range-slider"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal do Cofre — Browser de Pastas */}
      <StudioVaultBrowserModal
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        orgSlug={orgSlug || tokens.themeId}
        organizationId={organizationId || undefined}
        orgDisplayName={tokens.displayName || tokens.themeId?.toUpperCase() || 'Org'}
        onUploadClick={() => fileInputRef.current?.click()}
        onSelect={(item: VaultBrowserSelectedItem) => {
          createAndAddImageLayer(item.streamUrl, item.name, item.relativePath, item.vaultRef);
          setGalleryOpen(false);
        }}
      />
    </div>
  );
}
