// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import type { StudioTextLayer, StudioMathLayer } from './types';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { StudioTextPresetsSection } from './StudioTextPresetsSection';
import { StudioProColorPicker } from './StudioProColorPicker';

const EVENT_VARIABLES = ['DATA', 'HORARIO', 'LOCAL', 'PALESTRANTE'];

const FONT_FAMILIES = [
  { id: 'Inter, sans-serif', label: 'Inter' },
  { id: 'Space Grotesk, sans-serif', label: 'Space Grotesk' },
  { id: 'Playfair Display, serif', label: 'Playfair Display' },
  { id: 'JetBrains Mono, monospace', label: 'JetBrains Mono' },
  { id: 'Montserrat, sans-serif', label: 'Montserrat' },
  { id: 'Oswald, sans-serif', label: 'Oswald' },
  { id: 'Lora, serif', label: 'Lora' },
  { id: 'Merriweather, serif', label: 'Merriweather' },
];

export function StudioTextPanel() {
  const { activeSlide, selectedLayerId, addLayer, updateLayer, removeLayer, fillEventPlaceholders, addSlide } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [autoSplit, setAutoSplit] = useState(false);
  const [colorPickerTarget, setColorPickerTarget] = useState<'font' | 'pill' | 'shadow' | null>(null);

  const textLayers = activeSlide.layers.filter((l) => l.type === 'text') as StudioTextLayer[];
  const mathLayers = activeSlide.layers.filter((l) => l.type === 'math') as StudioMathLayer[];
  const selectedTextLayer = textLayers.find((l) => l.id === selectedLayerId) || textLayers[0] || null;

  const isScientificIdv = tokens.badgeTag?.toLowerCase().includes('lab') || tokens.themeId?.toLowerCase().includes('lab') || true;

  const handleAddText = (customText?: string, fontSize = 42, kind: 'title' | 'subtitle' | 'body' | 'callout' = 'title') => {
    const count = textLayers.length + 1;
    const newLayer: StudioTextLayer = {
      id: `text-${Date.now()}`,
      type: 'text',
      name: `Texto ${count}`,
      textKind: kind,
      text: customText || (kind === 'title' ? 'Novo Título' : kind === 'callout' ? 'Destaque Científico' : 'Novo Parágrafo'),
      fontFamily: kind === 'title' ? tokens.fontDisplay : tokens.fontBody,
      fontSize,
      color: tokens.textPrimary || '#ffffff',
      align: 'center',
      bold: kind === 'title' || kind === 'callout',
      italic: false,
      uppercase: false,
      lineHeight: 1.2,
      letterSpacing: 0,
      pillBgColor: tokens.primaryColor || '#1F9FCF',
      pillBgOpacity: kind === 'callout' ? 90 : 0,
      shadowColor: '#000000',
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.1, y: 0.25 + ((count % 4) * 0.08), width: 0.8, height: 0.2, rotation: 0,
    };
    addLayer(newLayer);
  };

  const handleTextChange = (newVal: string) => {
    if (!selectedTextLayer) return;
    if (autoSplit && newVal.length > 220) {
      const parts = newVal.match(/[^.!?]+[.!?]+/g) || [newVal.slice(0, 150), newVal.slice(150)];
      if (parts.length > 1) {
        updateLayer(selectedTextLayer.id, { text: parts[0].trim() });
        for (let i = 1; i < Math.min(parts.length, 4); i++) { addSlide(); }
        return;
      }
    }
    updateLayer(selectedTextLayer.id, { text: newVal });
  };

  const applyPreset = (type: 'quote' | 'fact' | 'qa' | 'steps') => {
    if (type === 'quote') handleAddText('“A ciência é uma forma de pensar muito mais do que um corpo de conhecimento.”\n— Carl Sagan', 36, 'body');
    if (type === 'fact') handleAddText('💡 VOCÊ SABIA?\n[r:A luz do Sol leva cerca de 8 minutos] para alcançar a Terra.', 38, 'title');
    if (type === 'qa') handleAddText('❓ O QUE ACONTECE NA VELOCIDADE DA LUZ?\nArraste para o lado para entender ➔', 40, 'title');
    if (type === 'steps') handleAddText('🔬 EXPERIMENTO EM 3 PASSOS:\n1. Hipótese inicial\n2. Coleta de dados\n3. Conclusão validada', 34, 'body');
  };

  return (
    <div className="space-y-3 text-fg">
      {/* Submenu 18: Adição & Conteúdo de Texto */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleAddText()}
          className="flex-1 py-2 px-3 rounded-xl bg-[#FFCC00] text-black font-bold text-xs hover:bg-[#FFD633] flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          <span>+ Adicionar Novo Texto</span>
        </button>
        {isScientificIdv && (
          <button
            type="button"
            onClick={() => {
              const math: StudioMathLayer = {
                id: `math-${Date.now()}`, type: 'math', name: `Fórmula ${mathLayers.length + 1}`,
                latex: 'E = mc^2', color: tokens.secondaryColor || '#FFCC00',
                visible: true, locked: false, opacity: 1, x: 0.25, y: 0.5, width: 0.5, height: 0.15, rotation: 0,
              };
              addLayer(math);
            }}
            className="py-2 px-3 rounded-xl border border-border-subtle bg-surface-hover text-amber-600 dark:text-amber-300 font-bold text-xs hover:bg-surface flex items-center gap-1 cursor-pointer"
            title="Inserir Fórmula Científica KaTeX"
          >
            <span className="font-serif font-black text-sm">∑</span>
            <span>Fórmula</span>
          </button>
        )}
      </div>

      {/* Editor do Texto Ativo (Submenus 18, 19 e 20) */}
      {selectedTextLayer && (
        <div className="p-3 rounded-2xl bg-surface-hover/40 border border-border-subtle space-y-3">
          <div className="flex items-center justify-between border-b border-border-subtle pb-1.5">
            <span className="text-xs font-bold text-fg flex items-center gap-1 truncate max-w-[140px]">
              <span className="material-symbols-outlined text-[15px] text-amber-500">edit_note</span>
              {selectedTextLayer.name}
            </span>
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-300 cursor-pointer" title="Auto-dividir em slides se colar texto longo">
                <input type="checkbox" checked={autoSplit} onChange={(e) => setAutoSplit(e.target.checked)} className="rounded-xs accent-amber-400" />
                <span>Auto-dividir</span>
              </label>
              <button type="button" onClick={() => removeLayer(selectedTextLayer.id)} className="p-1 text-red-500 hover:bg-red-500/15 rounded cursor-pointer">
                <span className="material-symbols-outlined text-[15px]">delete</span>
              </button>
            </div>
          </div>

          {/* 67. Seletor de Tipo (Título | Subtítulo | Corpo | Callout) */}
          <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-border-subtle">
            {(['title', 'subtitle', 'body', 'callout'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => updateLayer(selectedTextLayer.id, {
                  textKind: k,
                  fontFamily: k === 'title' || k === 'subtitle' ? tokens.fontDisplay : tokens.fontBody,
                  fontSize: k === 'title' ? 48 : k === 'subtitle' ? 36 : k === 'body' ? 26 : 24,
                  pillBgOpacity: k === 'callout' ? (selectedTextLayer.pillBgOpacity || 90) : selectedTextLayer.pillBgOpacity,
                })}
                className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  (selectedTextLayer.textKind || 'title') === k ? 'bg-[#FFCC00] text-black shadow-xs' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {k === 'title' ? 'Título' : k === 'subtitle' ? 'Subtítulo' : k === 'body' ? 'Corpo' : 'Callout'}
              </button>
            ))}
          </div>

          {/* 66. Editor Inline de Conteúdo Escrito */}
          <textarea
            rows={3}
            value={selectedTextLayer.text}
            onChange={(e) => handleTextChange(e.target.value)}
            className="w-full rounded-xl bg-surface border border-border-subtle p-2 text-xs text-fg focus:outline-none focus:border-[#FFCC00]"
            placeholder="Digite o texto. Suporta [r:SHOW] [b:DE] [g:FÍSICA] ou *destaques*"
          />

          {/* Placeholders Dinâmicos */}
          <div className="flex flex-wrap gap-1">
            {EVENT_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => updateLayer(selectedTextLayer.id, { text: `${selectedTextLayer.text} {${v}}` })}
                className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-600 dark:text-amber-300 text-[10px] font-mono hover:bg-amber-400/25 cursor-pointer"
              >
                +{`{${v}}`}
              </button>
            ))}
          </div>

          {/* Submenu 19: Fontes & Estilo */}
          <div className="space-y-2 pt-2 border-t border-border-subtle">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">
              Submenu 19 • Fontes & Estilo
            </span>

            {/* 68. Seletor de Família com Preview Real (8 fontes) */}
            <div className="grid grid-cols-2 gap-1">
              {FONT_FAMILIES.map((f) => {
                const isSelected = selectedTextLayer.fontFamily?.includes(f.label);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => updateLayer(selectedTextLayer.id, { fontFamily: f.id })}
                    style={{ fontFamily: f.id }}
                    className={`px-2 py-1 rounded-lg text-[11px] text-left truncate border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#FFCC00] text-black font-bold border-[#FFCC00]'
                        : 'bg-surface border-border-subtle text-fg hover:bg-surface-hover'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* 69. Tamanho (Slider + Input Numérico) e 70. Peso (Negrito / Itálico) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-[10px] text-fg-muted">Tam:</span>
                <input
                  type="range" min={12} max={140} step={1} value={selectedTextLayer.fontSize}
                  onChange={(e) => updateLayer(selectedTextLayer.id, { fontSize: Number(e.target.value) })}
                  className="flex-1 studio-range-slider"
                />
                <input
                  type="number" min={12} max={140} value={selectedTextLayer.fontSize}
                  onChange={(e) => updateLayer(selectedTextLayer.id, { fontSize: Math.max(12, Math.min(140, Number(e.target.value) || 24)) })}
                  className="w-12 px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-[10px] font-mono text-fg text-center"
                />
              </div>
              <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border-subtle">
                <button
                  type="button"
                  title="Negrito"
                  onClick={() => updateLayer(selectedTextLayer.id, { bold: !selectedTextLayer.bold })}
                  className={`p-1 rounded text-xs cursor-pointer ${selectedTextLayer.bold ? 'bg-[#FFCC00] text-black font-bold' : 'text-fg-muted hover:text-fg'}`}
                >
                  <span className="material-symbols-outlined text-[14px]">format_bold</span>
                </button>
                <button
                  type="button"
                  title="Itálico"
                  onClick={() => updateLayer(selectedTextLayer.id, { italic: !selectedTextLayer.italic })}
                  className={`p-1 rounded text-xs cursor-pointer ${selectedTextLayer.italic ? 'bg-[#FFCC00] text-black font-bold' : 'text-fg-muted hover:text-fg'}`}
                >
                  <span className="material-symbols-outlined text-[14px]">format_italic</span>
                </button>
              </div>
            </div>

            {/* 71. Espaçamento de Letras e 72. Altura de Linha */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-fg-muted block mb-0.5">Espaçamento: {selectedTextLayer.letterSpacing || 0}px</span>
                <input
                  type="range" min={-4} max={20} step={0.5} value={selectedTextLayer.letterSpacing || 0}
                  onChange={(e) => updateLayer(selectedTextLayer.id, { letterSpacing: Number(e.target.value) })}
                  className="w-full studio-range-slider"
                />
              </div>
              <div>
                <span className="text-[10px] text-fg-muted block mb-0.5">Entrelinha: {(selectedTextLayer.lineHeight || 1.2).toFixed(1)}x</span>
                <input
                  type="range" min={0.8} max={2.4} step={0.1} value={selectedTextLayer.lineHeight || 1.2}
                  onChange={(e) => updateLayer(selectedTextLayer.id, { lineHeight: Number(e.target.value) })}
                  className="w-full studio-range-slider"
                />
              </div>
            </div>
          </div>

          {/* Submenu 20: Cor Principal (HSV Pro), Alinhamento, Tarja Pill & Sombra */}
          <div className="space-y-2.5 pt-2 border-t border-border-subtle">
            <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted block">
              Submenu 20 • Cor, Alinhamento & Sombra
            </span>

            {/* 73. Cor Principal da Fonte + 74. Alinhamento & Caixa Alta */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setColorPickerTarget((t) => (t === 'font' ? null : 'font'))}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold hover:border-[#FFCC00] cursor-pointer"
              >
                <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: selectedTextLayer.color }} />
                <span>Cor da Fonte</span>
              </button>

              <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border-subtle">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align} type="button" onClick={() => updateLayer(selectedTextLayer.id, { align })}
                    className={`p-1 rounded text-xs cursor-pointer ${selectedTextLayer.align === align ? 'bg-[#FFCC00] text-black font-bold' : 'text-fg-muted hover:text-fg'}`}
                  >
                    <span className="material-symbols-outlined text-[14px]">format_align_{align}</span>
                  </button>
                ))}
                <button
                  type="button"
                  title="Caixa Alta (UPPERCASE)"
                  onClick={() => updateLayer(selectedTextLayer.id, { uppercase: !selectedTextLayer.uppercase })}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer ${selectedTextLayer.uppercase ? 'bg-[#FFCC00] text-black' : 'text-fg-muted hover:text-fg'}`}
                >
                  AA
                </button>
              </div>
            </div>

            {colorPickerTarget === 'font' && (
              <StudioProColorPicker
                color={selectedTextLayer.color || '#ffffff'}
                onChange={(hex) => updateLayer(selectedTextLayer.id, { color: hex })}
                label="Cor Principal da Fonte"
              />
            )}

            {/* 75. Tarja Pill com Cor e Opacidade */}
            <div className="p-2 rounded-xl bg-surface border border-border-subtle space-y-1.5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setColorPickerTarget((t) => (t === 'pill' ? null : 'pill'))}
                  className="flex items-center gap-1.5 text-[10px] font-bold cursor-pointer hover:text-amber-500"
                >
                  <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: selectedTextLayer.pillBgColor || '#1F9FCF' }} />
                  <span>Tarja / Pill Fundo ({selectedTextLayer.pillBgOpacity ?? 0}%)</span>
                </button>
                <input
                  type="range" min={0} max={100} value={selectedTextLayer.pillBgOpacity ?? 0}
                  onChange={(e) => updateLayer(selectedTextLayer.id, { pillBgOpacity: Number(e.target.value) })}
                  className="w-24 studio-range-slider"
                />
              </div>
              {colorPickerTarget === 'pill' && (
                <StudioProColorPicker
                  color={selectedTextLayer.pillBgColor || '#1F9FCF'}
                  onChange={(hex) => updateLayer(selectedTextLayer.id, { pillBgColor: hex })}
                  label="Cor da Tarja Pill"
                />
              )}
            </div>

            {/* 76. Sombra de Texto (Blur, Offset X, Offset Y) */}
            <div className="p-2 rounded-xl bg-surface border border-border-subtle space-y-1.5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setColorPickerTarget((t) => (t === 'shadow' ? null : 'shadow'))}
                  className="flex items-center gap-1.5 text-[10px] font-bold cursor-pointer hover:text-amber-500"
                >
                  <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: selectedTextLayer.shadowColor || '#000000' }} />
                  <span>Sombra de Texto</span>
                </button>
                <span className="text-[9px] font-mono text-fg-muted">
                  Blur {selectedTextLayer.shadowBlur ?? 0}px
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[9px] text-fg-muted">
                <div>
                  <span>Blur: {selectedTextLayer.shadowBlur ?? 0}</span>
                  <input
                    type="range" min={0} max={30} value={selectedTextLayer.shadowBlur ?? 0}
                    onChange={(e) => updateLayer(selectedTextLayer.id, { shadowBlur: Number(e.target.value) })}
                    className="w-full studio-range-slider"
                  />
                </div>
                <div>
                  <span>X: {selectedTextLayer.shadowOffsetX ?? 0}</span>
                  <input
                    type="range" min={-20} max={20} value={selectedTextLayer.shadowOffsetX ?? 0}
                    onChange={(e) => updateLayer(selectedTextLayer.id, { shadowOffsetX: Number(e.target.value) })}
                    className="w-full studio-range-slider"
                  />
                </div>
                <div>
                  <span>Y: {selectedTextLayer.shadowOffsetY ?? 2}</span>
                  <input
                    type="range" min={-20} max={20} value={selectedTextLayer.shadowOffsetY ?? 2}
                    onChange={(e) => updateLayer(selectedTextLayer.id, { shadowOffsetY: Number(e.target.value) })}
                    className="w-full studio-range-slider"
                  />
                </div>
              </div>
              {colorPickerTarget === 'shadow' && (
                <StudioProColorPicker
                  color={selectedTextLayer.shadowColor || '#000000'}
                  onChange={(hex) => updateLayer(selectedTextLayer.id, { shadowColor: hex })}
                  label="Cor da Sombra"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Seção Modular de Presets e Preenchimento em Lote */}
      <StudioTextPresetsSection onApplyPreset={applyPreset} onFillBatch={fillEventPlaceholders} />
    </div>
  );
}
