// Este programa é um software livre (Licença AGPLv3)
import { createClient } from '@/utils/supabase/server';
import { getTaskColumns, getUserProfile } from '@/app/(dashboard)/actions';
import { getUserOrganizationsAction } from '@/app/(dashboard)/organizacoes/actions';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { Task, AgendaEvent } from '@/types';
import AurtisticWorkspaceClient from '@/components/dashboard/AurtisticWorkspaceClient';

export const dynamic = 'force-dynamic';

export default async function AurtisticPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getUserProfile();

  // Busca organizações ativas do usuário
  const orgsRes = await getUserOrganizationsAction();
  const initialOrganizations = orgsRes.ok && Array.isArray(orgsRes.organizations) ? orgsRes.organizations : [];
  const hasLabdiv = initialOrganizations.some(
    (o) => o.id === '1ab41410-0000-4000-8000-000000000001' || o.slug === 'labdiv' || o.name?.toLowerCase().includes('labdiv')
  );

  // 1. Pessoal tasks
  const { data: pessoalTasks, error: pessoalError } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // 1.1 Pessoal events
  const { data: pessoalEvents } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // 1.2 Arquivos indexados do usuário vinculados a tarefas (evita overfetching das 2.369 fotos do portfólio)
  const { data: userFiles } = await supabase
    .from('user_files_index')
    .select('*')
    .eq('user_id', user.id)
    .or('linked_task_id.not.is.null,linked_task_ids.neq.{}');

  if (pessoalError) {
    return (
      <div className="h-full flex flex-col p-4 md:p-8 bg-app">
        <div className="p-4 bg-[#93000a]/20 border border-[#93000a] text-[#ffdad6] rounded-md text-sm">
          Erro ao carregar tarefas: {pessoalError.message}
        </div>
      </div>
    );
  }

  // 2. Servidor tasks (Somente João)
  let servidorTasks: Task[] = [];
  let servidorEvents: AgendaEvent[] = [];
  if (user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {
    const { data: sTasks } = await supabase
      .from('tasks')
      .select('*')
      .or('is_personal.is.null,is_personal.eq.false')
      .order('created_at', { ascending: false });
    servidorTasks = sTasks || [];

    const { data: sEvents } = await supabase
      .from('events')
      .select('*')
      .or('is_labdiv.is.null,is_labdiv.eq.false')
      .order('created_at', { ascending: false });
    servidorEvents = sEvents || [];
  }

  // 3. LabDiv tasks (Membros do LabDiv)
  let labdivTasks: Task[] = [];
  let labdivEvents: AgendaEvent[] = [];
  if (hasLabdiv || user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' || user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386') {
    const { data: lTasks } = await supabase
      .from('tasks')
      .select('*')
      .or('dimensao.eq.HUB,dimensao.eq.LabDiv,dimensao.eq.labdiv')
      .order('created_at', { ascending: false });
    labdivTasks = lTasks || [];

    const { data: lEvents } = await supabase
      .from('events')
      .select('*')
      .or('is_labdiv.eq.true,dimensao.eq.HUB,dimensao.eq.LabDiv')
      .order('created_at', { ascending: false });
    labdivEvents = lEvents || [];
  }

  const columns = await getTaskColumns();

  return (
    <Suspense fallback={<div className="h-full bg-app flex items-center justify-center text-fg">Carregando painel...</div>}>
      <AurtisticWorkspaceClient
        initialProfile={profile}
        pessoalTasks={pessoalTasks || []}
        servidorTasks={servidorTasks}
        labdivTasks={labdivTasks}
        pessoalEvents={pessoalEvents || []}
        servidorEvents={servidorEvents}
        labdivEvents={labdivEvents}
        columns={columns}
        userId={user.id}
        initialUserFiles={userFiles || []}
        initialOrganizations={initialOrganizations}
      />
    </Suspense>
  );
}
