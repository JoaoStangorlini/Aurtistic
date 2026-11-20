// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useRef } from 'react';
import { useStudio } from './StudioContext';
import { useOrganizationBrand } from '../OrganizationBrandProvider';
import { renderTokenizedRichTextCanvas } from '@/lib/canvas-tokenized-text';
import type { StudioSlide, StudioTextLayer } from './types';

interface StudioInlineTextEditorProps {
  layer: StudioTextLayer;
  stageWidth: number;
  canonicalWidth: number;
  onFinish: () => void;
}

export function StudioInlineTextEditor({
  layer,
  stageWidth,
  canonicalWidth,
  onFinish,
}: StudioInlineTextEditorProps) {
  const { slides, updateLayer, commitHistorySnapshot, textEditorRef, insertTextSnippet } = useStudio();
  const { tokens } = useOrganizationBrand();

  const initialSlidesRef = useRef<StudioSlide[]>(slides);
  const initialTextRef = useRef<string>(layer.text);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const committedRef = useRef(false);

  // Prevenção de auto-zoom no iOS/Android: fonte >= 16px compensada com transform scale
  const renderedPx = Math.max(10, layer.fontSize * (stageWidth / Math.max(1, canonicalWidth)));
  const needsZoomGuard = renderedPx < 16;
  const domFontPx = needsZoomGuard ? 16 : renderedPx;
  const scaleFactor = needsZoomGuard ? renderedPx / 16 : 1;

  const syncHeightIfNeeded = () => {
    const el = textEditorRef.current;
    if (!el || stageWidth <= 0) return;
    el.style.height = 'auto';
    const nextTextareaPx = Math.max(36, el.scrollHeight);
    el.style.height = `${nextTextareaPx}px`;
    const stageEl = el.closest('[data-stage-canvas]') as HTMLElement | null;
    const stageH = stageEl?.clientHeight || stageWidth;
    const visualPx = nextTextareaPx * scaleFactor;
    const normH = Math.min(0.95, Math.max(0.055, (visualPx + 10) / Math.max(100, stageH)));
    if (normH > layer.height + 0.012) {
      updateLayer(layer.id, { height: Number(normH.toFixed(3)) });
    }
  };

  const finishAndCommit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    syncHeightIfNeeded();
    if (layer.text !== initialTextRef.current) {
      commitHistorySnapshot(initialSlidesRef.current);
    }
    onFinish();
  };

  useEffect(() => {
    const el = textEditorRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      syncHeightIfNeeded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textEditorRef]);

  // Auto-grow do textarea e da altura da caixa conforme o conteúdo muda
  useEffect(() => {
    syncHeightIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.text, layer.fontSize, textEditorRef]);

  // Live LaTeX preview sempre que o texto contiver '$' ou '$$'
  const hasMath = layer.text.includes('$');
  useEffect(() => {
    if (!hasMath) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderTokenizedRichTextCanvas(ctx, {
      text: layer.text,
      mode: layer.textKind === 'title' ? 'title' : 'body',
      tokens,
      boxCenterX: canvas.width / 2,
      boxTopY: 12,
      maxBoxWidth: canvas.width - 24,
      fontSize: 22,
      align: 'center',
      customColorOverride: '#ffffff',
    });
  }, [hasMath, layer.text, layer.textKind, tokens]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const isMod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape' || (isMod && e.key === 'Enter')) {
      e.preventDefault();
      finishAndCommit();
      return;
    }

    if (!isMod) return;
    const key = e.key.toLowerCase();
    if (key === 'b') {
      e.preventDefault();
      insertTextSnippet('**', '**', 'negrito');
    } else if (key === 'i') {
      e.preventDefault();
      insertTextSnippet('*', '*', 'itálico');
    } else if (key === 'x' && e.shiftKey) {
      e.preventDefault();
      insertTextSnippet('~~', '~~', 'tachado');
    } else if (key === 'e') {
      e.preventDefault();
      insertTextSnippet('`', '`', 'código');
    } else if (key === 'm') {
      e.preventDefault();
      insertTextSnippet('$', '$', 'x^2');
    }
  };

  return (
    <div
      className="absolute z-50 pointer-events-auto"
      style={{
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        width: `${layer.width * 100}%`,
        height: `${layer.height * 100}%`,
        transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative w-full h-full flex flex-col justify-center">
        <div
          style={
            needsZoomGuard
              ? {
                  width: `${(100 / scaleFactor).toFixed(2)}%`,
                  transform: `scale(${scaleFactor})`,
                  transformOrigin: 'center left',
                }
              : undefined
          }
        >
          <textarea
            ref={textEditorRef}
            value={layer.text}
            onChange={(e) => updateLayer(layer.id, { text: e.target.value })}
            onKeyDown={handleKeyDown}
            onBlur={finishAndCommit}
            rows={1}
            style={{
              fontFamily: layer.fontFamily || tokens.fontBody,
              fontSize: `${domFontPx}px`,
              lineHeight: layer.lineHeight || 1.24,
              color: layer.color || '#ffffff',
              textAlign: layer.align || 'center',
              fontWeight: layer.bold ? 700 : 500,
              fontStyle: layer.italic ? 'italic' : 'normal',
            }}
            className="w-full bg-black/55 backdrop-blur-xs text-white rounded-lg px-2 py-1 ring-2 ring-[#FFCC00] focus:outline-none resize-none overflow-hidden shadow-xl"
          />
        </div>

        {/* Controles auxiliares ancorados fora do fluxo da caixa para preservar pivô de rotação [x+w/2, y+h/2] */}
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 flex flex-col gap-1.5">
          {/* Faixa compacta de atalhos rápidos (preserva foco do textarea no mobile/desktop) */}
          <div
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            className="flex flex-wrap items-center justify-center gap-1 px-1.5 py-1 rounded-xl bg-black/90 border border-white/20 shadow-xl"
          >
            {[
              { label: '$|$', fn: () => insertTextSnippet('$', '$', '') },
              { label: '**B**', fn: () => insertTextSnippet('**', '**', 'negrito') },
              { label: '*I*', fn: () => insertTextSnippet('*', '*', 'itálico') },
              { label: 'a/b', fn: () => insertTextSnippet('\\frac{', '}{}', '') },
              { label: '√x', fn: () => insertTextSnippet('\\sqrt{', '}', '') },
            ].map((btn) => (
              <button
                key={btn.label}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={btn.fn}
                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-[#FFCC00] hover:text-black text-[10px] font-bold text-white cursor-pointer"
              >
                {btn.label}
              </button>
            ))}
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={finishAndCommit}
              className="px-2 py-0.5 rounded bg-[#FFCC00] text-black text-[10px] font-black cursor-pointer"
            >
              OK
            </button>
          </div>

          {/* Card flutuante de preview LaTeX ao vivo */}
          {hasMath && (
            <div className="rounded-xl bg-[#07090e]/95 border border-[#00D4FF]/50 p-1.5 shadow-2xl pointer-events-none">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#00D4FF] block mb-0.5 px-1">
                Preview LaTeX ao Vivo
              </span>
              <canvas ref={previewCanvasRef} width={420} height={110} className="w-full h-auto block" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
