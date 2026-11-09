// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/MemberCapacityQuickSelector.tsx
'use client';

import React, { useState } from 'react';
import type { CognitiveCapacity } from '@/types/organizations';
import { updateMemberCapacityAction } from '@/app/(dashboard)/organizacoes/actions';

export interface MemberCapacityQuickSelectorProps {
  organizationId: string;
  initialCapacity?: CognitiveCapacity;
  initialNote?: string;
  onCapacityUpdated?: (capacity: CognitiveCapacity) => void;
}

export function MemberCapacityQuickSelector({
  organizationId,
  initialCapacity = 'normal',
  initialNote = '',
  onCapacityUpdated,
}: MemberCapacityQuickSelectorProps) {
  const [capacity, setCapacity] = useState<CognitiveCapacity>(initialCapacity);
  const [note, setNote] = useState(initialNote);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSelect = async (newCap: CognitiveCapacity) => {
    setCapacity(newCap);
    setIsSaving(true);
    try {
      const res = await updateMemberCapacityAction({
        organizationId,
        capacity: newCap,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        onCapacityUpdated?.(newCap);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNote = async () => {
    setIsSaving(true);
    try {
      await updateMemberCapacityAction({
        organizationId,
        capacity,
        note: note.trim() || undefined,
      });
      setIsEditingNote(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-surface/90 border border-border-subtle rounded-2xl shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-fg-secondary uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[15px] text-[var(--accent-secondary)]">battery_charging_full</span>
          Minha Bateria Cognitiva
        </span>
        {isSaving && (
          <span className="w-3 h-3 border-2 border-transparent border-t-[var(--accent-secondary)] rounded-full animate-spin"></span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => handleSelect('normal')}
          className={`py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 border transition-all ${
            capacity === 'normal'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
              : 'bg-app text-fg-secondary border-border-subtle hover:border-emerald-500/30'
          }`}
          title="Pronto para tarefas de alta densidade cognitiva"
        >
          <span>🟢</span>
          <span>Normal</span>
        </button>

        <button
          type="button"
          disabled={isSaving}
          onClick={() => handleSelect('reduced')}
          className={`py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 border transition-all ${
            capacity === 'reduced'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
              : 'bg-app text-fg-secondary border-border-subtle hover:border-amber-500/30'
          }`}
          title="Fadiga sensorial / atenção reduzida: priorizar tarefas leves"
        >
          <span>🟡</span>
          <span>Reduzida</span>
        </button>

        <button
          type="button"
          disabled={isSaving}
          onClick={() => handleSelect('depleted')}
          className={`py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 border transition-all ${
            capacity === 'depleted'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
              : 'bg-app text-fg-secondary border-border-subtle hover:border-rose-500/30'
          }`}
          title="Esgotamento / sobrecarga: evitar novas atribuições hoje"
        >
          <span>🔴</span>
          <span>Esgotada</span>
        </button>
      </div>

      {isEditingNote ? (
        <div className="flex gap-1.5 mt-1">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: Em fechamento de artigo até 16h..."
            className="flex-1 bg-app border border-border-subtle rounded-lg px-2.5 py-1 text-[11px] text-fg outline-none focus:border-[var(--accent-secondary)]"
          />
          <button
            type="button"
            onClick={handleSaveNote}
            className="px-2.5 py-1 bg-[var(--accent-secondary)] text-[#121212] font-bold rounded-lg text-[10px]"
          >
            OK
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[10px] text-fg-muted px-1 mt-0.5">
          <span className="truncate">{note ? `Nota: "${note}"` : 'Sem aviso de estado'}</span>
          <button
            type="button"
            onClick={() => setIsEditingNote(true)}
            className="text-[var(--accent-secondary)] hover:underline shrink-0 ml-1 font-semibold"
          >
            {note ? 'Editar' : '+ Nota'}
          </button>
        </div>
      )}
    </div>
  );
}

