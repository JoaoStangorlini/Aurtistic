// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { VaultSortField, VaultSortPreference } from '@/lib/vault-sorting';

const SORT_OPTIONS: { value: VaultSortField; label: string; icon: string }[] = [
  { value: 'name', label: 'Nome', icon: 'sort_by_alpha' },
  { value: 'type', label: 'Tipo', icon: 'category' },
  { value: 'date', label: 'Data', icon: 'calendar_today' },
  { value: 'size', label: 'Tamanho', icon: 'straighten' },
];

export function VaultSortControl({
  value,
  onChange,
  compact = false,
}: {
  value: VaultSortPreference;
  onChange: (next: VaultSortPreference) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updateMenuPosition = useCallback(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const menuW = 160;
    const left = Math.max(8, Math.min(window.innerWidth - menuW - 8, rect.right - menuW));
    const top = Math.min(window.innerHeight - 180, rect.bottom + 6);
    setMenuPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleScrollOrResize = () => setOpen(false);
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open, updateMenuPosition]);

  const activeMeta = SORT_OPTIONS.find((o) => o.value === value.field) || SORT_OPTIONS[0];

  return (
    <div ref={containerRef} className="relative inline-flex items-center shrink-0">
      <div className="inline-flex items-center rounded-xl border border-border-subtle bg-surface shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          title="Escolher critério de ordenação"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-fg hover:bg-surface-hover transition-colors cursor-pointer ${
            compact ? 'text-[11px]' : 'text-xs'
          } font-semibold`}
        >
          <span className="material-symbols-outlined text-[15px] text-fg-muted">{activeMeta.icon}</span>
          <span>{activeMeta.label}</span>
          <span
            className={`material-symbols-outlined text-[14px] text-fg-muted transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          >
            expand_more
          </span>
        </button>

        <div className="w-[1px] h-4 bg-border-subtle" />

        <button
          type="button"
          onClick={() =>
            onChange({
              ...value,
              direction: value.direction === 'asc' ? 'desc' : 'asc',
            })
          }
          title={
            value.direction === 'asc'
              ? 'Ordem Crescente (clique para inverter)'
              : 'Ordem Decrescente (clique para inverter)'
          }
          className="px-2 py-1.5 text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors cursor-pointer flex items-center"
        >
          <span className="material-symbols-outlined text-[15px]">
            {value.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
          </span>
        </button>
      </div>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Critérios de ordenação"
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
            className="w-40 rounded-xl bg-surface border border-border-subtle shadow-xl p-1 animate-in fade-in zoom-in-95 duration-100"
          >
            {SORT_OPTIONS.map((opt) => {
              const isSelected = value.field === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange({ ...value, field: opt.value });
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-bold'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </span>
                  {isSelected && (
                    <span className="material-symbols-outlined text-[15px]">check</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
