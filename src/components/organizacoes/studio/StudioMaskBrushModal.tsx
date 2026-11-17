// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useStudio } from './StudioContext';
import type { StudioImageLayer } from './types';

export function StudioMaskBrushModal() {
  const { maskModalLayerId, setMaskModalLayerId, activeSlide, updateLayer } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [brushMode, setBrushMode] = useState<'add' | 'erase'>('add');
  const [isDrawing, setIsDrawing] = useState(false);

  const targetLayer = activeSlide.layers.find((l) => l.id === maskModalLayerId && l.type === 'image') as
    | StudioImageLayer
    | undefined;

  // Carrega máscara existente no canvas
  useEffect(() => {
    if (!targetLayer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (targetLayer.maskDataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = targetLayer.maskDataUrl;
    }
  }, [targetLayer]);

  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const drawPoint = useCallback(
    (x: number, y: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      if (brushMode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    [brushMode, brushSize]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    drawPoint(x, y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getCanvasCoords(e);
    drawPoint(x, y);
  };

  const handleSaveMask = () => {
    if (!targetLayer || !canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    updateLayer(targetLayer.id, { maskDataUrl: dataUrl });
    setMaskModalLayerId(null);
  };

  const handleClearMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  if (!maskModalLayerId || !targetLayer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-[#0b0f19] border border-white/15 rounded-3xl p-5 max-w-2xl w-full shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-amber-400">brush</span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Pincel de Máscara Offscreen • {targetLayer.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setMaskModalLayerId(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Toolbar de ferramentas do pincel */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 p-3 rounded-xl border border-white/10 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBrushMode('add')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                brushMode === 'add' ? 'bg-amber-400 text-black shadow-sm' : 'bg-white/10 text-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              <span>Pintar</span>
            </button>
            <button
              type="button"
              onClick={() => setBrushMode('erase')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                brushMode === 'erase' ? 'bg-amber-400 text-black shadow-sm' : 'bg-white/10 text-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">ink_eraser</span>
              <span>Apagar</span>
            </button>
            <button
              type="button"
              onClick={handleClearMask}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all font-semibold"
            >
              Limpar Tudo
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Tamanho:</span>
            <input
              type="range"
              min={10}
              max={100}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-24 cursor-pointer"
            />
            <span className="font-mono text-white font-bold">{brushSize}px</span>
          </div>
        </div>

        {/* Área do Canvas com Overlay */}
        <div className="relative w-full aspect-square max-h-[380px] rounded-2xl overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center">
          <img
            src={targetLayer.src}
            alt="Preview"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-50"
          />
          <canvas
            ref={canvasRef}
            width={800}
            height={800}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setIsDrawing(false)}
            onMouseLeave={() => setIsDrawing(false)}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            style={{ backgroundColor: 'transparent' }}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-slate-400">
            Pinte a área onde os ajustes/recortes serão isolados na composição.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMaskModalLayerId(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveMask}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#FFCC00] text-[#121212] hover:bg-[#FFD633] shadow-md cursor-pointer"
            >
              Aplicar Máscara
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

