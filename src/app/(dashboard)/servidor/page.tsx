import { createClient } from '@/utils/supabase/server';
import { TasksView } from '@/components/dashboard/TasksView';
import { QuickLinks } from '@/components/dashboard/QuickLinks';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getTaskColumns, getUserProfile } from '@/app/(dashboard)/actions';

export const dynamic = 'force-dynamic';

export default async function ServidorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/servidor');
  }

  // Verifica permissão (Somente João)
  if (user.id !== 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {
    return (
      <div className="flex-1 bg-[#121212] flex flex-col items-center justify-center p-8 h-screen text-center">
        <span className="material-symbols-outlined text-[64px] text-[#F14343] mb-4">block</span>
        <h1 className="text-3xl font-black text-white font-['Bukra'] tracking-tighter mb-2">ACESSO NEGADO</h1>
        <p className="text-[#A0A0A0]">Seu nível de acesso não permite visualizar o painel do servidor.</p>
        <a href="/" className="mt-8 px-6 py-2 bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white rounded-md transition-colors font-bold text-sm">
          Voltar para Home
        </a>
      </div>
    );
  }
  
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
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
        <h1 className="text-2xl font-bold text-[#e5e2e1]">Servidor Geral</h1>
        <p className="text-sm text-[#8E8E8E] mt-1 mb-4">Visão global de todas as tarefas e dimensões</p>
        <QuickLinks />
      </div>

      <div>
        <TasksView initialTasks={tasks || []} initialColumns={columns} initialQuickFilters={profile?.quick_filters || ['responsavel', 'dimensao']} initialQuickSorts={profile?.quick_sorts || ['status', 'prazo', 'prioridade', 'manual']} advancedSettings={profile?.features_config?.advanced_settings || {}} />
      </div>
    </div>
  );
}
