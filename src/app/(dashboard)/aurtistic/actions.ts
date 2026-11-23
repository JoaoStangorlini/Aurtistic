// Este programa é um software livre (Licença AGPLv3)
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { performLogin, performSignup } from '@/lib/auth-actions-core';
import { normalizeAuthIdentifier } from '@/lib/auth-identifier';

export async function loginAurtistic(formData: FormData) {
  return performLogin(formData, {
    defaultRedirect: '/aurtistic',
    revalidateTarget: '/aurtistic',
  });
}

export async function signupAurtistic(formData: FormData) {
  return performSignup(formData, {
    defaultRedirect: '/aurtistic',
    revalidateTarget: '/aurtistic',
  });
}

export async function logoutAurtistic() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function deleteAurtisticProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const { error: tasksError } = await supabase
    .from('tasks')
    .delete()
    .eq('user_id', user.id);

  if (tasksError) throw new Error('Erro ao apagar tarefas: ' + tasksError.message);

  const { error: profileError } = await supabase
    .from('user_profiles')
    .delete()
    .eq('id', user.id);

  if (profileError) throw new Error('Erro ao apagar perfil: ' + profileError.message);

  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function deleteAllTasks() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const { error: tasksError } = await supabase
    .from('tasks')
    .delete()
    .eq('user_id', user.id);

  if (tasksError) throw new Error('Erro ao apagar tarefas: ' + tasksError.message);

  revalidatePath('/aurtistic');
}

export async function checkAurtisticUser(username: string): Promise<boolean> {
  const parsed = normalizeAuthIdentifier(username, { strictUsername: false });
  if (!parsed.ok) return false;

  const adminClient = createAdminClient();
  if (!adminClient) return false;

  const { data, error } = await adminClient.rpc('check_auth_identifier_exists', {
    p_identifier: parsed.email,
  });
  if (error) {
    console.error('Erro ao verificar usuário:', error.message || error);
    return false;
  }
  return Boolean(data);
}
