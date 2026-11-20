// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { StudioLiveSlider } from './StudioLiveSlider';
import { useOptionalStudio } from './StudioContext';

export interface StudioProColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
  label?: string;
  onClose?: () => void;
  brandSwatches?: string[];
  canvasRefForFallback?: React.RefObject<HTMLCanvasElement | null>;
  className?: string;
}

// Helpers matemáticos de cor
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b];
  }
  const num = parseInt(clean.slice(0, 6), 16);
  if (isNaN(num)) return [255, 255, 255];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, v];
}

export function StudioProColorPicker({
  color,
  onChange,
  onClose,
  brandSwatches = ['#00D4FF', '#FFCC00', '#FF1E56', '#00FF66', '#0066FF', '#FFFFFF', '#121212'],
  canvasRefForFallback,
  className = '',
}: StudioProColorPickerProps) {
  const [rgb, setRgb] = useState<[number, number, number]>(() => hexToRgb(color));
  const [hexInput, setHexInput] = useState(color.toUpperCase());
  const optionalStudio = useOptionalStudio();
  const [hsv, setHsv] = useState<[number, number, number]>(() => rgbToHsv(...hexToRgb(color)));
  const wheelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPickingWheel, setIsPickingWheel] = useState(false);
  const [isCanvasDropperActive, setIsCanvasDropperActive] = useState(false);

  // Sincroniza quando prop color mudar externamente
  useEffect(() => {
    const nextRgb = hexToRgb(color);
    setRgb(nextRgb);
    setHexInput(color.toUpperCase());
    setHsv(rgbToHsv(...nextRgb));
  }, [color]);

  // Renderiza a Roda HSV no Canvas
  const drawWheel = useCallback(() => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 4;

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * w + x) * 4;

        if (dist <= radius) {
          const angle = Math.atan2(dy, dx); // -PI..PI
          const hue = (angle + Math.PI) / (2 * Math.PI); // 0..1
          const sat = Math.min(1, dist / radius);
          const [r, g, b] = hsvToRgb(hue, sat, hsv[2] || 1);
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Desenha anel do cursor selecionado
    const selAngle = hsv[0] * 2 * Math.PI - Math.PI;
    const selDist = hsv[1] * radius;
    const sx = cx + selDist * Math.cos(selAngle);
    const sy = cy + selDist * Math.sin(selAngle);

    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, 2 * Math.PI);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }, [hsv]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  const handleWheelPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = Math.min(cx, cy) - 4;

    const angle = Math.atan2(dy, dx);
    const hue = (angle + Math.PI) / (2 * Math.PI);
    const sat = Math.max(0, Math.min(1, dist / radius));
    const nextHsv: [number, number, number] = [hue, sat, hsv[2]];
    setHsv(nextHsv);

    const [nr, ng, nb] = hsvToRgb(nextHsv[0], nextHsv[1], nextHsv[2]);
    setRgb([nr, ng, nb]);
    const hex = rgbToHex(nr, ng, nb);
    setHexInput(hex);
    onChange(hex);
  };

  const handleBrightnessChange = (val: number) => {
    const nextHsv: [number, number, number] = [hsv[0], hsv[1], val / 100];
    setHsv(nextHsv);
    const [nr, ng, nb] = hsvToRgb(nextHsv[0], nextHsv[1], nextHsv[2]);
    setRgb([nr, ng, nb]);
    const hex = rgbToHex(nr, ng, nb);
    setHexInput(hex);
    onChange(hex);
  };

  const handleHexSubmit = (val: string) => {
    setHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val) || /^[0-9A-Fa-f]{6}$/.test(val)) {
      const formatted = val.startsWith('#') ? val.toUpperCase() : `#${val.toUpperCase()}`;
      const nextRgb = hexToRgb(formatted);
      setRgb(nextRgb);
      setHsv(rgbToHsv(...nextRgb));
      onChange(formatted);
    }
  };

  // EyeDropper com fallback universal
  const handleEyeDropper = async () => {
    // 1. Tenta API Nativa se disponível
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          handleHexSubmit(result.sRGBHex);
        }
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Usuário cancelou ou navegador bloqueou, segue para fallback
      }
    }

    // 2. Fallback via Canvas getImageData
    if (canvasRefForFallback?.current) {
      setIsCanvasDropperActive(true);
      const canvas = canvasRefForFallback.current;
      const onPick = (ev: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const px = Math.floor((ev.clientX - rect.left) * scaleX);
        const py = Math.floor((ev.clientY - rect.top) * scaleY);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const pixel = ctx.getImageData(px, py, 1, 1).data;
          const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
          handleHexSubmit(hex);
        }
        setIsCanvasDropperActive(false);
        canvas.removeEventListener('click', onPick);
      };
      canvas.addEventListener('click', onPick, { once: true });
      return;
    }

    // 3. Fallback universal via palco principal do Studio
    optionalStudio?.startEyedropper((pickedHex) => handleHexSubmit(pickedHex));
  };

  return (
    <div className={`p-3.5 rounded-2xl bg-surface border border-border-subtle shadow-2xl text-fg space-y-3 w-64 ${className}`}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-amber-500">palette</span>
          <span>Roda de Cores HSV</span>
        </span>
        {onClose && (
          <button type="button" onClick={onClose} className="p-0.5 rounded text-fg-muted hover:text-fg cursor-pointer">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {/* Roda Canvas */}
      <div className="flex justify-center relative select-none">
        <canvas
          ref={wheelCanvasRef}
          width={180}
          height={180}
          className="rounded-full shadow-inner cursor-crosshair touch-none"
          onPointerDown={(e) => {
            setIsPickingWheel(true);
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            handleWheelPointer(e);
          }}
          onPointerMove={(e) => {
            if (isPickingWheel) handleWheelPointer(e);
          }}
          onPointerUp={() => setIsPickingWheel(false)}
        />
      </div>

      {/* Slider de Luminância / Brilho V do HSV */}
      <StudioLiveSlider
        id="color-picker-v"
        label="Luminosidade"
        value={Math.round(hsv[2] * 100)}
        min={0}
        max={100}
        defaultValue={100}
        unit="%"
        transparentScrub={false}
        onChange={(val) => handleBrightnessChange(val)}
      />

      {/* Input HEX + Conta-gotas + Swatch Ativo */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-xl border border-border-subtle shrink-0 shadow-xs"
          style={{ backgroundColor: color }}
        />
        <input
          type="text"
          value={hexInput}
          maxLength={7}
          onChange={(e) => handleHexSubmit(e.target.value)}
          className="flex-1 px-2 py-1 rounded-xl bg-surface-hover/80 border border-border-subtle text-xs font-mono font-bold text-fg uppercase text-center focus:outline-hidden focus:border-amber-500"
          placeholder="#RRGGBB"
        />
        <button
          type="button"
          onClick={handleEyeDropper}
          title={isCanvasDropperActive ? 'Clique no canvas para capturar a cor' : 'Conta-gotas (EyeDropper)'}
          className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
            isCanvasDropperActive
              ? 'bg-amber-400 text-black border-amber-500 animate-pulse'
              : 'border-border-subtle bg-surface-hover text-fg hover:text-amber-500'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">colorize</span>
        </button>
      </div>

      {/* Paleta Oficial da Organização & Cores de Alto Contraste */}
      {brandSwatches.length > 0 && (
        <div className="pt-2 border-t border-border-subtle space-y-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-fg-muted block">
            Paleta da Marca & Contraste
          </span>
          <div className="flex flex-wrap gap-1.5">
            {brandSwatches.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => handleHexSubmit(swatch)}
                className={`w-6 h-6 rounded-lg border transition-transform hover:scale-110 cursor-pointer ${
                  color.toUpperCase() === swatch.toUpperCase()
                    ? 'ring-2 ring-amber-500 ring-offset-1 border-white'
                    : 'border-black/20'
                }`}
                style={{ backgroundColor: swatch }}
                title={swatch}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}