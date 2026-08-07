import { createClient } from '@/utils/supabase/server';
import { getUserProfile } from '@/app/(dashboard)/actions';
import { redirect } from 'next/navigation';
import AdvancedConfigClient from './AdvancedConfigClient';

export const dynamic = 'force-dynamic';

export default async function ConfiguracoesAvancadasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/aurtistic/login');
  }

  const profile = await getUserProfile();
  
  if (!profile) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-[#121212] text-white">
        Perfil não encontrado.
      </div>
    );
  }

  // Get current statuses to populate tags
  const { data: cols } = await supabase.from('task_columns').select('*').eq('key', 'status').single();
  const availableStatuses = cols?.options?.map((o: any) => o.value) || ['completa', 'não iniciada', 'em andamento'];

  const currentAdvancedConfig = profile.features_config?.advanced_settings || {
    enable_subtasks: true,
    enable_workspaces: true,
    enable_admin_filters: true,
    sync_curriculum_photo: true,
    completion_statuses: ['completa', 'concluída']
  };

  return (
    <main className="min-h-full bg-[#121212] p-4 md:p-8">
      <AdvancedConfigClient 
        initialConfig={currentAdvancedConfig}
        availableStatuses={availableStatuses}
        userEmail={user.email || ''}
      />
    </main>
  );
}
