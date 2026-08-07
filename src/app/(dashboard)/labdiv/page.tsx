import { createClient } from '@/utils/supabase/server';
import { TasksView } from '@/components/dashboard/TasksView';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getTaskColumns, getUserProfile } from '@/app/(dashboard)/actions';

export const dynamic = 'force-dynamic';

export default async function LabDivPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/labdiv');
  }

  // Verifica permissão (João ou Andy)
  if (user.id !== 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' && user.id !== '7dcfe172-1cf0-4389-9abd-f340b1408386') {
    redirect('/');
  }

  // Apenas as tarefas públicas (is_personal = false ou nulo) da dimensão HUB
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('dimensao', 'HUB')
    .or('is_personal.is.null,is_personal.eq.false')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="h-full flex flex-col p-4 md:p-8 bg-[#121212]">
        <div className="p-4 bg-[#93000a]/20 border border-[#93000a] text-[#ffdad6] rounded-md text-sm">
          Erro ao carregar tarefas: {error.message}
        </div>
      </div>
    );
  }

  const columns = await getTaskColumns();
  const profile = await getUserProfile();

  return (
    <div className="min-h-full flex flex-col p-4 md:p-8 bg-[#121212]">
      <div className="mb-4 md:mb-6 shrink-0">
        <h1 className="text-2xl font-bold text-[#e5e2e1]">Tarefas</h1>
        <p className="text-sm text-[#8E8E8E] mt-1">Gerencie e visualize as tarefas e suas prioridades.</p>
      </div>

      <div>
        <TasksView initialTasks={tasks || []} initialColumns={columns} initialQuickFilters={profile?.quick_filters || ['responsavel', 'dimensao']} initialQuickSorts={profile?.quick_sorts || ['status', 'prazo', 'prioridade', 'manual']} advancedSettings={profile?.features_config?.advanced_settings || {}} />
      </div>
    </div>
  );
}
