// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { ASPECT_DIMENSIONS, type StudioImageLayer, type StudioVaultRef } from './types';
import { StudioVaultBrowserModal, type VaultBrowserSelectedItem } from './StudioVaultBrowserModal';
import { StudioLiveSlider } from './StudioLiveSlider';
import { StudioHelpTooltip } from './StudioHelpTooltip';

type ImageSubTab = 'library' | 'framing';

export function StudioImagePanel() {
  const { orgSlug, organizationId, activeSlide, selectedLayerId, setSelectedLayerId, addLayer, updateLayer, removeLayer, setMaskModalLayerId } = useStudio();
  const { tokens } = useOrganizationBrand();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [subTab, setSubTab] = useState<ImageSubTab>('library');

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

  const createAndAddImageLayer = (
    src: string,
    name: string,
    vaultRelativePath?: string,
    vaultRef?: StudioVaultRef,
    fallbackUrl?: string
  ) => {
    const id = `img-${Date.now()}`;
    const newLayer: StudioImageLayer = {
      id,
      type: 'image',
      name,
      src,
      resolvedUrl: src,
      fallbackUrl,
      vaultRelativePath,
      vaultRef,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0, zoom: 1,
      cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1,
      aspectFit: 'cover',
      filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0 },
    };
    addLayer(newLayer);

    // Ajusta automaticamente a caixa para a proporção natural da foto (horizontal/vertical)
    if (typeof window !== 'undefined') {
      const dims = ASPECT_DIMENSIONS[activeSlide.aspectRatio] || ASPECT_DIMENSIONS['1:1'];
      const slideAspect = dims.width / dims.height;
      const probe = (url: string, onFail?: () => void) => {
        const imgEl = new Image();
        imgEl.crossOrigin = 'anonymous';
        imgEl.onload = () => {
          if (imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
            const imgAspect = imgEl.naturalWidth / imgEl.naturalHeight;
            let normW: number;
            let normH: number;
            if (imgAspect >= 1) {
              normW = 0.84;
              normH = Math.min(0.84, (normW * slideAspect) / imgAspect);
              if (normH < 0.18) normH = 0.18;
            } else {
              normH = 0.78;
              normW = Math.min(0.84, (normH * imgAspect) / slideAspect);
              if (normW < 0.18) normW = 0.18;
            }
            updateLayer(id, {
              naturalWidth: imgEl.naturalWidth,
              naturalHeight: imgEl.naturalHeight,
              width: Number(normW.toFixed(3)),
              height: Number(normH.toFixed(3)),
              x: Number(((1 - normW) / 2).toFixed(3)),
              y: Number(((1 - normH) / 2).toFixed(3)),
            });
          }
        };
        if (onFail) imgEl.onerror = onFail;
        imgEl.src = url;
      };
      probe(src, fallbackUrl ? () => probe(fallbackUrl) : undefined);
    }
  };

  const handleOpenVault = () => {
    setGalleryOpen(true);
  };

  return (
    <div className="space-y-3">
      {/* 2 Subperfis Enxutos (sem <button> aninhado, sticky no topo) */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-md flex items-center gap-1 p-1 rounded-xl border border-border-subtle">
        <div
          className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
            subTab === 'library' ? 'bg-[#FFCC00] text-black shadow-xs' : 'text-fg-secondary hover:text-fg'
          }`}
        >
          <button type="button" onClick={() => setSubTab('library')} className="cursor-pointer">
            Galeria & Envio
          </button>
          <StudioHelpTooltip helpKey="image.library" />
        </div>
        <div
          className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
            subTab === 'framing' ? 'bg-[#FFCC00] text-black shadow-xs' : 'text-fg-secondary hover:text-fg'
          }`}
        >
          <button type="button" onClick={() => setSubTab('framing')} className="cursor-pointer">
            Enquadramento
          </button>
          <StudioHelpTooltip helpKey="image.framing" />
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />

      {subTab === 'library' && (
        <div className="space-y-3">
          {/* Botões de Ação */}
          <div className="flex items-center gap-2">
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
                    onClick={() => {
                      setSelectedLayerId(img.id);
                      setSubTab('framing');
                    }}
                    className={`p-2 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                      img.id === selectedImageLayer?.id ? 'border-[#FFCC00] bg-[#FFCC00]/10' : 'border-border-subtle bg-elevated/60 hover:border-border-strong'
                    }`}
                  >
                    <img
                      src={img.resolvedUrl || img.src || img.fallbackUrl}
                      alt={img.name}
                      crossOrigin="anonymous"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (img.fallbackUrl && target.src !== img.fallbackUrl) {
                          target.src = img.fallbackUrl;
                        }
                      }}
                      className="w-9 h-9 rounded-lg object-cover bg-black shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-fg truncate">{img.name || `Imagem ${idx + 1}`}</p>
                      <span className="text-[10px] text-fg-muted">Toque para enquadrar</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'framing' && !selectedImageLayer && (
        <div className="p-4 rounded-xl border border-dashed border-border-subtle text-center text-xs text-fg-muted">
          Selecione ou adicione uma imagem na aba &ldquo;Galeria & Envio&rdquo; para ajustar zoom, rotação e enquadramento.
        </div>
      )}

      {/* Transformações da Imagem Selecionada */}
      {subTab === 'framing' && selectedImageLayer && (
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

          <StudioLiveSlider
            id="img-zoom"
            label="Zoom"
            value={Number(selectedImageLayer.zoom.toFixed(1))}
            min={1}
            max={3}
            step={0.1}
            unit="x"
            onChange={(val) => updateLayer(selectedImageLayer.id, { zoom: val })}
          />

          <StudioLiveSlider
            id="img-rotation"
            label="Rotação"
            value={selectedImageLayer.rotation}
            min={0}
            max={360}
            step={5}
            unit="°"
            onChange={(val) => updateLayer(selectedImageLayer.id, { rotation: val })}
          />

          <StudioLiveSlider
            id="img-opacity"
            label="Opacidade (%)"
            value={Math.round(selectedImageLayer.opacity * 100)}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(val) => updateLayer(selectedImageLayer.id, { opacity: Number((val / 100).toFixed(2)) })}
          />
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
            <StudioLiveSlider
              id="img-offset-x"
              label="Offset X (%)"
              value={Math.round((selectedImageLayer.offsetX || 0) * 100)}
              min={-50}
              max={50}
              step={1}
              unit="%"
              onChange={(val) => updateLayer(selectedImageLayer.id, { offsetX: Number((val / 100).toFixed(2)) })}
            />
            <StudioLiveSlider
              id="img-offset-y"
              label="Offset Y (%)"
              value={Math.round((selectedImageLayer.offsetY || 0) * 100)}
              min={-50}
              max={50}
              step={1}
              unit="%"
              onChange={(val) => updateLayer(selectedImageLayer.id, { offsetY: Number((val / 100).toFixed(2)) })}
            />
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
          createAndAddImageLayer(
            item.streamUrl || item.thumbUrl || '',
            item.name,
            item.relativePath,
            item.vaultRef,
            item.thumbUrl || undefined
          );
          setGalleryOpen(false);
        }}
      />
    </div>
  );
}
