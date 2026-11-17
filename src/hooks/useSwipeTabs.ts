// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useCallback, useRef } from 'react';
import type { TouchEvent, WheelEvent } from 'react';

interface UseSwipeTabsOptions {
  /** Chamado ao deslizar para a esquerda (próxima subaba). */
  onNext?: () => void;
  /** Chamado ao deslizar para a direita (subaba anterior). */
  onPrev?: () => void;
  enabled?: boolean;
}

const TOUCH_MIN_DX = 70;
const TOUCH_MAX_MS = 700;
const WHEEL_THRESHOLD = 140;
const COOLDOWN_MS = 900;

/** Ignora gestos que começam em controles interativos ou áreas roláveis na horizontal. */
function shouldIgnore(target: EventTarget | null, dir: -1 | 1): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el) {
    const tag = el.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      tag === 'CANVAS' ||
      tag === 'VIDEO' ||
      el.isContentEditable ||
      el.dataset?.noSwipe !== undefined
    ) {
      return true;
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') {
        // dir: 1 = conteúdo indo para a direita (dedo p/ esquerda)
        const canScrollFurther = dir === 1 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0;
        if (canScrollFurther) return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

export function useSwipeTabs({ onNext, onPrev, enabled = true }: UseSwipeTabsOptions) {
  const start = useRef<{ x: number; y: number; t: number; target: EventTarget | null } | null>(null);
  const wheelAcc = useRef(0);
  const wheelReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedUntil = useRef(0);

  const fire = useCallback(
    (dir: -1 | 1) => {
      const now = Date.now();
      if (now < lockedUntil.current) return;
      const cb = dir === 1 ? onNext : onPrev;
      if (!cb) return;
      lockedUntil.current = now + COOLDOWN_MS;
      cb();
    },
    [onNext, onPrev]
  );

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || e.touches.length !== 1) {
        start.current = null;
        return;
      }
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, t: Date.now(), target: e.target };
    },
    [enabled]
  );

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!enabled || !s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Date.now() - s.t > TOUCH_MAX_MS) return;
      if (Math.abs(dx) < TOUCH_MIN_DX || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const dir: -1 | 1 = dx < 0 ? 1 : -1;
      if (shouldIgnore(s.target, dir)) return;
      fire(dir);
    },
    [enabled, fire]
  );

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!enabled) return;
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5 || e.ctrlKey) return;
      const dir: -1 | 1 = e.deltaX > 0 ? 1 : -1;
      if (shouldIgnore(e.target, dir)) return;
      wheelAcc.current += e.deltaX;
      if (wheelReset.current) clearTimeout(wheelReset.current);
      wheelReset.current = setTimeout(() => {
        wheelAcc.current = 0;
      }, 180);
      if (Math.abs(wheelAcc.current) >= WHEEL_THRESHOLD) {
        wheelAcc.current = 0;
        fire(dir);
      }
    },
    [enabled, fire]
  );

  return { onTouchStart, onTouchEnd, onWheel };
}

