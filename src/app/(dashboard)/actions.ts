'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { Task, TaskColumn, AgendaEvent } from '@/types';

export async function updateTaskOrders(updates: { id: string, ordem_manual: number }[]) {
  const supabase = await createClient();
  
  // Executar os updates individualmente
  for (const update of updates) {
    const { error } = await supabase
      .from('tasks')
      .update({ ordem_manual: update.ordem_manual })
      .eq('id', update.id);
      
    if (error) {
      console.error("Erro ao atualizar ordem:", error);
      throw new Error(error.message);
    }
  }
}

export async function saveTask(taskData: Partial<Task>) {
  const supabase = await createClient();

  const { data: { user: actionUser } } = await supabase.auth.getUser();
  
  // Buscar configuração avançada para status de conclusão
  let completionStatuses = ['completa', 'concluída', 'concluida'];
  if (actionUser) {
    const { data: profile } = await supabase.from('user_profiles').select('features_config').eq('id', actionUser.id).single();
    if (profile?.features_config?.advanced_settings?.completion_statuses) {
      completionStatuses = profile.features_config.advanced_settings.completion_statuses.map((s: string) => s.toLowerCase());
    }
  }

  // Se a tarefa foi marcada como completa e tem "frequencia", empurra para a frente
  let dataToSave = { ...taskData };
  const currentStatusLower = (dataToSave.status || '').toLowerCase();
  const isCompleted = completionStatuses.includes(currentStatusLower);
  
  if (isCompleted && dataToSave.frequencia) {
    const freq = dataToSave.frequencia.toLowerCase();
    let daysToAdd = 0;
    
    if (freq.includes('diária') || freq.includes('diaria') || freq.includes('dia')) daysToAdd = 1;
    else if (freq.includes('semanal') || freq.includes('semana')) daysToAdd = 7;
    else if (freq.includes('quinzenal') || freq.includes('quinzena')) daysToAdd = 15;
    else if (freq.includes('mensal') || freq.includes('mês') || freq.includes('mes')) daysToAdd = 30;
    else if (freq.includes('anual') || freq.includes('ano')) daysToAdd = 365;
    
    if (daysToAdd > 0) {
      if (dataToSave.prazo) {
        const p = new Date(dataToSave.prazo);
        p.setDate(p.getDate() + daysToAdd);
        dataToSave.prazo = p.toISOString();
      }
      if (dataToSave.inicio) {
        const i = new Date(dataToSave.inicio);
        i.setDate(i.getDate() + daysToAdd);
        dataToSave.inicio = i.toISOString();
      }
      dataToSave.status = 'não iniciada'; // Reseta o status
      dataToSave.concluida_em = null;
    }
  } else if (isCompleted) {
    // Se marcou como completa e não é recorrente (ou não tem frequencia)
    dataToSave.concluida_em = new Date().toISOString();
  } else {
    // Se mudou para qualquer outro status, remove a data de conclusão
    dataToSave.concluida_em = null;
  }

  // Remove empty strings and replace with null for database consistency
  Object.keys(dataToSave).forEach(key => {
    if (dataToSave[key as keyof Task] === '') {
      (dataToSave as any)[key] = null;
    }
  });

  // user_id will be handled by RLS if possible, but let's grab it explicitly to be safe
  if (actionUser && !dataToSave.user_id) {
    dataToSave.user_id = actionUser.id;
  }

  if (dataToSave.id) {
    // Upsert existing or new task with specific ID (optimistic creation)
    const { data: originalTask } = await supabase.from('tasks').select('*').eq('id', dataToSave.id).single();

    const { error } = await supabase
      .from('tasks')
      .upsert(dataToSave, { onConflict: 'id' });

    if (error) throw new Error(error.message);

    // Propagate changes to child tasks
    if (originalTask) {
       const fieldsToPropagate: Partial<Task> = {};
       const propagateKeys = ['dimensao', 'categoria', 'prazo', 'responsavel', 'prioridade', 'status'];
       propagateKeys.forEach(k => {
          const newVal = (dataToSave as any)[k];
          const oldVal = (originalTask as any)[k];
          if (newVal !== undefined && newVal !== oldVal) {
              (fieldsToPropagate as any)[k] = newVal;
          }
       });
       
       if (fieldsToPropagate.status && completionStatuses.includes(fieldsToPropagate.status.toLowerCase())) fieldsToPropagate.concluida_em = dataToSave.concluida_em;
       if (fieldsToPropagate.status && !completionStatuses.includes(fieldsToPropagate.status.toLowerCase())) fieldsToPropagate.concluida_em = null;

       const customNew = JSON.stringify(dataToSave.custom_fields || {});
       const customOld = JSON.stringify(originalTask.custom_fields || {});
       if (customNew !== customOld && dataToSave.custom_fields !== undefined) {
           fieldsToPropagate.custom_fields = dataToSave.custom_fields;
       }

       if (Object.keys(fieldsToPropagate).length > 0) {
           await supabase.from('tasks').update(fieldsToPropagate).eq('parent_id', dataToSave.id);
       }
    }
  } else {
    // Insert new task without ID
    const { error } = await supabase
      .from('tasks')
      .insert([dataToSave]);

    if (error) throw new Error(error.message);
  }

  revalidatePath('/labdiv');
  revalidatePath('/servidor');
}

export async function deleteTask(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  
  revalidatePath('/labdiv');
  revalidatePath('/servidor');
}

export async function updateMultipleTasks(taskIds: string[], updates: Partial<Task>) {
  const supabase = await createClient();

  // Remove empty strings and replace with null for database consistency
  const dataToSave = { ...updates };
  Object.keys(dataToSave).forEach(key => {
    if (dataToSave[key as keyof Task] === '') {
      (dataToSave as any)[key] = null;
    }
  });

  const { data: { user: multiUser } } = await supabase.auth.getUser();
  let completionStatuses = ['completa', 'concluída', 'concluida'];
  if (multiUser) {
    const { data: profile } = await supabase.from('user_profiles').select('features_config').eq('id', multiUser.id).single();
    if (profile?.features_config?.advanced_settings?.completion_statuses) {
      completionStatuses = profile.features_config.advanced_settings.completion_statuses.map((s: string) => s.toLowerCase());
    }
  }

  const multiStatusLower = (dataToSave.status || '').toLowerCase();
  const multiIsCompleted = completionStatuses.includes(multiStatusLower);

  // Se marcou o status como "completa" na edição múltipla, vamos tratar o concluida_em simplificadamente.
  if (multiIsCompleted) {
    dataToSave.concluida_em = new Date().toISOString();
  } else if (dataToSave.status && !multiIsCompleted) {
    dataToSave.concluida_em = null;
  }

  const { error } = await supabase
    .from('tasks')
    .update(dataToSave)
    .in('id', taskIds);

  if (error) {
    console.error("Erro na edição em massa:", error);
    throw new Error(error.message);
  }

  // Propagate to subtasks
  await supabase
    .from('tasks')
    .update(dataToSave)
    .in('parent_id', taskIds);

  revalidatePath('/labdiv');
  revalidatePath('/servidor');
}

export async function deleteMultipleTasks(taskIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('tasks')
    .delete()
    .in('id', taskIds);

  if (error) {
    console.error("Erro na exclusão em massa:", error);
    throw new Error(error.message);
  }

  revalidatePath('/labdiv');
  revalidatePath('/servidor');
}

export async function getTaskColumns(): Promise<TaskColumn[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_columns')
    .select('*')
    .order('order_num', { ascending: true });

  if (error) {
    console.error("Erro ao carregar colunas:", error);
    return [];
  }
  return data || [];
}

export async function saveTaskColumn(column: TaskColumn) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('task_columns')
    .upsert({
      id: column.id,
      key: column.key,
      name: column.name,
      type: column.type,
      options: column.options,
      is_native: column.is_native,
      order_num: column.order_num
    });

  if (error) {
    console.error("Erro ao salvar coluna:", error);
    throw new Error(error.message);
  }
  
  revalidatePath('/servidor');
  revalidatePath('/labdiv');
  revalidatePath('/');
}

export async function updateOptionNameCascade(columnKey: string, isNative: boolean, oldVal: string, newVal: string) {
  const supabase = await createClient();
  
  if (isNative) {
     const { error } = await supabase
       .from('tasks')
       .update({ [columnKey]: newVal } as any)
       .eq(columnKey, oldVal);
     if (error) throw new Error(error.message);
  } else {
     const { data: tasks } = await supabase.from('tasks').select('id, custom_fields').contains('custom_fields', { [columnKey]: oldVal });
     if (tasks && tasks.length > 0) {
       for (const t of tasks) {
         const updatedFields = { ...t.custom_fields, [columnKey]: newVal };
         await supabase.from('tasks').update({ custom_fields: updatedFields }).eq('id', t.id);
       }
     }
  }
  
  revalidatePath('/');
}

export async function getUserProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching user profile:', error);
    return null;
  }

  const joaoCV = {
    name: 'João Paulo Stangorlini de Carvalho',
    role: 'Estudante de Física (USP) | Desenvolvedor | Fotógrafo | Educador | Designer',
    phone: '(11) 967840-1823',
    email: 'joaopaulostangorlini@usp.br',
    address: 'Rua Arthur Soter Lopes da Silva, 88',
    github: '/JoaoStangorlini',
    summary: 'Estudante de Física no Instituto de Física (USP - Butantã) com perfil voltado à tecnologia e educação. Experiência prática em desenvolvimento Web (PWA), design (web e gráfico), otimização, manutenção e montagem de hardware de alta performance, sala de aula e monitorias em ambientes de difusão científica/inovação. Experiência básica de cálculo e execução de instalações elétricas (residenciais).',
    experiences: [
      {
        role: 'Monitor de Inovação e Tecnologias Imersivas',
        company: 'DigiLab (Inova USP)',
        period: '2025 - Presente',
        bullets: [
          'Operação e Suporte em VR/AR: Mediação técnica em experiências de Realidade Virtual e Aumentada.',
          'Troubleshooting em Tempo Real: Resolução de falhas de hardware e software sob pressão durante eventos.',
          'Estudo de Sistemas Imersivos: Pesquisa sobre o funcionamento físico e técnico de dispositivos de VR.',
          'Atendimento Bilíngue: Suporte técnico e conversação em Inglês para visitantes.'
        ]
      },
      {
        role: 'Monitor de Difusão Científica',
        company: 'Parque CienTec – USP',
        period: '2024 - 2025',
        bullets: [
          'Comunicação científica e mediação de experimentos de Física e Astronomia.',
          'Adaptação de conceitos complexos para diversos níveis de público.',
          'Desenvolvimento de planos de aulas e planejamento de possíveis novas atividades.'
        ]
      }
    ],
    education: [
      {
        institution: 'Instituto de Física da Universidade de São Paulo (USP)',
        period: '2024 - 2029',
        degree: 'Licenciatura em Física (em andamento)',
        bullets: [
          'Bolsista PAPFE (apoio à permanência e formação estudantil).',
          'Bolsista PUB (Programa Unificado de Bolsas) – Atuação no parque de Ciências e tecnologia USP Cientec.',
          'Projetos AEX (Apoio à Extensão): Atuação no Digital Lab / Inova USP e palestrante no programa "De Volta à Escola | Eu na USP".'
        ]
      }
    ],
    skills: ['HTML5', 'CSS3', 'JavaScript', 'TypeScript', 'React.js', 'Next.js', 'SQL', 'Git & GitHub', 'Física Geral', 'Design Gráfico', 'Montagem de Hardware', 'Inglês Intermediário']
  };

  const joaoResumo = {
    tagline: 'FOTÓGRAFO & DEV & FÍSICO',
    title: 'JOÃO PAULO STANGORLINI',
    subtitle: 'Focando em pesquisa científica, desenvolvimento full-stack e organização acadêmica através do Aurtistic.',
    button1_text: 'Agendar Reunião',
    button1_url: 'https://calendar.app.google/tELr1q8ky4G98EL58',
    button2_text: 'Ver GitHub',
    button2_url: 'https://github.com/JoaoStangorlini',
    profile_image_url: '/perfil.jpeg',
    description: 'Estudante de Física no Instituto de Física (USP - Butantã) com perfil voltado à tecnologia e educação. Experiência prática em desenvolvimento Web (PWA), design (web e gráfico), otimização, manutenção e montagem de hardware de alta performance.'
  };

  const joaoPortfolio = [
    {
      title: 'HUB LabDiv',
      description: 'Plataforma completa de comunicação e difusão científica do IFUSP, com fluxo de informações e artes integradas.',
      link: 'https://hub-lab-div.vercel.app',
      tags: ['PWA', 'Next.js', 'Supabase', 'TailwindCSS'],
      image_url: '/labdiv-logo.png'
    },
    {
      title: 'Aurtistic',
      description: 'Um gerenciador pessoal completo de tarefas e rotinas acadêmicas, focado em organização e produtividade sem distrações.',
      link: '/aurtistic',
      tags: ['SaaS', 'Capacitor', 'Supabase', 'React'],
      image_url: '/aurtistic-icon.png'
    }
  ];

  const defaultUsername = user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' 
    ? 'joao' 
    : (user.email ? user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '') : 'user');

  if (!data) {
    // Create one if it doesn't exist
    const newProfile = { 
      id: user.id, 
      quick_links: user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? [] : [
        { name: "Google", href: "https://www.google.com" },
        { name: "YouTube", href: "https://www.youtube.com" },
        { name: "ChatGPT", href: "https://chat.openai.com" }
      ], 
      quick_filters: ['responsavel', 'dimensao'], 
      quick_sorts: ['status', 'prazo', 'prioridade', 'manual'],
      features_config: {
        active: user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' 
          ? ["tasks", "resumo", "curriculo", "portfolio"] 
          : ["tasks"],
        order: ["tasks", "resumo", "curriculo", "portfolio"],
        layout_style: "default"
      },
      resumo: user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? JSON.stringify(joaoResumo) : null,
      curriculo: user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? joaoCV : [],
      portfolio: user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? joaoPortfolio : [],
      username: defaultUsername
    };
    await supabase.from('user_profiles').insert(newProfile);
    return newProfile;
  }

  // Generate username for existing user if they don't have one
  if (!data.username) {
    try {
      await supabase.from('user_profiles').update({ username: defaultUsername }).eq('id', user.id);
      data.username = defaultUsername;
    } catch(err) {
      console.error("Error setting username:", err);
    }
  }

  // Se já existe mas está sem as informações do João (ex: acabaram de rodar a migração e colunas estão nulas)
  if (data && user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {
    let updated = false;
    const updates: any = {};
    if (!data.curriculo || (Array.isArray(data.curriculo) && data.curriculo.length === 0)) {
      updates.curriculo = joaoCV;
      data.curriculo = joaoCV;
      updated = true;
    }
    if (!data.resumo) {
      const str = JSON.stringify(joaoResumo);
      updates.resumo = str;
      data.resumo = str;
      updated = true;
    }
    if (!data.portfolio || (Array.isArray(data.portfolio) && data.portfolio.length === 0)) {
      updates.portfolio = joaoPortfolio;
      data.portfolio = joaoPortfolio;
      updated = true;
    }
    if (updated) {
      await supabase.from('user_profiles').update(updates).eq('id', user.id);
    }
  }

  return data;
}

export async function saveQuickLinks(links: any[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase
    .from('user_profiles')
    .update({ quick_links: links })
    .eq('id', user.id);

  if (error) throw new Error(error.message);
  
  revalidatePath('/aurtistic');
}

export async function saveQuickPreferences(quickFilters: string[], quickSorts: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: user.id, quick_filters: quickFilters, quick_sorts: quickSorts });

  if (error) {
    console.error("Erro ao salvar quick preferences:", error);
    throw new Error(error.message);
  }

  revalidatePath('/labdiv');
  revalidatePath('/servidor');
  revalidatePath('/aurtistic');
  revalidatePath('/tarefas');
  revalidatePath('/');
}

export async function saveUserProfileData(profileData: {
  resumo?: string | null;
  curriculo?: any;
  portfolio?: any;
  features_config?: any;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase
    .from('user_profiles')
    .update(profileData)
    .eq('id', user.id);

  if (error) {
    console.error("Erro ao salvar perfil do usuário:", error);
    throw new Error(error.message);
  }

  revalidatePath('/aurtistic');
  revalidatePath('/');
}

export async function updateNotificationConfig(notificationsConfig: any) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  // Fetch current config to merge
  const { data: profile, error: fetchError } = await supabase
    .from('user_profiles')
    .select('features_config')
    .eq('id', user.id)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const currentFeaturesConfig = profile?.features_config || {};
  
  const updatedFeaturesConfig = {
    ...currentFeaturesConfig,
    notifications: notificationsConfig
  };

  const { error } = await supabase
    .from('user_profiles')
    .update({ features_config: updatedFeaturesConfig })
    .eq('id', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/configurar-notificacoes');
  revalidatePath('/aurtistic');
}

// ----------------------------------------------------------------------
// EVENTOS (AGENDA) ACTIONS
// ----------------------------------------------------------------------

export async function createEvent(eventData: Partial<AgendaEvent>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase.from('events').insert([
    {
      ...eventData,
      user_id: user.id
    }
  ]);

  if (error) {
    console.error("Erro ao criar evento:", error);
    throw new Error(error.message);
  }

  revalidatePath('/servidor');
}

export async function createEventsBatch(eventsData: Partial<AgendaEvent>[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const records = eventsData.map(ev => ({
    ...ev,
    user_id: user.id
  }));

  const { error } = await supabase.from('events').insert(records);

  if (error) {
    console.error("Erro ao criar batch de eventos:", error);
    throw new Error(error.message);
  }

  revalidatePath('/');
  revalidatePath('/aurtistic');
  revalidatePath('/labdiv');
  revalidatePath('/servidor');
}

export async function updateEvent(eventId: string, eventData: Partial<AgendaEvent>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase
    .from('events')
    .update(eventData)
    .eq('id', eventId)
    .eq('user_id', user.id); // garantindo RLS adicionalmente

  if (error) {
    console.error("Erro ao atualizar evento:", error);
    throw new Error(error.message);
  }

  revalidatePath('/');
  revalidatePath('/aurtistic');
  revalidatePath('/labdiv');
  revalidatePath('/servidor');
}

export async function deleteEvent(eventId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .eq('user_id', user.id);

  if (error) {
    console.error("Erro ao deletar evento:", error);
    throw new Error(error.message);
  }

  revalidatePath('/');
  revalidatePath('/aurtistic');
  revalidatePath('/labdiv');
  revalidatePath('/servidor');
}

export async function updateAdvancedConfig(advancedSettings: any) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase.from('user_profiles').select('features_config').eq('id', user.id).single();
  const features_config = profile?.features_config || {};
  
  features_config.advanced_settings = advancedSettings;

  const { error } = await supabase.from('user_profiles').update({ features_config }).eq('id', user.id);
  if (error) throw new Error(error.message);
}
