import { createClient } from '@/utils/supabase/server';
import { getTaskColumns, getUserProfile } from '@/app/(dashboard)/actions';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import AurtisticWorkspaceClient from '@/components/dashboard/AurtisticWorkspaceClient';

export const dynamic = 'force-dynamic';

export default async function AurtisticPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/aurtistic/login');
  }

  // 1. Pessoal tasks
  const { data: pessoalTasks, error: pessoalError } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_personal', true)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // 1.1 Pessoal events
  const { data: pessoalEvents } = await supabase
    .from('events')
    .select('*')
    .eq('is_labdiv', false)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (pessoalError) {
    return (
      <div className="h-full flex flex-col p-4 md:p-8 bg-[#121212]">
        <div className="p-4 bg-[#93000a]/20 border border-[#93000a] text-[#ffdad6] rounded-md text-sm">
          Erro ao carregar tarefas: {pessoalError.message}
        </div>
      </div>
    );
  }

  // 2. Servidor tasks (Somente João)
  let servidorTasks: any[] = [];
  let servidorEvents: any[] = [];
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

  // 3. LabDiv tasks (João ou Andy)
  let labdivTasks: any[] = [];
  let labdivEvents: any[] = [];
  if (user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' || user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386') {
    const { data: lTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('dimensao', 'HUB')
      .or('is_personal.is.null,is_personal.eq.false')
      .order('created_at', { ascending: false });
    labdivTasks = lTasks || [];

    const { data: lEvents } = await supabase
      .from('events')
      .select('*')
      .eq('is_labdiv', true)
      .order('created_at', { ascending: false });
    labdivEvents = lEvents || [];
  }

  const columns = await getTaskColumns();
  const profile = await getUserProfile();

  return (
    <Suspense fallback={<div className="h-full bg-[#121212] flex items-center justify-center text-white">Carregando painel...</div>}>
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
      />
    </Suspense>
  );
}

