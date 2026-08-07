import { createClient } from '@/utils/supabase/server';
import { getUserProfile } from '@/app/(dashboard)/actions';
import { redirect } from 'next/navigation';
import AdvancedConfigClient from '@/app/configuracoes-avancadas/AdvancedConfigClient';

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

  // Get current columns to populate tags
  const { data: colsData } = await supabase.from('task_columns').select('*');
  const cols = colsData || [];
  
  const statusCol = cols.find(c => c.key === 'status');
  const prioridadeCol = cols.find(c => c.key === 'prioridade');
  const categoriaCol = cols.find(c => c.key === 'categoria');

  const availableStatuses = statusCol?.options?.map((o: any) => o.value) || ['completa', 'não iniciada', 'em andamento'];
  const availablePriorities = prioridadeCol?.options?.map((o: any) => o.value) || ['Baixa', 'Média', 'Alta'];
  const availableCategories = categoriaCol?.options?.map((o: any) => o.value) || ['Trabalho', 'Estudo', 'Pessoal'];

  const currentAdvancedConfig = profile.features_config?.advanced_settings || {
    enable_subtasks: true,
    enable_workspaces: true,
    sync_curriculum_photo: true,
    completion_statuses: ['completa', 'concluída'],
    auto_fill_dimension: true,
    pre_fill_defaults: false,
    default_task_values: {},
    default_display_mode: 'tarefas',
    default_view_mode: 'list',
    start_in_daily_followup: false,
    show_quick_links: true,
    show_quick_filters: true,
    auto_complete_parent: true,
    auto_complete_subtasks: false,
    inherit_parent_attributes: true,
    prevent_parent_completion_if_subtasks_pending: false,
    auto_expand_descriptions: false,
    pin_favorites_to_top: false,
    enable_badge_quick_edit: true,
    show_export_buttons: true,
    confirm_on_delete: true,
    soft_delete_to_discarded: false
  };

  return (
    <main className="min-h-full bg-[#121212] p-4 md:p-8">
      <AdvancedConfigClient 
        initialConfig={currentAdvancedConfig}
        availableStatuses={availableStatuses}
        availablePriorities={availablePriorities}
        availableCategories={availableCategories}
        userEmail={user.email || ''}
      />
    </main>
  );
}
