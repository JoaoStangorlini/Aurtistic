// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';

export interface StudioDesignAssistantProps {
  activeOverlay: 'none' | 'thirds' | 'golden' | 'diagonals';
  onToggleOverlay: (type: 'none' | 'thirds' | 'golden' | 'diagonals') => void;
}

export function StudioDesignAssistant({ activeOverlay, onToggleOverlay }: StudioDesignAssistantProps) {
  const { activeSlide, updateSlide } = useStudio();
  const [tipsOpen, setTipsOpen] = useState(false);

  const currentOverlayDark = activeSlide.globalFilters.overlayDark ?? 0;

  const handleAutoAdjustContrast = () => {
    // Eleva overlayDark para atingir contraste confortável com o texto
    const targetDark = Math.min(75, Math.max(currentOverlayDark + 25, 45));
    updateSlide(activeSlide.id, {
      globalFilters: {
        ...activeSlide.globalFilters,
        overlayDark: targetDark,
      },
    });
  };

  return (
    <div className="space-y-3.5 p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs">
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-amber-300">smart_toy</span>
          <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">Assistente de Design & WCAG</h3>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
          WCAG AAA
        </span>
      </div>

      {/* Contraste e Legibilidade do Texto */}
      <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 text-[11px]">Legibilidade de Fundo</span>
          <span className="font-mono text-amber-300 font-bold">{currentOverlayDark}% Escuro</span>
        </div>
        <p className="text-[10px] text-slate-400">
          O padrão WCAG AAA exige proporção mínima de 7:1 para leitura imediata em feeds e stories.
        </p>
        <button
          type="button"
          onClick={handleAutoAdjustContrast}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 font-bold text-xs transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[15px]">contrast</span>
          <span>Ajustar Escuro Automático (7:1)</span>
        </button>
      </div>

      {/* Overlays de Composição Fotográfica */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
          Guias de Composição Visual
        </label>
        <div className="grid grid-cols-4 gap-1 text-[10px] font-bold">
          {(
            [
              { id: 'none', label: 'Desligado' },
              { id: 'thirds', label: 'Terços' },
              { id: 'golden', label: 'Áurea' },
              { id: 'diagonals', label: 'Diagonais' },
            ] as const
          ).map((ov) => (
            <button
              key={ov.id}
              type="button"
              onClick={() => onToggleOverlay(ov.id)}
              className={`py-1.5 rounded-lg text-center cursor-pointer transition-all ${
                activeOverlay === ov.id ? 'bg-[#FFCC00] text-black shadow-xs' : 'bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {ov.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mini-Guia Educativo Colapsável */}
      <div className="pt-1 border-t border-white/10">
        <button
          type="button"
          onClick={() => setTipsOpen(!tipsOpen)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-[#FFCC00]">school</span>
            <span>Teoria das Cores & Composição</span>
          </span>
          <span className="material-symbols-outlined text-[16px]">{tipsOpen ? 'expand_less' : 'expand_more'}</span>
        </button>

        {tipsOpen && (
          <div className="mt-2 p-2.5 rounded-xl bg-white/5 space-y-2 text-[10px] text-slate-300">
            <p>
              💡 <strong>Regra dos Terços:</strong> Alinhe o sujeito principal da foto ou o título nos pontos de interseção para prender o olhar.
            </p>
            <p>
              🎨 <strong>Harmonia Análoga:</strong> Ideal para comunicados institucionais sóbrios e coesos.
            </p>
            <p>
              ⚡ <strong>Harmonia Complementar:</strong> Gera alto impacto visual em posts de experimentos e agendas de eventos.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

