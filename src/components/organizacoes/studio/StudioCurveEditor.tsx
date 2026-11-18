// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useRef } from 'react';
import { DEFAULT_CURVE_POINTS, type CurvePoint } from './types';

type CurveChannel = 'rgb' | 'r' | 'g' | 'b';

interface StudioCurveEditorProps {
  curves?: {
    rgb: CurvePoint[];
    r: CurvePoint[];
    g: CurvePoint[];
    b: CurvePoint[];
  };
  onChange: (nextCurves: { rgb: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[] }) => void;
  onCommit?: () => void;
}

const CHANNEL_META: Record<CurveChannel, { label: string; stroke: string }> = {
  rgb: { label: 'Master RGB', stroke: '#FFCC00' },
  r: { label: 'Canal R', stroke: '#EF4444' },
  g: { label: 'Canal G', stroke: '#22C55E' },
  b: { label: 'Canal B', stroke: '#3B82F6' },
};

function ensureChannelPoints(pts?: CurvePoint[]): CurvePoint[] {
  if (!pts || pts.length < 2) return DEFAULT_CURVE_POINTS.map((p) => ({ ...p }));
  return pts.map((p) => ({ ...p }));
}

export function StudioCurveEditor({ curves, onChange, onCommit }: StudioCurveEditorProps) {
  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const safeCurves = {
    rgb: ensureChannelPoints(curves?.rgb),
    r: ensureChannelPoints(curves?.r),
    g: ensureChannelPoints(curves?.g),
    b: ensureChannelPoints(curves?.b),
  };

  const points = safeCurves[channel];

  const updatePointAt = (idx: number, rawX: number, rawY: number) => {
    const next = points.map((p) => ({ ...p }));
    // Guardrail 4 (Fase 3): Monotonicidade estrita X_{i-1} < X_i < X_{i+1} e clamp Y em [0, 255]
    const minX = idx === 0 ? 0 : next[idx - 1].x + 2;
    const maxX = idx === next.length - 1 ? 255 : next[idx + 1].x - 2;
    const clampedX = idx === 0 ? 0 : idx === next.length - 1 ? 255 : Math.max(minX, Math.min(maxX, Math.round(rawX)));
    const clampedY = Math.max(0, Math.min(255, Math.round(rawY)));

    next[idx] = { x: clampedX, y: clampedY };
    onChange({
      ...safeCurves,
      [channel]: next,
    });
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activeIdx === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    updatePointAt(activeIdx, normX * 255, normY * 255);
  };

  const handlePointerUp = () => {
    if (activeIdx !== null) {
      setActiveIdx(null);
      onCommit?.();
    }
  };

  const handleResetChannel = () => {
    onChange({
      ...safeCurves,
      [channel]: DEFAULT_CURVE_POINTS.map((p) => ({ ...p })),
    });
    onCommit?.();
  };

  // Constrói caminho suave Catmull-Rom/Bézier cúbica em viewBox 0..255 (invertendo Y para SVG)
  const pathD = points
    .map((p, i) => {
      const svgY = 255 - p.y;
      if (i === 0) return `M ${p.x} ${svgY}`;
      const prev = points[i - 1];
      const prevSvgY = 255 - prev.y;
      const midX = (prev.x + p.x) / 2;
      return `C ${midX} ${prevSvgY}, ${midX} ${svgY}, ${p.x} ${svgY}`;
    })
    .join(' ');

  return (
    <div className="space-y-2 p-2.5 rounded-xl bg-surface-hover/50 border border-border-subtle">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {(['rgb', 'r', 'g', 'b'] as CurveChannel[]).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(ch)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                channel === ch
                  ? 'bg-[#FFCC00] text-black shadow-xs'
                  : 'bg-surface text-fg-muted hover:text-fg border border-border-subtle'
              }`}
            >
              {CHANNEL_META[ch].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleResetChannel}
          title="Resetar curva do canal"
          className="text-[10px] font-bold text-fg-muted hover:text-fg px-1.5 py-0.5 rounded cursor-pointer"
        >
          Resetar
        </button>
      </div>

      <div className="relative w-full h-36 rounded-lg bg-[#0b0f19] border border-border-subtle overflow-hidden touch-none select-none">
        <svg
          ref={svgRef}
          viewBox="0 0 255 255"
          preserveAspectRatio="none"
          className="w-full h-full cursor-crosshair"
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Grade de referência 4x4 */}
          {[64, 128, 191].map((g) => (
            <React.Fragment key={g}>
              <line x1={g} y1={0} x2={g} y2={255} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
              <line x1={0} y1={g} x2={255} y2={g} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
            </React.Fragment>
          ))}
          {/* Diagonal identidade */}
          <line x1={0} y1={255} x2={255} y2={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" strokeWidth={1} />

          {/* Curva Bézier monotônica */}
          <path d={pathD} fill="none" stroke={CHANNEL_META[channel].stroke} strokeWidth={3} strokeLinecap="round" />

          {/* Nós arrastáveis */}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={255 - p.y}
              r={activeIdx === idx ? 7 : 5.5}
              fill={CHANNEL_META[channel].stroke}
              stroke="#ffffff"
              strokeWidth={2}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                e.stopPropagation();
                setActiveIdx(idx);
                (e.target as SVGElement).setPointerCapture(e.pointerId);
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

