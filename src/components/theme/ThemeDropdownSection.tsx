// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import { useTheme } from './ThemeProvider';
import { PALETTE_LIST, type ThemeMode } from '@/lib/theme-config';

export function ThemeDropdownSection() {
  const { mode, palette, resolvedMode, setThemeMode, setThemePalette, paletteDef } = useTheme();

  const modeButtons: Array<{ id: ThemeMode; label: string; icon: string }> = [
    { id: 'light', label: 'Claro', icon: 'light_mode' },
    { id: 'system', label: 'Auto', icon: 'brightness_auto' },
    { id: 'dark', label: 'Escuro', icon: 'dark_mode' },
  ];

  return (
    <div
      className="px-3 py-2 space-y-3"
      onClick={(e) => {
        // Impede que clicar dentro do configurador feche o dropdown do perfil acidentalmente
        e.stopPropagation();
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-fg-secondary uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-[var(--accent-secondary)]">palette</span>
          Aparência
        </span>
        <span className="text-[10px] text-fg-muted font-medium">
          {mode === 'system' ? `Auto (${resolvedMode === 'dark' ? 'Escuro' : 'Claro'})` : ''}
        </span>
      </div>

      {/* Modo de Luminância (Claro / Auto / Escuro) */}
      <div className="grid grid-cols-3 gap-1 bg-app p-1 rounded-lg border border-border-subtle">
        {modeButtons.map((btn) => {
          const isActive = mode === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              onClick={() => setThemeMode(btn.id)}
              className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[11px] font-bold transition-all ${
                isActive
                  ? 'bg-surface text-fg shadow-sm border border-border-strong'
                  : 'text-fg-secondary hover:text-fg'
              }`}
              title={`Ativar modo ${btn.label}`}
            >
              <span className="material-symbols-outlined text-[14px]">{btn.icon}</span>
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* Seletor de Paleta Bicolor */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-fg-muted">Cores de Destaque:</span>
          <span className="text-fg font-semibold truncate max-w-[140px] text-right">
            {paletteDef.name}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          {PALETTE_LIST.map((p) => {
            const isSelected = palette === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setThemePalette(p.id)}
                title={p.name}
                className={`relative w-8 h-8 rounded-full transition-transform hover:scale-110 flex items-center justify-center shrink-0 ${
                  isSelected
                    ? 'ring-2 ring-fg ring-offset-2 ring-offset-[var(--bg-surface)] scale-105 shadow-md'
                    : 'opacity-75 hover:opacity-100 border border-border-subtle'
                }`}
                style={{
                  background: `linear-gradient(135deg, ${p.preview.primary} 50%, ${p.preview.secondary} 50%)`,
                }}
              >
                {isSelected && (
                  <span className="material-symbols-outlined text-[14px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] font-bold">
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
