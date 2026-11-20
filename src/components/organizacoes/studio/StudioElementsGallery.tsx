// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import type { StudioShapeLayer, StudioShapeType, StudioTextLayer } from './types';
import { StudioProColorPicker } from './StudioProColorPicker';
import { StudioVaultBrowserModal, type VaultBrowserSelectedItem } from './StudioVaultBrowserModal';
import { StudioLiveSlider } from './StudioLiveSlider';
import { StudioHelpTooltip } from './StudioHelpTooltip';

type ElementsSubTab = 'shapes' | 'stickers' | 'badges' | 'qr';

const ELEMENTS_SUBTABS: { id: ElementsSubTab; label: string; icon: string; helpKey: string }[] = [
  { id: 'shapes', label: 'Formas', icon: 'category', helpKey: 'elements.shapes' },
  { id: 'stickers', label: 'Símbolos', icon: 'science', helpKey: 'elements.stickers' },
  { id: 'badges', label: 'Tags', icon: 'sell', helpKey: 'elements.badges' },
  { id: 'qr', label: 'Frame & Borda', icon: 'filter_frames', helpKey: 'elements.qr' },
];

const QUICK_TAGS = ['AO VIVO', 'NOVO EVENTO', 'INSCRIÇÕES ABERTAS', 'ENTRADA GRATUITA', 'IFUSP', 'CIÊNCIA NA PRÁTICA'];

const SCIENTIFIC_SYMBOLS = ['∑', '∫', '∇', '⊕', 'ħ', 'λ', 'π', 'Δ', 'α', 'β', 'γ', 'Ω', 'μ', 'σ', '≈', '≠', '±', '∞'];

export function StudioElementsGallery() {
  const { addLayer, selectedLayer, updateLayer, orgSlug, organizationId } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [styleMode, setStyleMode] = useState<'idv' | 'neutral'>('idv');
  const [subTab, setSubTab] = useState<ElementsSubTab>('shapes');
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [showBorderPicker, setShowBorderPicker] = useState(false);

  const selectedShape = selectedLayer?.type === 'shape' ? (selectedLayer as StudioShapeLayer) : null;

  const activeColor = styleMode === 'idv' ? tokens.primaryColor : '#ffffff';
  const activeSecondary = styleMode === 'idv' ? tokens.secondaryColor : '#FFCC00';

  const handleAddShape = (shapeType: StudioShapeType, name: string) => {
    const isLineOrArrow = shapeType.includes('arrow') || shapeType === 'line' || shapeType === 'science-wave';
    const isAtom = shapeType === 'science-atom';
    const layer: StudioShapeLayer = {
      id: `shape-${Date.now()}`,
      type: 'shape',
      name,
      shapeType,
      fillColor: isAtom ? 'transparent' : activeColor,
      strokeColor: activeSecondary,
      strokeWidth: isLineOrArrow || isAtom ? 4 : 0,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.35,
      y: 0.35,
      width: isLineOrArrow ? 0.35 : 0.28,
      height: isLineOrArrow ? 0.08 : 0.28,
      rotation: 0,
    };
    addLayer(layer);
  };

  const handleAddSymbol = (sym: string) => {
    const layer: StudioTextLayer = {
      id: `sym-${Date.now()}`,
      type: 'text',
      name: `Símbolo ${sym}`,
      text: sym,
      fontFamily: 'serif',
      fontSize: 72,
      color: activeColor,
      align: 'center',
      bold: true,
      italic: true,
      lineHeight: 1,
      letterSpacing: 0,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.4,
      y: 0.4,
      width: 0.2,
      height: 0.2,
      rotation: 0,
    };
    addLayer(layer);
  };

  return (
    <div className="space-y-4 p-3.5 rounded-2xl bg-surface border border-border-subtle text-xs text-fg">
      {/* Seletor de Modo */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-2">
        <span className="font-bold text-fg uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-amber-500">category</span>
          <span>Galeria de Elementos</span>
        </span>
        <div className="flex items-center gap-1 bg-surface-hover p-0.5 rounded-lg border border-border-subtle text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setStyleMode('idv')}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              styleMode === 'idv' ? 'bg-[#FFCC00] text-black shadow-xs' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Na IDV
          </button>
          <button
            type="button"
            onClick={() => setStyleMode('neutral')}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              styleMode === 'neutral' ? 'bg-[#FFCC00] text-black shadow-xs' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Neutro
          </button>
        </div>
      </div>

      {/* 4 Subperfis Enxutos (sticky no topo ao rolar) */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-md pt-0.5 pb-1 -mx-1 px-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {ELEMENTS_SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              subTab === t.id
                ? 'bg-[#FFCC00] text-black shadow-xs'
                : 'bg-surface-hover/60 text-fg-secondary hover:text-fg border border-border-subtle'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Formas Geométricas Básicas & Setas */}
      {subTab === 'shapes' && (
      <div className="space-y-3">
        <div>
        <label className="text-[10px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
          <span>Formas Geométricas</span>
          <StudioHelpTooltip helpKey="elements.shapes" />
        </label>
        <div className="grid grid-cols-4 gap-2 text-[10px] font-bold text-center">
          <button
            type="button"
            onClick={() => handleAddShape('rectangle', 'Retângulo')}
            className="p-2 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-6 h-6 text-amber-500" viewBox="0 0 24 24">
              <rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="truncate">Retângulo</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddShape('circle', 'Círculo')}
            className="p-2 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="truncate">Círculo</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddShape('triangle', 'Triângulo')}
            className="p-2 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24">
              <polygon points="12,3 22,21 2,21" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="truncate">Triângulo</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddShape('hexagon', 'Hexágono')}
            className="p-2 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-6 h-6 text-purple-500" viewBox="0 0 24 24">
              <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="truncate">Hexágono</span>
          </button>
        </div>
      </div>

      {/* Setas & Caixas de Destaque com Visual Previews */}
      <div>
        <label className="text-[10px] font-bold text-fg-muted uppercase tracking-wider block mb-1.5">
          Setas & Callouts
        </label>
        <div className="grid grid-cols-4 gap-2 text-[10px] font-bold text-center">
          <button
            type="button"
            onClick={() => handleAddShape('arrow', 'Seta Direta')}
            className="p-2 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-6 h-6 text-amber-500" viewBox="0 0 24 24">
              <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <polyline points="14,6 20,12 14,18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="truncate">Seta ➔</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddShape('arrow-curved', 'Seta Curva')}
            className="p-2 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-6 h-6 text-cyan-500" viewBox="0 0 24 24">
              <path d="M4,20 C4,10 12,6 20,6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <polyline points="14,2 20,6 16,12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="truncate">Curva ⤴</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddShape('arrow-double', 'Dupla Ponta')}
            className="p-2 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-6 h-6 text-pink-500" viewBox="0 0 24 24">
              <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <polyline points="9,7 4,12 9,17" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="15,7 20,12 15,17" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="truncate">Dupla ⇄</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddShape('callout', 'Callout Fala')}
            className="p-2 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-6 h-6 text-indigo-400" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <span className="truncate">Callout 💬</span>
          </button>
        </div>
      </div>

      {/* Ciência & Física com Previews Vetoriais */}
      </div>
      )}

      {subTab === 'stickers' && (
      <div className="space-y-3">
        <div>
        <label className="text-[10px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
          <span>Ciência & Física (Átomos, Ondas e Lentes)</span>
          <StudioHelpTooltip helpKey="elements.stickers" />
        </label>
        <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-center">
          <button
            type="button"
            onClick={() => handleAddShape('science-atom', 'Átomo Orbital')}
            className="p-2.5 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
            title="Átomo com órbitas eletrônicas para encaixar foto ou palco"
          >
            <svg className="w-8 h-8 text-[#00D4FF]" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="3" fill="#FF1E56" />
              <ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" transform="rotate(30 16 16)" />
              <ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" transform="rotate(-30 16 16)" />
              <ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" transform="rotate(90 16 16)" />
            </svg>
            <span>⚛️ Átomo</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddShape('science-wave', 'Onda Senoidal')}
            className="p-2.5 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-8 h-8 text-[#00FF66]" viewBox="0 0 32 32">
              <path d="M2,16 Q6,6 10,16 T18,16 T26,16 T30,16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span>〰️ Onda</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddShape('science-lens', 'Lente Óptica')}
            className="p-2.5 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] hover:bg-surface-hover transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <svg className="w-8 h-8 text-[#FFE600]" viewBox="0 0 32 32">
              <path d="M12,4 Q20,16 12,28 Q4,16 12,4 Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>🔍 Lente</span>
          </button>
        </div>
      </div>

      {/* Símbolos e Letras Gregas */}
      <div>
        <label className="text-[10px] font-bold text-fg-muted uppercase tracking-wider block mb-1.5">
          Símbolos & Notação Científica
        </label>
        <div className="grid grid-cols-6 gap-1.5">
          {SCIENTIFIC_SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleAddSymbol(s)}
              className="h-8 rounded-lg border border-border-subtle bg-surface-hover/50 hover:border-[#FFCC00] hover:bg-surface-hover text-sm font-serif font-bold text-fg flex items-center justify-center cursor-pointer transition-all shadow-2xs"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Submenus 16 & 17: Foto Dentro da Forma (Frame Clip) + Borda + Zoom/Pan Interno */}
      </div>
      )}

      {subTab === 'badges' && (
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
            <span>Etiquetas & Tags Rápidas</span>
            <StudioHelpTooltip helpKey="elements.badges" />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  addLayer({
                    id: `tag-${Date.now()}`,
                    type: 'text',
                    name: `Tag ${tag}`,
                    textKind: 'callout',
                    text: tag,
                    fontFamily: tokens.fontDisplay,
                    fontSize: 22,
                    color: '#ffffff',
                    align: 'center',
                    bold: true,
                    italic: false,
                    uppercase: true,
                    lineHeight: 1.1,
                    letterSpacing: 1,
                    pillBgColor: activeColor,
                    pillBgOpacity: 95,
                    visible: true,
                    locked: false,
                    opacity: 1,
                    x: 0.25,
                    y: 0.12,
                    width: 0.5,
                    height: 0.08,
                    rotation: 0,
                  })
                }
                className="px-2.5 py-2 rounded-xl bg-surface-hover/60 border border-border-subtle hover:border-[#FFCC00] text-[10px] font-black tracking-wide text-fg truncate cursor-pointer"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {subTab === 'qr' && !selectedShape && (
        <div className="p-4 rounded-xl border border-dashed border-border-subtle text-center text-[11px] text-fg-muted space-y-1">
          <div className="flex items-center justify-center gap-1 font-bold text-fg-secondary">
            <span>Frame Clip & Contorno de Forma</span>
            <StudioHelpTooltip helpKey="elements.qr" />
          </div>
          <p>Adicione ou selecione uma forma na aba &ldquo;Formas&rdquo; para encaixar uma foto dentro dela ou ajustar a borda.</p>
        </div>
      )}

      {subTab === 'qr' && selectedShape && (
        <div className="pt-3 border-t border-border-subtle space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
              Submenus 16–17 • Frame Clip ({selectedShape.name})
            </span>
            {selectedShape.frameClip && (
              <button
                type="button"
                onClick={() => updateLayer(selectedShape.id, { frameClip: undefined })}
                className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
              >
                Remover Foto
              </button>
            )}
          </div>

          {/* 60. Encaixar Imagem na Forma/Átomo via ctx.clip() */}
          <button
            type="button"
            onClick={() => setIsVaultOpen(true)}
            className="w-full py-2 px-3 rounded-xl bg-[#FFCC00] text-black font-bold text-xs hover:bg-[#FFD633] flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add_photo_alternate</span>
            <span>{selectedShape.frameClip ? 'Trocar Foto Encaixada' : 'Encaixar Foto nesta Forma'}</span>
          </button>

          {/* 61. Grossura do Contorno (0..40px) e 62. Cor da Borda (HSV Pro) */}
          <div className="p-2.5 rounded-xl bg-surface-hover/40 border border-border-subtle space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-fg-secondary">
                Grossura Borda: {selectedShape.strokeWidth ?? 0}px
              </span>
              <button
                type="button"
                onClick={() => setShowBorderPicker((v) => !v)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold cursor-pointer"
              >
                <span
                  className="w-3 h-3 rounded-full border border-border-subtle"
                  style={{ backgroundColor: selectedShape.strokeColor || '#FFCC00' }}
                />
                <span>Cor da Borda</span>
              </button>
            </div>
            <StudioLiveSlider
              id="shape-stroke-width"
              label="Espessura da Borda"
              value={selectedShape.strokeWidth ?? 0}
              min={0}
              max={40}
              unit="px"
              onChange={(val) => updateLayer(selectedShape.id, { strokeWidth: val })}
            />
            {showBorderPicker && (
              <StudioProColorPicker
                color={selectedShape.strokeColor || '#FFCC00'}
                onChange={(hex) => updateLayer(selectedShape.id, { strokeColor: hex })}
                label="Cor do Contorno da Forma"
              />
            )}
          </div>

          {/* 63 & 64. Ajuste Interno no Frame (Zoom + Pan X/Y) */}
          {selectedShape.frameClip && (
            <div className="p-2.5 rounded-xl bg-surface-hover/40 border border-border-subtle space-y-2">
              <span className="text-[10px] font-bold text-fg-muted uppercase block">
                Submenu 17 • Ajuste Interno no Frame
              </span>
              <StudioLiveSlider
                id="shape-frame-zoom"
                label="Zoom Interno"
                value={Number(selectedShape.frameClip.zoom.toFixed(2))}
                min={1}
                max={3}
                step={0.05}
                unit="x"
                onChange={(val) =>
                  updateLayer(selectedShape.id, {
                    frameClip: { ...selectedShape.frameClip!, zoom: val },
                  })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <StudioLiveSlider
                  id="shape-frame-pan-x"
                  label="Pan X (%)"
                  value={Math.round(selectedShape.frameClip.panX * 100)}
                  min={-50}
                  max={50}
                  step={2}
                  unit="%"
                  onChange={(val) =>
                    updateLayer(selectedShape.id, {
                      frameClip: { ...selectedShape.frameClip!, panX: Number((val / 100).toFixed(2)) },
                    })
                  }
                />
                <StudioLiveSlider
                  id="shape-frame-pan-y"
                  label="Pan Y (%)"
                  value={Math.round(selectedShape.frameClip.panY * 100)}
                  min={-50}
                  max={50}
                  step={2}
                  unit="%"
                  onChange={(val) =>
                    updateLayer(selectedShape.id, {
                      frameClip: { ...selectedShape.frameClip!, panY: Number((val / 100).toFixed(2)) },
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}

      <StudioVaultBrowserModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        onUploadClick={() => setIsVaultOpen(false)}
        orgSlug={orgSlug || tokens.themeId}
        organizationId={organizationId || undefined}
        orgDisplayName={tokens.displayName || tokens.themeId?.toUpperCase() || 'Org'}
        onSelect={(item: VaultBrowserSelectedItem) => {
          if (selectedShape) {
            updateLayer(selectedShape.id, {
              frameClip: {
                src: item.streamUrl,
                resolvedUrl: item.streamUrl,
                zoom: 1,
                panX: 0,
                panY: 0,
              },
            });
          }
          setIsVaultOpen(false);
        }}
      />
    </div>
  );
}