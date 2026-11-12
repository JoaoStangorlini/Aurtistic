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
  currentUserId?: string;
  onSelectMemberFilter?: (memberId: string | null) => void;
  selectedMemberId?: string | null;
  onSelectSubteamFilter?: (subteamId: string | null) => void;
  selectedSubteamId?: string | null;
  onClaimTask?: (taskId: string) => Promise<void>;
  onRelieveTask?: (taskId: string, targetMemberName: string) => Promise<void>;
  onAssignAllToMe?: () => Promise<void>;
}

export function TeamProgressPanel({
  organization,
  subteams,
  members,
  tasks,
  currentUserId,
  onSelectMemberFilter,
  selectedMemberId,
  onSelectSubteamFilter,
  selectedSubteamId,
  onClaimTask,
  onRelieveTask,
  onAssignAllToMe,
}: TeamProgressPanelProps) {
  const [activeSubteamTab, setActiveSubteamTab] = useState<string>(selectedSubteamId || 'all');
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  const [isAssigningAll, setIsAssigningAll] = useState(false);
  const [isUnassignedExpanded, setIsUnassignedExpanded] = useState(false);
  const [isReliefExpanded, setIsReliefExpanded] = useState(false);

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

  // Tarefas sem responsável na organização ou na subequipe selecionada
  const unassignedTasks = useMemo(() => {
    return orgTasks.filter((t) => {
      const isDone = t.status === 'Concluído' || t.status === 'done';
      if (isDone) return false;
      const hasAssignee =
        (t.assigned_member_ids && t.assigned_member_ids.length > 0) ||
        Boolean(t.assignee_id) ||
        Boolean(t.responsavel);
      if (hasAssignee) return false;
      if (activeSubteamTab !== 'all' && t.subteam_id !== activeSubteamTab) return false;
      return true;
    });
  }, [orgTasks, activeSubteamTab]);

  // Membros com sobrecarga/esgotamento e suas tarefas pendentes
  const overloadedMembersData = useMemo(() => {
    return members
      .map((m) => {
        const isDepleted = m.cognitive_capacity === 'depleted';
        const memberTasks = orgTasks.filter(
          (t) =>
            t.status !== 'Concluído' &&
            t.status !== 'done' &&
            ((t.assigned_member_ids && t.assigned_member_ids.includes(m.id)) ||
              (m.user_id && t.user_id === m.user_id) ||
              (t.responsavel && t.responsavel.toLowerCase().includes(m.full_name.toLowerCase())))
        );
        // Sobrecarga automática: mais de 4 tarefas ativas ou capacidade 'depleted'
        const isOverloaded = isDepleted || memberTasks.length >= 5;
        return {
          member: m,
          tasks: memberTasks,
          isOverloaded,
        };
      })
      .filter((d) => d.isOverloaded && d.tasks.length > 0);
  }, [members, orgTasks]);

  const handleClaim = async (taskId: string) => {
    if (!onClaimTask) return;
    setClaimingTaskId(taskId);
    try {
      await onClaimTask(taskId);
    } finally {
      setClaimingTaskId(null);
    }
  };

  const handleRelieve = async (taskId: string, targetMemberName: string) => {
    if (!onRelieveTask) return;
    setClaimingTaskId(taskId);
    try {
      await onRelieveTask(taskId, targetMemberName);
    } finally {
      setClaimingTaskId(null);
    }
  };

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

      {/* Seção 1: Fila de Tarefas Sem Responsável (Abertas na Categoria - Expansível) */}
      <div className="border-t border-border-subtle pt-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsUnassignedExpanded((prev) => !prev)}
            className="flex items-center gap-2 text-left group cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-amber-400 group-hover:scale-110 transition-transform">
              assignment_late
            </span>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-fg uppercase tracking-wider group-hover:text-amber-300 transition-colors">
                Tarefas Sem Responsável ({unassignedTasks.length})
              </h3>
              <span className="material-symbols-outlined text-[16px] text-fg-muted">
                {isUnassignedExpanded ? 'expand_less' : 'expand_more'}
              </span>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {unassignedTasks.length > 0 && onAssignAllToMe && (
              <button
                type="button"
                disabled={isAssigningAll}
                onClick={async () => {
                  setIsAssigningAll(true);
                  try {
                    await onAssignAllToMe();
                  } finally {
                    setIsAssigningAll(false);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[15px]">done_all</span>
                <span>{isAssigningAll ? 'Atribuindo...' : 'Atribuir Todas para Mim'}</span>
              </button>
            )}
            <span className="text-[11px] text-fg-muted hidden sm:inline">
              Demandas abertas para qualquer membro da categoria puxar.
            </span>
          </div>
        </div>

        {isUnassignedExpanded && (
          <div className="animate-in fade-in duration-200">
            {unassignedTasks.length === 0 ? (
              <div className="p-3 rounded-xl bg-app/40 border border-border-subtle text-xs text-fg-muted text-center italic">
                Nenhuma tarefa sem responsável nesta visualização. Toda a equipe está alinhada!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {unassignedTasks.map((task) => {
                  const subteam = subteams.find((s) => s.id === task.subteam_id);
                  const isClaiming = claimingTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className="p-3 rounded-xl bg-app border border-border-subtle flex flex-col justify-between gap-2.5 hover:border-amber-500/40 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                            style={{
                              backgroundColor: `${subteam?.color || '#9D4EDD'}20`,
                              color: subteam?.color || '#9D4EDD',
                            }}
                          >
                            {subteam?.name || 'Geral'}
                          </span>
                          {task.prioridade && (
                            <span className="text-[10px] font-bold text-fg-secondary">
                              {task.prioridade}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-fg line-clamp-2">{task.nome}</h4>
                        {task.prazo && (
                          <span className="text-[10px] text-fg-muted block">
                            Prazo: {task.prazo}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isClaiming || !onClaimTask}
                        onClick={() => handleClaim(task.id)}
                        className="w-full py-1.5 px-3 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          front_hand
                        </span>
                        <span>{isClaiming ? 'Assumindo...' : 'Assumir Tarefa'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Seção 2: Apoio Mútuo e Redistribuição Solidária (Aliviar Companheiro - Expansível) */}
      {overloadedMembersData.length > 0 && (
        <div className="border-t border-border-subtle pt-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsReliefExpanded((prev) => !prev)}
              className="flex items-center gap-2 text-left group cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-rose-400 group-hover:scale-110 transition-transform">
                volunteer_activism
              </span>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wider group-hover:text-rose-200 transition-colors">
                  Apoio Mútuo • Alívio de Sobrecarga ({overloadedMembersData.reduce((acc, curr) => acc + curr.tasks.length, 0)} tarefas)
                </h3>
                <span className="material-symbols-outlined text-[16px] text-rose-400/80">
                  {isReliefExpanded ? 'expand_less' : 'expand_more'}
                </span>
              </div>
            </button>
            <span className="text-[11px] text-rose-300/80 hidden sm:inline">
              Colegas em alerta de sobrecarga. Você pode puxar uma tarefa para aliviar a carga da equipe.
            </span>
          </div>

          {isReliefExpanded && (
            <div className="space-y-3 animate-in fade-in duration-200">
              {overloadedMembersData.map(({ member: m, tasks: mTasks }) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2.5"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center justify-center">
                        {m.full_name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-rose-200 block">
                          {m.full_name}
                        </span>
                        <span className="text-[10px] text-rose-300/80 block">
                          Sinalizado como sobrecarregado ({mTasks.length} tarefas pendentes)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {mTasks.map((t) => {
                      const isRelieving = claimingTaskId === t.id;
                      return (
                        <div
                          key={t.id}
                          className="p-2.5 rounded-lg bg-surface border border-border-subtle flex flex-col justify-between gap-2"
                        >
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-fg-muted block">
                              {t.prioridade || 'Normal'}
                            </span>
                            <h5 className="text-xs font-bold text-fg line-clamp-1">{t.nome}</h5>
                          </div>
                          <button
                            type="button"
                            disabled={isRelieving || !onRelieveTask}
                            onClick={() => handleRelieve(t.id, m.full_name)}
                            className="w-full py-1 px-2.5 rounded-md text-[11px] font-bold bg-teal-500 text-slate-950 hover:bg-teal-400 transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-sm disabled:opacity-50"
                            title={`Assumir esta tarefa de ${m.full_name}`}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              handshake
                            </span>
                            <span>{isRelieving ? 'Puxando...' : 'Aliviar Companheiro (Assumir)'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

