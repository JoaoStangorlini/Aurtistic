// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { StudioLiveSlider } from './StudioLiveSlider';
import { StudioProColorPicker } from './StudioProColorPicker';
import { StudioHelpTooltip } from './StudioHelpTooltip';
import { isLayerEffectivelyLocked } from '@/lib/studio/folder-utils';
import type { StudioBrushKind, StudioDrawingLayer } from './types';

const BRUSH_TOOLS: { id: StudioBrushKind; label: string; icon: string }[] = [
  { id: 'pen', label: 'Caneta', icon: 'edit' },
  { id: 'marker', label: 'Marcador', icon: 'stylus' },
  { id: 'highlighter', label: 'Marca-Texto', icon: 'ink_highlighter' },
  { id: 'neon', label: 'Neon', icon: 'flare' },
  { id: 'spray', label: 'Spray', icon: 'grain' },
  { id: 'dashed', label: 'Tracejado', icon: 'line_style' },
  { id: 'eraser', label: 'Borracha', icon: 'ink_eraser' },
];

export function StudioBrushPanel({ onExitBrushMode }: { onExitBrushMode: () => void }) {
  const {
    activeSlide,
    selectedLayer,
    activeBrush,
    setActiveBrush,
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    brushOpacity,
    setBrushOpacity,
    undoLastBrushStroke,
    clearDrawingLayer,
    createNewDrawingLayer,
  } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [showColorPicker, setShowColorPicker] = useState(false);

  const activeDrawing =
    selectedLayer?.type === 'drawing'
      ? (selectedLayer as StudioDrawingLayer)
      : ([...activeSlide.layers].reverse().find((l) => l.type === 'drawing') as StudioDrawingLayer | undefined);

  const quickColors = [
    '#FFFFFF',
    '#FFCC00',
    '#00D4FF',
    '#FF1E56',
    '#00FF66',
    tokens.primaryColor || '#1F9FCF',
    tokens.secondaryColor || '#FFCC00',
    '#000000',
  ];

  return (
    <div className="space-y-3 text-fg text-xs">
      {/* 7 Pincéis Livres */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <span>7 Pincéis Livres</span>
            <StudioHelpTooltip helpKey="brush.tools" />
          </span>
          <button
            type="button"
            onClick={onExitBrushMode}
            className="px-2 py-0.5 rounded-lg bg-surface border border-border-subtle hover:border-[#FFCC00] text-[10px] font-bold text-fg-secondary hover:text-fg cursor-pointer"
          >
            Voltar para Seleção
          </button>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {BRUSH_TOOLS.map((b) => {
            const active = activeBrush === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBrush(b.id)}
                className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 text-[10px] font-bold cursor-pointer transition-all ${
                  active
                    ? 'bg-[#FFCC00] text-black border-[#FFCC00] shadow-xs'
                    : 'bg-surface border-border-subtle text-fg-secondary hover:text-fg'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{b.icon}</span>
                <span className="truncate max-w-full">{b.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders (transparentScrub={false} para não esconder a gaveta sem traço em tela) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 rounded-2xl bg-surface-hover/40 border border-border-subtle">
        <StudioLiveSlider
          id="brush-size"
          label="Tamanho"
          helpKey="brush.size"
          value={brushSize}
          min={2}
          max={80}
          unit="px"
          transparentScrub={false}
          onChange={setBrushSize}
        />
        <StudioLiveSlider
          id="brush-opacity"
          label="Opacidade"
          helpKey="brush.opacity"
          value={brushOpacity}
          min={10}
          max={100}
          unit="%"
          transparentScrub={false}
          onChange={setBrushOpacity}
        />
      </div>

      {/* Cores rápidas + HSV Pro */}
      {activeBrush !== 'eraser' && (
        <div className="space-y-2 p-2.5 rounded-2xl bg-surface-hover/40 border border-border-subtle">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {quickColors.map((hex, i) => (
                <button
                  key={`${hex}-${i}`}
                  type="button"
                  onClick={() => setBrushColor(hex)}
                  aria-label={`Cor ${hex}`}
                  className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${
                    brushColor.toLowerCase() === hex.toLowerCase()
                      ? 'border-[#FFCC00] scale-110 shadow'
                      : 'border-white/25'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowColorPicker((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-surface border border-border-subtle text-[10px] font-bold hover:border-[#FFCC00] cursor-pointer"
            >
              {showColorPicker ? 'Fechar Cor' : 'Cor Personalizada'}
            </button>
          </div>

          {showColorPicker && (
            <StudioProColorPicker
              color={brushColor}
              onChange={setBrushColor}
              label="Cor do Pincel"
            />
          )}
        </div>
      )}

      {/* Ações da Camada de Desenho */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={!activeDrawing || activeDrawing.strokes.length === 0}
          onClick={undoLastBrushStroke}
          className="py-1.5 px-2 rounded-xl bg-surface border border-border-subtle text-[10px] font-bold hover:border-[#FFCC00] disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">undo</span>
          <span>Desfazer Traço</span>
        </button>
        <button
          type="button"
          onClick={createNewDrawingLayer}
          className="py-1.5 px-2 rounded-xl bg-surface border border-border-subtle text-[10px] font-bold hover:border-[#FFCC00] cursor-pointer flex items-center justify-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          <span>+ Nova Camada</span>
        </button>
        <button
          type="button"
          disabled={!activeDrawing || isLayerEffectivelyLocked(activeDrawing, activeSlide.folders) || activeDrawing.strokes.length === 0}
          onClick={() => activeDrawing && !isLayerEffectivelyLocked(activeDrawing, activeSlide.folders) && clearDrawingLayer(activeDrawing.id)}
          className="py-1.5 px-2 rounded-xl bg-surface border border-border-subtle text-[10px] font-bold text-red-400 hover:border-red-500 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
          <span>Limpar</span>
        </button>
      </div>
    </div>
  );
}
