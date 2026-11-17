// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import type { StudioShapeLayer, StudioTextLayer } from './types';

const SCIENTIFIC_SYMBOLS = ['∑', '∫', '∇', '⊕', 'ħ', 'λ', 'π', 'Δ', 'α', 'β', 'γ', 'Ω', 'μ', 'σ', '≈', '≠', '±', '∞'];
const SOCIAL_ICONS = ['share', 'thumb_up', 'favorite', 'chat', 'bookmark', 'location_on', 'calendar_today', 'schedule', 'qr_code', 'mail'];

export function StudioElementsGallery() {
  const { addLayer } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [styleMode, setStyleMode] = useState<'idv' | 'neutral'>('idv');

  const activeColor = styleMode === 'idv' ? tokens.primaryColor : '#ffffff';
  const activeSecondary = styleMode === 'idv' ? tokens.secondaryColor : '#888888';

  const handleAddShape = (shapeType: 'rectangle' | 'circle' | 'line') => {
    const layer: StudioShapeLayer = {
      id: `shape-${Date.now()}`,
      type: 'shape',
      name: `Forma ${shapeType === 'circle' ? 'Círculo' : shapeType === 'rectangle' ? 'Retângulo' : 'Linha'}`,
      shapeType,
      fillColor: activeColor,
      strokeColor: activeSecondary,
      strokeWidth: shapeType === 'line' ? 4 : 0,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.35, y: 0.35,
      width: shapeType === 'line' ? 0.3 : 0.25,
      height: shapeType === 'line' ? 0.01 : 0.25,
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
      {/* Seletor de Modo de Estilo */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <span className="font-bold text-white uppercase tracking-wider text-[11px]">Galeria de Elementos</span>
        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setStyleMode('idv')}
            className={`px-2 py-0.5 rounded cursor-pointer ${styleMode === 'idv' ? 'bg-[#FFCC00] text-black' : 'text-slate-400'}`}
          >
            Na IDV
          </button>
          <button
            type="button"
            onClick={() => setStyleMode('neutral')}
            className={`px-2 py-0.5 rounded cursor-pointer ${styleMode === 'neutral' ? 'bg-[#FFCC00] text-black' : 'text-slate-400'}`}
          >
            Neutro
          </button>
        </div>
      </div>

      {/* Formas Geométricas Básicas */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
          Formas Geométricas
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleAddShape('rectangle')}
            className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:border-[#FFCC00] hover:bg-white/10 flex flex-col items-center gap-1 cursor-pointer transition-all"
          >
            <div className="w-6 h-6 border-2 rounded-xs" style={{ borderColor: activeColor }} />
            <span className="text-[10px] text-slate-300 font-bold">Retângulo</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddShape('circle')}
            className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:border-[#FFCC00] hover:bg-white/10 flex flex-col items-center gap-1 cursor-pointer transition-all"
          >
            <div className="w-6 h-6 border-2 rounded-full" style={{ borderColor: activeColor }} />
            <span className="text-[10px] text-slate-300 font-bold">Círculo</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddShape('line')}
            className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:border-[#FFCC00] hover:bg-white/10 flex flex-col items-center gap-1 cursor-pointer transition-all"
          >
            <div className="w-6 h-0.5 mt-3" style={{ backgroundColor: activeColor }} />
            <span className="text-[10px] text-slate-300 font-bold">Linha</span>
          </button>
        </div>
      </div>

      {/* Símbolos Científicos e Físico-Matemáticos */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
          Símbolos Científicos & Física
        </label>
        <div className="grid grid-cols-6 gap-1.5">
          {SCIENTIFIC_SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleAddSymbol(s)}
              className="h-8 rounded-lg border border-white/10 bg-white/5 hover:border-[#FFCC00] hover:text-[#FFCC00] text-sm font-serif font-bold text-slate-200 flex items-center justify-center transition-all cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Ícones de Ação e Redes */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
          Ícones de Divulgação
        </label>
        <div className="grid grid-cols-5 gap-1.5">
          {SOCIAL_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => handleAddSymbol(ic)}
              className="h-8 rounded-lg border border-white/10 bg-white/5 hover:border-[#FFCC00] hover:text-[#FFCC00] text-slate-300 flex items-center justify-center transition-all cursor-pointer"
              title={ic}
            >
              <span className="material-symbols-outlined text-[16px]">{ic}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

