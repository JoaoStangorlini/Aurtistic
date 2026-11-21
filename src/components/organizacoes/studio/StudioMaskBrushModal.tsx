// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useStudio } from './StudioContext';
import { StudioLiveSlider } from './StudioLiveSlider';
import type { StudioImageLayer } from './types';

type BrushShape = 'freehand' | 'circle' | 'rect' | 'ellipse' | 'hexagon';

export function StudioMaskBrushModal() {
  const { maskModalLayerId, setMaskModalLayerId, activeSlide, updateLayer } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [brushSize, setBrushSize] = useState(36);
  const [brushMode, setBrushMode] = useState<'add' | 'erase'>('add');
  const [brushShape, setBrushShape] = useState<BrushShape>('freehand');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isCutout, setIsCutout] = useState(true);

  const targetLayer = activeSlide.layers.find((l) => l.id === maskModalLayerId && l.type === 'image') as StudioImageLayer | undefined;

  useEffect(() => {
    if (!targetLayer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (targetLayer.maskDataUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = targetLayer.maskDataUrl;
    }
    setIsCutout(targetLayer.filters?.isCutoutMask !== false);
  }, [targetLayer]);

  const getCanvasCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (e.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    };
  }, []);

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, r: number, shape: BrushShape) => {
    ctx.beginPath();
    if (shape === 'rect') {
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else if (shape === 'ellipse') {
      ctx.ellipse(x, y, r * 1.4, r * 0.8, 0, 0, Math.PI * 2);
    } else if (shape === 'hexagon') {
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const hx = x + r * Math.cos(angle);
        const hy = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }, []);

  const drawStrokeSegment = useCallback(
    (from: { x: number; y: number } | null, to: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.globalCompositeOperation = brushMode === 'erase' ? 'destination-out' : 'source-over';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';

      if (brushShape === 'freehand' && from) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      } else {
        drawShape(ctx, to.x, to.y, brushSize / 2, brushShape);
      }
      ctx.restore();
    },
    [brushMode, brushSize, brushShape, drawShape]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const pt = getCanvasCoords(e);
    lastPointRef.current = pt;
    drawStrokeSegment(null, pt);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pt = getCanvasCoords(e);
    drawStrokeSegment(lastPointRef.current, pt);
    lastPointRef.current = pt;
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const handleInvertMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'xor';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  const handleSaveMask = () => {
    if (!targetLayer || !canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    updateLayer(targetLayer.id, {
      maskDataUrl: dataUrl,
      filters: {
        ...(targetLayer.filters || { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, overlayDark: 0, temperature: 0, vignette: 0 }),
        isCutoutMask: isCutout,
        targetMaskAreaOnly: !isCutout,
      },
    });
    setMaskModalLayerId(null);
  };

  if (!maskModalLayerId || !targetLayer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-surface border border-border-subtle rounded-3xl p-5 max-w-2xl w-full shadow-2xl flex flex-col gap-3.5 text-fg">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-red-400">brush</span>
            <h3 className="text-sm font-bold text-fg uppercase tracking-wider">Máscara Offscreen • {targetLayer.name}</h3>
          </div>
          <button type="button" onClick={() => setMaskModalLayerId(null)} className="p-1 rounded-lg text-fg-muted hover:text-fg">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Toolbar de Formas e Modos */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-elevated/60 p-2.5 rounded-xl border border-border-subtle text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button" onClick={() => setBrushMode('add')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${brushMode === 'add' ? 'bg-red-500 text-white' : 'bg-elevated text-fg-secondary'}`}
            >
              Pintar (Vermelho)
            </button>
            <button
              type="button" onClick={() => setBrushMode('erase')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${brushMode === 'erase' ? 'bg-red-500 text-white' : 'bg-elevated text-fg-secondary'}`}
            >
              Borracha
            </button>
            <button type="button" onClick={handleInvertMask} className="px-2.5 py-1 rounded-lg bg-amber-400/20 text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-400/30">
              Inverter
            </button>
            <button type="button" onClick={() => { const c = canvasRef.current; if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height); }} className="px-2 py-1 rounded-lg bg-elevated text-fg-muted hover:text-fg">
              Limpar
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-fg-muted">Forma:</span>
            {(['freehand', 'circle', 'rect', 'ellipse', 'hexagon'] as BrushShape[]).map((s) => (
              <button
                key={s} type="button" onClick={() => setBrushShape(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${brushShape === s ? 'bg-[#FFCC00] text-black' : 'bg-elevated text-fg-muted'}`}
              >
                {s === 'freehand' ? 'Livre' : s === 'circle' ? 'Círculo' : s === 'rect' ? 'Ret' : s === 'ellipse' ? 'Elipse' : 'Hex'}
              </button>
            ))}
          </div>

          <div className="w-40">
            <StudioLiveSlider
              id="mask-brush-size"
              label="Tamanho Pincel"
              value={brushSize}
              min={5}
              max={200}
              defaultValue={28}
              unit="px"
              transparentScrub={false}
              onChange={(val) => setBrushSize(val)}
            />
          </div>
        </div>

        {/* Toggle de Recorte vs Edição Seletiva */}
        <div className="flex items-center gap-4 text-xs px-1">
          <label className="flex items-center gap-2 text-fg-secondary cursor-pointer">
            <input type="radio" name="maskType" checked={isCutout} onChange={() => setIsCutout(true)} className="accent-red-500" />
            <span>Recorte Total (Cutout / Transparência ao redor)</span>
          </label>
          <label className="flex items-center gap-2 text-fg-secondary cursor-pointer">
            <input type="radio" name="maskType" checked={!isCutout} onChange={() => setIsCutout(false)} className="accent-red-500" />
            <span>Edição Seletiva (Aplica filtros da Aba 2 só nesta área)</span>
          </label>
        </div>

        {/* Visualizador com Overlay Vermelho rgba(255, 0, 0, 0.4) */}
        <div className="relative w-full aspect-square max-h-[360px] rounded-2xl overflow-hidden bg-black/70 border border-border-subtle flex items-center justify-center">
          <img src={targetLayer.resolvedUrl || targetLayer.src} alt="Preview" crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-80" />
          <canvas
            ref={canvasRef}
            width={800}
            height={800}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
            style={{ mixBlendMode: 'screen', filter: 'drop-shadow(0 0 2px rgba(255,0,0,0.8))', opacity: 0.85 }}
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-fg-muted">Áreas pintadas recebem a máscara com precisão offscreen.</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMaskModalLayerId(null)} className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-fg-secondary hover:bg-elevated">Cancelar</button>
            <button type="button" onClick={handleSaveMask} className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#FFCC00] text-black hover:bg-[#FFD633] shadow-md cursor-pointer">Salvar Máscara</button>
          </div>
        </div>
      </div>
    </div>
  );
}
