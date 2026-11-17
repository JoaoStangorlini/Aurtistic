// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState, useCallback, useRef } from 'react';
import type { StudioSlide } from '@/components/organizacoes/studio/types';

const MAX_HISTORY = 50;

export function useStudioHistory(initialSlides: StudioSlide[]) {
  const [history, setHistory] = useState<StudioSlide[][]>([initialSlides]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isInternalChangeRef = useRef(false);

  const pushState = useCallback((newSlides: StudioSlide[]) => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    setHistory((prev) => {
      const upToCurrent = prev.slice(0, historyIndex + 1);
      const next = [...upToCurrent, newSlides];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  const undo = useCallback((): StudioSlide[] | null => {
    if (historyIndex <= 0) return null;
    isInternalChangeRef.current = true;
    const targetIdx = historyIndex - 1;
    setHistoryIndex(targetIdx);
    return history[targetIdx];
  }, [history, historyIndex]);

  const redo = useCallback((): StudioSlide[] | null => {
    if (historyIndex >= history.length - 1) return null;
    isInternalChangeRef.current = true;
    const targetIdx = historyIndex + 1;
    setHistoryIndex(targetIdx);
    return history[targetIdx];
  }, [history, historyIndex]);

  return {
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    pushState,
    undo,
    redo,
  };
}
