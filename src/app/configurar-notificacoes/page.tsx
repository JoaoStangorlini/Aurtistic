// Este programa é um software livre (Licença AGPLv3)
import { createClient } from '@/utils/supabase/server';
import { getUserProfile } from '@/app/(dashboard)/actions';
import { redirect } from 'next/navigation';
import NotificationsConfigClient from './NotificationsConfigClient';

export const dynamic = 'force-dynamic';

export default async function ConfigurarNotificacoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getUserProfile();
  
  if (!profile) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-app text-fg">
        Perfil não encontrado.
      </div>
    );
  }

  // Extrair config ou padrão
  const currentNotificationsConfig = profile.features_config?.notifications || {
    enabled: true,
    only_before_deadline: true,
    daily_reminders: false,
    reminder_time: "09:00",
    muted_task_ids: []
  };

  // Buscar tarefas visíveis para o usuário (mesma lógica do dashboard principal)
  let query = supabase.from('tasks').select('*');
  if (user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {
    query = query.or(`user_id.eq.${user.id},is_personal.is.null,is_personal.eq.false`);
  } else if (user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386') {
    query = query.or(`user_id.eq.${user.id},and(dimensao.eq.HUB,or(is_personal.is.null,is_personal.eq.false))`);
  } else {
    query = query.eq('is_personal', true).eq('user_id', user.id);
  }
  
  const { data: tasksData } = await query;
  const userTasks = tasksData || [];

  return (
    <div className="min-h-full bg-app text-fg p-4 md:p-8">
      <div className="max-w-2xl mx-auto mt-12">
        <h1 className="text-3xl font-bold text-[#FFCC00] mb-2 flex items-center gap-3">
          <span className="material-symbols-outlined text-[32px]">notifications_active</span>
          Configurar Notificações
        </h1>
        <p className="text-fg-secondary mb-8">
          Personalize como e quando você quer ser alertado sobre os prazos das suas tarefas.
        </p>

        <NotificationsConfigClient 
          initialConfig={currentNotificationsConfig} 
          userId={user.id}
          tasks={userTasks}
        />
      </div>
    </div>
  );
}
