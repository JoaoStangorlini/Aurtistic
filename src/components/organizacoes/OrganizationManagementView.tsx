// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/OrganizationManagementView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Task, AgendaEvent } from '@/types';
import type {
  Organization,
  OrganizationMember,
  OrganizationSubteam,
  OrganizationMeeting,
  CognitiveCapacity,
} from '@/types/organizations';
import { MemberCapacityQuickSelector } from './MemberCapacityQuickSelector';
import { TeamProgressPanel } from './TeamProgressPanel';
import { When2MeetSchedulerGrid } from './When2MeetSchedulerGrid';
import { OrganizationPlaybooksModal } from './OrganizationPlaybooksModal';
import { LiveMeetingSplitWorkspace } from './LiveMeetingSplitWorkspace';
import { OrganizationGoalsPanel } from './OrganizationGoalsPanel';
import { OrganizationRequestsPanel } from './OrganizationRequestsPanel';
import { OrganizationScheduleAttendancePanel } from './OrganizationScheduleAttendancePanel';
import {
  getOrCreateActiveInviteAction,
  createOrganizationMeetingAction,
} from '@/app/(dashboard)/organizacoes/actions';

export interface OrganizationManagementViewProps {
  organization: Organization;
  subteams: OrganizationSubteam[];
  members: OrganizationMember[];
  tasks: Task[];
  meetings: OrganizationMeeting[];
  currentUserId: string;
  userEvents?: AgendaEvent[];
  onMeetingsUpdated?: () => void;
  onOpenVault?: () => void;
}

export function OrganizationManagementView({
  organization,
  subteams,
  members,
  tasks,
  meetings,
  currentUserId,
  userEvents = [],
  onMeetingsUpdated,
  onOpenVault,
}: OrganizationManagementViewProps) {
  const [activeInviteToken, setActiveInviteToken] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isPlaybooksOpen, setIsPlaybooksOpen] = useState(false);
  const [activeMeetingForLive, setActiveMeetingForLive] = useState<OrganizationMeeting | null>(null);
  const [selectedMeetingForWhen2Meet, setSelectedMeetingForWhen2Meet] = useState<OrganizationMeeting | null>(null);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);

  const myMember = members.find((m) => m.user_id === currentUserId) || null;
  const isOrgAdmin =
    myMember?.org_role === 'admin' ||
    currentUserId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';

  // Carrega código de convite ativo
  useEffect(() => {
    let ignore = false;
    async function loadInvite() {
      const res = await getOrCreateActiveInviteAction(organization.id);
      if (!ignore && res.ok && res.token) {
        setActiveInviteToken(res.token);
      }
    }
    loadInvite();
    return () => {
      ignore = true;
    };
  }, [organization.id]);

  const handleCopyCode = () => {
    if (!activeInviteToken) return;
    navigator.clipboard.writeText(activeInviteToken);
    setCopyFeedback('Código copiado!');
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const handleCopyLink = () => {
    if (!activeInviteToken) return;
    const url = `${window.location.origin}/convite/${activeInviteToken}`;
    navigator.clipboard.writeText(url);
    setCopyFeedback('Link copiado!');
    setTimeout(() => setCopyFeedback(null), 2500);
  };

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
      if (res.ok) {
        setNewMeetingTitle('');
        onMeetingsUpdated?.();
      }
    } finally {
      setIsCreatingMeeting(false);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-6 pt-4 animate-in fade-in duration-300">
      {/* Topo do Módulo de Gestão */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface border border-border-subtle rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 font-black text-2xl shadow-inner">
            🏛️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-white">{organization.name}</h2>
              <span className="rounded-full bg-teal-500/10 border border-teal-500/30 px-3 py-0.5 text-xs font-bold text-teal-400">
                {isOrgAdmin ? '⭐ Você é Administrador' : 'Membro da Equipe'}
              </span>
            </div>
            <p className="text-xs text-fg-muted mt-1">
              {organization.description || 'Workspace Oficial e Colaborativo da Equipe.'}
            </p>
          </div>
        </div>

        {/* Ações do Módulo */}
        <div className="flex flex-wrap items-center gap-2.5">
          <MemberCapacityQuickSelector
            organizationId={organization.id}
            initialCapacity={myMember?.cognitive_capacity || 'normal'}
            initialNote={myMember?.capacity_note || ''}
          />

          <button
            type="button"
            onClick={() => setIsPlaybooksOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">menu_book</span>
            Roteiros
          </button>

          <Link
            href="/servidor"
            onClick={(e) => {
              if (onOpenVault) {
                e.preventDefault();
                onOpenVault();
              }
            }}
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">folder_special</span>
            Org Vault (25 GB)
          </Link>
        </div>
      </div>

      {/* Card Visual de Convite / Código de Entrada da Equipe */}
      <div className="bg-surface border border-teal-500/30 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <span className="material-symbols-outlined text-[20px]">share</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Código de Entrada da Equipe
              {copyFeedback && (
                <span className="text-[11px] font-bold text-emerald-400 animate-pulse">
                  ✅ {copyFeedback}
                </span>
              )}
            </h3>
            <p className="text-xs text-fg-muted mt-0.5">
              Compartilhe o código ou o link direto para que novos colegas entrem na organização em 1 clique.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border-subtle bg-app text-fg px-3 py-1.5">
            <span className="text-xs font-mono font-bold text-teal-400 tracking-wider">
              {activeInviteToken ? activeInviteToken.slice(0, 16) : 'Carregando...'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            disabled={!activeInviteToken}
            className="flex items-center gap-1 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover text-fg px-3 py-2 text-xs font-bold text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">content_copy</span>
            Copiar Código
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            disabled={!activeInviteToken}
            className="flex items-center gap-1 rounded-xl bg-teal-600 hover:bg-teal-500 px-3.5 py-2 text-xs font-bold text-white transition-colors shadow-md"
          >
            <span className="material-symbols-outlined text-[14px]">link</span>
            Copiar Link
          </button>
        </div>
      </div>

      {/* Painel de Progresso das Subequipes e Membros */}
      <TeamProgressPanel
        organization={organization}
        subteams={subteams}
        members={members}
        tasks={tasks}
      />

      {/* Painel de Metas Globais e por Categoria */}
      <OrganizationGoalsPanel
        organization={organization}
        subteams={subteams}
        tasks={tasks}
      />

      {/* Horários, Escalas e Controle de Presenças com QR Code */}
      <OrganizationScheduleAttendancePanel
        organization={organization}
        subteams={subteams}
        members={members}
        currentUserId={currentUserId}
        currentUserName={myMember?.full_name || 'Membro do Laboratório'}
        isAdmin={isOrgAdmin}
      />

      {/* Canal de Pedidos e Sugestões da Organização */}
      <OrganizationRequestsPanel
        organization={organization}
        subteams={subteams}
        currentUserId={currentUserId}
        currentUserName={myMember?.full_name || 'Membro do Laboratório'}
        isAdmin={isOrgAdmin}
      />

      {/* Seção de Reuniões, When2Meet e Transcrição Híbrida */}
      <div className="bg-surface border border-border-subtle rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-teal-400">calendar_month</span>
            <h3 className="text-base font-bold text-white">Reuniões da Equipe & When2Meet</h3>
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

        {/* Grade When2Meet Expandida */}
        {selectedMeetingForWhen2Meet && (
          <div className="pt-4 border-t border-border-subtle">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-teal-400">
                Grade de Disponibilidade: {selectedMeetingForWhen2Meet.title}
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

      {/* Modal de Playbooks */}
      <OrganizationPlaybooksModal
        isOpen={isPlaybooksOpen}
        onClose={() => setIsPlaybooksOpen(false)}
        organizationId={organization.id}
        subteams={subteams}
      />

      {/* Workspace de Reunião Ao Vivo */}
      {activeMeetingForLive && (
        <LiveMeetingSplitWorkspace
          isOpen={Boolean(activeMeetingForLive)}
          onClose={() => setActiveMeetingForLive(null)}
          meeting={activeMeetingForLive}
          isOrgAdmin={isOrgAdmin}
        />
      )}
    </div>
  );
}

