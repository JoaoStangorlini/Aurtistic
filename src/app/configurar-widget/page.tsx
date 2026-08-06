// Este programa é um software livre (Licença AGPLv3)
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import WidgetConfigClient from './WidgetConfigClient';

export const dynamic = 'force-dynamic';

export default async function ConfigurarWidgetPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/aurtistic/login');
  }

  // Buscar todas as tarefas do usuário para o gerenciador de visibilidade do Widget
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .or(`user_id.eq.${user.id},is_personal.eq.true`)
    .order('created_at', { ascending: false });

  return (
    <main className="min-h-full bg-[#121212] p-4 md:p-8">
      <WidgetConfigClient 
        userId={user.id} 
        tasks={tasks || []} 
      />
    </main>
  );
}
