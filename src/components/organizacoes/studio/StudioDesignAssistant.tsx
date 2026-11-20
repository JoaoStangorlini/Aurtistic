// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { ASPECT_DIMENSIONS, type StudioSlide, type StudioTextLayer } from './types';
import { renderSlideToCanvas } from '@/lib/studio/canvas-renderer';
import { isLayerEffectivelyVisible } from '@/lib/studio/folder-utils';
import { getRotatedLayerAabb } from '@/lib/studio/stage-geometry';
import { StudioHelpTooltip } from './StudioHelpTooltip';

interface TextAuditItem {
  layerId: string;
  previewText: string;
  textColor: string;
  bgSampleHex: string;
  minRatio: number;
  avgRatio: number;
  level: 'AAA' | 'AA' | 'Atenção';
  suggestion: string;
}

const MINI_COURSE_CARDS: {
  id: string;
  title: string;
  avoid: string;
  recommended: string;
  icon: string;
}[] = [
  {
    id: 'contrast',
    title: 'Contraste Texto x Fundo',
    avoid: 'Texto claro direto sobre áreas claras ou foto muito detalhada sem apoio.',
    recommended: 'Busque razão >= 4.5:1 usando tarja de fundo, sombra suave ou escurecendo a foto.',
    icon: 'contrast',
  },
  {
    id: 'hierarchy',
    title: 'Hierarquia em 3 Níveis',
    avoid: 'Todos os textos do slide com o mesmo tamanho e peso tipográfico.',
    recommended: 'Título grande em destaque, subtítulo médio e legenda objetiva (24px–32px+).',
    icon: 'format_size',
  },
  {
    id: 'safe-area',
    title: 'Margens Seguras (Safe Area)',
    avoid: 'Textos colados nas bordas onde botões do Instagram/TikTok cobrem a leitura.',
    recommended: 'Ative Guias → Margens Safe Area e mantenha textos dentro da zona central.',
    icon: 'crop_free',
  },
  {
    id: 'line-length',
    title: 'Largura de Leitura',
    avoid: 'Parágrafos longos ocupando 100% da largura sem respiro lateral.',
    recommended: 'Limite caixas de texto a 60%–80% da largura com alinhamento consistente.',
    icon: 'view_column',
  },
  {
    id: 'latex',
    title: 'Equações LaTeX Legíveis',
    avoid: 'Fórmulas pequenas com fontes decorativas ou mistura de símbolos quebrados.',
    recommended: 'Use o modo LaTeX ($...$) em Texto e aumente o contraste ao redor da equação.',
    icon: 'functions',
  },
  {
    id: 'bokeh',
    title: 'Foco no Assunto Principal',
    avoid: 'Fundo competindo com o texto principal por excesso de nitidez e textura.',
    recommended: 'Use Ajustar → Foco & Bokeh + Máscara para suavizar apenas atrás da legenda.',
    icon: 'blur_on',
  },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 255, g: 255, b: 255 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function blendOverRgb(
  base: { r: number; g: number; b: number },
  overlayHex: string,
  alpha: number
): { r: number; g: number; b: number } {
  const ov = hexToRgb(overlayHex);
  const a = Math.max(0, Math.min(1, alpha));
  return {
    r: Math.round(base.r * (1 - a) + ov.r * a),
    g: Math.round(base.g * (1 - a) + ov.g * a),
    b: Math.round(base.b * (1 - a) + ov.b * a),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function StudioDesignAssistant() {
  const { activeSlide, aspectRatio, setSelectedLayerId } = useStudio();
  const { tokens } = useOrganizationBrand();
  const [tab, setTab] = useState<'audit' | 'course'>('audit');
  const [audits, setAudits] = useState<TextAuditItem[]>([]);
  const [taintedSkipped, setTaintedSkipped] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runIdRef = useRef(0);

  // Debounce curto (200ms) + 1 único canvas offscreen reutilizado em escala reduzida (~0.25x, máx. 270px)
  useEffect(() => {
    if (typeof document === 'undefined' || tab !== 'audit') return;
    let cancelled = false;
    const myRunId = ++runIdRef.current;

    const timer = window.setTimeout(() => {
      if (cancelled || runIdRef.current !== myRunId) return;
      const textLayers = activeSlide.layers.filter(
        (l): l is StudioTextLayer => l.type === 'text' && isLayerEffectivelyVisible(l, activeSlide.folders)
      );
      if (textLayers.length === 0) {
        if (!cancelled && runIdRef.current === myRunId) {
          setAudits([]);
          setTaintedSkipped(false);
        }
        return;
      }

      const dims = ASPECT_DIMENSIONS[aspectRatio];
      const sampleW = Math.min(270, Math.max(180, Math.round(dims.width * 0.25)));
      const sampleH = Math.max(100, Math.round((sampleW * dims.height) / dims.width));

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const results: TextAuditItem[] = [];
      let hadTainted = false;

      for (const textLayer of textLayers) {
        const targetIdx = activeSlide.layers.findIndex((l) => l.id === textLayer.id);
        if (targetIdx < 0) continue;

        // Renderiza estritamente as camadas ANTERIORES ao texto avaliado (sem auto-poluição)
        const bgOnlySlide: StudioSlide = {
          ...activeSlide,
          layers: activeSlide.layers.slice(0, targetIdx),
        };
        renderSlideToCanvas(ctx, bgOnlySlide, sampleW, sampleH, tokens);

        const aabb = getRotatedLayerAabb(textLayer);
        const x0 = Math.max(0, Math.floor(aabb.minX * sampleW));
        const y0 = Math.max(0, Math.floor(aabb.minY * sampleH));
        const x1 = Math.min(sampleW, Math.ceil(aabb.maxX * sampleW));
        const y1 = Math.min(sampleH, Math.ceil(aabb.maxY * sampleH));
        const boxW = Math.max(4, x1 - x0);
        const boxH = Math.max(4, y1 - y0);

        let imageData: ImageData;
        try {
          imageData = ctx.getImageData(x0, y0, boxW, boxH);
        } catch {
          hadTainted = true;
          continue;
        }

        const data = imageData.data;
        const textRgb = hexToRgb(textLayer.color || '#ffffff');
        const pillAlpha = (textLayer.pillBgOpacity ?? 0) / 100;
        const pillHex = textLayer.pillBgColor || '#1F9FCF';

        let minRatio = 21;
        let sumRatio = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let count = 0;

        // Amostra grade 10x10 rotacionada pelo pivô único [x+w/2, y+h/2]
        const cx = (textLayer.x + textLayer.width / 2) * sampleW;
        const cy = (textLayer.y + textLayer.height / 2) * sampleH;
        const lw = textLayer.width * sampleW;
        const lh = textLayer.height * sampleH;
        const rad = ((textLayer.rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        for (let gy = 0; gy < 10; gy++) {
          const ly = ((gy + 0.5) / 10 - 0.5) * lh;
          for (let gx = 0; gx < 10; gx++) {
            const lx = ((gx + 0.5) / 10 - 0.5) * lw;
            const px = Math.round(cx + lx * cos - ly * sin) - x0;
            const py = Math.round(cy + lx * sin + ly * cos) - y0;
            if (px < 0 || px >= boxW || py < 0 || py >= boxH) continue;
            const offset = (py * boxW + px) * 4;
            let bgRgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
            if (pillAlpha > 0) {
              bgRgb = blendOverRgb(bgRgb, pillHex, pillAlpha);
            }
            const ratio = getContrastRatio(textRgb, bgRgb);
            if (ratio < minRatio) minRatio = ratio;
            sumRatio += ratio;
            sumR += bgRgb.r;
            sumG += bgRgb.g;
            sumB += bgRgb.b;
            count++;
          }
        }

        if (count === 0) continue;

        const avgRatio = sumRatio / count;
        const avgHex = rgbToHex(sumR / count, sumG / count, sumB / count);
        const level: TextAuditItem['level'] =
          minRatio >= 7 ? 'AAA' : minRatio >= 4.5 ? 'AA' : 'Atenção';

        let suggestion = 'Contraste excelente para leitura em qualquer tela.';
        if (level === 'Atenção') {
          suggestion =
            'Contraste baixo atrás do texto. Abra Texto → Estilo para ativar tarja/sombra, ou reduza a exposição da foto em Ajustar → Luz.';
        } else if (minRatio < 4.5 && avgRatio >= 4.5) {
          suggestion =
            'O contraste médio é bom, mas há trechos da foto competindo com a letra. Adicione sombra no texto ou leve desfoque em Ajustar → Foco & Bokeh.';
        }

        results.push({
          layerId: textLayer.id,
          previewText: (textLayer.text || 'Texto sem conteúdo').slice(0, 40),
          textColor: textLayer.color || '#ffffff',
          bgSampleHex: avgHex,
          minRatio: Number(minRatio.toFixed(1)),
          avgRatio: Number(avgRatio.toFixed(1)),
          level,
          suggestion,
        });
      }

      if (cancelled || runIdRef.current !== myRunId) return;
      setAudits(results);
      setTaintedSkipped(hadTainted);
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSlide, aspectRatio, tokens, tab]);

  return (
    <div className="space-y-3 text-xs">
      {/* Abas: Dicas no Slide vs Mini-Curso (somente dicas, sem alteração automática) */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-app border border-border-subtle">
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`flex-1 py-1.5 px-2.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
            tab === 'audit'
              ? 'bg-accent-primary text-on-accent-primary shadow-xs'
              : 'text-fg-secondary hover:text-fg'
          }`}
        >
          Dicas no Slide ({audits.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('course')}
          className={`flex-1 py-1.5 px-2.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
            tab === 'course'
              ? 'bg-accent-primary text-on-accent-primary shadow-xs'
              : 'text-fg-secondary hover:text-fg'
          }`}
        >
          Mini-Curso (6)
        </button>
      </div>

      {tab === 'audit' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-fg-muted">
            <span>Leitura do fundo antes de cada camada de texto</span>
            <StudioHelpTooltip helpKey="topbar.wcag" />
          </div>

          {taintedSkipped && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
              Alguma imagem externa bloqueou a leitura direta de pixels. Use o Mini-Curso ao lado ou ative tarja/sombra em Texto → Estilo para garantir contraste.
            </div>
          )}

          {audits.length === 0 && !taintedSkipped ? (
            <div className="p-3 rounded-xl bg-app border border-border-subtle text-fg-secondary text-[11px] leading-relaxed">
              Nenhuma camada de texto visível neste slide. Adicione um texto no dock inferior para medir o contraste real contra o fundo.
            </div>
          ) : (
            audits.map((item) => {
              const badgeColor =
                item.level === 'AAA'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : item.level === 'AA'
                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40';

              return (
                <button
                  key={item.layerId}
                  type="button"
                  onClick={() => setSelectedLayerId(item.layerId)}
                  className="w-full text-left p-2.5 rounded-xl bg-app border border-border-subtle hover:border-accent-primary/50 transition-colors space-y-1.5 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-4 h-4 rounded border border-border-subtle shrink-0 flex items-center justify-center text-[9px] font-black"
                        style={{ backgroundColor: item.bgSampleHex, color: item.textColor }}
                      >
                        Aa
                      </span>
                      <span className="font-semibold text-fg truncate">{item.previewText}</span>
                    </div>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${badgeColor}`}>
                      {item.level} • {item.minRatio}:1
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-secondary leading-snug">{item.suggestion}</p>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {MINI_COURSE_CARDS.map((card) => (
            <div
              key={card.id}
              className="p-2.5 rounded-xl bg-app border border-border-subtle space-y-1.5"
            >
              <div className="flex items-center gap-1.5 font-bold text-fg text-[11px]">
                <span className="material-symbols-outlined text-[15px] text-accent-primary">
                  {card.icon}
                </span>
                <span>{card.title}</span>
              </div>
              <div className="grid grid-cols-1 gap-1 text-[10px]">
                <div className="px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
                  <strong className="uppercase mr-1">Evite:</strong>
                  {card.avoid}
                </div>
                <div className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  <strong className="uppercase mr-1">Recomendado:</strong>
                  {card.recommended}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
