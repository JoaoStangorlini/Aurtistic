// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import type { StudioTextLayer, StudioMathLayer } from './types';
import { useOrganizationBrand } from '../OrganizationBrandProvider';

const EVENT_VARIABLES = ['DATA', 'HORARIO', 'LOCAL', 'PALESTRANTE', 'TEMA'];

export function StudioTextPanel() {
  const { activeSlide, selectedLayerId, setSelectedLayerId, addLayer, updateLayer, removeLayer, fillEventPlaceholders } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [replacements, setReplacements] = useState<Record<string, string>>({ DATA: '', HORARIO: '', LOCAL: '', PALESTRANTE: '' });
  const [showReplacer, setShowReplacer] = useState(false);

  const textLayers = activeSlide.layers.filter((l) => l.type === 'text') as StudioTextLayer[];
  const mathLayers = activeSlide.layers.filter((l) => l.type === 'math') as StudioMathLayer[];
  const selectedTextLayer = textLayers.find((l) => l.id === selectedLayerId) || textLayers[0] || null;

  const handleAddText = () => {
    const count = textLayers.length + 1;
    const newLayer: StudioTextLayer = {
      id: `text-${Date.now()}`,
      type: 'text',
      name: `Texto ${count}`,
      text: count === 1 ? 'Novo Título' : 'Novo Parágrafo ou Mensagem',
      fontFamily: tokens.fontDisplay || 'sans-serif',
      fontSize: count === 1 ? 52 : 36,
      color: tokens.textPrimary || '#ffffff',
      align: 'center',
      bold: true,
      italic: false,
      lineHeight: 1.2,
      letterSpacing: 0,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.1, y: 0.3 + (count * 0.1), width: 0.8, height: 0.15, rotation: 0,
    };
    addLayer(newLayer);
  };

  const handleAddMathFormula = () => {
    const newLayer: StudioMathLayer = {
      id: `math-${Date.now()}`,
      type: 'math',
      name: `Fórmula ${mathLayers.length + 1}`,
      latex: 'E = mc^2',
      color: tokens.secondaryColor || '#FFCC00',
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.25, y: 0.5, width: 0.5, height: 0.15, rotation: 0,
    };
    addLayer(newLayer);
  };

  const insertVariable = (varName: string) => {
    if (!selectedTextLayer) return;
    updateLayer(selectedTextLayer.id, { text: `${selectedTextLayer.text} {${varName}}` });
  };

  return (
    <div className="space-y-3.5">
      {/* Botões de Ação para Criar Texto ou Fórmula */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAddText}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#FFCC00] text-[#121212] font-bold text-xs hover:bg-[#FFD633] transition-all cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          <span>+ Texto</span>
        </button>
        <button
          type="button"
          onClick={handleAddMathFormula}
          className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl border border-white/20 bg-white/5 text-amber-300 font-bold text-xs hover:bg-white/10 transition-all cursor-pointer shadow-sm"
          title="Inserir Fórmula Matemática / KaTeX"
        >
          <span className="font-serif font-black text-sm">∑</span>
          <span>Fórmula</span>
        </button>
      </div>

      {/* Lista de Blocos de Texto */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Textos Nesta Tela ({textLayers.length})
        </label>
        <div className="flex flex-wrap gap-1.5">
          {textLayers.map((txt) => (
            <button
              key={txt.id}
              type="button"
              onClick={() => setSelectedLayerId(txt.id)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                txt.id === selectedTextLayer?.id ? 'border-[#FFCC00] bg-[#FFCC00]/15 text-[#FFCC00]' : 'border-white/10 bg-white/5 text-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">title</span>
              <span className="truncate max-w-[85px]">{txt.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Controles do Texto Selecionado */}
      {selectedTextLayer && (
        <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-xs font-bold text-white flex items-center gap-1 truncate max-w-[150px]">
              <span className="material-symbols-outlined text-[15px] text-[#FFCC00]">edit_note</span>
              {selectedTextLayer.name}
            </span>
            <button
              type="button"
              onClick={() => removeLayer(selectedTextLayer.id)}
              className="p-1 rounded-lg text-red-400 hover:bg-red-500/20"
            >
              <span className="material-symbols-outlined text-[15px]">delete</span>
            </button>
          </div>

          <div>
            <textarea
              rows={3}
              value={selectedTextLayer.text}
              onChange={(e) => updateLayer(selectedTextLayer.id, { text: e.target.value })}
              className="w-full rounded-xl bg-black/40 border border-white/15 p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FFCC00]"
              placeholder="Digite o texto. Suporta [r:SHOW] [b:DE] [g:FÍSICA] ou *destaques*"
            />
          </div>

          {/* Variáveis Dinâmicas de Evento */}
          <div>
            <span className="text-[10px] text-slate-400 block mb-1">Placeholders Rápidos:</span>
            <div className="flex flex-wrap gap-1">
              {EVENT_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 text-[10px] font-mono hover:bg-amber-400/25"
                >
                  +{`{${v}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Tamanho da Fonte */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400 text-[11px]">Tamanho da Fonte</span>
              <span className="font-mono text-white font-bold text-[11px]">{selectedTextLayer.fontSize}px</span>
            </div>
            <input
              type="range" min={18} max={110} step={2} value={selectedTextLayer.fontSize}
              onChange={(e) => updateLayer(selectedTextLayer.id, { fontSize: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
          </div>

          {/* Alinhamento e Estilos */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => updateLayer(selectedTextLayer.id, { align })}
                  className={`p-1.5 rounded-lg text-xs cursor-pointer ${selectedTextLayer.align === align ? 'bg-[#FFCC00] text-black font-bold' : 'text-slate-400'}`}
                >
                  <span className="material-symbols-outlined text-[15px]">format_align_{align}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => updateLayer(selectedTextLayer.id, { bold: !selectedTextLayer.bold })}
                className={`p-1.5 rounded-lg text-xs cursor-pointer ${selectedTextLayer.bold ? 'bg-[#FFCC00] text-black font-bold' : 'text-slate-400'}`}
              >
                <span className="material-symbols-outlined text-[15px]">format_bold</span>
              </button>
              <button
                type="button"
                onClick={() => updateLayer(selectedTextLayer.id, { italic: !selectedTextLayer.italic })}
                className={`p-1.5 rounded-lg text-xs cursor-pointer ${selectedTextLayer.italic ? 'bg-[#FFCC00] text-black font-bold' : 'text-slate-400'}`}
              >
                <span className="material-symbols-outlined text-[15px]">format_italic</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Substituidor em Lote de Variáveis */}
      <div className="pt-1 border-t border-white/10">
        <button
          type="button"
          onClick={() => setShowReplacer(!showReplacer)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-slate-300 hover:text-white"
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-amber-300">event_note</span>
            <span>Preenchimento de Eventos em Lote</span>
          </span>
          <span className="material-symbols-outlined text-[16px]">{showReplacer ? 'expand_less' : 'expand_more'}</span>
        </button>

        {showReplacer && (
          <div className="mt-2 p-2.5 rounded-xl bg-white/5 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text" placeholder="Data (ex: 28/Nov)" value={replacements.DATA}
                onChange={(e) => setReplacements({ ...replacements, DATA: e.target.value })}
                className="p-1.5 rounded bg-black/40 border border-white/15 text-[11px] text-white"
              />
              <input
                type="text" placeholder="Horário (ex: 15h00)" value={replacements.HORARIO}
                onChange={(e) => setReplacements({ ...replacements, HORARIO: e.target.value })}
                className="p-1.5 rounded bg-black/40 border border-white/15 text-[11px] text-white"
              />
            </div>
            <input
              type="text" placeholder="Local (ex: Auditório Alessandro Volta)" value={replacements.LOCAL}
              onChange={(e) => setReplacements({ ...replacements, LOCAL: e.target.value })}
              className="w-full p-1.5 rounded bg-black/40 border border-white/15 text-[11px] text-white"
            />
            <button
              type="button"
              onClick={() => fillEventPlaceholders(replacements)}
              className="w-full py-1.5 rounded-xl bg-[#FFCC00] text-black font-black text-xs hover:bg-[#FFD633]"
            >
              Aplicar em Todos os Slides
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
