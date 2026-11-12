// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/OrganizationGoalsPanel.tsx
'use client';

import React, { useMemo, useState } from 'react';
import type { Task } from '@/types';
import type {
  Organization,
  OrganizationSubteam,
} from '@/types/organizations';

export interface GoalItem {
  id: string;
  title: string;
  description?: string;
  subteam_id?: string | null; // null = Meta Global; preenchido = Meta da Categoria
  targetDate?: string;
}

export interface OrganizationGoalsPanelProps {
  organization: Organization;
  subteams: OrganizationSubteam[];
  tasks: Task[];
  onSelectSubteam?: (subteamId: string | null) => void;
}

export function OrganizationGoalsPanel({
  organization,
  subteams,
  tasks,
  onSelectSubteam,
}: OrganizationGoalsPanelProps) {
  const [selectedAxisFilter, setSelectedAxisFilter] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(false);

  // Metas semente da Organização
  const defaultGoals: GoalItem[] = useMemo(() => {
    const goals: GoalItem[] = [
      {
        id: 'goal-global-1',
        title: 'Lançamento e Acessibilidade do Portal Aurtistic 13.0',
        description: 'Entrega do ambiente unificado, cofre local offline e governança de tarefas.',
        subteam_id: null,
      },
    ];

    for (const sub of subteams) {
      if (sub.name.toLowerCase().includes('program')) {
        goals.push({
          id: `goal-${sub.id}`,
          title: 'Estabilidade do Servidor e Sincronização Segura',
          description: 'Deploy no Fire Stick, sanitização de EXIF e streaming de dados com telemetria.',
          subteam_id: sub.id,
        });
      } else if (sub.name.toLowerCase().includes('comunic')) {
        goals.push({
          id: `goal-${sub.id}`,
          title: 'Divulgação Científica e Comunicação Inclusiva',
          description: 'Padronização de materiais, cobertura fotográfica e recepção de novos membros.',
          subteam_id: sub.id,
        });
      } else if (sub.name.toLowerCase().includes('pesquis')) {
        goals.push({
          id: `goal-${sub.id}`,
          title: 'Pesquisa Neurodivergente & Métricas de Acessibilidade',
          description: 'Documentação de usabilidade cognitiva, redução de barreiras e relatórios acadêmicos.',
          subteam_id: sub.id,
        });
      } else if (sub.name.toLowerCase().includes('admin')) {
        goals.push({
          id: `goal-${sub.id}`,
          title: 'Governança Institucional e Organização dos Ciclos',
          description: 'Gestão de membros, prestação de contas e infraestrutura de trabalho.',
          subteam_id: sub.id,
        });
      }
    }
    return goals;
  }, [subteams]);

  // Calcula o progresso dinâmico de cada meta com base nas tarefas
  const goalsWithProgress = useMemo(() => {
    return defaultGoals.map((goal) => {
      // Tarefas vinculadas à categoria da meta (ou tarefas gerais para metas globais)
      const linkedTasks = tasks.filter((t) => {
        if (goal.subteam_id) {
          return t.subteam_id === goal.subteam_id;
        }
        return true;
      });

      const total = linkedTasks.length;
      const completed = linkedTasks.filter(
        (t) => t.status === 'Concluído' || t.status === 'done'
      ).length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        ...goal,
        total,
        completed,
        percent,
      };
    });
  }, [defaultGoals, tasks]);

  // Filtra as metas de acordo com o filtro selecionado
  const filteredGoals = useMemo(() => {
    if (selectedAxisFilter === 'all') return goalsWithProgress;
    if (selectedAxisFilter === 'global') {
      return goalsWithProgress.filter((g) => !g.subteam_id);
    }
    return goalsWithProgress.filter((g) => g.subteam_id === selectedAxisFilter);
  }, [goalsWithProgress, selectedAxisFilter]);

  return (
    <div className="p-4 md:p-5 bg-surface border border-border-subtle rounded-2xl shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[22px] text-teal-400">
            flag
          </span>
          <div>
            <h3 className="text-sm font-bold text-fg uppercase tracking-wider font-['Bukra']">
              Evolução de Metas e Objetivos • {organization.name}
            </h3>
            <p className="text-xs text-fg-secondary">
              Acompanhamento do progresso das Metas Globais e por Categoria calculado a partir das entregas.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-app text-xs font-bold text-fg-secondary hover:text-white transition-colors cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px]">
            {isExpanded ? 'expand_less' : 'tune'}
          </span>
          <span>{isExpanded ? 'Recolher Detalhes' : 'Visualizar Metas'}</span>
        </button>
      </div>

      {/* Filtros por Eixo/Categoria */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-bold text-fg-muted uppercase mr-1">Filtrar Eixo:</span>
        <button
          type="button"
          onClick={() => {
            setSelectedAxisFilter('all');
            onSelectSubteam?.(null);
          }}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            selectedAxisFilter === 'all'
              ? 'bg-teal-500 text-slate-950 shadow-sm'
              : 'bg-app border border-border-subtle text-fg-secondary hover:text-white'
          }`}
        >
          Todas as Metas
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedAxisFilter('global');
            onSelectSubteam?.(null);
          }}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            selectedAxisFilter === 'global'
              ? 'bg-indigo-500 text-white shadow-sm'
              : 'bg-app border border-border-subtle text-fg-secondary hover:text-white'
          }`}
        >
          🌐 Metas Globais
        </button>
        {subteams.map((sub) => (
          <button
            key={sub.id}
            type="button"
            onClick={() => {
              setSelectedAxisFilter(sub.id);
              onSelectSubteam?.(sub.id);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              selectedAxisFilter === sub.id
                ? 'bg-white/20 text-white border border-white/40'
                : 'bg-app border border-border-subtle text-fg-secondary hover:text-white'
            }`}
          >
            {sub.name}
          </button>
        ))}
      </div>

      {/* Grid de Metas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredGoals.map((g) => {
          const sub = subteams.find((s) => s.id === g.subteam_id);
          const isGlobal = !g.subteam_id;

          return (
            <div
              key={g.id}
              className="p-3.5 rounded-xl bg-app border border-border-subtle flex flex-col justify-between gap-3 hover:border-teal-500/30 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      isGlobal
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-teal-500/15 text-teal-300 border border-teal-500/20'
                    }`}
                  >
                    {isGlobal ? 'Meta Global' : sub?.name || 'Categoria'}
                  </span>
                  <span className="text-xs font-bold text-fg font-mono">
                    {g.percent}%
                  </span>
                </div>
                <h4 className="text-xs font-bold text-fg">{g.title}</h4>
                {g.description && (
                  <p className="text-[11px] text-fg-muted line-clamp-2">{g.description}</p>
                )}
              </div>

              {/* Barra de Progresso da Meta */}
              <div className="space-y-1">
                <div className="w-full h-2 bg-surface rounded-full overflow-hidden border border-border-subtle">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      isGlobal ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-teal-400'
                    }`}
                    style={{ width: `${g.percent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-fg-muted">
                  <span>{g.completed} de {g.total} tarefas concluídas</span>
                  <span>{g.percent === 100 ? 'Meta Cumprida ✓' : `${g.total - g.completed} pendentes`}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

