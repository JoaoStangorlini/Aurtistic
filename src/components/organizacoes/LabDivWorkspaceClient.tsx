// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/LabDivWorkspaceClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Task, TaskColumn, AgendaEvent } from '@/types';
import type {
  Organization,
  OrganizationMember,
  OrganizationSubteam,
  OrganizationMeeting,
  CognitiveCapacity,
} from '@/types/organizations';
import { TeamProgressPanel } from './TeamProgressPanel';
import { MemberCapacityQuickSelector } from './MemberCapacityQuickSelector';
import { OrganizationPlaybooksModal } from './OrganizationPlaybooksModal';
import { When2MeetSchedulerGrid } from './When2MeetSchedulerGrid';
import { LiveMeetingSplitWorkspace } from './LiveMeetingSplitWorkspace';
import { OrganizationGoalsPanel } from './OrganizationGoalsPanel';
import { OrganizationRequestsPanel } from './OrganizationRequestsPanel';
import { OrganizationScheduleAttendancePanel } from './OrganizationScheduleAttendancePanel';
import { OrganizationAdminModal } from './OrganizationAdminModal';
import { TasksView } from '@/components/dashboard/TasksView';
import {
  createOrganizationMeetingAction,
  getOrganizationDetailsAction,
  getOrganizationMeetingsAction,
} from '@/app/(dashboard)/organizacoes/actions';
import { saveTask } from '@/app/(dashboard)/actions';
import { JoinOrganizationModal } from './JoinOrganizationModal';
import { CreateOrganizationModal } from './CreateOrganizationModal';

export interface LabDivWorkspaceClientProps {
  organization: Organization;
  subteams: OrganizationSubteam[];
  members: OrganizationMember[];
  initialTasks: Task[];
  initialMeetings: OrganizationMeeting[];
  columns: TaskColumn[];
  currentUserId: string;
  myMember?: OrganizationMember | null;
  quickFilters?: string[];
  quickSorts?: string[];
  advancedSettings?: Record<string, unknown>;
  userEvents?: AgendaEvent[];
  isDbMigrationPending?: boolean;
  userOrganizations?: Organization[];
}

export function LabDivWorkspaceClient({
  organization: initialOrg,
  subteams: initialSubteams,
  members: initialMembers,
  initialTasks,
  initialMeetings,
  columns,
  currentUserId,
  myMember,
  quickFilters = ['responsavel', 'dimensao'],
  quickSorts = ['status', 'prazo', 'prioridade', 'manual'],
  advancedSettings = {},
  userEvents = [],
  isDbMigrationPending = false,
  userOrganizations = [],
}: LabDivWorkspaceClientProps) {
  const [currentOrg, setCurrentOrg] = useState<Organization>(initialOrg);
  const [subteams, setSubteams] = useState<OrganizationSubteam[]>(initialSubteams);
  const [members, setMembers] = useState<OrganizationMember[]>(initialMembers);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [meetings, setMeetings] = useState<OrganizationMeeting[]>(initialMeetings);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const organization = currentOrg;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`aurtistic_subteams_${organization.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSubteams(parsed);
        }
      }
    } catch {}
  }, [organization.id]);

  const handleUpdateSubteams = (updated: OrganizationSubteam[]) => {
    setSubteams(updated);
    try {
      localStorage.setItem(`aurtistic_subteams_${organization.id}`, JSON.stringify(updated));
    } catch {}
  };

  const handleSwitchOrg = async (orgId: string) => {
    const selected = userOrganizations.find((o) => o.id === orgId);
    if (selected) {
      setCurrentOrg(selected);
      const res = await getOrganizationDetailsAction(orgId);
      if (res.ok && res.organization) {
        if (res.organization.subteams) setSubteams(res.organization.subteams);
        if (res.organization.members) setMembers(res.organization.members);
      }
      const mRes = await getOrganizationMeetingsAction(orgId);
      if (mRes.ok && mRes.meetings) {
        setMeetings(mRes.meetings);
      }
    }
  };
  const [isPlaybooksOpen, setIsPlaybooksOpen] = useState(false);
  const [activeMeetingForLive, setActiveMeetingForLive] = useState<OrganizationMeeting | null>(null);
  const [selectedMeetingForWhen2Meet, setSelectedMeetingForWhen2Meet] = useState<OrganizationMeeting | null>(null);
  const [showMeetingsSection, setShowMeetingsSection] = useState(false);
  const [showGoalsSection, setShowGoalsSection] = useState(false);
  const [showScheduleSection, setShowScheduleSection] = useState(false);
  const [showRequestsSection, setShowRequestsSection] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string | null>(null);

  const isOrgAdmin =
    myMember?.org_role === 'admin' ||
    currentUserId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetingTitle.trim()) return;
    setIsCreatingMeeting(true);
    try {
      const res = await createOrganizationMeetingAction({
        organizationId: organization.id,
        title: newMeetingTitle.trim(),
        durationMinutes: 60,
      });
      if (res.ok && res.meeting) {
        setMeetings([res.meeting as OrganizationMeeting, ...meetings]);
        setNewMeetingTitle('');
      }
    } finally {
      setIsCreatingMeeting(false);
    }
  };

  const handleClaimTask = async (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const currentMember = members.find((m) => m.user_id === currentUserId) || myMember;
    const updated = {
      ...target,
      assignee_id: currentUserId,
      assigned_member_ids: currentMember ? [currentMember.id] : [],
      responsavel: currentMember ? currentMember.full_name : target.responsavel,
    };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    try {
      await saveTask(updated);
    } catch {}
  };

  const handleAssignAllToMe = async () => {
    if (!myMember) return;
    const unassigned = tasks.filter(
      (t) =>
        (!t.assigned_member_ids || t.assigned_member_ids.length === 0) &&
        (!t.responsavel || t.responsavel.trim() === '' || t.responsavel === 'Sem Responsável')
    );
    if (unassigned.length === 0) return;

    for (const t of unassigned) {
      const updated: Task = {
        ...t,
        assignee_id: currentUserId,
        responsavel: myMember.full_name || 'João Stangorlini',
        assigned_member_ids: [myMember.id],
        organization_id: organization.id,
      };
      await saveTask(updated);
    }

    setTasks((prev) =>
      prev.map((t) => {
        const isUn =
          (!t.assigned_member_ids || t.assigned_member_ids.length === 0) &&
          (!t.responsavel || t.responsavel.trim() === '' || t.responsavel === 'Sem Responsável');
        if (isUn) {
          return {
            ...t,
            assignee_id: currentUserId,
            responsavel: myMember.full_name || 'João Stangorlini',
            assigned_member_ids: [myMember.id],
            organization_id: organization.id,
          };
        }
        return t;
      })
    );
  };

  const handleRelieveTask = async (taskId: string, targetMemberName: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const currentMember = members.find((m) => m.user_id === currentUserId) || myMember;
    const helperName = currentMember ? currentMember.full_name : 'colega';
    const updated = {
      ...target,
      assignee_id: currentUserId,
      assigned_member_ids: currentMember ? [currentMember.id] : [],
      responsavel: helperName,
    };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    try {
      await saveTask(updated);
    } catch {}
  };

  return (
    <div className="min-h-full flex flex-col p-4 md:p-8 bg-app space-y-6 text-fg">
      {isDbMigrationPending && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs shadow-md">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-amber-400 text-[24px]">database</span>
            <div>
              <p className="font-bold text-amber-300">Migração de Banco de Dados Pendente no Supabase</p>
              <p className="text-amber-200/80 mt-0.5">
                Exibindo tarefas legadas vinculadas ao LabDiv (dimensão <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300">HUB</code> / <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300">LabDiv</code>). Para habilitar multi-organizações completas, execute o script <code className="bg-black/40 px-1.5 py-0.5 rounded font-mono text-amber-300">06_multi_organizations_v4_complete.sql</code> no SQL Editor do Supabase.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Alternador Macro Unificado: Organizações & Arquivos */}
      <div data-tour="org-view-mode" className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border-subtle rounded-2xl px-4 py-2.5 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Aba Gestão:
          </span>
          <div className="flex items-center gap-1 bg-app p-1 rounded-xl border border-border-subtle">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-teal-500 text-slate-950 shadow-sm">
              <span className="material-symbols-outlined text-[16px]">domain</span>
              <span>Equipe & Projetos</span>
            </div>
            <Link
              href="/servidor"
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-fg-secondary hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">folder_special</span>
              <span>Cofre de Arquivos</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Topo: Identidade da Organização e Ações Rápidas */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface border border-border-subtle rounded-2xl p-5 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 border border-teal-500/30 overflow-hidden p-2">
            <img src="/labdiv-logo.png" alt="LabDiv" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-white">{organization.name}</h1>
              {userOrganizations.length > 1 ? (
                <select
                  value={currentOrg.id}
                  onChange={(e) => handleSwitchOrg(e.target.value)}
                  className="rounded-xl border border-teal-500/30 bg-app px-3 py-1.5 text-xs font-bold text-teal-300 focus:border-teal-500 focus:outline-none cursor-pointer"
                >
                  {userOrganizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      🏛️ {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-full bg-teal-500/10 border border-teal-500/30 px-2.5 py-0.5 text-xs font-bold text-teal-400">
                  Workspace Oficial
                </span>
              )}
            </div>
            <p className="text-xs text-fg-muted mt-1">
              {organization.description || 'Laboratório de Divulgação Científica • IFUSP'}
            </p>
          </div>
        </div>

        {/* Bateria Cognitiva Pessoal e Botões do Topo */}
        <div className="flex flex-wrap items-center gap-3">
          <MemberCapacityQuickSelector
            organizationId={organization.id}
            initialCapacity={myMember?.cognitive_capacity || 'normal'}
            initialNote={myMember?.capacity_note || ''}
          />

          <button
            type="button"
            onClick={() => setIsPlaybooksOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">menu_book</span>
            Roteiros
          </button>

          <button
            type="button"
            onClick={() => setShowMeetingsSection((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
              showMeetingsSection
                ? 'border-teal-500 bg-teal-500/20 text-teal-200 shadow-sm'
                : 'border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
            Reuniões ({meetings.length})
            <span className="material-symbols-outlined text-[16px]">
              {showMeetingsSection ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowGoalsSection((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
              showGoalsSection
                ? 'border-teal-500 bg-teal-500/20 text-teal-200 shadow-sm'
                : 'border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">flag</span>
            Metas & Objetivos
            <span className="material-symbols-outlined text-[16px]">
              {showGoalsSection ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowScheduleSection((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
              showScheduleSection
                ? 'border-teal-500 bg-teal-500/20 text-teal-200 shadow-sm'
                : 'border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">calendar_clock</span>
            Escalas & Presenças (QR)
            <span className="material-symbols-outlined text-[16px]">
              {showScheduleSection ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowRequestsSection((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
              showRequestsSection
                ? 'border-amber-500 bg-amber-500/20 text-amber-200 shadow-sm'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">forward_to_inbox</span>
            Pedidos & Sugestões
            <span className="material-symbols-outlined text-[16px]">
              {showRequestsSection ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {isOrgAdmin && (
            <button
              type="button"
              onClick={() => setIsAdminModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3.5 py-2 text-xs font-bold text-purple-300 hover:bg-purple-500/20 transition-colors cursor-pointer shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">shield_person</span>
              Painel Administrativo
            </button>
          )}
        </div>
      </div>

      {/* Painéis Expansíveis dos Botões do Topo (Abertura Imediatamente Abaixo da Barra de Ações) */}
      {showGoalsSection && (
        <div className="animate-in fade-in duration-200">
          <OrganizationGoalsPanel
            organization={organization}
            subteams={subteams}
            tasks={tasks}
          />
        </div>
      )}

      {showScheduleSection && (
        <div className="animate-in fade-in duration-200">
          <OrganizationScheduleAttendancePanel
            organization={organization}
            subteams={subteams}
            members={members}
            currentUserId={currentUserId}
            currentUserName={myMember?.full_name || 'Membro do Laboratório'}
            isAdmin={isOrgAdmin}
          />
        </div>
      )}

      {showRequestsSection && (
        <div className="animate-in fade-in duration-200">
          <OrganizationRequestsPanel
            organization={organization}
            subteams={subteams}
            currentUserId={currentUserId}
            currentUserName={myMember?.full_name || 'Membro do Laboratório'}
            isAdmin={isOrgAdmin}
          />
        </div>
      )}

      {/* Seção Expansível de Reuniões e When2Meet */}
      {showMeetingsSection && (
        <div data-tour="org-meetings-section" className="bg-surface border border-border-subtle rounded-2xl p-5 shadow-lg space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-teal-400">calendar_month</span>
              <h2 className="text-base font-bold text-white">Reuniões da Equipe & When2Meet</h2>
            </div>

            {/* Criar Nova Reunião */}
            <form onSubmit={handleCreateMeeting} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Título da reunião..."
                value={newMeetingTitle}
                onChange={(e) => setNewMeetingTitle(e.target.value)}
                className="rounded-lg border border-border-subtle bg-app text-fg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isCreatingMeeting || !newMeetingTitle.trim()}
                className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-500 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Agendar
              </button>
            </form>
          </div>

          {/* Lista de Reuniões */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {meetings.map((m) => (
              <div
                key={m.id}
                className="flex flex-col justify-between rounded-xl border border-border-subtle bg-app text-fg p-4 transition-colors hover:border-border-strong"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-bold text-white truncate">{m.title}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
                      {m.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    {m.scheduled_at
                      ? new Date(m.scheduled_at).toLocaleString('pt-BR')
                      : 'Data a definir'}
                    {' • '}
                    {m.duration_minutes || 60} min
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setActiveMeetingForLive(m)}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-teal-600/20 border border-teal-500/30 py-1.5 text-xs font-semibold text-teal-300 hover:bg-teal-600/30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">mic</span>
                    Abrir Ao Vivo
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMeetingForWhen2Meet(
                        selectedMeetingForWhen2Meet?.id === m.id ? null : m
                      )
                    }
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      selectedMeetingForWhen2Meet?.id === m.id
                        ? 'bg-[#FFCC00]/20 border-[#FFCC00] text-[#FFCC00]'
                        : 'border-border-subtle bg-surface text-fg-muted hover:text-fg hover:bg-surface-hover'
                    }`}
                  >
                    Horários
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Grid When2Meet Expandido para a Reunião Selecionada */}
          {selectedMeetingForWhen2Meet && (
            <div className="pt-4 border-t border-border-subtle">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold text-teal-400">
                  Definindo melhor horário para: {selectedMeetingForWhen2Meet.title}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMeetingForWhen2Meet(null)}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Fechar Grade
                </button>
              </div>
              <When2MeetSchedulerGrid
                meetingId={selectedMeetingForWhen2Meet.id}
                currentUserId={currentUserId}
                userEvents={userEvents}
              />
            </div>
          )}
        </div>
      )}

      {/* Painel de Progresso da Equipe e Subequipes */}
      <TeamProgressPanel
        organization={organization}
        subteams={subteams}
        members={members}
        tasks={tasks}
        currentUserId={currentUserId}
        onSelectMemberFilter={setSelectedMemberFilter}
        selectedMemberId={selectedMemberFilter}
        onClaimTask={handleClaimTask}
        onRelieveTask={handleRelieveTask}
        onAssignAllToMe={handleAssignAllToMe}
      />

      {/* Modal Administrativo de Governança, Atribuições e Perfis */}
      <OrganizationAdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        organization={organization}
        subteams={subteams}
        members={members}
        tasks={tasks}
        currentUserId={currentUserId}
        onTasksUpdated={(updatedTasks) => setTasks(updatedTasks)}
        onSubteamsUpdated={handleUpdateSubteams}
      />

      {/* Lista de Tarefas com Todas as Funcionalidades de TasksView */}
      <div className="pt-2">
        <TasksView
          initialTasks={tasks}
          initialColumns={columns}
          userId={currentUserId}
          initialQuickFilters={quickFilters}
          initialQuickSorts={quickSorts}
          advancedSettings={advancedSettings}
          showUnassignedBanner={true}
        />
      </div>

      {/* Modal de Playbooks da Organização */}
      <OrganizationPlaybooksModal
        isOpen={isPlaybooksOpen}
        onClose={() => setIsPlaybooksOpen(false)}
        organizationId={organization.id}
        subteams={subteams}
      />

      {/* Workspace de Reunião Ao Vivo (Tela Dividida + Transcrição Híbrida) */}
      {activeMeetingForLive && (
        <LiveMeetingSplitWorkspace
          isOpen={Boolean(activeMeetingForLive)}
          onClose={() => setActiveMeetingForLive(null)}
          meeting={activeMeetingForLive}
          isOrgAdmin={isOrgAdmin}
          onMeetingFinished={() => {
            setActiveMeetingForLive(null);
          }}
        />
      )}

      {/* Modais de Entrar / Criar Organização */}
      <JoinOrganizationModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onJoinedSuccess={async (orgId) => {
          handleSwitchOrg(orgId);
        }}
      />

      <CreateOrganizationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreatedSuccess={async (orgId) => {
          handleSwitchOrg(orgId);
        }}
      />
    </div>
  );
}
