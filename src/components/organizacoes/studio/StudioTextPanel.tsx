// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import { useStudio } from './StudioContext';
import type { StudioTextLayer } from './types';
import { useOrganizationBrand } from '../OrganizationBrandProvider';

export function StudioTextPanel() {
  const { activeSlide, selectedLayerId, setSelectedLayerId, addLayer, updateLayer, removeLayer } = useStudio();
  const { tokens } = useOrganizationBrand();

  const textLayers = activeSlide.layers.filter((l) => l.type === 'text') as StudioTextLayer[];
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
      x: 0.1,
      y: 0.3 + (count * 0.1),
      width: 0.8,
      height: 0.15,
      rotation: 0,
    };
    addLayer(newLayer);
  };

  return (
    <div className="space-y-4">
      {/* Botão para Criar Novo Bloco de Texto */}
      <button
        type="button"
        onClick={handleAddText}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#FFCC00] text-[#121212] font-bold text-xs hover:bg-[#FFD633] transition-all cursor-pointer shadow-sm"
      >
        <span className="material-symbols-outlined text-[16px]">add_circle</span>
        <span>+ Novo Bloco de Texto</span>
      </button>

      {/* Lista de Blocos de Texto */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          Textos Nesta Tela ({textLayers.length})
        </label>
        <div className="flex flex-wrap gap-2">
          {textLayers.map((txt) => {
            const isSelected = txt.id === selectedTextLayer?.id;
            return (
              <button
                key={txt.id}
                type="button"
                onClick={() => setSelectedLayerId(txt.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'border-[#FFCC00] bg-[#FFCC00]/15 text-[#FFCC00]'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">title</span>
                <span className="truncate max-w-[100px]">{txt.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controles do Texto Selecionado */}
      {selectedTextLayer && (
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">edit_note</span>
              {selectedTextLayer.name}
            </span>
            <button
              type="button"
              onClick={() => removeLayer(selectedTextLayer.id)}
              title="Excluir Texto"
              className="p-1 rounded-lg text-red-400 hover:bg-red-500/20"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>

          {/* Textarea com sintaxe */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Conteúdo do Texto</label>
            <textarea
              rows={3}
              value={selectedTextLayer.text}
              onChange={(e) => updateLayer(selectedTextLayer.id, { text: e.target.value })}
              className="w-full rounded-xl bg-black/40 border border-white/15 p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FFCC00]"
              placeholder="Digite o texto. Suporta [r:SHOW] [b:DE] [g:FÍSICA] ou *destaques*"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              💡 Dica: Use <code className="text-amber-300">[r:vermelho]</code>, <code className="text-blue-300">[b:azul]</code>, <code className="text-green-300">[g:verde]</code> ou <code className="text-yellow-300">*destaque*</code>.
            </span>
          </div>

          {/* Tamanho da Fonte */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Tamanho da Fonte</span>
              <span className="font-mono text-white font-bold">{selectedTextLayer.fontSize}px</span>
            </div>
            <input
              type="range"
              min={20}
              max={120}
              step={2}
              value={selectedTextLayer.fontSize}
              onChange={(e) => updateLayer(selectedTextLayer.id, { fontSize: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
          </div>

          {/* Alinhamento e Estilos */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => updateLayer(selectedTextLayer.id, { align })}
                  className={`p-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                    selectedTextLayer.align === align ? 'bg-[#FFCC00] text-black font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">format_align_{align}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => updateLayer(selectedTextLayer.id, { bold: !selectedTextLayer.bold })}
                className={`p-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                  selectedTextLayer.bold ? 'bg-[#FFCC00] text-black font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">format_bold</span>
              </button>
              <button
                type="button"
                onClick={() => updateLayer(selectedTextLayer.id, { italic: !selectedTextLayer.italic })}
                className={`p-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                  selectedTextLayer.italic ? 'bg-[#FFCC00] text-black font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">format_italic</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
