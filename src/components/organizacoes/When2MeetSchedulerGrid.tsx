// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/When2MeetSchedulerGrid.tsx
'use client';

import React, { useState } from 'react';
import type { AgendaEvent } from '@/types';
import { computeUserBusyIntervals } from '@/utils/ics';
import { createClient } from '@/utils/supabase/client';

export interface When2MeetSchedulerGridProps {
  meetingId: string;
  userEvents?: AgendaEvent[];
  initialSlots?: Array<{ slot_start: string; slot_end: string; user_id: string; is_available: boolean }>;
  currentUserId: string;
  onSlotsUpdated?: () => void;
}

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const DAYS_COUNT = 5;

export function When2MeetSchedulerGrid({
  meetingId,
  userEvents = [],
  initialSlots = [],
  currentUserId,
  onSlotsUpdated,
}: When2MeetSchedulerGridProps) {
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const slot of initialSlots) {
      if (slot.user_id === currentUserId && slot.is_available) {
        s.add(slot.slot_start);
      }
    }
    return s;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Calcula os próximos 5 dias úteis a partir de amanhã
  const days = React.useMemo(() => {
    const list: Date[] = [];
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (list.length < DAYS_COUNT) {
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        list.push(new Date(d));
      }
      d.setDate(d.getDate() + 1);
    }
    return list;
  }, []);

  const toggleSlot = (isoString: string) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(isoString)) next.delete(isoString);
      else next.add(isoString);
      return next;
    });
  };

  const handlePreFillWithAgenda = () => {
    if (days.length === 0) return;
    const rangeStart = new Date(days[0]);
    rangeStart.setHours(8, 0, 0, 0);
    const rangeEnd = new Date(days[days.length - 1]);
    rangeEnd.setHours(21, 0, 0, 0);

    const busy = computeUserBusyIntervals(userEvents, rangeStart, rangeEnd);
    const freeSlots = new Set<string>();

    for (const day of days) {
      for (const h of HOURS) {
        const slotStart = new Date(day);
        slotStart.setHours(h, 0, 0, 0);
        const slotEnd = new Date(day);
        slotEnd.setHours(h + 1, 0, 0, 0);

        const isBusy = busy.some(
          (b) => slotStart < b.end && slotEnd > b.start
        );

        if (!isBusy) {
          freeSlots.add(slotStart.toISOString());
        }
      }
    }

    setSelectedSlots(freeSlots);
    setStatusMsg('Grid pré-preenchido com seus horários livres na agenda!');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleSaveAvailability = async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const supabase = createClient();
      // Remove slots existentes do usuário nesta reunião
      await supabase
        .from('organization_meeting_availability')
        .delete()
        .eq('meeting_id', meetingId)
        .eq('user_id', currentUserId);

      // Insere os novos selecionados
      const rows = Array.from(selectedSlots).map((slotStart) => {
        const s = new Date(slotStart);
        const e = new Date(s.getTime() + 60 * 60 * 1000);
        return {
          meeting_id: meetingId,
          user_id: currentUserId,
          slot_start: s.toISOString(),
          slot_end: e.toISOString(),
          is_available: true,
        };
      });

      if (rows.length > 0) {
        await supabase.from('organization_meeting_availability').insert(rows);
      }

      setStatusMsg('Disponibilidade salva com sucesso!');
      onSlotsUpdated?.();
      setTimeout(() => setStatusMsg(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-surface border border-border-subtle rounded-2xl shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div>
          <h3 className="text-sm font-bold text-fg font-['Bukra'] flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[var(--accent-secondary)]">
              calendar_month
            </span>
            Grade de Disponibilidade Coletiva
          </h3>
          <p className="text-xs text-fg-secondary">
            Marque os horários em que você está livre para encontrarmos a melhor sobreposição.
          </p>
        </div>

        <button
          type="button"
          onClick={handlePreFillWithAgenda}
          className="px-3.5 py-2 bg-gradient-to-r from-[#9D4EDD]/20 to-[#FFCC00]/20 hover:from-[#9D4EDD]/30 hover:to-[#FFCC00]/30 border border-[#9D4EDD]/40 text-fg text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px] text-[var(--accent-secondary)]">
            bolt
          </span>
          <span>Pré-preencher com minha Agenda</span>
        </button>
      </div>

      {statusMsg && (
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Grid de Horários */}
      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-2 text-fg-muted font-bold text-[10px] uppercase">Hora</th>
              {days.map((day) => (
                <th key={day.toISOString()} className="p-2 text-fg font-bold text-[11px]">
                  {day.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour) => (
              <tr key={hour} className="border-t border-border-subtle/50">
                <td className="p-2 text-[10px] font-bold text-fg-secondary">
                  {String(hour).padStart(2, '0')}:00
                </td>
                {days.map((day) => {
                  const slotDate = new Date(day);
                  slotDate.setHours(hour, 0, 0, 0);
                  const iso = slotDate.toISOString();
                  const isSelected = selectedSlots.has(iso);

                  return (
                    <td key={iso} className="p-1">
                      <button
                        type="button"
                        onClick={() => toggleSlot(iso)}
                        className={`w-full py-2 rounded-lg text-[10px] font-bold transition-all border ${
                          isSelected
                            ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-300 shadow-sm'
                            : 'bg-app border-border-subtle text-fg-muted hover:border-[var(--accent-primary)]/40'
                        }`}
                      >
                        {isSelected ? 'Livre' : '—'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleSaveAvailability}
          className="px-6 py-2.5 bg-[var(--accent-secondary)] text-[#121212] font-black rounded-xl text-xs uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md disabled:opacity-50 flex items-center gap-1.5"
        >
          {isSaving ? (
            <span className="w-4 h-4 border-2 border-transparent border-t-[#121212] rounded-full animate-spin"></span>
          ) : (
            <span className="material-symbols-outlined text-[16px]">save</span>
          )}
          <span>Salvar Minha Disponibilidade</span>
        </button>
      </div>
    </div>
  );
}

