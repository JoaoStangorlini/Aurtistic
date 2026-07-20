// Este programa é um software livre (Licença AGPLv3)
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
    redirect('/login');
  }

  // 1. Pessoal tasks
  const { data: pessoalTasks, error: pessoalError } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_personal', true)
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
  if (user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .or('is_personal.is.null,is_personal.eq.false')
      .order('created_at', { ascending: false });
    servidorTasks = data || [];
  }

  // 3. LabDiv tasks (João ou Andy)
  let labdivTasks: any[] = [];
  if (user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' || user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386') {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('dimensao', 'HUB')
      .or('is_personal.is.null,is_personal.eq.false')
      .order('created_at', { ascending: false });
    labdivTasks = data || [];
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
        columns={columns}
        userId={user.id}
      />
    </Suspense>
  );
}
