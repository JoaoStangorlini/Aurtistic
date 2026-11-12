// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/OrganizationAdminModal.tsx
'use client';

import React, { useState, useMemo } from 'react';
import type { Task } from '@/types';
import type {
  Organization,
  OrganizationMember,
  OrganizationSubteam,
} from '@/types/organizations';
import { saveTask } from '@/lib/offlineActions';

export interface OrganizationAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  organization: Organization;
  subteams: OrganizationSubteam[];
  members: OrganizationMember[];
  tasks: Task[];
  currentUserId: string;
  onTasksUpdated: (updatedTasks: Task[]) => void;
  onSubteamsUpdated?: (updatedSubteams: OrganizationSubteam[]) => void;
}

export function OrganizationAdminModal({
  isOpen,
  onClose,
  organization,
  subteams,
  members,
  tasks,
  currentUserId,
  onTasksUpdated,
  onSubteamsUpdated,
}: OrganizationAdminModalProps) {
  const [activeTab, setActiveTab] = useState<'associar' | 'reatribuir' | 'categorias' | 'membros' | 'lote'>('associar');
  const [taskSearch, setTaskSearch] = useState('');
  const [nameMapping, setNameMapping] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Estados para criar nova categoria / subequipe
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#14B8A6');

  // Extrai nomes distintos de responsáveis nas tarefas
  const distinctResponsavelNames = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      const name = (t.responsavel || '').trim();
      if (name) {
        map.set(name, (map.get(name) || 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [tasks]);

  // Tarefas sem responsável
  const unassignedTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        (!t.responsavel || t.responsavel.trim() === '' || t.responsavel === 'Sem Responsável') &&
        (!t.assigned_member_ids || t.assigned_member_ids.length === 0)
    );
  }, [tasks]);

  // Tarefas filtradas para reatribuição
  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return tasks.slice(0, 50);
    const q = taskSearch.toLowerCase();
    return tasks.filter(
      (t) =>
        t.nome.toLowerCase().includes(q) ||
        (t.responsavel && t.responsavel.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [tasks, taskSearch]);

  if (!isOpen) return null;

  // Ação 1: Vincular um nome de texto ao perfil de um membro
  const handleLinkNameToMember = async (textName: string) => {
    const targetMemberId = nameMapping[textName];
    if (!targetMemberId) {
      setStatusMessage(`Selecione um membro para vincular ao nome "${textName}".`);
      return;
    }

    const member = members.find((m) => m.id === targetMemberId);
    if (!member) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const affectedTasks = tasks.filter(
        (t) => (t.responsavel || '').trim().toLowerCase() === textName.toLowerCase()
      );

      const updatedAll = [...tasks];
      for (const t of affectedTasks) {
        const updatedTask: Task = {
          ...t,
          responsavel: member.full_name,
          assigned_member_ids: [member.id],
          organization_id: organization.id,
        };
        await saveTask(updatedTask);
        const idx = updatedAll.findIndex((x) => x.id === t.id);
        if (idx !== -1) {
          updatedAll[idx] = updatedTask;
        }
      }

      onTasksUpdated(updatedAll);
      setStatusMessage(`Sucesso: ${affectedTasks.length} tarefas vinculadas ao perfil de ${member.full_name}.`);
    } catch (err: any) {
      setStatusMessage(`Erro ao vincular: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Ação 2: Reatribuir uma tarefa individual
  const handleReassignTask = async (taskId: string, newMemberId: string | null, newSubteamId?: string | null) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const member = newMemberId ? members.find((m) => m.id === newMemberId) : null;
    const updatedTask: Task = {
      ...task,
      responsavel: member ? member.full_name : 'Sem Responsável',
      assigned_member_ids: member ? [member.id] : [],
      subteam_id: newSubteamId !== undefined ? newSubteamId : task.subteam_id,
      organization_id: organization.id,
    };

    setIsProcessing(true);
    try {
      await saveTask(updatedTask);
      const updatedAll = tasks.map((t) => (t.id === taskId ? updatedTask : t));
      onTasksUpdated(updatedAll);
      setStatusMessage(`Tarefa "${task.nome.slice(0, 30)}..." atualizada com sucesso.`);
    } catch (err: any) {
      setStatusMessage(`Erro ao reatribuir: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Ação 3: Atribuir todas as tarefas sem responsável ao admin atual
  const handleAssignAllUnassignedToMe = async () => {
    const myMember = members.find((m) => m.user_id === currentUserId) || members[0];
    if (!myMember || unassignedTasks.length === 0) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const updatedAll = [...tasks];
      for (const t of unassignedTasks) {
        const updatedTask: Task = {
          ...t,
          assignee_id: currentUserId,
          responsavel: myMember.full_name,
          assigned_member_ids: [myMember.id],
          organization_id: organization.id,
        };
        await saveTask(updatedTask);
        const idx = updatedAll.findIndex((x) => x.id === t.id);
        if (idx !== -1) {
          updatedAll[idx] = updatedTask;
        }
      }

      onTasksUpdated(updatedAll);
      setStatusMessage(`Sucesso: ${unassignedTasks.length} tarefas sem responsável foram atribuídas a ${myMember.full_name}.`);
    } catch (err: any) {
      setStatusMessage(`Erro ao atribuir tarefas: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-surface border border-purple-500/40 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle bg-app/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <span className="material-symbols-outlined text-[24px]">admin_panel_settings</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white uppercase tracking-wider font-['Bukra']">
                Painel Administrativo • {organization.name}
              </h2>
              <p className="text-xs text-fg-secondary">
                Governança, reatribuição de tarefas e vinculação de responsáveis a perfis.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface border border-border-subtle flex items-center justify-center text-fg-muted hover:text-white hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Notificação de Status */}
        {statusMessage && (
          <div className="px-5 py-2.5 bg-purple-500/15 border-b border-purple-500/30 text-purple-200 text-xs flex items-center justify-between">
            <span>{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-purple-300 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Abas de Navegação */}
        <div className="flex items-center gap-1 px-4 sm:px-5 pt-3 border-b border-border-subtle bg-app/20 overflow-x-auto hide-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('associar')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors cursor-pointer ${
              activeTab === 'associar'
                ? 'border-purple-400 text-purple-300 bg-surface'
                : 'border-transparent text-fg-secondary hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">link</span>
            <span>Associar Nomes a Perfis</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reatribuir')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors cursor-pointer ${
              activeTab === 'reatribuir'
                ? 'border-purple-400 text-purple-300 bg-surface'
                : 'border-transparent text-fg-secondary hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
            <span>Reatribuir Tarefas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('categorias')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors cursor-pointer ${
              activeTab === 'categorias'
                ? 'border-purple-400 text-purple-300 bg-surface'
                : 'border-transparent text-fg-secondary hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">category</span>
            <span>Categorias ({subteams.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('lote')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors cursor-pointer ${
              activeTab === 'lote'
                ? 'border-purple-400 text-purple-300 bg-surface'
                : 'border-transparent text-fg-secondary hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">done_all</span>
            <span>Ações em Lote ({unassignedTasks.length} sem responsável)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('membros')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors cursor-pointer ${
              activeTab === 'membros'
                ? 'border-purple-400 text-purple-300 bg-surface'
                : 'border-transparent text-fg-secondary hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">group</span>
            <span>Equipe ({members.length})</span>
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* ABA 1: Associar Nomes de Texto a Perfis Oficiais */}
          {activeTab === 'associar' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-app border border-border-subtle text-xs text-fg-secondary space-y-1">
                <p className="font-bold text-fg">
                  🔗 Vincular Nomes Textuais das Tarefas aos Perfis da Equipe
                </p>
                <p>
                  Quando tarefas são importadas de planilhas ou legados, o responsável é apenas um texto.
                  Aqui você associa esse nome ao perfil oficial de membro do laboratório, unificando a carga e o acompanhamento.
                </p>
              </div>

              <div className="space-y-2">
                {distinctResponsavelNames.map(({ name, count }) => (
                  <div
                    key={name}
                    className="p-3 rounded-xl bg-app border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surface border border-border-subtle flex items-center justify-center font-bold text-fg shrink-0">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-fg block text-sm">{name}</span>
                        <span className="text-[11px] text-fg-muted block">
                          Presente em <strong className="text-purple-300">{count}</strong> {count === 1 ? 'tarefa' : 'tarefas'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={nameMapping[name] || ''}
                        onChange={(e) =>
                          setNameMapping((prev) => ({ ...prev, [name]: e.target.value }))
                        }
                        className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs text-fg focus:border-purple-500 focus:outline-none cursor-pointer min-w-[200px]"
                      >
                        <option value="">-- Selecionar Perfil Oficial --</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.full_name} ({m.org_role === 'admin' ? 'Admin' : 'Membro'})
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={isProcessing || !nameMapping[name]}
                        onClick={() => handleLinkNameToMember(name)}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold text-xs hover:bg-purple-500 transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[15px]">sync</span>
                        <span>Vincular</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA 2: Reatribuição Rápida de Tarefas */}
          {activeTab === 'reatribuir' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-fg-muted">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Buscar tarefa por título ou responsável..."
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-subtle bg-app text-xs text-fg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                {taskSearch && (
                  <button
                    type="button"
                    onClick={() => setTaskSearch('')}
                    className="px-3 py-2 text-xs font-bold text-fg-secondary hover:text-white"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {filteredTasks.map((task) => {
                  const assignedMember = members.find(
                    (m) =>
                      (task.assigned_member_ids && task.assigned_member_ids.includes(m.id)) ||
                      (m.user_id && task.user_id === m.user_id) ||
                      (task.responsavel && task.responsavel.toLowerCase() === m.full_name.toLowerCase())
                  );

                  return (
                    <div
                      key={task.id}
                      className="p-3 rounded-xl bg-app border border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <h4 className="font-bold text-fg line-clamp-1">{task.nome}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-fg-muted flex-wrap">
                          <span>Status: <strong>{task.status}</strong></span>
                          <span>•</span>
                          <span>Resp. Atual: <strong className="text-amber-300">{task.responsavel || 'Sem Responsável'}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        {/* Seletor de Categoria */}
                        <select
                          value={task.subteam_id || ''}
                          onChange={(e) =>
                            handleReassignTask(task.id, assignedMember?.id || null, e.target.value || null)
                          }
                          className="rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-fg focus:border-purple-500 focus:outline-none cursor-pointer"
                        >
                          <option value="">Geral</option>
                          {subteams.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>

                        {/* Seletor de Responsável */}
                        <select
                          value={assignedMember?.id || ''}
                          onChange={(e) =>
                            handleReassignTask(task.id, e.target.value || null)
                          }
                          className="rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-fg focus:border-purple-500 focus:outline-none cursor-pointer min-w-[170px]"
                        >
                          <option value="">Sem Responsável</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ABA: Categorias & Subequipes */}
          {activeTab === 'categorias' && (
            <div className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newCategoryName.trim()) return;
                  const newSub: OrganizationSubteam = {
                    id: crypto.randomUUID(),
                    organization_id: organization.id,
                    name: newCategoryName.trim(),
                    description: newCategoryDesc.trim() || 'Categoria oficial da organização',
                    color: newCategoryColor,
                    created_at: new Date().toISOString(),
                  };
                  const updated = [...subteams, newSub];
                  onSubteamsUpdated?.(updated);
                  setNewCategoryName('');
                  setNewCategoryDesc('');
                  setStatusMessage(`Categoria "${newSub.name}" criada com sucesso!`);
                }}
                className="p-4 rounded-xl bg-app border border-purple-500/30 space-y-3"
              >
                <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  <span>Criar Nova Categoria / Subequipe</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                      Nome da Categoria *
                    </label>
                    <input
                      type="text"
                      required
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex: Robótica, Audiovisual, Eventos..."
                      className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none focus:border-purple-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                      Descrição / Escopo
                    </label>
                    <input
                      type="text"
                      value={newCategoryDesc}
                      onChange={(e) => setNewCategoryDesc(e.target.value)}
                      placeholder="Ex: Produção de vídeos e divulgação..."
                      className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-fg focus:outline-none focus:border-purple-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-fg-muted uppercase block mb-1">
                      Cor de Identificação
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newCategoryColor}
                        onChange={(e) => setNewCategoryColor(e.target.value)}
                        className="h-8 w-10 rounded cursor-pointer bg-surface border border-border-subtle p-0.5"
                      />
                      <button
                        type="submit"
                        className="flex-1 py-1.5 px-3 rounded-lg bg-purple-500 text-slate-950 font-bold text-xs hover:bg-purple-400 transition-colors cursor-pointer"
                      >
                        + Criar Categoria
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
                  Categorias Ativas ({subteams.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {subteams.map((sub) => {
                    const countTasks = tasks.filter(
                      (t) =>
                        t.subteam_id === sub.id ||
                        (t.categoria || '').toLowerCase() === sub.name.toLowerCase()
                    ).length;

                    return (
                      <div
                        key={sub.id}
                        className="p-3 rounded-xl bg-app border border-border-subtle flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0"
                            style={{ backgroundColor: sub.color || '#14B8A6' }}
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-fg block truncate">{sub.name}</span>
                            <span className="text-[10px] text-fg-muted block truncate">
                              {sub.description || 'Sem descrição'} • {countTasks} tarefas
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = subteams.filter((s) => s.id !== sub.id);
                            onSubteamsUpdated?.(updated);
                            setStatusMessage(`Categoria "${sub.name}" removida.`);
                          }}
                          className="p-1.5 rounded-lg text-fg-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                          title="Remover categoria"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: Ações em Lote */}
          {activeTab === 'lote' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[18px]">assignment_late</span>
                  <span>Tarefas Sem Responsável ({unassignedTasks.length})</span>
                </div>
                <p className="text-xs text-amber-200/90">
                  {unassignedTasks.length > 0
                    ? `Existem ${unassignedTasks.length} tarefas sem nenhum responsável atribuído no momento.`
                    : 'Não há tarefas sem responsável no momento! Toda a equipe está alinhada.'}
                </p>
                {unassignedTasks.length > 0 && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleAssignAllUnassignedToMe}
                    className="mt-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-colors cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px]">done_all</span>
                    <span>Atribuir Todas as {unassignedTasks.length} Tarefas para Mim</span>
                  </button>
                )}
              </div>

              {unassignedTasks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
                    Lista de Tarefas Sem Responsável
                  </h4>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {unassignedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-2.5 rounded-lg bg-app border border-border-subtle flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-semibold text-fg truncate">{task.nome}</span>
                        <button
                          type="button"
                          onClick={() => handleReassignTask(task.id, members.find((m) => m.user_id === currentUserId)?.id || members[0]?.id)}
                          className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[11px] hover:bg-amber-500 hover:text-slate-950 transition-colors shrink-0 cursor-pointer"
                        >
                          Puxar para Mim
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA 4: Membros e Governança */}
          {activeTab === 'membros' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-app border border-border-subtle space-y-1">
                  <span className="text-[10px] font-bold text-fg-muted uppercase">Total de Membros</span>
                  <span className="text-2xl font-black text-fg block">{members.length}</span>
                </div>
                <div className="p-3 rounded-xl bg-app border border-border-subtle space-y-1">
                  <span className="text-[10px] font-bold text-fg-muted uppercase">Administradores</span>
                  <span className="text-2xl font-black text-teal-400 block">
                    {members.filter((m) => m.org_role === 'admin').length}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-app border border-border-subtle space-y-1">
                  <span className="text-[10px] font-bold text-fg-muted uppercase">Categorias Oficiais</span>
                  <span className="text-2xl font-black text-indigo-400 block">{subteams.length}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
                  Membros Registrados ({members.length})
                </h4>
                <div className="space-y-1.5">
                  {members.map((m) => {
                    const sub = subteams.find((s) => s.id === m.subteam_id);
                    return (
                      <div
                        key={m.id}
                        className="p-3 rounded-xl bg-app border border-border-subtle flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-surface border border-border-subtle flex items-center justify-center font-bold text-fg shrink-0">
                            {m.full_name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-fg block truncate">{m.full_name}</span>
                            <span className="text-[10px] text-fg-muted truncate block">
                              {m.email || 'Sem e-mail'} • {m.org_role === 'admin' ? 'Administrador ⭐' : 'Membro'}
                            </span>
                          </div>
                        </div>

                        <span className="text-[10px] px-2 py-0.5 rounded bg-surface border border-border-subtle text-fg-secondary shrink-0 font-bold">
                          {sub?.name || 'Geral'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

