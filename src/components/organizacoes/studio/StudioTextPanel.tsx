// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import type { StudioTextLayer, StudioMathLayer } from './types';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { StudioTextPresetsSection } from './StudioTextPresetsSection';

const EVENT_VARIABLES = ['DATA', 'HORARIO', 'LOCAL', 'PALESTRANTE'];

export function StudioTextPanel() {
  const { activeSlide, selectedLayerId, setSelectedLayerId, addLayer, updateLayer, removeLayer, fillEventPlaceholders, addSlide } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [autoSplit, setAutoSplit] = useState(false);

  const textLayers = activeSlide.layers.filter((l) => l.type === 'text') as StudioTextLayer[];
  const mathLayers = activeSlide.layers.filter((l) => l.type === 'math') as StudioMathLayer[];
  const selectedTextLayer = textLayers.find((l) => l.id === selectedLayerId) || textLayers[0] || null;

  const isScientificIdv = tokens.badgeTag?.toLowerCase().includes('lab') || tokens.themeId?.toLowerCase().includes('lab') || true;

  const handleAddText = (customText?: string, fontSize = 42, kind: 'title' | 'subtitle' | 'body' | 'label' = 'title') => {
    const count = textLayers.length + 1;
    const newLayer: StudioTextLayer = {
      id: `text-${Date.now()}`,
      type: 'text',
      name: `Texto ${count}`,
      textKind: kind,
      text: customText || (kind === 'title' ? 'Novo Título' : 'Novo Parágrafo'),
      fontFamily: kind === 'title' ? tokens.fontDisplay : tokens.fontBody,
      fontSize,
      color: tokens.textPrimary || '#ffffff',
      align: 'center',
      bold: kind === 'title',
      italic: false,
      lineHeight: 1.2,
      letterSpacing: 0,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.1, y: 0.25 + (count * 0.08), width: 0.8, height: 0.2, rotation: 0,
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
    <div className="space-y-3">
      {/* Botões de Criação */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleAddText()}
          className="flex-1 py-2 px-3 rounded-xl bg-[#FFCC00] text-black font-bold text-xs hover:bg-[#FFD633] flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          <span>+ Texto</span>
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
            className="py-2 px-3 rounded-xl border border-white/20 bg-white/5 text-amber-300 font-bold text-xs hover:bg-white/10 flex items-center gap-1 cursor-pointer"
            title="Inserir Fórmula Científica KaTeX"
          >
            <span className="font-serif font-black text-sm">∑</span>
            <span>Fórmula</span>
          </button>
        )}
      </div>

      {/* Editor do Texto Ativo */}
      {selectedTextLayer && (
        <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-xs font-bold text-white flex items-center gap-1 truncate max-w-[140px]">
              <span className="material-symbols-outlined text-[15px] text-[#FFCC00]">edit_note</span>
              {selectedTextLayer.name}
            </span>
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1 text-[10px] text-amber-300 cursor-pointer" title="Auto-dividir em slides se colar texto longo">
                <input type="checkbox" checked={autoSplit} onChange={(e) => setAutoSplit(e.target.checked)} className="rounded-xs accent-amber-400" />
                <span>Auto-dividir</span>
              </label>
              <button type="button" onClick={() => removeLayer(selectedTextLayer.id)} className="p-1 text-red-400 hover:bg-red-500/20 rounded cursor-pointer">
                <span className="material-symbols-outlined text-[15px]">delete</span>
              </button>
            </div>
          </div>

          {/* Tipo Hierárquico: Title | Subtitle | Body | Label */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
            {(['title', 'subtitle', 'body', 'label'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => updateLayer(selectedTextLayer.id, {
                  textKind: k,
                  fontFamily: k === 'title' || k === 'subtitle' ? tokens.fontDisplay : tokens.fontBody,
                  fontSize: k === 'title' ? 48 : k === 'subtitle' ? 36 : k === 'body' ? 26 : 18,
                })}
                className={`flex-1 py-0.5 rounded text-[10px] font-bold capitalize transition-all cursor-pointer ${
                  (selectedTextLayer.textKind || 'title') === k ? 'bg-[#FFCC00] text-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                {k === 'title' ? 'Título' : k === 'subtitle' ? 'Sub' : k === 'body' ? 'Corpo' : 'Tag'}
              </button>
            ))}
          </div>

          <textarea
            rows={3}
            value={selectedTextLayer.text}
            onChange={(e) => handleTextChange(e.target.value)}
            className="w-full rounded-xl bg-black/40 border border-white/15 p-2 text-xs text-white focus:outline-none focus:border-[#FFCC00]"
            placeholder="Digite o texto. Suporta [r:SHOW] [b:DE] [g:FÍSICA] ou *destaques*"
          />

          {/* Placeholders Dinâmicos */}
          <div className="flex flex-wrap gap-1">
            {EVENT_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => updateLayer(selectedTextLayer.id, { text: `${selectedTextLayer.text} {${v}}` })}
                className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 text-[10px] font-mono hover:bg-amber-400/25 cursor-pointer"
              >
                +{`{${v}}`}
              </button>
            ))}
          </div>

          {/* Fonte, Espaçamento e Entrelinha */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block mb-0.5">Espaçamento: {selectedTextLayer.letterSpacing || 0}px</span>
              <input
                type="range" min={-2} max={10} step={0.5} value={selectedTextLayer.letterSpacing || 0}
                onChange={(e) => updateLayer(selectedTextLayer.id, { letterSpacing: Number(e.target.value) })}
                className="w-full cursor-pointer"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block mb-0.5">Entrelinha: {(selectedTextLayer.lineHeight || 1.2).toFixed(1)}x</span>
              <input
                type="range" min={0.8} max={2.0} step={0.1} value={selectedTextLayer.lineHeight || 1.2}
                onChange={(e) => updateLayer(selectedTextLayer.id, { lineHeight: Number(e.target.value) })}
                className="w-full cursor-pointer"
              />
            </div>
          </div>

          {/* Tamanho e Alinhamento */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-400">Tam:</span>
              <input
                type="range" min={16} max={96} step={2} value={selectedTextLayer.fontSize}
                onChange={(e) => updateLayer(selectedTextLayer.id, { fontSize: Number(e.target.value) })}
                className="w-20 cursor-pointer"
              />
              <span className="font-mono text-white text-[10px]">{selectedTextLayer.fontSize}</span>
            </div>

            <div className="flex items-center gap-1 bg-black/30 p-0.5 rounded-lg border border-white/10">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align} type="button" onClick={() => updateLayer(selectedTextLayer.id, { align })}
                  className={`p-1 rounded text-xs cursor-pointer ${selectedTextLayer.align === align ? 'bg-[#FFCC00] text-black font-bold' : 'text-slate-400'}`}
                >
                  <span className="material-symbols-outlined text-[14px]">format_align_{align}</span>
                </button>
              ))}
              <button
                type="button" onClick={() => updateLayer(selectedTextLayer.id, { bold: !selectedTextLayer.bold })}
                className={`p-1 rounded text-xs cursor-pointer ${selectedTextLayer.bold ? 'bg-[#FFCC00] text-black font-bold' : 'text-slate-400'}`}
              >
                <span className="material-symbols-outlined text-[14px]">format_bold</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seção Modular de Presets e Preenchimento em Lote */}
      <StudioTextPresetsSection onApplyPreset={applyPreset} onFillBatch={fillEventPlaceholders} />
    </div>
  );
}
