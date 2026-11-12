// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';

export type HealthItemType = 'consulta' | 'exame';

export interface HealthReminderItem {
  id: string;
  type: HealthItemType;
  title: string;
  professionalOrLab?: string;
  scheduledDate?: string | null; // Formato YYYY-MM-DD
  lastDoneDate?: string | null; // Formato YYYY-MM-DD
  notes?: string;
  createdAt: string;
}

const STORAGE_KEY = 'aurtistic_health_reminders_v1';

const QUICK_SUGGESTION_CHIPS = [
  { title: 'Oftalmologista', type: 'consulta' as HealthItemType, icon: 'visibility' },
  { title: 'Hemograma Completo', type: 'exame' as HealthItemType, icon: 'bloodtype' },
  { title: 'Vitamina D', type: 'exame' as HealthItemType, icon: 'wb_sunny' },
  { title: 'Check-up Anual', type: 'consulta' as HealthItemType, icon: 'health_and_safety' },
  { title: 'Dentista', type: 'consulta' as HealthItemType, icon: 'dentistry' },
  { title: 'Glicemia / Perfil Lipídico', type: 'exame' as HealthItemType, icon: 'biotech' },
];

export function HealthMedicalRemindersPanel() {
  const [items, setItems] = useState<HealthReminderItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Campos do formulário
  const [itemType, setItemType] = useState<HealthItemType>('consulta');
  const [title, setTitle] = useState('');
  const [professionalOrLab, setProfessionalOrLab] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');

  // Carrega do localStorage (LGPD: dados nunca saem do dispositivo)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch {}
    setIsLoaded(true);
  }, []);

  // Salva no localStorage
  const saveItems = useCallback((newItems: HealthReminderItem[]) => {
    setItems(newItems);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    } catch {}
  }, []);

  // Calcula dinamicamente a diferença em dias entre hoje e a data agendada
  const computeDaysDifference = (targetDateStr: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = targetDateStr.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    target.setHours(0, 0, 0, 0);

    const diffMs = target.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  // Separação estrita dos 3 sub-painéis requeridos
  const { toScheduleItems, upcomingItems, pastDoneItems } = useMemo(() => {
    const toSchedule: HealthReminderItem[] = [];
    const upcoming: Array<{ item: HealthReminderItem; daysUntil: number }> = [];
    const pastDone: HealthReminderItem[] = [];

    for (const it of items) {
      if (it.scheduledDate) {
        const days = computeDaysDifference(it.scheduledDate);
        if (days >= 0) {
          upcoming.push({ item: it, daysUntil: days });
        } else {
          // Data já ultrapassou: candidato a mover para histórico
          upcoming.push({ item: it, daysUntil: days });
        }
      } else {
        toSchedule.push(it);
      }

      if (it.lastDoneDate) {
        pastDone.push(it);
      }
    }

    // Ordena os futuros por data mais próxima
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
    // Ordena histórico pelas datas mais recentes
    pastDone.sort((a, b) => String(b.lastDoneDate).localeCompare(String(a.lastDoneDate)));

    return { toScheduleItems: toSchedule, upcomingItems: upcoming, pastDoneItems: pastDone };
  }, [items]);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newItem: HealthReminderItem = {
      id: `health_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: itemType,
      title: title.trim(),
      professionalOrLab: professionalOrLab.trim() || undefined,
      scheduledDate: scheduledDate ? scheduledDate : null,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    saveItems([newItem, ...items]);
    setTitle('');
    setProfessionalOrLab('');
    setScheduledDate('');
    setNotes('');
    setIsFormOpen(false);
  };

  const handleApplyChip = (chip: (typeof QUICK_SUGGESTION_CHIPS)[0]) => {
    setItemType(chip.type);
    setTitle(chip.title);
    setIsFormOpen(true);
  };

  // Transição de status: Mover item vencido/concluído para as "Últimas", atualizando lastDoneDate
  const handleMarkAsDone = (id: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = items.map((it) => {
      if (it.id === id) {
        return {
          ...it,
          lastDoneDate: it.scheduledDate || todayStr,
          scheduledDate: null, // Limpa o agendamento atual
        };
      }
      return it;
    });
    saveItems(updated);
  };

  const handleDeleteItem = (id: string) => {
    saveItems(items.filter((it) => it.id !== id));
  };

  if (!isLoaded) return null;

  return (
    <div className="space-y-4 pt-3 border-t border-[var(--border-subtle,#2D2D2D)]">
      {/* Aviso LGPD / Confinamento Local */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-200">
        <span className="material-symbols-outlined text-[18px] text-teal-400 shrink-0 mt-0.5">
          verified_user
        </span>
        <div>
          <span className="font-bold text-teal-300">Privacidade Médica & LGPD: </span>
          Estes registros ficam salvos <strong>exclusivamente neste dispositivo</strong>. Nenhuma
          informação clínica ou de consultas é transmitida para a nuvem sem seu consentimento explícito.
        </div>
      </div>

      {/* Cabeçalho do Painel */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-teal-400">medical_services</span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary,#F5F5F5)]">
            Consultas, Exames & Saúde Preventiva
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setIsFormOpen((prev) => !prev)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 border border-teal-500/40 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">
            {isFormOpen ? 'expand_less' : 'add'}
          </span>
          <span>{isFormOpen ? 'Fechar' : 'Novo Registro'}</span>
        </button>
      </div>

      {/* Sugestões Rápidas (Chips de 1 clique) */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block">
          Sugestões Rápidas:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip.title}
              type="button"
              onClick={() => handleApplyChip(chip)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[var(--surface-secondary,#242424)] hover:bg-[var(--surface-hover,#2D2D2D)] border border-[var(--border-subtle,#2D2D2D)] hover:border-teal-500/50 text-[var(--text-secondary,#B3B3B3)] hover:text-white transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px] text-teal-400">{chip.icon}</span>
              <span>{chip.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Formulário de Criação */}
      {isFormOpen && (
        <form
          onSubmit={handleAddItem}
          className="p-3.5 rounded-xl bg-[var(--surface-secondary,#242424)] border border-[var(--border-subtle,#2D2D2D)] space-y-3 animate-in fade-in duration-150"
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setItemType('consulta')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                itemType === 'consulta'
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                  : 'bg-[var(--surface-primary,#1A1A1A)] border-[var(--border-subtle,#2D2D2D)] text-[var(--text-muted,#8E8E8E)]'
              }`}
            >
              Consulta Médica
            </button>
            <button
              type="button"
              onClick={() => setItemType('exame')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                itemType === 'exame'
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                  : 'bg-[var(--surface-primary,#1A1A1A)] border-[var(--border-subtle,#2D2D2D)] text-[var(--text-muted,#8E8E8E)]'
              }`}
            >
              Exame Laboratorial
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-1">
                Especialidade ou Nome do Exame *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Oftalmologista, Hemograma..."
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-primary,#1A1A1A)] border border-[var(--border-subtle,#2D2D2D)] text-xs text-[var(--text-primary,#F5F5F5)] focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-1">
                Profissional, Clínica ou Laboratório
              </label>
              <input
                type="text"
                value={professionalOrLab}
                onChange={(e) => setProfessionalOrLab(e.target.value)}
                placeholder="Ex: Dr. Silva, Lab Central..."
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-primary,#1A1A1A)] border border-[var(--border-subtle,#2D2D2D)] text-xs text-[var(--text-primary,#F5F5F5)] focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-1">
                Data Agendada (Deixe vazio para &quot;Para Agendar&quot;)
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-primary,#1A1A1A)] border border-[var(--border-subtle,#2D2D2D)] text-xs text-[var(--text-primary,#F5F5F5)] focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-muted,#8E8E8E)] uppercase block mb-1">
                Instruções ou Observações
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Jejum de 8h, levar receitas anteriores..."
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-primary,#1A1A1A)] border border-[var(--border-subtle,#2D2D2D)] text-xs text-[var(--text-primary,#F5F5F5)] focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted,#8E8E8E)] hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-teal-500 text-slate-950 hover:bg-teal-400 transition-colors shadow-sm"
            >
              Salvar Registro
            </button>
          </div>
        </form>
      )}

      {/* Grid com os 3 Sub-Painéis Padronizados */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Sub-painel 1: Para Agendar */}
        <div className="p-3 rounded-xl bg-[var(--surface-secondary,#242424)] border border-[var(--border-subtle,#2D2D2D)] flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle,#2D2D2D)] mb-2">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-amber-400">event_busy</span>
              <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)]">Para Agendar</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-amber-300">
              {toScheduleItems.length}
            </span>
          </div>

          <div className="space-y-2 flex-1">
            {toScheduleItems.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted,#8E8E8E)] italic py-2 text-center">
                Nenhum item pendente de agendamento.
              </p>
            ) : (
              toScheduleItems.map((it) => (
                <div
                  key={it.id}
                  className="p-2 rounded-lg bg-[var(--surface-primary,#1A1A1A)] border border-[var(--border-subtle,#2D2D2D)] text-xs space-y-1"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-bold text-[var(--text-primary,#F5F5F5)]">{it.title}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(it.id)}
                      className="text-[var(--text-muted,#8E8E8E)] hover:text-rose-400"
                      title="Excluir"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                  {it.professionalOrLab && (
                    <p className="text-[11px] text-[var(--text-muted,#8E8E8E)]">{it.professionalOrLab}</p>
                  )}
                  {it.notes && <p className="text-[10px] text-amber-300/80 italic">{it.notes}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sub-painel 2: Daqui a X dias */}
        <div className="p-3 rounded-xl bg-[var(--surface-secondary,#242424)] border border-[var(--border-subtle,#2D2D2D)] flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle,#2D2D2D)] mb-2">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-teal-400">schedule</span>
              <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)]">Daqui a X dias</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-teal-300">
              {upcomingItems.length}
            </span>
          </div>

          <div className="space-y-2 flex-1">
            {upcomingItems.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted,#8E8E8E)] italic py-2 text-center">
                Nenhuma data futura definida.
              </p>
            ) : (
              upcomingItems.map(({ item: it, daysUntil }) => (
                <div
                  key={it.id}
                  className="p-2 rounded-lg bg-[var(--surface-primary,#1A1A1A)] border border-[var(--border-subtle,#2D2D2D)] text-xs space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-bold text-[var(--text-primary,#F5F5F5)]">{it.title}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(it.id)}
                      className="text-[var(--text-muted,#8E8E8E)] hover:text-rose-400"
                      title="Excluir"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span
                      className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
                        daysUntil < 0
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : daysUntil === 0
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-teal-500/20 text-teal-300'
                      }`}
                    >
                      {daysUntil < 0
                        ? `Atrasado há ${Math.abs(daysUntil)} dias`
                        : daysUntil === 0
                        ? 'É hoje!'
                        : `Daqui a ${daysUntil} dias`}
                    </span>
                    <span className="text-[var(--text-muted,#8E8E8E)] font-mono text-[10px]">
                      {it.scheduledDate}
                    </span>
                  </div>
                  {it.professionalOrLab && (
                    <p className="text-[11px] text-[var(--text-muted,#8E8E8E)]">{it.professionalOrLab}</p>
                  )}
                  {/* Botão de Transição de Status: Mover para Últimas */}
                  <button
                    type="button"
                    onClick={() => handleMarkAsDone(it.id)}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 text-[11px] font-bold transition-colors cursor-pointer"
                    title="Marcar como realizado e mover para Últimas Consultas/Exames"
                  >
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    <span>Concluir & Mover para Histórico</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sub-painel 3: Últimas Consultas / Últimos Exames */}
        <div className="p-3 rounded-xl bg-[var(--surface-secondary,#242424)] border border-[var(--border-subtle,#2D2D2D)] flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle,#2D2D2D)] mb-2">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-emerald-400">history</span>
              <span className="text-xs font-bold text-[var(--text-primary,#F5F5F5)]">
                Últimas Consultas / Últimos Exames
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-emerald-300">
              {pastDoneItems.length}
            </span>
          </div>

          <div className="space-y-2 flex-1">
            {pastDoneItems.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted,#8E8E8E)] italic py-2 text-center">
                Nenhum histórico registrado ainda.
              </p>
            ) : (
              pastDoneItems.map((it) => (
                <div
                  key={it.id}
                  className="p-2 rounded-lg bg-[var(--surface-primary,#1A1A1A)] border border-[var(--border-subtle,#2D2D2D)] text-xs space-y-1"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-bold text-[var(--text-primary,#F5F5F5)]">{it.title}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(it.id)}
                      className="text-[var(--text-muted,#8E8E8E)] hover:text-rose-400"
                      title="Excluir"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-emerald-400">
                    <span className="flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[12px]">done_all</span>
                      <span>Realizado</span>
                    </span>
                    <span className="font-mono text-[var(--text-muted,#8E8E8E)]">{it.lastDoneDate}</span>
                  </div>
                  {it.professionalOrLab && (
                    <p className="text-[11px] text-[var(--text-muted,#8E8E8E)]">{it.professionalOrLab}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

