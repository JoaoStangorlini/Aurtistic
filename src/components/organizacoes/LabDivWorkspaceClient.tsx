// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/components/organizacoes/LabDivWorkspaceClient.tsx
'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
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
import { OrganizationMaterialSelector } from './OrganizationMaterialSelector';
import { OrgBenchStockPanel } from './OrgBastidoresModules';
import { OrganizationPostStudio } from './studio/OrganizationPostStudio';
import { TasksView } from '@/components/dashboard/TasksView';
import {
  createOrganizationMeetingAction,
  getOrganizationDetailsAction,
  getOrganizationMeetingsAction,
} from '@/app/(dashboard)/organizacoes/actions';
import { saveTask } from '@/app/(dashboard)/actions';
import { JoinOrganizationModal } from './JoinOrganizationModal';
import { CreateOrganizationModal } from './CreateOrganizationModal';
import { OrganizationBrandProvider, useOrganizationBrand } from './OrganizationBrandProvider';
import { useTheme } from '@/components/theme/ThemeProvider';

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
  isEmbed?: boolean;
  ticket?: string;
  initialView?: 'organizacoes' | 'studio';
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
  isEmbed = false,
  ticket,
  initialView = 'organizacoes',
}: LabDivWorkspaceClientProps) {
  const router = useRouter();
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
      setSelectedMemberFilter(null);
      const [res, mRes] = await Promise.all([
        getOrganizationDetailsAction(orgId),
        getOrganizationMeetingsAction(orgId),
      ]);
      if (res.ok) {
        if (Array.isArray((res as any).subteams)) setSubteams((res as any).subteams);
        if (Array.isArray((res as any).members)) setMembers((res as any).members);
        if (Array.isArray((res as any).tasks)) setTasks((res as any).tasks);
      }
      if (mRes.ok && mRes.meetings) {
        setMeetings(mRes.meetings);
      }
      if (!isEmbed && selected.slug) {
        const viewQs = activeMacroView === 'studio' ? '&view=studio' : '';
        router.push(`/labdiv?org=${encodeURIComponent(selected.slug)}${viewQs}`);
      }
    }
  };
  const { tokens } = useOrganizationBrand();
  const { setIsStudioActive } = useTheme();
  const [studioStage, setStudioStage] = useState<'launcher' | 'editor' | 'publish'>('launcher');
  const searchParams = useSearchParams();
  const queryView = searchParams?.get('view');
  const userSwitchedRef = React.useRef(false);
  const [activeMacroView, setActiveMacroView] = useState<'organizacoes' | 'studio'>(
    queryView === 'studio' ? 'studio' : initialView
  );
  const [studioVisited, setStudioVisited] = useState(
    queryView === 'studio' || initialView === 'studio'
  );
  const isStudioEditorFull = activeMacroView === 'studio' && studioStage === 'editor';

  useEffect(() => {
    setIsStudioActive(isStudioEditorFull);
    return () => setIsStudioActive(false);
  }, [isStudioEditorFull, setIsStudioActive]);

  // Sincronização reativa da aba Studio vs Equipe quando initialView ou query param ?view mudar
  useEffect(() => {
    if (userSwitchedRef.current) return;
    const target = queryView === 'studio' ? 'studio' : (initialView || 'organizacoes');
    setActiveMacroView(target);
    if (target === 'studio') {
      setStudioVisited(true);
    }
  }, [initialView, queryView]);
  const [showInlineVault, setShowInlineVault] = useState(true);
  const [isPlaybooksOpen, setIsPlaybooksOpen] = useState(false);
  const [activeMeetingForLive, setActiveMeetingForLive] = useState<OrganizationMeeting | null>(null);
  const [selectedMeetingForWhen2Meet, setSelectedMeetingForWhen2Meet] = useState<OrganizationMeeting | null>(null);
  const [activeModuleTab, setActiveModuleTab] = useState<
    'horarios_ponto' | 'metas_tarefas' | 'ideias_converse' | 'estoque' | 'equipe_acervo'
  >('horarios_ponto');
  const [visitedModules, setVisitedModules] = useState<Set<string>>(() => new Set(['horarios_ponto']));
  const [, startSwitchTransition] = useTransition();

  const selectModuleTab = (
    tab: 'horarios_ponto' | 'metas_tarefas' | 'ideias_converse' | 'estoque' | 'equipe_acervo'
  ) => {
    setVisitedModules((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
    startSwitchTransition(() => {
      setActiveModuleTab(tab);
    });
  };

  const selectMacroView = (view: 'organizacoes' | 'studio') => {
    userSwitchedRef.current = true;
    if (view === 'studio') setStudioVisited(true);
    startSwitchTransition(() => {
      setActiveMacroView(view);
    });
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (view === 'studio') {
        url.searchParams.set('view', 'studio');
      } else {
        url.searchParams.delete('view');
      }
      window.history.replaceState(null, '', url.toString());
    }
  };
  const swipeHandlers = useSwipeTabs({
    enabled: !isEmbed && activeMacroView !== 'studio',
    onNext: () => {
      if (activeMacroView === 'organizacoes') selectMacroView('studio');
    },
    onPrev: () => {
      if (activeMacroView === 'studio') selectMacroView('organizacoes');
      else router.push(`/servidor?org=${encodeURIComponent(currentOrg.id)}`);
    },
  });
  const [pendingQrDirection, setPendingQrDirection] = useState<'entrada' | 'saida' | null>(null);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
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
    <OrganizationBrandProvider orgSlug={currentOrg.slug} brandConfig={currentOrg.brand_config}>
      <div
        {...swipeHandlers}
        className={
          isStudioEditorFull
            ? 'relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden p-1 sm:p-2 text-fg'
            : 'relative z-10 min-h-full flex flex-col p-4 md:p-8 space-y-6 text-fg'
        }
      >
      {isDbMigrationPending && !isStudioEditorFull && (
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

      {/* Faixa 1: Switch Macro M3 [ Cofre | Organizações | Studio ] acima de tudo (oculta no editor do Studio) */}
      {!isEmbed && !isStudioEditorFull && (
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="inline-flex items-center p-1 bg-surface rounded-2xl border border-border-subtle shadow-md gap-1">
            <Link
              href={`/servidor?org=${encodeURIComponent(currentOrg.id)}`}
              prefetch={true}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold text-fg-secondary hover:text-fg transition-colors"
              title={`Abrir Cofre de Arquivos de ${currentOrg.name}`}
            >
              <span className="material-symbols-outlined text-[16px]">folder_special</span>
              <span>Cofre</span>
            </Link>
            <button
              type="button"
              onClick={() => selectMacroView('organizacoes')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs transition-all duration-200 active:scale-95 cursor-pointer ${
                activeMacroView === 'organizacoes'
                  ? 'font-black bg-[#FFCC00] text-[#121212] shadow-sm'
                  : 'font-bold text-fg-secondary hover:text-fg'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">domain</span>
              <span>Organizações</span>
            </button>
            <button
              type="button"
              onClick={() => selectMacroView('studio')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs transition-all duration-200 active:scale-95 cursor-pointer ${
                activeMacroView === 'studio'
                  ? 'font-black bg-[#FFCC00] text-[#121212] shadow-sm'
                  : 'font-bold text-fg-secondary hover:text-fg'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">palette</span>
              <span>Studio</span>
            </button>
          </div>
          {activeMacroView === 'studio' && (
            <div
              className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-surface/90 border border-border-subtle shadow-xs backdrop-blur-xs transition-all animate-in fade-in duration-200"
              title="Integração Oficial de Ecossistema: HUB LabDiv × Aurtistic"
            >
              <div className="flex items-center gap-1.5">
                <img
                  src="/icone-HUBLabDiv.svg"
                  alt="HUB LabDiv"
                  className="h-4.5 w-4.5 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="font-black text-xs text-fg tracking-tight">HUB</span>
                <span
                  className="font-black text-xs tracking-tight bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${tokens.containerColor || '#0F4780'}, ${tokens.primaryColor || '#1F9FCF'})`,
                  }}
                >
                  LabDiv
                </span>
              </div>

              <span className="text-[11px] font-bold text-fg-muted opacity-60">×</span>

              <div className="flex items-center gap-1.5">
                <img
                  src="/icons/icon-purple-gold.png"
                  alt="Aurtistic"
                  className="h-4 w-4 object-contain rounded-xs"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    if (!el.src.includes('aurtistic-icon.png')) {
                      el.src = '/aurtistic-icon.png';
                    }
                  }}
                />
                <span className="font-black text-xs text-[#581c87] dark:bg-gradient-to-r dark:from-[#9D4EDD] dark:via-[#C77DFF] dark:to-[#FFCC00] dark:bg-clip-text dark:text-transparent tracking-tight">
                  Aurtistic
                </span>
              </div>

              <a
                href="https://hublabdiv.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border border-border-subtle bg-app text-fg-secondary hover:text-[#FFCC00] hover:border-[#FFCC00]/50 hover:bg-surface hover:shadow-[0_0_12px_rgba(255,204,0,0.35)] transition-all shadow-xs cursor-pointer"
                title="Conferir portal institucional do HUB LabDiv"
              >
                <span>Conferir o HUB</span>
                <span className="material-symbols-outlined text-[12px]">open_in_new</span>
              </a>
            </div>
          )}
        </div>
      )}

      {/* Faixa 2: Card Fixo Idêntico (oculto no editor do Studio) */}
      {!isStudioEditorFull && (
      <div data-tour="org-view-mode" className="relative shrink-0 flex flex-wrap items-center justify-between gap-4 bg-surface border border-border-subtle rounded-2xl p-4 shadow-lg z-20">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 overflow-hidden p-1.5 shadow-inner">
            {currentOrg.slug === 'labdiv' || (!currentOrg.slug && currentOrg.name?.toLowerCase().includes('labdiv')) ? (
              <img src="/labdiv-logo.png" alt="LabDiv" className="w-full h-full object-contain" />
            ) : currentOrg.slug === 'show-da-fisica' ? (
              <div className="w-full h-full flex flex-col items-center justify-center font-black text-center leading-none">
                <span className="text-[9px] text-[#ff1e1e]">SHOW</span>
                <span className="text-[8px] text-[#0066ff]">FÍSICA</span>
              </div>
            ) : currentOrg.slug === 'hs' ? (
              <img src="/hs-logo.png" alt="Hackerspace" className="w-full h-full object-cover rounded-xl" />
            ) : currentOrg.avatar_url ? (
              <img src={currentOrg.avatar_url} alt={currentOrg.name} className="w-full h-full object-contain" />
            ) : (
              <span className="text-lg font-black text-[var(--accent-primary)]">
                {currentOrg.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            {isEmbed ? (
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg md:text-xl font-black font-bukra text-fg">
                  {currentOrg.name}
                </h2>
                <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)]">
                  Gestão Integrada
                </span>
              </div>
            ) : (
              <OrganizationMaterialSelector
                organizations={userOrganizations}
                selectedOrgId={currentOrg.id}
                onSelectOrg={(id) => id && handleSwitchOrg(id)}
                onCreateOrg={() => setIsCreateModalOpen(true)}
                onJoinWithCode={() => setIsAdminModalOpen(true)}
              />
            )}
          </div>
        </div>

        {/* Botão constante no canto direito na mesma altura e tom de Pedir Boost */}
        {!isEmbed && isOrgAdmin && (
          <button
            type="button"
            onClick={() => setIsAdminModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 px-3.5 py-2 text-xs font-bold text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 transition-colors cursor-pointer shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">shield_person</span>
            <span>Credenciamento</span>
          </button>
        )}
      </div>
      )}

      {activeMacroView === 'studio' ? (
        <OrganizationPostStudio organizationId={currentOrg.id} orgSlug={currentOrg.slug} onStageChange={setStudioStage} />
      ) : (
      <div className="space-y-6">
      {/* Bento Grid Operacional (Nível 1 - 8px Grid) + Navigation Bar M3 (Seleção Única - 5 Módulos) */}
      {(() => {
        const isShow = currentOrg.slug === 'show-da-fisica';
        const isHs = currentOrg.slug === 'hs';
        const opsTag = isShow
          ? 'SF-OPS // BASTIDORES DO SHOW • Auditório Alessandro Volta • IFUSP'
          : isHs
            ? 'HS-OPS // HACKERSPACE • Oficina & Hardware Livre • IFUSP'
            : 'LD-OPS // BASTIDORES LABDIV • Portal HUB LabDiv • IFUSP';

        const navModules = [
          {
            id: 'horarios_ponto' as const,
            label: 'Ponto & Horários',
            icon: 'calendar_clock',
            accentToken: 'var(--md-sys-color-primary)',
            textOnActive: 'var(--md-sys-color-on-primary, var(--on-accent-primary))',
          },
          {
            id: 'metas_tarefas' as const,
            label: 'Metas & Tarefas',
            icon: 'flag',
            accentToken: 'var(--md-sys-color-secondary)',
            textOnActive: 'var(--md-sys-color-on-secondary, var(--on-accent-secondary))',
          },
          {
            id: 'ideias_converse' as const,
            label: 'Ideias, Pedidos & Converse',
            icon: 'forum',
            accentToken: 'var(--md-sys-color-tertiary)',
            textOnActive: '#ffffff',
          },
          {
            id: 'estoque' as const,
            label: 'Estoque',
            icon: 'inventory_2',
            accentToken: 'var(--md-sys-color-primary-container)',
            textOnActive: '#ffffff',
          },
          {
            id: 'equipe_acervo' as const,
            label: 'Equipe & Acervo',
            icon: 'diversity_3',
            accentToken: 'var(--md-sys-color-primary)',
            textOnActive: 'var(--md-sys-color-on-primary, var(--on-accent-primary))',
          },
        ];

        return (
          <div className="space-y-4">
            {/* Bloco Superior Dinâmico: Identidade da Organização Ativa & Bateria Cognitiva */}
            <div
              className={`p-4 border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${
                isShow || isHs
                  ? 'neon-border-green bg-surface/85 backdrop-blur-md rounded-none'
                  : 'org-card rounded-2xl border-border-subtle bg-surface/90 backdrop-blur-xl'
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--md-sys-color-primary)] block">
                  ● {opsTag}
                </span>
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider mt-1">
                  {isShow ? (
                    <>
                      <span className="neon-text-red">{currentOrg.name}</span> ·{' '}
                      <span className="neon-text-blue">GESTÃO</span> ·{' '}
                      <span className="neon-text-green">OPERAÇÃO</span>
                    </>
                  ) : (
                    <span>{currentOrg.name} · GESTÃO · OPERAÇÃO</span>
                  )}
                </h2>
                <p className="text-xs text-fg-muted mt-1">
                  {isShow
                    ? 'Coordenação de experimentos, turnos de monitores e apresentações do Show de Física.'
                    : isHs
                      ? 'Oficina aberta, inventário de bancada e turnos colaborativos do Hackerspace.'
                      : `Painel operacional, metas e acervos integrados de ${currentOrg.name}.`}
                </p>
              </div>
              <div className="w-full lg:w-[360px] shrink-0">
                <MemberCapacityQuickSelector
                  organizationId={currentOrg.id}
                  initialCapacity={myMember?.cognitive_capacity || 'normal'}
                  initialNote={myMember?.capacity_note || ''}
                />
              </div>
            </div>

            {/* Navigation Bar M3 (Seleção Única — 5 Módulos Lógicos) */}
            <nav
              aria-label="Módulos da Gestão"
              className={`p-1.5 border flex flex-wrap items-center gap-2 ${
                isShow || isHs
                  ? 'border-border-subtle bg-surface/85 backdrop-blur-md rounded-none'
                  : 'rounded-2xl border-border-subtle bg-surface/90 backdrop-blur-xl shadow-md'
              }`}
            >
              {navModules.map((mod) => {
                const isActive = activeModuleTab === mod.id;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => selectModuleTab(mod.id)}
                    aria-current={isActive ? 'page' : undefined}
                    style={
                      isActive
                        ? { backgroundColor: mod.accentToken, color: mod.textOnActive }
                        : undefined
                    }
                    className={`flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-bold transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                      isShow || isHs ? 'rounded-none' : 'rounded-xl'
                    } ${
                      isActive
                        ? 'shadow-md font-black'
                        : 'text-fg-muted hover:text-fg hover:bg-app'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{mod.icon}</span>
                    <span className="truncate">{mod.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        );
      })()}

      {/* Conteúdo dos Módulos com Keep-Mounted Cache (troca instantânea 0ms após primeira visita) */}
      {visitedModules.has('horarios_ponto') && (
        <div className={activeModuleTab === 'horarios_ponto' ? 'space-y-6' : 'hidden'}>
          <OrganizationScheduleAttendancePanel
            key={currentOrg.slug}
            organization={currentOrg}
            subteams={subteams}
            members={members}
            currentUserId={currentUserId}
            currentUserName={myMember?.full_name || 'Membro do Laboratório'}
            isAdmin={isOrgAdmin}
            externalOpenScanner={pendingQrDirection}
            onExternalScannerHandled={() => setPendingQrDirection(null)}
            onAttendanceStatusChange={({ isCheckedIn: nextStatus }) => setIsCheckedIn(nextStatus)}
          />

          <div
            data-tour="org-meetings-section"
            className="org-card p-4 md:p-6 bg-surface border border-border-subtle rounded-2xl shadow-lg space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[var(--md-sys-color-primary)]">
                  calendar_month
                </span>
                <h4 className="text-sm font-bold uppercase tracking-wider text-fg">
                  Reuniões da Equipe & When2Meet ({meetings.length})
                </h4>
              </div>
              <form onSubmit={handleCreateMeeting} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Título da reunião..."
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  className="rounded-xl border border-border-subtle bg-app text-fg px-3 py-1.5 text-xs placeholder-slate-500 focus:border-[var(--md-sys-color-primary)] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isCreatingMeeting || !newMeetingTitle.trim()}
                  className="inline-flex items-center gap-1 rounded-xl bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-bold text-slate-950 hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Agendar
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {meetings.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col justify-between rounded-xl border border-border-subtle bg-app text-fg p-4 transition-colors hover:border-border-strong"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold text-fg truncate">{m.title}</span>
                      <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-fg-muted font-mono">
                        {m.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-fg-muted mb-3">
                      {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('pt-BR') : 'Data a definir'} • {m.duration_minutes || 60} min
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
                    <button
                      type="button"
                      onClick={() => setActiveMeetingForLive(m)}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-[var(--md-sys-color-primary)]/15 border border-[var(--md-sys-color-primary)]/30 py-1.5 text-xs font-semibold text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/25 transition-colors cursor-pointer"
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
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        selectedMeetingForWhen2Meet?.id === m.id
                          ? 'bg-[var(--md-sys-color-secondary)]/20 border-[var(--md-sys-color-secondary)] text-[var(--md-sys-color-secondary)]'
                          : 'border-border-subtle bg-surface text-fg-muted hover:text-fg hover:bg-surface-hover'
                      }`}
                    >
                      Horários
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {selectedMeetingForWhen2Meet && (
              <div className="pt-4 border-t border-border-subtle">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--md-sys-color-primary)]">
                    Definindo melhor horário para: {selectedMeetingForWhen2Meet.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedMeetingForWhen2Meet(null)}
                    className="text-xs text-fg-muted hover:text-fg cursor-pointer"
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
        </div>
      )}

      {visitedModules.has('metas_tarefas') && (
        <div className={activeModuleTab === 'metas_tarefas' ? 'space-y-6' : 'hidden'}>
          <OrganizationGoalsPanel
            key={`goals-${currentOrg.slug}`}
            organization={currentOrg}
            subteams={subteams}
            tasks={tasks}
            currentUserId={currentUserId}
            onTaskCreated={(newTask) => setTasks((prev) => [newTask, ...prev])}
            onTaskUpdated={(updatedTask) =>
              setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)))
            }
          />
          <TasksView
            key={`tasks-${currentOrg.slug}`}
            initialTasks={tasks}
            initialColumns={columns}
            userId={currentUserId}
            initialQuickFilters={quickFilters}
            initialQuickSorts={quickSorts}
            advancedSettings={advancedSettings}
            showUnassignedBanner={true}
          />
        </div>
      )}

      {visitedModules.has('ideias_converse') && (
        <div className={activeModuleTab === 'ideias_converse' ? 'block' : 'hidden'}>
          <OrganizationRequestsPanel
            key={`req-${currentOrg.slug}`}
            organization={currentOrg}
            subteams={subteams}
            currentUserId={currentUserId}
            currentUserName={myMember?.full_name || 'Membro do Laboratório'}
            isAdmin={isOrgAdmin}
          />
        </div>
      )}

      {visitedModules.has('estoque') && (
        <div className={activeModuleTab === 'estoque' ? 'block' : 'hidden'}>
          <OrgBenchStockPanel key={`stock-${currentOrg.slug}`} orgSlug={currentOrg.slug} />
        </div>
      )}

      {visitedModules.has('equipe_acervo') && (
        <div className={activeModuleTab === 'equipe_acervo' ? 'space-y-6' : 'hidden'}>
          <TeamProgressPanel
            key={`team-${currentOrg.slug}`}
            organization={currentOrg}
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

          <div
            className={`p-5 border space-y-4 ${
              currentOrg.slug === 'show-da-fisica' || currentOrg.slug === 'hs'
                ? 'neon-border-blue bg-surface rounded-none'
                : 'org-card rounded-2xl border-border-subtle bg-surface'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black uppercase text-fg">
                  Acervo Técnico, Playbooks & Cofre da Organização
                </h3>
                <p className="text-xs text-fg-muted">
                  POPs de segurança, roteiros técnicos e acesso ao Cofre de Mídia de {currentOrg.name}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaybooksOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--md-sys-color-primary)]/40 bg-[var(--md-sys-color-primary)]/15 px-3.5 py-2 text-xs font-bold text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/25 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">menu_book</span>
                  Abrir Playbooks / POPs
                </button>
                <button
                  type="button"
                  onClick={() => setShowInlineVault((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--md-sys-color-secondary)]/40 bg-[var(--md-sys-color-secondary)]/15 px-3.5 py-2 text-xs font-bold text-[var(--md-sys-color-secondary)] hover:bg-[var(--md-sys-color-secondary)]/25 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {showInlineVault ? 'unfold_less' : 'unfold_more'}
                  </span>
                  {showInlineVault ? 'Recolher Cofre Embutido' : 'Expandir Cofre Embutido'}
                </button>
                <Link
                  href={`/servidor?org=${encodeURIComponent(currentOrg.id)}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--md-sys-color-primary)] px-3.5 py-2 text-xs font-bold text-slate-950 hover:brightness-110"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  Tela Cheia
                </Link>
              </div>
            </div>
          </div>

          {showInlineVault && (
            <div className="rounded-2xl border border-border-subtle overflow-hidden bg-[#07090e] shadow-xl">
              <iframe
                key={`inline-vault-${currentOrg.id}`}
                src={`/servidor?org=${encodeURIComponent(currentOrg.id)}&embed=1&inline=1${ticket ? `&ticket=${encodeURIComponent(ticket)}` : ''}`}
                className="w-full h-[680px] border-0 bg-[#07090e]"
                title={`Cofre Compartilhado — ${currentOrg.name}`}
              />
            </div>
          )}
        </div>
      )}

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
      )}
      </div>
    </OrganizationBrandProvider>
  );
}
