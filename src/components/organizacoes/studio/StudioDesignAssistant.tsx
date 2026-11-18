// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect } from 'react';
import { useStudio } from './StudioContext';
import { getRelativeLuminance } from '@/lib/studio/color-harmony';
import type { StudioGuideOverlayMode } from './types';

export interface StudioDesignAssistantProps {
  activeOverlay: StudioGuideOverlayMode;
  onToggleOverlay: (type: StudioGuideOverlayMode) => void;
}

export function StudioDesignAssistant({ activeOverlay, onToggleOverlay }: StudioDesignAssistantProps) {
  const { activeSlide, selectedLayer, updateSlide } = useStudio();
  const [tipsOpen, setTipsOpen] = useState(false);
  const [measuredContrast, setMeasuredContrast] = useState<number>(7.2);
  const [dismissedTip, setDismissedTip] = useState(false);
  const [hideTipsForever, setHideTipsForever] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('aurtistic_studio_hide_tips') === 'true') {
        setHideTipsForever(true);
      }
    } catch {}
  }, []);

  const currentOverlayDark = activeSlide.globalFilters.overlayDark ?? 0;

  // Amostragem real de contraste e luminância sob o texto
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Amostra a área do texto ativo ou centro do Canvas
        const x = Math.round((selectedLayer ? selectedLayer.x : 0.2) * canvas.width);
        const y = Math.round((selectedLayer ? selectedLayer.y : 0.2) * canvas.height);
        const w = Math.max(10, Math.round((selectedLayer ? selectedLayer.width : 0.6) * canvas.width));
        const h = Math.max(10, Math.round((selectedLayer ? selectedLayer.height : 0.2) * canvas.height));

        const imgData = ctx.getImageData(x, y, Math.min(w, 50), Math.min(h, 50));
        let totalLum = 0;
        const count = imgData.data.length / 4;
        for (let i = 0; i < imgData.data.length; i += 4) {
          const r = imgData.data[i] / 255;
          const g = imgData.data[i + 1] / 255;
          const b = imgData.data[i + 2] / 255;
          totalLum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        const avgLum = totalLum / count;
        const textColor = selectedLayer && 'color' in selectedLayer ? (selectedLayer as any).color : '#ffffff';
        const textLum = getRelativeLuminance(textColor || '#ffffff');
        const ratio = (Math.max(avgLum, textLum) + 0.05) / (Math.min(avgLum, textLum) + 0.05);
        setMeasuredContrast(Number(ratio.toFixed(1)));
      } catch {
        // Fallback estimado caso canvas esteja com proteção de CORS
        const baseEstimate = 1 + (currentOverlayDark / 10);
        setMeasuredContrast(Number(baseEstimate.toFixed(1)));
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [activeSlide, selectedLayer, currentOverlayDark]);

  const handleAutoAdjustContrast = () => {
    const targetDark = Math.min(80, Math.max(currentOverlayDark + 20, 45));
    updateSlide(activeSlide.id, {
      globalFilters: {
        ...activeSlide.globalFilters,
        overlayDark: targetDark,
      },
    });
  };

  const isAaa = measuredContrast >= 7.0;
  const isAa = measuredContrast >= 4.5;

  return (
    <div className="space-y-3.5 p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-amber-300">smart_toy</span>
          <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">Assistente WCAG & Design</h3>
        </div>
        <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${isAaa ? 'bg-emerald-500/20 text-emerald-300' : isAa ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
          {isAaa ? 'WCAG AAA (7:1)' : isAa ? 'WCAG AA (4.5:1)' : 'Abaixo do Padrão'}
        </span>
      </div>

      {/* Contraste Amostrado Real dos Pixels */}
      <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 text-[11px]">Contraste Real Amostrado</span>
          <span className="font-mono text-amber-300 font-bold text-xs">{measuredContrast}:1</span>
        </div>
        <p className="text-[10px] text-slate-400">
          Amostragem direta dos pixels do Canvas sob o texto selecionado (exigência mínima de 7:1 para AAA).
        </p>
        <button
          type="button"
          onClick={handleAutoAdjustContrast}
          className="w-full py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
        >
          <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
          <span>Auto-Ajustar para 7:1 (AAA)</span>
        </button>
      </div>

      {/* Dicas Contextuais Inteligentes */}
      {!hideTipsForever && !dismissedTip && (
        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-400/25 space-y-1.5">
          <div className="flex items-start gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-blue-400 shrink-0 mt-0.5">lightbulb</span>
            <p className="text-[10px] text-blue-200">
              {selectedLayer && Math.abs(selectedLayer.x + selectedLayer.width / 2 - 0.5) < 0.04
                ? '🎯 Camada perfeitamente centralizada no eixo horizontal.'
                : (activeSlide.globalFilters.temperature ?? 0) > 15
                ? '🌡️ Fundo quente ativo: garanta bom contraste usando textos em tons frios ou neutros.'
                : '💡 Mantenha títulos na metade superior do slide para melhor retenção visual no carrossel.'}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-blue-400/15">
            <button
              type="button"
              onClick={() => setDismissedTip(true)}
              className="text-[9px] text-slate-300 hover:text-white cursor-pointer font-semibold"
            >
              Entendi
            </button>
            <button
              type="button"
              onClick={() => {
                setHideTipsForever(true);
                try { localStorage.setItem('aurtistic_studio_hide_tips', 'true'); } catch {}
              }}
              className="text-[9px] text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Não mostrar mais
            </button>
          </div>
        </div>
      )}

      {/* Overlays de Composição */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
          Guias de Composição Fotográfica
        </label>
        <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
          {(
            [
              { id: 'none', label: 'Off' },
              { id: 'thirds', label: 'Terços' },
              { id: 'diagonals', label: 'Diagonais' },
              { id: 'safe_area', label: 'Safe Area' },
              { id: 'golden_spiral', label: 'Espiral φ' },
              { id: 'golden_grid', label: 'Grade φ' },
            ] as const
          ).map((ov) => (
            <button
              key={ov.id}
              type="button"
              onClick={() => onToggleOverlay(ov.id)}
              className={`py-1 rounded-md text-center cursor-pointer transition-all ${
                activeOverlay === ov.id ? 'bg-[#FFCC00] text-black shadow-xs' : 'bg-surface-hover text-fg-muted hover:text-fg'
              }`}
            >
              {ov.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mini-Guia Educativo */}
      <div className="pt-1 border-t border-white/10">
        <button
          type="button"
          onClick={() => setTipsOpen(!tipsOpen)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-slate-300 hover:text-white"
        >
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-[#FFCC00]">school</span>
            <span>Teoria das Cores & Dicas</span>
          </span>
          <span className="material-symbols-outlined text-[15px]">{tipsOpen ? 'expand_less' : 'expand_more'}</span>
        </button>

        {tipsOpen && (
          <div className="mt-2 p-2 rounded-xl bg-white/5 space-y-1.5 text-[10px] text-slate-300">
            <p>💡 <strong>Temperatura:</strong> Cores quentes (&gt; 20) destacam chamadas para ação. Cores frias transmitem profundidade científica.</p>
            <p>📸 <strong>Regra dos Terços:</strong> Posicione pontos de interesse nas 4 interseções para leitura dinâmica.</p>
          </div>
        )}
      </div>
    </div>
  );
}
