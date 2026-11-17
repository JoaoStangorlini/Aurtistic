// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useEffect, useRef } from 'react';
import type { StudioDraft, StudioStage } from '@/components/organizacoes/studio/types';
import { saveDraftToIdb } from '@/lib/studio/studio-idb';

interface UseStudioAutoSaveOptions {
  stage: StudioStage;
  activeDraftSlot: 1 | 2 | 3 | null;
  draft: StudioDraft | null;
  orgSlug?: string | null;
  onSaved?: (savedAt: string) => void;
}

export function useStudioAutoSave({
  stage,
  activeDraftSlot,
  draft,
  orgSlug,
  onSaved,
}: UseStudioAutoSaveOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSerializedRef = useRef<string>('');

  useEffect(() => {
    if (stage !== 'editor' || !activeDraftSlot || !draft) return;

    const serialized = JSON.stringify({
      slot: activeDraftSlot,
      aspect: draft.aspectRatio,
      slidesCount: draft.slides.length,
      layersCount: draft.slides.reduce((acc, s) => acc + s.layers.length, 0),
    });

    if (serialized === lastSerializedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      lastSerializedRef.current = serialized;
      try {
        await saveDraftToIdb(draft);
        const slug = orgSlug || '';
        fetch('/api/studio/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slotIndex: activeDraftSlot, orgSlug: slug, draft }),
        }).catch(() => {});
        onSaved?.(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        console.warn('[StudioAutoSave] Falha no auto-save debounced:', err);
      }
    }, 5000); // Debounce de 5 segundos de inatividade

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [stage, activeDraftSlot, draft, orgSlug, onSaved]);
}
