// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef } from 'react';
import { useStudio } from './StudioContext';
import { StudioHelpTooltip } from './StudioHelpTooltip';

export interface StudioLiveSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  helpKey?: string;
  transparentScrub?: boolean;
  onChange: (next: number) => void;
  onCommit?: (finalValue: number) => void;
}

const RULER_TICKS = Array.from({ length: 21 }, (_, i) => i);

export function StudioLiveSlider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  unit = '',
  helpKey,
  transparentScrub = true,
  onChange,
  onCommit,
}: StudioLiveSliderProps) {
  const { activeSliderId, setActiveSliderId, beginGestureSnapshot, commitGestureSnapshot } = useStudio();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const startValueRef = useRef<number>(value);
  const latestValueRef = useRef<number>(value);

  const isThisActive = transparentScrub && activeSliderId === id;
  const pct = max === min ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const clampStep = (raw: number): number => {
    const snapped = Math.round(raw / step) * step;
    const decimals = step < 1 ? String(step).split('.')[1]?.length || 2 : 0;
    return Number(Math.max(min, Math.min(max, snapped)).toFixed(decimals));
  };

  const computeValueFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return latestValueRef.current;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return latestValueRef.current;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampStep(min + ratio * (max - min));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    draggingRef.current = true;
    beginGestureSnapshot();
    startValueRef.current = value;
    latestValueRef.current = value;
    if (transparentScrub) setActiveSliderId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = computeValueFromClientX(e.clientX);
    if (next !== value) {
      latestValueRef.current = next;
      onChange(next);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    const next = computeValueFromClientX(e.clientX);
    if (next !== latestValueRef.current) {
      latestValueRef.current = next;
      onChange(next);
    }
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    if (transparentScrub) setActiveSliderId(null);
    if (latestValueRef.current !== startValueRef.current) {
      commitGestureSnapshot();
      onCommit?.(latestValueRef.current);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const targetReset =
      defaultValue !== undefined ? defaultValue : min <= 0 && max >= 0 ? 0 : min;
    if (targetReset === value) return;
    beginGestureSnapshot();
    latestValueRef.current = targetReset;
    onChange(targetReset);
    commitGestureSnapshot();
    onCommit?.(targetReset);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mult = e.shiftKey ? 10 : 1;
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step * mult;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step * mult;
    if (delta === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const next = clampStep(value + delta);
    if (next !== value) {
      beginGestureSnapshot();
      latestValueRef.current = next;
      onChange(next);
      commitGestureSnapshot();
      onCommit?.(next);
    }
  };

  return (
    <div className="min-h-[50px]">
      <div
        data-active-slider={isThisActive ? 'true' : undefined}
        className={
          isThisActive
            ? 'fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 right-3 mx-auto max-w-[560px] z-[70] studio-dock-dark bg-black/95 text-white px-4 py-2.5 rounded-2xl border border-white/15 shadow-2xl pointer-events-auto select-none'
            : ''
        }
      >
        <div className="flex items-center justify-between text-[11px] mb-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className={isThisActive ? 'font-bold text-white truncate' : 'font-semibold text-fg-secondary truncate'}>
              {label}
            </span>
            {helpKey && !isThisActive && <StudioHelpTooltip helpKey={helpKey} />}
          </div>
          <span
            className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
              isThisActive
                ? 'bg-[#FFCC00] text-black'
                : 'bg-surface border border-border-subtle text-fg'
            }`}
          >
            {value}{unit}
          </span>
        </div>

        {/* Régua graduada interativa (mesmo nó DOM preservando setPointerCapture) */}
        <div
          ref={trackRef}
          role="slider"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          tabIndex={0}
          title="Arraste para ajustar • Duplo-clique para resetar • Setas para ajuste fino"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
          className="relative h-7 flex items-center cursor-ew-resize touch-none select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FFCC00] rounded"
        >
          {/* Marcações de régua */}
          <div className="absolute inset-x-0 flex items-center justify-between pointer-events-none px-0.5">
            {RULER_TICKS.map((tick) => {
              const isMajor = tick % 5 === 0;
              return (
                <span
                  key={tick}
                  className={`w-[1px] rounded-full ${
                    isThisActive
                      ? isMajor ? 'h-3 bg-white/45' : 'h-1.5 bg-white/20'
                      : isMajor ? 'h-2.5 bg-fg-muted/45' : 'h-1.5 bg-fg-muted/20'
                  }`}
                />
              );
            })}
          </div>

          {/* Trilho e preenchimento colorido */}
          <div
            className={`relative w-full h-1.5 rounded-full pointer-events-none ${
              isThisActive ? 'bg-white/25' : 'bg-border-strong/70'
            }`}
          >
            <div
              className="absolute top-0 bottom-0 left-0 rounded-full bg-[var(--accent-secondary)]"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[var(--accent-secondary)] border-2 border-black shadow-md"
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
