'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export async function loginAurtistic(formData: FormData) {
  const supabase = await createClient();

  const rawInput = (formData.get('username') as string)?.trim() || '';
  const password = formData.get('password') as string;
  
  let email = '';

  if (rawInput.includes('@')) {
    // Se o usuário digitou um email (ex: admin), usamos diretamente
    email = rawInput;
  } else {
    // Transformar usuário em email falso para o Supabase (sanitizado)
    const sanitizedUsername = rawInput
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase();
      
    if (!sanitizedUsername) {
      redirect(`/aurtistic/login?error=${encodeURIComponent('Usuário inválido.')}`);
    }

    email = `${sanitizedUsername}@aurtistic.local`;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/aurtistic/login?error=${encodeURIComponent('Credenciais inválidas')}`);
  }

  revalidatePath('/aurtistic', 'layout');
  redirect('/aurtistic');
}

export async function signupAurtistic(formData: FormData) {
  const supabase = await createClient();

  const username = (formData.get('username') as string)?.trim() || '';
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (password !== confirmPassword) {
    redirect(`/aurtistic/login?error=${encodeURIComponent('As senhas não coincidem.')}`);
  }

  // Transformar usuário em email falso para o Supabase (sanitizado)
  const sanitizedUsername = username
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
    
  if (!sanitizedUsername) {
    redirect(`/aurtistic/login?error=${encodeURIComponent('Usuário inválido. Use apenas letras e números.')}`);
  }

  const email = `${sanitizedUsername}@aurtistic.local`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: username,
        username: username,
      }
    }
  });

  if (error) {
    redirect(`/aurtistic/login?error=${encodeURIComponent('Erro ao criar conta: ' + error.message)}`);
  }

  // Ensure user_profile exists if sign up is confirmed directly
  if (data?.user) {
    const newProfile = { id: data.user.id, quick_links: [], quick_filters: ['responsavel', 'dimensao'] };
    await supabase.from('user_profiles').insert(newProfile);
  }

  revalidatePath('/aurtistic', 'layout');
  redirect('/aurtistic');
}

export async function logoutAurtistic() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/aurtistic/login');
}

export async function deleteAurtisticProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  // Deletar todas as tarefas do usuário logado
  const { error: tasksError } = await supabase
    .from('tasks')
    .delete()
    .eq('user_id', user.id);

  if (tasksError) throw new Error("Erro ao apagar tarefas: " + tasksError.message);

  // Deletar o perfil do usuário
  const { error: profileError } = await supabase
    .from('user_profiles')
    .delete()
    .eq('id', user.id);

  if (profileError) throw new Error("Erro ao apagar perfil: " + profileError.message);

  // Fazer logout para encerrar a sessão já que o auth.users a princípio não podemos deletar sem master key
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/aurtistic/login');
}

export async function deleteAllTasks() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  // Deletar todas as tarefas do usuário logado
  const { error: tasksError } = await supabase
    .from('tasks')
    .delete()
    .eq('user_id', user.id);

  if (tasksError) throw new Error("Erro ao apagar tarefas: " + tasksError.message);

  revalidatePath('/aurtistic');
}

export async function checkAurtisticUser(username: string) {
  const supabase = await createClient();
  const rawInput = username.trim();
  
  let email = '';
  if (rawInput.includes('@')) {
    email = rawInput;
  } else {
    const sanitizedUsername = rawInput
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase();
      
    if (!sanitizedUsername) return false;
    email = `${sanitizedUsername}@aurtistic.local`;
  }
  
  const { data, error } = await supabase.rpc('check_user_exists', { lookup_email: email });
  if (error) {
    console.error("Erro ao verificar usuario", error);
    return false;
  }
  return !!data;
}
