// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect } from 'react';

export interface EyeRest202020OverlayProps {
  isOpen: boolean;
  onComplete: () => void;
  onDismiss: () => void;
  onPlayChime?: () => void;
}

export function EyeRest202020Overlay({
  isOpen,
  onComplete,
  onDismiss,
  onPlayChime,
}: EyeRest202020OverlayProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(20);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onPlayChime) onPlayChime();
          onComplete();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, onComplete, onPlayChime]);

  if (!isOpen) return null;

  const progressPercent = ((20 - secondsRemaining) / 20) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg animate-in fade-in duration-300"
    >
      <div className="w-full max-w-md bg-[var(--surface-primary)] border border-[var(--border-subtle)] rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden space-y-6">
        {/* Halo decorativo de respiração */}
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-[var(--accent-primary)]/15 blur-3xl pointer-events-none animate-pulse"
          style={{ animationDuration: '4s' }}
        />

        {/* Ícone e Título */}
        <div className="space-y-2 relative">
          <div className="w-16 h-16 rounded-2xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-[var(--accent-primary)] shadow-inner">
            <span className="material-symbols-outlined text-[36px]">visibility</span>
          </div>
          <h3 className="text-xl font-bold text-[var(--text-primary)]">
            Descanso Visual 20-20-20
          </h3>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-xs mx-auto">
            Desvie o olhar do monitor. Foque os olhos em um ponto distante (a pelo menos 6 metros) e respire fundo.
          </p>
        </div>

        {/* Círculo do Cronômetro de 20s */}
        <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="6"
            />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth="6"
              strokeDasharray={2 * Math.PI * 52}
              strokeDashoffset={2 * Math.PI * 52 * (1 - progressPercent / 100)}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold font-mono text-[var(--text-primary)]">
              {secondsRemaining}s
            </span>
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
              Relaxando
            </span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            Pular agora
          </button>
          <button
            type="button"
            onClick={onComplete}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] hover:opacity-90 transition-opacity shadow-lg shadow-[var(--accent-primary)]/20 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">check</span>
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
}
