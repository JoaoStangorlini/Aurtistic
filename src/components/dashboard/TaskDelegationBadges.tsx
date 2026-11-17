// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import type { Task } from '@/types';

interface TaskDelegationBadgesProps {
  task: Task;
  allTasks: Task[];
  subteams?: any[];
  members?: any[];
  completionStatuses?: string[];
  onToggleSubtask?: (subtaskId: string, completed: boolean) => void;
}

/**
 * Badges de Equipes e Indivíduos + contador X/Y concluídas (tarefa-mãe)
 * e botão rápido de conclusão (subtarefa do checklist).
 */
export function TaskDelegationBadges({
  task,
  allTasks,
  subteams = [],
  members = [],
  completionStatuses = ['completa', 'concluída', 'descartada'],
  onToggleSubtask,
}: TaskDelegationBadgesProps) {
  const done = completionStatuses.map((s) => s.toLowerCase());
  const isDone = (t: Task) => done.includes((t.status || '').toLowerCase());

  const subteamIds = task.assigned_subteam_ids?.length
    ? task.assigned_subteam_ids
    : (task.subteam_id ? [task.subteam_id] : []);
  const memberIds = task.assigned_member_ids || [];

  const teamBadges = subteamIds
    .map((id) => subteams.find((s) => s.id === id))
    .filter(Boolean) as any[];
  const memberBadges = memberIds
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean) as any[];

  const children = task.parent_id
    ? []
    : allTasks
        .filter((t) => t.parent_id === task.id)
        .sort((a, b) => (a.ordem_manual || 0) - (b.ordem_manual || 0));
  const completedChildren = children.filter(isDone).length;

  if (teamBadges.length === 0 && memberBadges.length === 0 && children.length === 0 && !task.parent_id) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {children.length > 0 && (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
            completedChildren === children.length
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-surface border-border-subtle text-fg-secondary'
          }`}
          title="Subtarefas concluídas"
        >
          ✔ {completedChildren}/{children.length} concluídas
        </span>
      )}
      {teamBadges.map((t) => (
        <span
          key={t.id}
          className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-500/40 bg-amber-500/10 text-amber-200"
          style={t.color ? { borderColor: `${t.color}66`, color: t.color } : undefined}
        >
          👥 {t.name}
        </span>
      ))}
      {memberBadges.map((m) => (
        <span
          key={m.id}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-teal-500/40 bg-teal-500/10 text-teal-200"
        >
          👤 {m.full_name}
        </span>
      ))}
      {task.parent_id && onToggleSubtask && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSubtask(task.id, !isDone(task));
          }}
          className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-border-subtle text-fg-secondary hover:text-white cursor-pointer"
          title="Alternar conclusão da subtarefa"
        >
          {isDone(task) ? '↺ Reabrir' : '✓ Concluir'}
        </button>
      )}
    </div>
  );
}

