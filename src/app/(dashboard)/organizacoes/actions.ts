// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/(dashboard)/organizacoes/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import type {
  CognitiveCapacity,
  OrgRole,
  ReviewDecision,
} from '@/types/organizations';
import { isUuid } from '@/lib/validators';

const LABDIV_ORG_ID = '1ab41410-0000-4000-8000-000000000001';

const LABDIV_DEFAULT_ORG: any = {
  id: LABDIV_ORG_ID,
  slug: 'labdiv',
  name: 'LabDiv',
  description: 'Laboratório de Divulgação Científica (LabDiv - IFUSP)',
  avatar_url: null,
  primary_color: '#9D4EDD',
  secondary_color: '#FFCC00',
  storage_quota_bytes: 53687091200,
  storage_used_bytes: 0,
  storage_policy: 'admin_or_permitted',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  myRole: 'admin',
  myMemberId: LABDIV_ORG_ID,
  canUploadOrgVault: true,
  myCapacity: 'normal',
};

export async function getUserOrganizationsAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  let orgs: any[] = [];

  try {
    const { data: memberRows, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        org_role,
        subteam_id,
        can_upload_org_vault,
        cognitive_capacity,
        capacity_note,
        capacity_until,
        organization:organizations(*)
      `)
      .eq('user_id', user.id);

    if (!error && Array.isArray(memberRows)) {
      orgs = memberRows
        .map((m) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const org: any = m.organization;
          if (!org) return null;
          return {
            ...org,
            myRole: m.org_role,
            myMemberId: m.id,
            mySubteamId: m.subteam_id,
            canUploadOrgVault: m.can_upload_org_vault,
            myCapacity: m.cognitive_capacity,
          };
        })
        .filter(Boolean);
    }
  } catch {
    // Tabela pode ainda não estar no schema cache
  }

  // Fallback / Resolução Híbrida:
  // Se o usuário ainda não tiver linhas em organization_members, checar vínculo com LabDiv / HUB
  if (orgs.length === 0) {
    let isLabdiv = false;
    const hubOrgs: string[] = [];

    // 1. Checa metadados do auth
    if (user.user_metadata?.is_labdiv) isLabdiv = true;
    if (Array.isArray(user.user_metadata?.organizations)) {
      hubOrgs.push(...user.user_metadata.organizations);
    }
    if (user.email?.includes('usp.br') || user.email?.includes('hublabdiv') || user.email === 'stangorlini@aurtistic.local') {
      isLabdiv = true;
    }

    // 2. Checa user_profiles.features_config.hub_connection
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('features_config')
        .eq('id', user.id)
        .maybeSingle();

      const hubConn = profile?.features_config?.hub_connection;
      if (hubConn) {
        if (hubConn.is_labdiv) isLabdiv = true;
        if (Array.isArray(hubConn.organizations)) {
          hubOrgs.push(...hubConn.organizations);
        }
      }
    } catch {
      // Silencioso
    }

    // 3. Usuários fundadores / administradores conhecidos do LabDiv
    const knownLabdivUserIds = [
      'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e',
      '7dcfe172-1cf0-4389-9abd-f340b1408386',
      '48b2fb73-c5d3-4eff-b727-54e4b91bf21b',
      'fb12ee7b-da8f-4b80-ac5c-3b8d478047d2',
    ];
    if (knownLabdivUserIds.includes(user.id)) {
      isLabdiv = true;
    }

    if (isLabdiv || hubOrgs.some((o) => o.toLowerCase() === 'labdiv')) {
      orgs.push({
        ...LABDIV_DEFAULT_ORG,
        myMemberId: user.id,
      });
    }
  }

  return { ok: true, organizations: orgs };
}

export async function getOrganizationDetailsAction(orgId: string) {
  if (!isUuid(orgId)) return { ok: false, error: 'ID de organização inválido.' };
  const supabase = await createClient();

  try {
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();

    if (!orgErr && org) {
      const { data: subteams } = await supabase
        .from('organization_subteams')
        .select('*')
        .eq('organization_id', orgId)
        .order('name');

      const { data: members } = await supabase
        .from('organization_members')
        .select('*, subteam:organization_subteams(*)')
        .eq('organization_id', orgId)
        .order('full_name');

      return {
        ok: true,
        organization: org,
        subteams: subteams || [],
        members: members || [],
      };
    }
  } catch {
    // Tabela pode ainda não existir
  }

  // Fallback institucional para LabDiv
  if (orgId === LABDIV_ORG_ID) {
    return {
      ok: true,
      organization: LABDIV_DEFAULT_ORG,
      subteams: [
        { id: '1ab41410-0000-4000-8000-000000000101', organization_id: LABDIV_ORG_ID, name: 'Comunicação & Mídias', description: 'Gestão de redes, vídeos, podcasts e divulgação científica', color: '#9D4EDD' },
        { id: '1ab41410-0000-4000-8000-000000000102', organization_id: LABDIV_ORG_ID, name: 'Pesquisa & Extensão', description: 'Projetos científicos, artigos, dados e parcerias acadêmicas', color: '#049FFF' },
        { id: '1ab41410-0000-4000-8000-000000000103', organization_id: LABDIV_ORG_ID, name: 'Administração & Coordenação', description: 'Governança institucional, finanças e cronogramas gerais', color: '#FFCC00' }
      ],
      members: [
        { id: '1ab41410-m001', organization_id: LABDIV_ORG_ID, full_name: 'João Paulo Stangorlini', email: 'joaopaulostangorlini@usp.br', org_role: 'admin', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' },
        { id: '1ab41410-m002', organization_id: LABDIV_ORG_ID, full_name: 'Andy dos Santos Ramos', email: 'andy@labdiv.usp.br', org_role: 'admin', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' },
        { id: '1ab41410-m003', organization_id: LABDIV_ORG_ID, full_name: 'Dani Serafim', email: 'dani@labdiv.usp.br', org_role: 'member', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' },
        { id: '1ab41410-m004', organization_id: LABDIV_ORG_ID, full_name: 'HUB LabDiv Institucional', email: 'hublabdiv@gmail.com', org_role: 'admin', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' }
      ],
    };
  }

  return { ok: false, error: 'Organização não encontrada.' };
}

export async function updateMemberCapacityAction(input: {
  organizationId: string;
  capacity: CognitiveCapacity;
  note?: string;
  until?: string;
}) {
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('update_my_member_capacity', {
    p_org_id: input.organizationId,
    p_capacity: input.capacity,
    p_note: input.note || null,
    p_until: input.until || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true, member: data };
}

export async function createOrganizationInviteAction(input: {
  organizationId: string;
  targetEmail?: string;
  targetName?: string;
  assignedRole?: OrgRole;
  assignedSubteamId?: string;
  placeholderMemberId?: string;
}) {
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data, error } = await supabase
    .from('organization_invites')
    .insert({
      organization_id: input.organizationId,
      created_by: user.id,
      target_email: input.targetEmail || null,
      target_name: input.targetName || null,
      assigned_role: input.assignedRole || 'member',
      assigned_subteam_id: input.assignedSubteamId || null,
      placeholder_member_id: input.placeholderMemberId || null,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, invite: data, inviteUrl: `/convite/${data.token}` };
}

export async function getOrganizationTaskTemplatesAction(orgId: string) {
  if (!isUuid(orgId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_task_templates')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, templates: data || [] };
}

export async function createOrganizationTaskTemplateAction(input: {
  organizationId: string;
  title: string;
  description?: string;
  subteamId?: string;
  checklistItems: Array<{ text: string }>;
}) {
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_task_templates')
    .insert({
      organization_id: input.organizationId,
      title: input.title.trim(),
      description: input.description || null,
      subteam_id: input.subteamId || null,
      checklist_items: input.checklistItems || [],
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, template: data };
}

/**
 * Converte um item da pauta de reunião em Tarefa formal da organização em 1 clique
 * Gravando converted_task_id no JSONB para impedir duplicações.
 */
export async function convertMeetingAgendaItemToTaskAction(input: {
  meetingId: string;
  agendaItemId?: string;
  title?: string;
  itemTitle?: string;
  organizationId?: string;
  subteamId?: string | null;
  assigneeName?: string;
  assigneeUserId?: string;
  prazo?: string;
}) {
  if (!isUuid(input.meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const taskTitle = (input.title || input.itemTitle || '').trim();
  if (!taskTitle) return { ok: false, error: 'Título da pauta inválido.' };

  // Busca a reunião para obter organization_id e atualizar o item da pauta
  const { data: meeting } = await supabase
    .from('organization_meetings')
    .select('*, organization:organizations(name)')
    .eq('id', input.meetingId)
    .single();

  if (!meeting) return { ok: false, error: 'Reunião não encontrada.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgName = (meeting as any).organization?.name || (meeting.organization_id ? 'LabDiv' : 'Pessoal');
  const ataNote = `Origem: Reunião "${meeting.title}" (${meeting.scheduled_at ? new Date(meeting.scheduled_at).toLocaleDateString('pt-BR') : 'Data não definida'}).\n[Ata da Reunião](#meeting-${meeting.id})`;
  const orgId = input.organizationId || meeting.organization_id || LABDIV_ORG_ID;

  const taskId = crypto.randomUUID();
  const taskToSave: Record<string, unknown> = {
    id: taskId,
    user_id: user.id,
    organization_id: orgId,
    subteam_id: input.subteamId || meeting.subteam_id || null,
    assigned_member_ids: input.assigneeUserId ? [input.assigneeUserId] : [],
    responsavel: input.assigneeName || null,
    nome: taskTitle,
    descricao: ataNote,
    status: 'não iniciada',
    prioridade: 'Média',
    dimensao: orgName,
    prazo: input.prazo || null,
    is_personal: !orgId,
    created_at: new Date().toISOString(),
  };

  const { data: insertedTask, error: taskErr } = await supabase
    .from('tasks')
    .insert(taskToSave)
    .select('*')
    .single();

  if (taskErr) {
    return { ok: false, error: 'Falha ao criar tarefa: ' + taskErr.message };
  }

  // Atualiza agenda_items na reunião com converted_task_id
  if (meeting && Array.isArray(meeting.agenda_items)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedAgenda = meeting.agenda_items.map((item: any) => {
      if (
        (input.agendaItemId && item.id === input.agendaItemId) ||
        (!input.agendaItemId && item.title === taskTitle)
      ) {
        return { ...item, converted_task_id: taskId };
      }
      return item;
    });

    await supabase
      .from('organization_meetings')
      .update({ agenda_items: updatedAgenda })
      .eq('id', input.meetingId);
  }

  revalidatePath('/labdiv');
  revalidatePath('/servidor');
  revalidatePath('/');
  return { ok: true, taskId, task: insertedTask || taskToSave };
}

export async function applyPlaybookToTasksAction(input: {
  organizationId: string;
  templateId: string;
  subteamId?: string;
  assignedMemberIds?: string[];
  prazo?: string;
}) {
  if (!isUuid(input.organizationId) || !isUuid(input.templateId)) {
    return { ok: false, error: 'IDs inválidos.' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data: tmpl } = await supabase
    .from('organization_task_templates')
    .select('*, organization:organizations(name)')
    .eq('id', input.templateId)
    .single();

  if (!tmpl) return { ok: false, error: 'Template não encontrado.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgName = (tmpl as any).organization?.name || 'Organização';

  const { data: parentTask, error: pErr } = await supabase
    .from('tasks')
    .insert({
      user_id: user.id,
      organization_id: input.organizationId,
      subteam_id: input.subteamId || tmpl.subteam_id || null,
      assigned_member_ids: input.assignedMemberIds || [],
      nome: `[Playbook] ${tmpl.title}`,
      descricao: tmpl.description || null,
      status: 'A Fazer',
      prioridade: 'Média',
      dimensao: orgName,
      prazo: input.prazo || null,
      is_personal: false,
    })
    .select('id')
    .single();

  if (pErr) return { ok: false, error: pErr.message };

  const checklist = Array.isArray(tmpl.checklist_items) ? tmpl.checklist_items : [];
  if (checklist.length > 0) {
    const subtasks = checklist.map((item: any, idx: number) => ({
      user_id: user.id,
      organization_id: input.organizationId,
      subteam_id: input.subteamId || tmpl.subteam_id || null,
      assigned_member_ids: input.assignedMemberIds || [],
      parent_id: parentTask.id,
      nome: item.text || `Passo ${idx + 1}`,
      status: 'A Fazer',
      prioridade: 'Média',
      dimensao: orgName,
      is_personal: false,
      ordem_manual: idx,
    }));

    await supabase.from('tasks').insert(subtasks);
  }

  revalidatePath('/');
  return { ok: true, taskId: parentTask.id };
}

export async function getOrganizationMeetingsAction(orgId: string) {
  if (!isUuid(orgId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('organization_meetings')
      .select('*, organization:organizations(name, slug)')
      .eq('organization_id', orgId)
      .order('scheduled_at', { ascending: false });

    if (!error) return { ok: true, meetings: data || [] };
  } catch {
    // Tabela pode ainda não existir
  }
  return { ok: true, meetings: [] };
}

export async function createOrganizationMeetingAction(input: {
  organizationId: string;
  title: string;
  description?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  meetUrl?: string;
  subteamId?: string;
}) {
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data, error } = await supabase
    .from('organization_meetings')
    .insert({
      organization_id: input.organizationId,
      created_by: user.id,
      title: input.title.trim(),
      description: input.description || null,
      scheduled_at: input.scheduledAt || null,
      duration_minutes: input.durationMinutes || 60,
      meet_url: input.meetUrl || null,
      subteam_id: input.subteamId || null,
      review_status: 'draft',
      status: 'scheduled',
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, meeting: data };
}

export async function getMeetingDetailsAction(meetingId: string) {
  if (!isUuid(meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data: meeting, error: mErr } = await supabase
    .from('organization_meetings')
    .select('*, organization:organizations(name, slug)')
    .eq('id', meetingId)
    .single();

  if (mErr || !meeting) return { ok: false, error: mErr?.message || 'Reunião não encontrada.' };

  const { data: personalNote } = await supabase
    .from('organization_meeting_personal_notes')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    ok: true,
    meeting,
    personalNotes: personalNote?.notes_markdown || '',
    userId: user.id,
  };
}

export async function updateMeetingNotesAction(input: {
  meetingId: string;
  liveNotes?: string;
  processNotes?: string;
  personalNotes?: string;
  transcriptText?: string;
  agendaItems?: Array<{ id: string; title: string; completed: boolean }>;
}) {
  if (!isUuid(input.meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  // Atualiza notas e transcrição da reunião se fornecidas
  if (
    input.liveNotes !== undefined ||
    input.processNotes !== undefined ||
    input.transcriptText !== undefined ||
    input.agendaItems !== undefined
  ) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.liveNotes !== undefined) patch.live_notes_markdown = input.liveNotes;
    if (input.processNotes !== undefined) patch.process_notes_markdown = input.processNotes;
    if (input.transcriptText !== undefined) patch.transcript_text = input.transcriptText;
    if (input.agendaItems !== undefined) patch.agenda_items = input.agendaItems;

    await supabase
      .from('organization_meetings')
      .update(patch)
      .eq('id', input.meetingId);
  }

  // Atualiza notas pessoais isoladas do usuário
  if (input.personalNotes !== undefined) {
    await supabase
      .from('organization_meeting_personal_notes')
      .upsert(
        {
          meeting_id: input.meetingId,
          user_id: user.id,
          notes_markdown: input.personalNotes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'meeting_id,user_id' }
      );
  }

  return { ok: true };
}

export async function submitMeetingReviewAction(input: {
  meetingId: string;
  decision: ReviewDecision;
  feedback?: string;
}) {
  if (!isUuid(input.meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data, error } = await supabase
    .from('organization_meeting_reviews')
    .insert({
      meeting_id: input.meetingId,
      reviewer_user_id: user.id,
      decision: input.decision,
      feedback_markdown: input.feedback || null,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  if (input.decision === 'approved') {
    await supabase
      .from('organization_meetings')
      .update({ review_status: 'under_review' })
      .eq('id', input.meetingId);
  }

  return { ok: true, review: data };
}

export async function publishMeetingAtaAction(input: {
  meetingId: string;
  ataMarkdown: string;
}) {
  if (!isUuid(input.meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_meetings')
    .update({
      published_ata_markdown: input.ataMarkdown,
      review_status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.meetingId)
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, meeting: data };
}

/**
 * Cria uma nova organização no ecossistema e vincula o criador como Admin.
 */
export async function createOrganizationAction(input: {
  name: string;
  slug?: string;
  description?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'O nome da organização é obrigatório.' };

  const slug = (input.slug || name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const { data, error } = await supabase.rpc('create_new_organization', {
    p_name: name,
    p_slug: slug,
    p_description: input.description || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/labdiv');
  revalidatePath('/servidor');
  return { ok: true, organization: data };
}

/**
 * Visualiza preview seguro de convite por código ou link.
 */
export async function getOrganizationInvitePreviewAction(codeOrUrl: string) {
  const supabase = await createClient();
  const cleanToken = codeOrUrl
    .trim()
    .replace(/^.*\/convite\//, '')
    .split('?')[0]
    .split('#')[0]
    .trim();

  if (!cleanToken) return { ok: false, error: 'Código ou link de convite vazio.' };

  const { data, error } = await supabase.rpc('get_organization_invite_preview', {
    p_token: cleanToken,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.valid) return { ok: false, error: data?.error || 'Convite inválido ou expirado.' };

  return { ok: true, preview: data, token: cleanToken };
}

/**
 * Entra na organização por código de convite ou link.
 */
export async function joinOrganizationByCodeAction(input: {
  codeOrUrl: string;
  claimPlaceholderId?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Você precisa estar logado para entrar na organização.' };

  const cleanToken = input.codeOrUrl
    .trim()
    .replace(/^.*\/convite\//, '')
    .split('?')[0]
    .split('#')[0]
    .trim()
    .toUpperCase();

  if (!cleanToken) return { ok: false, error: 'Código de convite inválido.' };

  // Reivindicação automática de perfil placeholder se houver correspondência de e-mail ou nome
  let claimPlaceholderId = input.claimPlaceholderId || null;
  if (!claimPlaceholderId) {
    try {
      const { data: inv } = await supabase
        .from('organization_invites')
        .select('organization_id')
        .eq('token', cleanToken)
        .maybeSingle();

      if (inv?.organization_id) {
        const userEmail = (user.email || '').toLowerCase().trim();
        const userName = (user.user_metadata?.full_name || '').toLowerCase().trim();
        const { data: placeholders } = await supabase
          .from('organization_members')
          .select('id, email, full_name')
          .eq('organization_id', inv.organization_id)
          .eq('is_placeholder', true);

        if (Array.isArray(placeholders)) {
          const match = placeholders.find(
            (p) =>
              (p.email && p.email.toLowerCase().trim() === userEmail) ||
              (p.full_name && p.full_name.toLowerCase().trim() === userName)
          );
          if (match) {
            claimPlaceholderId = match.id;
          }
        }
      }
    } catch {}
  }

  const { data, error } = await supabase.rpc('accept_organization_invite', {
    p_token: cleanToken,
    p_claim_placeholder_id: claimPlaceholderId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/labdiv');
  revalidatePath('/servidor');
  return { ok: true, result: data };
}

/**
 * Obtém ou gera código de convite ativo para compartilhamento com a equipe.
 */
export async function getOrCreateActiveInviteAction(orgId: string) {
  if (!isUuid(orgId)) return { ok: false, error: 'ID de organização inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  // Busca convite ativo existente
  const { data: existing } = await supabase
    .from('organization_invites')
    .select('*')
    .eq('organization_id', orgId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { ok: true, token: existing.token, invite: existing };
  }

  // Cria novo convite padrão com expiração de 30 dias
  const { data: newInv, error: invErr } = await supabase
    .from('organization_invites')
    .insert({
      organization_id: orgId,
      created_by: user.id,
      assigned_role: 'member',
    })
    .select('*')
    .single();

  if (invErr) return { ok: false, error: invErr.message };
  return { ok: true, token: newInv.token, invite: newInv };
}
