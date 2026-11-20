// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { STUDIO_HELP_CATALOG } from '@/lib/studio/studio-help-catalog';
import { useOptionalStudio } from './StudioContext';

interface StudioHelpTooltipProps {
  helpKey: string;
  title?: string;
  description?: string;
  tip?: string;
  size?: 'xs' | 'sm';
  className?: string;
  controlledOpen?: boolean;
  onControlledOpenChange?: (open: boolean) => void;
}

export function StudioHelpTooltip({
  helpKey,
  title,
  description,
  tip,
  size = 'xs',
  className = '',
  controlledOpen,
  onControlledOpenChange,
}: StudioHelpTooltipProps) {
  const studio = useOptionalStudio();
  const activeSliderId = studio?.activeSliderId ?? null;

  const entry = STUDIO_HELP_CATALOG[helpKey];
  const resolvedTitle = title ?? entry?.title ?? 'Ajuda';
  const resolvedDesc = description ?? entry?.description;
  const resolvedTip = tip ?? entry?.tip;

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === 'function' ? next(open) : next;
      if (isControlled) {
        onControlledOpenChange?.(resolved);
      } else {
        setInternalOpen(resolved);
      }
    },
    [isControlled, onControlledOpenChange, open]
  );

  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placeBelow: boolean }>({
    top: 0,
    left: 8,
    width: 264,
    placeBelow: true,
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const popWidth = Math.min(264, window.innerWidth - margin * 2);
    const estimatedHeight = 140;

    const spaceBelow = window.innerHeight - rect.bottom;
    const placeBelow = spaceBelow >= estimatedHeight || rect.top < estimatedHeight;

    const rawLeft = rect.left + rect.width / 2 - popWidth / 2;
    const left = Math.max(margin, Math.min(rawLeft, window.innerWidth - popWidth - margin));
    const top = placeBelow
      ? Math.min(window.innerHeight - margin, rect.bottom + 8)
      : Math.max(margin, rect.top - 8);

    setCoords({ top, left, width: popWidth, placeBelow });
  }, []);

  // Fecha imediatamente qualquer tooltip aberto ao iniciar arraste de slider
  useEffect(() => {
    if (activeSliderId !== null && open) {
      setOpen(false);
    }
  }, [activeSliderId, open, setOpen]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const handleScrollOrResize = () => setOpen(false);

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    window.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open, updatePosition, setOpen]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  if (!resolvedDesc) return null;

  const isDesktopPointer = () =>
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const handleMouseEnter = () => {
    if (!isDesktopPointer()) return;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, 180);
  };

  const handleMouseLeave = () => {
    if (!isDesktopPointer()) return;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 120);
  };

  const btnDims = size === 'sm' ? 'w-5 h-5 text-[11px]' : 'w-4 h-4 text-[10px]';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Ajuda: ${resolvedTitle}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          updatePosition();
          setOpen((prev) => !prev);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-hover/80 text-fg-muted hover:text-accent-primary hover:border-accent-primary/50 transition-colors font-bold leading-none ${btnDims} ${className}`}
      >
        ?
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            onMouseEnter={() => {
              if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
            }}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              transform: coords.placeBelow ? 'none' : 'translateY(-100%)',
              zIndex: 9999,
            }}
            className="rounded-xl border border-border-subtle bg-surface/95 backdrop-blur-md p-3 shadow-2xl text-left pointer-events-auto"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-xs font-semibold text-fg-primary leading-snug">{resolvedTitle}</p>
              <button
                type="button"
                aria-label="Fechar ajuda"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                className="text-fg-muted hover:text-fg-primary text-xs leading-none p-0.5"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-fg-secondary leading-relaxed">{resolvedDesc}</p>
            {resolvedTip && (
              <p className="mt-2 pt-1.5 border-t border-border-subtle text-[10px] font-medium text-accent-primary leading-snug">
                Dica: {resolvedTip}
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
