// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import type { StudioShapeLayer, StudioShapeType, StudioTextLayer } from './types';

const SCIENTIFIC_SYMBOLS = ['∑', '∫', '∇', '⊕', 'ħ', 'λ', 'π', 'Δ', 'α', 'β', 'γ', 'Ω', 'μ', 'σ', '≈', '≠', '±', '∞'];

export function StudioElementsGallery() {
  const { addLayer } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [styleMode, setStyleMode] = useState<'idv' | 'neutral'>('idv');

  const activeColor = styleMode === 'idv' ? tokens.primaryColor : '#ffffff';
  const activeSecondary = styleMode === 'idv' ? tokens.secondaryColor : '#FFCC00';

  const handleAddShape = (shapeType: StudioShapeType, name: string) => {
    const isLineOrArrow = shapeType.includes('arrow') || shapeType === 'line' || shapeType === 'science-wave';
    const layer: StudioShapeLayer = {
      id: `shape-${Date.now()}`,
      type: 'shape',
      name,
      shapeType,
      fillColor: activeColor,
      strokeColor: activeSecondary,
      strokeWidth: isLineOrArrow ? 4 : 0,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.35, y: 0.35,
      width: isLineOrArrow ? 0.35 : 0.25,
      height: isLineOrArrow ? 0.08 : 0.25,
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
      x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 0,
    };
    addLayer(layer);
  };

  return (
    <div className="space-y-3.5 p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs">
      {/* Seletor de Modo */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="font-bold text-white uppercase tracking-wider text-[11px]">Galeria de Elementos</span>
        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10 text-[10px] font-bold">
          <button type="button" onClick={() => setStyleMode('idv')} className={`px-2 py-0.5 rounded ${styleMode === 'idv' ? 'bg-[#FFCC00] text-black' : 'text-slate-400'}`}>
            Na IDV
          </button>
          <button type="button" onClick={() => setStyleMode('neutral')} className={`px-2 py-0.5 rounded ${styleMode === 'neutral' ? 'bg-[#FFCC00] text-black' : 'text-slate-400'}`}>
            Neutro
          </button>
        </div>
      </div>

      {/* Formas Geométricas & Callouts */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Formas & Destaques</label>
        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold text-center">
          <button type="button" onClick={() => handleAddShape('rectangle', 'Retângulo')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">Retângulo</button>
          <button type="button" onClick={() => handleAddShape('circle', 'Círculo')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">Círculo</button>
          <button type="button" onClick={() => handleAddShape('triangle', 'Triângulo')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">Triângulo</button>
          <button type="button" onClick={() => handleAddShape('hexagon', 'Hexágono')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">Hexágono</button>
        </div>
      </div>

      {/* Setas Explicativas & Callout */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Setas & Caixas de Fala</label>
        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold text-center">
          <button type="button" onClick={() => handleAddShape('arrow', 'Seta Direta')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">Seta ➔</button>
          <button type="button" onClick={() => handleAddShape('arrow-curved', 'Seta Curva')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">Curva ⤴</button>
          <button type="button" onClick={() => handleAddShape('arrow-double', 'Dupla Ponta')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">Dupla ⇄</button>
          <button type="button" onClick={() => handleAddShape('callout', 'Callout')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">Callout 💬</button>
        </div>
      </div>

      {/* Símbolos Científicos Vetoriais */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Ciência & Física (Vetorial)</label>
        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-bold text-center">
          <button type="button" onClick={() => handleAddShape('science-atom', 'Átomo')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">⚛️ Átomo</button>
          <button type="button" onClick={() => handleAddShape('science-wave', 'Onda Senoidal')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">〰️ Onda</button>
          <button type="button" onClick={() => handleAddShape('circle', 'Lente')} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#FFCC00]">🔍 Lente</button>
        </div>
      </div>

      {/* Letras Gregas e Notação */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Símbolos e Letras Gregas</label>
        <div className="grid grid-cols-6 gap-1">
          {SCIENTIFIC_SYMBOLS.map((s) => (
            <button
              key={s} type="button" onClick={() => handleAddSymbol(s)}
              className="h-7 rounded border border-white/10 bg-white/5 hover:border-[#FFCC00] text-xs font-serif font-bold text-slate-200 flex items-center justify-center cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
