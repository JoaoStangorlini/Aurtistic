// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/OrganizationGoalsPanel.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Task } from '@/types';
import type {
  Organization,
  OrganizationSubteam,
} from '@/types/organizations';
import { saveTask } from '@/app/(dashboard)/actions';

export interface GoalItem {
  id: string;
  title: string;
  description?: string;
  subteam_id?: string | null;
  targetDate?: string;
}

export interface OrganizationGoalsPanelProps {
  organization: Organization;
  subteams: OrganizationSubteam[];
  tasks: Task[];
  currentUserId?: string;
  onSelectSubteam?: (subteamId: string | null) => void;
  onTaskCreated?: (task: Task) => void;
  onTaskUpdated?: (task: Task) => void;
}

const GOALS_KEY_PREFIX = 'aurtistic_org_goals_v2_';

export function OrganizationGoalsPanel({
  organization,
  subteams,
  tasks,
  currentUserId,
  onSelectSubteam,
  onTaskCreated,
  onTaskUpdated,
}: OrganizationGoalsPanelProps) {
  const goalsStorageKey = `${GOALS_KEY_PREFIX}${organization.id}`;
  const [customGoals, setCustomGoals] = useState<GoalItem[]>([]);
  const [selectedAxisFilter, setSelectedAxisFilter] = useState<string>('all');
  const [expandedGoalIds, setExpandedGoalIds] = useState<string[]>([]);
  const [isNewGoalOpen, setIsNewGoalOpen] = useState(false);

  // Formulário de nova meta
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDesc, setNewGoalDesc] = useState('');
  const [newGoalSubteamId, setNewGoalSubteamId] = useState<string>('');

  // Criação rápida de tarefa dentro da meta
  const [taskDraftByGoal, setTaskDraftByGoal] = useState<Record<string, string>>({});
  const [creatingGoalId, setCreatingGoalId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(goalsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCustomGoals(parsed);
          return;
        }
      }
    } catch {}
    setCustomGoals([]);
  }, [goalsStorageKey]);

  const seedGoals: GoalItem[] = useMemo(() => {
    const goals: GoalItem[] = [
      {
        id: 'goal-global-1',
        title: `Objetivos Gerais • ${organization.name}`,
        description: 'Entregas estruturantes, organização da equipe e metas compartilhadas.',
        subteam_id: null,
      },
    ];

    for (const sub of subteams) {
      goals.push({
        id: `goal-${sub.id}`,
        title: `Meta de ${sub.name}`,
        description: `Acompanhamento das entregas e demandas da frente ${sub.name}.`,
        subteam_id: sub.id,
      });
    }
    return goals;
  }, [organization.name, subteams]);

  const allGoals = useMemo(() => [...customGoals, ...seedGoals], [customGoals, seedGoals]);

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;
    const created: GoalItem = {
      id: `goal_${Date.now()}`,
      title: newGoalTitle.trim(),
      description: newGoalDesc.trim() || undefined,
      subteam_id: newGoalSubteamId || null,
    };
    const next = [created, ...customGoals];
    setCustomGoals(next);
    try {
      localStorage.setItem(goalsStorageKey, JSON.stringify(next));
    } catch {}
    setNewGoalTitle('');
    setNewGoalDesc('');
    setNewGoalSubteamId('');
    setIsNewGoalOpen(false);
    setExpandedGoalIds((prev) => [...prev, created.id]);
  };

  const handleDeleteGoal = (goalId: string) => {
    const next = customGoals.filter((g) => g.id !== goalId);
    setCustomGoals(next);
    try {
      localStorage.setItem(goalsStorageKey, JSON.stringify(next));
    } catch {}
  };

  const getLinkedTasksForGoal = (goal: GoalItem) => {
    const tagMarker = `[meta:${goal.id}]`;
    return tasks.filter((t) => {
      if (t.goal_id === goal.id) return true;
      const hasMarker = Boolean(t.descricao && t.descricao.includes(tagMarker));
      if (hasMarker) return true;
      if (goal.id.startsWith('goal-')) {
        if (goal.subteam_id) return t.subteam_id === goal.subteam_id;
        return !t.subteam_id;
      }
      return false;
    });
  };

  const goalsWithProgress = useMemo(() => {
    return allGoals.map((goal) => {
      const linkedTasks = getLinkedTasksForGoal(goal);
      const total = linkedTasks.length;
      const completed = linkedTasks.filter(
        (t) => t.status === 'Concluído' || t.status === 'done'
      ).length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        ...goal,
        linkedTasks,
        total,
        completed,
        percent,
      };
    });
  }, [allGoals, tasks]);

  const filteredGoals = useMemo(() => {
    if (selectedAxisFilter === 'all') return goalsWithProgress;
    if (selectedAxisFilter === 'global') return goalsWithProgress.filter((g) => !g.subteam_id);
    return goalsWithProgress.filter((g) => g.subteam_id === selectedAxisFilter);
  }, [goalsWithProgress, selectedAxisFilter]);

  const handleAddTaskToGoal = async (goal: GoalItem) => {
    const title = (taskDraftByGoal[goal.id] || '').trim();
    if (!title) return;
    setCreatingGoalId(goal.id);
    try {
      const tagMarker = `[meta:${goal.id}]`;
      const newTask: Task = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: currentUserId || '',
        nome: title,
        descricao: `${tagMarker} Tarefa vinculada à meta: ${goal.title}`,
        status: 'A Fazer',
        prioridade: 'Média',
        categoria: null,
        responsavel: null,
        inicio: null,
        prazo: null,
        frequencia: null,
        dimensao: organization.name,
        concluida_em: null,
        organization_id: organization.id,
        subteam_id: goal.subteam_id || null,
        goal_id: goal.id,
        created_at: new Date().toISOString(),
      };
      await saveTask(newTask);
      onTaskCreated?.(newTask);
      setTaskDraftByGoal((prev) => ({ ...prev, [goal.id]: '' }));
      if (!expandedGoalIds.includes(goal.id)) {
        setExpandedGoalIds((prev) => [...prev, goal.id]);
      }
    } finally {
      setCreatingGoalId(null);
    }
  };

  const handleToggleTaskDone = async (task: Task) => {
    const isDone = task.status === 'Concluído' || task.status === 'done';
    const updated: Task = {
      ...task,
      status: isDone ? 'A Fazer' : 'Concluído',
      concluida_em: isDone ? null : new Date().toISOString(),
    };
    onTaskUpdated?.(updated);
    try {
      await saveTask(updated);
    } catch {}
  };

  const toggleGoalExpand = (goalId: string) => {
    setExpandedGoalIds((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  return (
    <div className="org-card p-4 md:p-6 bg-surface border border-border-subtle rounded-2xl shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--md-sys-color-secondary)]/15 border border-[var(--md-sys-color-secondary)]/30 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px] text-[var(--md-sys-color-secondary)]">
              flag
            </span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-fg uppercase tracking-wider">
              Metas & Objetivos • {organization.name}
            </h3>
            <p className="text-xs text-fg-muted mt-0.5">
              Crie metas gerais, adicione tarefas diretamente dentro de cada meta e acompanhe o progresso.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsNewGoalOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--md-sys-color-secondary)] text-slate-950 text-xs font-black hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px]">
            {isNewGoalOpen ? 'close' : 'add'}
          </span>
          <span>{isNewGoalOpen ? 'Fechar' : 'Nova Meta'}</span>
        </button>
      </div>

      {isNewGoalOpen && (
        <form
          onSubmit={handleCreateGoal}
          className="p-4 rounded-2xl bg-app border border-[var(--md-sys-color-secondary)]/40 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                Título da Meta *
              </label>
              <input
                type="text"
                required
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="Ex: Organizar Semana da Física 2026"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border-subtle text-xs text-fg focus:outline-none focus:border-[var(--md-sys-color-secondary)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                Frente / Subequipe
              </label>
              <select
                value={newGoalSubteamId}
                onChange={(e) => setNewGoalSubteamId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
              >
                <option value="">Meta Global (Toda a Equipe)</option>
                {subteams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
              Descrição (opcional)
            </label>
            <input
              type="text"
              value={newGoalDesc}
              onChange={(e) => setNewGoalDesc(e.target.value)}
              placeholder="Critério de sucesso ou resumo do objetivo..."
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border-subtle text-xs text-fg focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsNewGoalOpen(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-fg-muted hover:text-fg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-xs font-black bg-[var(--md-sys-color-secondary)] text-slate-950 hover:brightness-110 cursor-pointer"
            >
              Criar Meta
            </button>
          </div>
        </form>
      )}

      {/* Filter Chips M3 por Eixo */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setSelectedAxisFilter('all');
            onSelectSubteam?.(null);
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            selectedAxisFilter === 'all'
              ? 'bg-[var(--md-sys-color-primary)] text-slate-950 shadow-sm'
              : 'bg-app border border-border-subtle text-fg-muted hover:text-fg'
          }`}
        >
          Todas ({goalsWithProgress.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedAxisFilter('global');
            onSelectSubteam?.(null);
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            selectedAxisFilter === 'global'
              ? 'bg-[var(--md-sys-color-secondary)] text-slate-950 shadow-sm'
              : 'bg-app border border-border-subtle text-fg-muted hover:text-fg'
          }`}
        >
          Metas Globais
        </button>
        {subteams.map((sub) => (
          <button
            key={sub.id}
            type="button"
            onClick={() => {
              setSelectedAxisFilter(sub.id);
              onSelectSubteam?.(sub.id);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedAxisFilter === sub.id
                ? 'bg-[var(--md-sys-color-primary)] text-slate-950 shadow-sm'
                : 'bg-app border border-border-subtle text-fg-muted hover:text-fg'
            }`}
          >
            {sub.name}
          </button>
        ))}
      </div>

      {/* Grid de Metas com Tarefas Internas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredGoals.map((g) => {
          const sub = subteams.find((s) => s.id === g.subteam_id);
          const isGlobal = !g.subteam_id;
          const isCustom = customGoals.some((cg) => cg.id === g.id);
          const isExpanded = expandedGoalIds.includes(g.id);

          return (
            <div
              key={g.id}
              className="p-4 rounded-2xl bg-app border border-border-subtle flex flex-col justify-between gap-4 hover:border-[var(--md-sys-color-primary)]/40 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                      isGlobal
                        ? 'bg-[var(--md-sys-color-secondary)]/15 text-[var(--md-sys-color-secondary)] border-[var(--md-sys-color-secondary)]/30'
                        : 'bg-[var(--md-sys-color-primary)]/15 text-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]/30'
                    }`}
                  >
                    {isGlobal ? 'Meta Global' : sub?.name || 'Frente'}
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-fg font-mono">{g.percent}%</span>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(g.id)}
                        className="p-1 rounded-lg text-fg-muted hover:text-rose-400 cursor-pointer"
                        title="Excluir meta"
                      >
                        <span className="material-symbols-outlined text-[15px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>

                <h4 className="text-sm font-bold text-fg">{g.title}</h4>
                {g.description && <p className="text-xs text-fg-muted">{g.description}</p>}
              </div>

              {/* Barra de Progresso M3 */}
              <div className="space-y-1.5">
                <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden border border-border-subtle">
                  <div
                    style={{
                      width: `${g.percent}%`,
                      backgroundColor: isGlobal
                        ? 'var(--md-sys-color-secondary)'
                        : 'var(--md-sys-color-primary)',
                    }}
                    className="h-full transition-all duration-500 rounded-full"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-fg-muted">
                  <span>
                    {g.completed} de {g.total} tarefas concluídas
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleGoalExpand(g.id)}
                    className="inline-flex items-center gap-1 font-bold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer"
                  >
                    <span>{isExpanded ? 'Ocultar tarefas' : `Ver / Criar tarefas (${g.total})`}</span>
                    <span className="material-symbols-outlined text-[15px]">
                      {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Criação e Checklist de Tarefas Dentro da Meta */}
              {isExpanded && (
                <div className="pt-3 border-t border-border-subtle space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={taskDraftByGoal[g.id] || ''}
                      onChange={(e) =>
                        setTaskDraftByGoal((prev) => ({ ...prev, [g.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTaskToGoal(g);
                        }
                      }}
                      placeholder="+ Nova tarefa nesta meta..."
                      className="flex-1 px-3 py-1.5 rounded-xl bg-surface border border-border-subtle text-xs text-fg focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                    />
                    <button
                      type="button"
                      disabled={creatingGoalId === g.id || !(taskDraftByGoal[g.id] || '').trim()}
                      onClick={() => handleAddTaskToGoal(g)}
                      className="px-3 py-1.5 rounded-xl bg-[var(--md-sys-color-primary)] text-slate-950 text-xs font-black disabled:opacity-40 cursor-pointer"
                    >
                      {creatingGoalId === g.id ? '...' : 'Adicionar'}
                    </button>
                  </div>

                  {g.linkedTasks.length === 0 ? (
                    <p className="text-[11px] text-fg-muted italic">
                      Nenhuma tarefa vinculada ainda. Adicione acima para iniciar o progresso.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {g.linkedTasks.map((t) => {
                        const isDone = t.status === 'Concluído' || t.status === 'done';
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleToggleTaskDone(t)}
                            className="w-full p-2 rounded-xl bg-surface border border-border-subtle hover:border-[var(--md-sys-color-primary)]/40 flex items-center gap-2.5 text-left text-xs transition-colors cursor-pointer"
                          >
                            <span
                              className={`material-symbols-outlined text-[17px] ${
                                isDone ? 'text-emerald-400' : 'text-fg-muted'
                              }`}
                            >
                              {isDone ? 'check_box' : 'check_box_outline_blank'}
                            </span>
                            <span className={`flex-1 truncate ${isDone ? 'line-through text-fg-muted' : 'text-fg font-medium'}`}>
                              {t.nome}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
