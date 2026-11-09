// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/TeamProgressPanel.tsx
'use client';

import React, { useMemo, useState } from 'react';
import type { Task } from '@/types';
import type {
  Organization,
  OrganizationMember,
  OrganizationSubteam,
} from '@/types/organizations';

export interface TeamProgressPanelProps {
  organization: Organization;
  subteams: OrganizationSubteam[];
  members: OrganizationMember[];
  tasks: Task[];
  onSelectMemberFilter?: (memberId: string | null) => void;
  selectedMemberId?: string | null;
  onSelectSubteamFilter?: (subteamId: string | null) => void;
  selectedSubteamId?: string | null;
}

export function TeamProgressPanel({
  organization,
  subteams,
  members,
  tasks,
  onSelectMemberFilter,
  selectedMemberId,
  onSelectSubteamFilter,
  selectedSubteamId,
}: TeamProgressPanelProps) {
  const [activeSubteamTab, setActiveSubteamTab] = useState<string>(selectedSubteamId || 'all');

  const handleSubteamClick = (subId: string) => {
    const next = activeSubteamTab === subId ? 'all' : subId;
    setActiveSubteamTab(next);
    onSelectSubteamFilter?.(next === 'all' ? null : next);
  };

  // Filtra tarefas da organização ativa
  const orgTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        t.organization_id === organization.id ||
        t.dimensao === 'HUB' ||
        t.dimensao === 'LabDiv' ||
        (organization.name && t.dimensao === organization.name)
    );
  }, [tasks, organization.id, organization.name]);

  // Estatísticas gerais
  const stats = useMemo(() => {
    const total = orgTasks.length;
    const completed = orgTasks.filter((t) => t.status === 'Concluído').length;
    const inProgress = orgTasks.filter((t) => t.status === 'Em Andamento').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, percent };
  }, [orgTasks]);

  // Agrupamento por subequipe
  const subteamProgress = useMemo(() => {
    return subteams.map((sub) => {
      const subTasks = orgTasks.filter((t) => t.subteam_id === sub.id);
      const subTotal = subTasks.length;
      const subDone = subTasks.filter((t) => t.status === 'Concluído').length;
      const percent = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0;
      return {
        ...sub,
        total: subTotal,
        done: subDone,
        percent,
      };
    });
  }, [subteams, orgTasks]);

  return (
    <div data-tour="team-progress-panel" className="p-4 md:p-6 bg-surface/90 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-xl space-y-6">
      {/* Cabeçalho do Painel de Equipe */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[var(--accent-secondary)]">
              groups
            </span>
            <h2 className="text-base font-bold text-fg font-['Bukra']">
              Progresso da Equipe • {organization.name}
            </h2>
          </div>
          <p className="text-xs text-fg-secondary mt-0.5">
            Distribuição de tarefas, subequipes e monitoramento de sobrecarga cognitiva.
          </p>
        </div>

        {/* Barra de Progresso Geral */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-xs font-bold text-fg">{stats.percent}% concluído</span>
            <span className="block text-[10px] text-fg-muted">
              {stats.completed}/{stats.total} tarefas
            </span>
          </div>
          <div className="w-24 sm:w-32 h-2.5 bg-app rounded-full overflow-hidden border border-border-subtle">
            <div
              className="h-full bg-gradient-brand transition-all duration-500 rounded-full"
              style={{ width: `${stats.percent}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Grid de Subequipes */}
      <div>
        <h3 className="text-xs font-bold text-fg-secondary uppercase tracking-wider mb-3">
          Subequipes do {organization.name}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {subteamProgress.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => handleSubteamClick(sub.id)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                activeSubteamTab === sub.id
                  ? 'bg-app border-[var(--accent-secondary)] shadow-sm'
                  : 'bg-app/60 border-border-subtle hover:border-[var(--accent-primary)]'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: sub.color || '#9D4EDD' }}
                ></span>
                <span className="text-[11px] font-bold text-fg-secondary">
                  {sub.percent}%
                </span>
              </div>
              <h4 className="text-xs font-bold text-fg truncate">{sub.name}</h4>
              <span className="text-[10px] text-fg-muted block mt-0.5">
                {sub.done} de {sub.total} concluídas
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Membros e Bateria Cognitiva */}
      <div data-tour="org-members-section">
        <h3 className="text-xs font-bold text-fg-secondary uppercase tracking-wider mb-3">
          Membros da Equipe & Bateria Cognitiva
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {members.map((m) => {
            const isSelected = selectedMemberId === m.id;
            const capIcon =
              m.cognitive_capacity === 'normal'
                ? '🟢'
                : m.cognitive_capacity === 'reduced'
                  ? '🟡'
                  : '🔴';

            const memberTasks = orgTasks.filter(
              (t) =>
                (t.assigned_member_ids && t.assigned_member_ids.includes(m.id)) ||
                (m.user_id && t.user_id === m.user_id) ||
                (t.responsavel && t.responsavel.toLowerCase().includes(m.full_name.toLowerCase()))
            );

            const isCompleted = (status?: string | null) => {
              const s = (status || '').toLowerCase();
              return s === 'concluído' || s === 'concluido' || s === 'completa' || s === 'done';
            };
            const isInProgress = (status?: string | null) => {
              const s = (status || '').toLowerCase();
              return s === 'em andamento' || s === 'andamento' || s === 'fazendo';
            };

            const now = Date.now();
            const completedCount = memberTasks.filter((t) => isCompleted(t.status)).length;
            const inProgressCount = memberTasks.filter((t) => isInProgress(t.status)).length;
            const overdueCount = memberTasks.filter(
              (t) => !isCompleted(t.status) && t.prazo && new Date(t.prazo).getTime() < now
            ).length;
            const pendingCount = Math.max(0, memberTasks.length - completedCount - inProgressCount);

            return (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  onSelectMemberFilter?.(isSelected ? null : m.id)
                }
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer gap-2 ${
                  isSelected
                    ? 'bg-[var(--accent-secondary)]/15 border-[var(--accent-secondary)] shadow-sm'
                    : 'bg-app border-border-subtle hover:border-[var(--accent-primary)]/50'
                }`}
                title={m.capacity_note ? `Nota: ${m.capacity_note}` : m.full_name}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-surface border border-border-subtle flex items-center justify-center text-[11px] font-bold text-fg shrink-0">
                      {m.full_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-fg block truncate">
                        {m.full_name}
                      </span>
                      {m.is_placeholder && (
                        <span className="text-[10px] text-amber-400 font-mono block">
                          (placeholder)
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs shrink-0" title={`Capacidade: ${m.cognitive_capacity}`}>
                    {capIcon}
                  </span>
                </div>

                {/* Cards de Carga por Membro: Concluídas, Em Andamento, Pendentes, Atrasadas */}
                <div className="grid grid-cols-4 gap-1 text-center pt-2 border-t border-border-subtle text-[10px]">
                  <div className="p-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold" title="Concluídas">
                    <span className="block text-[9px] opacity-75">🟢 Feito</span>
                    <span>{completedCount}</span>
                  </div>
                  <div className="p-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold" title="Em Andamento">
                    <span className="block text-[9px] opacity-75">🟡 Andam.</span>
                    <span>{inProgressCount}</span>
                  </div>
                  <div className="p-1 rounded bg-white/5 border border-white/10 text-white/70 font-semibold" title="Pendentes">
                    <span className="block text-[9px] opacity-75">⚪ Pend.</span>
                    <span>{pendingCount}</span>
                  </div>
                  <div className={`p-1 rounded font-semibold ${overdueCount > 0 ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300' : 'bg-white/5 border border-white/10 text-white/40'}`} title="Atrasadas">
                    <span className="block text-[9px] opacity-75">🔴 Atraso</span>
                    <span>{overdueCount}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

