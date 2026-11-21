// Este programa é um software livre (Licença AGPLv3)
'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { Task, TaskColumn, AgendaEvent } from '@/types';
import {
  signEdgeTenantTicket,
  PRIMARY_ADMIN_UUID,
  getEdgeStorageServerUrl,
  resolveEdgeHmacSecret,
} from '@/lib/edge-ticket';
import { buildTenantZipUrl } from '@/lib/edge-urls';

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

    if (error) {
      if ((error as any).code === '23503' && dataToSave.organization_id) {
        console.warn('saveTask upsert: foreign key constraint on organization_id failed, retrying with organization_id = null');
        const fallbackData = { ...dataToSave, organization_id: null };
        const { error: retryError } = await supabase.from('tasks').upsert(fallbackData, { onConflict: 'id' });
        if (retryError) throw new Error(retryError.message);
      } else {
        throw new Error(error.message);
      }
    }

    // Propagate changes to child tasks
    if (originalTask) {
       const fieldsToPropagate: Partial<Task> = {};
       // 'status' e 'prazo' NÃO são propagados às subtarefas (preservam o checklist individual)
       const propagateKeys = ['dimensao', 'categoria', 'prioridade'];
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

       // `responsavel` só é propagado para subtarefas SEM delegação própria
       // (nunca sobrescreve responsavel/subteam_id/assigned_* de subtarefas já delegadas).
       if (dataToSave.responsavel !== undefined && dataToSave.responsavel !== originalTask.responsavel) {
           const { data: children } = await supabase
             .from('tasks')
             .select('id, subteam_id, assigned_subteam_ids, assigned_member_ids')
             .eq('parent_id', dataToSave.id);
           const undelegatedIds = (children || [])
             .filter((c: any) => !c.subteam_id && !(c.assigned_subteam_ids?.length) && !(c.assigned_member_ids?.length))
             .map((c: any) => c.id);
           if (undelegatedIds.length > 0) {
               await supabase.from('tasks').update({ responsavel: dataToSave.responsavel }).in('id', undelegatedIds);
           }
       }

       // `prazo` só é propagado para subtarefas que ainda não têm prazo próprio
       if (dataToSave.prazo !== undefined && dataToSave.prazo !== originalTask.prazo && dataToSave.prazo) {
           await supabase.from('tasks').update({ prazo: dataToSave.prazo }).eq('parent_id', dataToSave.id).is('prazo', null);
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

    if (error) {
      if ((error as any).code === '23503' && dataToSave.organization_id) {
        console.warn('saveTask insert: foreign key constraint on organization_id failed, retrying with organization_id = null');
        const fallbackData = { ...dataToSave, organization_id: null };
        const { error: retryError } = await supabase.from('tasks').insert([fallbackData]);
        if (retryError) throw new Error(retryError.message);
      } else {
        throw new Error(error.message);
      }
    }
  }

  revalidatePath('/labdiv');
  revalidatePath('/servidor');
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveSubteams(t: Partial<Task>): string[] {
  const list = Array.isArray(t.assigned_subteam_ids)
    ? t.assigned_subteam_ids
    : (t.subteam_id ? [t.subteam_id] : []);
  return list.filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id));
}

function resolveMembers(t: Partial<Task>): string[] {
  return (Array.isArray(t.assigned_member_ids) ? t.assigned_member_ids : [])
    .filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id));
}

export async function saveTaskWithSubtasksAction(parentTask: Partial<Task>, subtasks: Partial<Task>[]) {
  const supabase = await createClient();
  const { data: { user: actionUser } } = await supabase.auth.getUser();
  if (!actionUser) throw new Error('Unauthorized');

  const parentId = parentTask.id && UUID_REGEX.test(parentTask.id) ? parentTask.id : crypto.randomUUID();
  const parentSubteams = resolveSubteams(parentTask);

  // 1. Salva a tarefa-mãe (reaproveita regras de recorrência/conclusão do saveTask)
  await saveTask({
    ...parentTask,
    id: parentId,
    assigned_subteam_ids: parentSubteams,
    subteam_id: parentSubteams[0] ?? null,
    assigned_member_ids: resolveMembers(parentTask),
  });

  // 2. UUIDs definitivos + payload ordenado
  const subtasksPayload = subtasks
    .filter((st) => (st.nome || '').trim().length > 0)
    .map((st, idx) => {
      const resolvedSubteams = resolveSubteams(st);
      return {
        id: st.id && UUID_REGEX.test(st.id) ? st.id : crypto.randomUUID(),
        parent_id: parentId,
        user_id: parentTask.user_id || actionUser.id,
        organization_id: parentTask.organization_id || null,
        is_personal: parentTask.is_personal ?? false,
        nome: (st.nome || '').trim(),
        status: st.status || 'não iniciada',
        ordem_manual: idx,
        subteam_id: resolvedSubteams[0] ?? null,
        assigned_subteam_ids: resolvedSubteams,
        assigned_member_ids: resolveMembers(st),
        responsavel: st.responsavel ?? null,
        prazo: st.prazo || parentTask.prazo || null,
        prioridade: st.prioridade || parentTask.prioridade || 'Baixa',
        dimensao: parentTask.dimensao || 'HUB',
        categoria: parentTask.categoria || null,
      };
    });

  if (subtasksPayload.length > 0) {
    const { error: upsertError } = await supabase.from('tasks').upsert(subtasksPayload, { onConflict: 'id' });
    if (upsertError) {
      if ((upsertError as any).code === '23503') {
        console.warn('saveTaskWithSubtasksAction: foreign key constraint failed on subtasks, retrying with organization_id = null');
        const fallbackSubtasks = subtasksPayload.map((s) => ({ ...s, organization_id: null }));
        const { error: retryError } = await supabase.from('tasks').upsert(fallbackSubtasks, { onConflict: 'id' });
        if (retryError) throw new Error(retryError.message);
      } else {
        throw new Error(upsertError.message);
      }
    }
  }

  // 3. Remove subtarefas órfãs (removidas no modal)
  const keptIds = subtasksPayload.map((s) => s.id).filter((id) => UUID_REGEX.test(id));
  let deleteQuery = supabase.from('tasks').delete().eq('parent_id', parentId);
  if (keptIds.length > 0) {
    deleteQuery = deleteQuery.not('id', 'in', `(${keptIds.join(',')})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath('/labdiv');
  revalidatePath('/servidor');
  return { id: parentId };
}

export async function toggleSubtaskCompletionAction(subtaskId: string, completed: boolean) {
  if (!UUID_REGEX.test(subtaskId)) throw new Error('ID de subtarefa inválido');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('tasks')
    .update({
      status: completed ? 'completa' : 'não iniciada',
      concluida_em: completed ? new Date().toISOString() : null,
    })
    .eq('id', subtaskId)
    .not('parent_id', 'is', null);
  if (error) throw new Error(error.message);

  revalidatePath('/labdiv');
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
  delete (dataToSave as any).subtasks;
  delete (dataToSave as any).parent_task;
  delete (dataToSave as any).files;
  delete (dataToSave as any).checklist;

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
      image_url: '/icone-HUBLabDiv.svg'
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
    } else if (Array.isArray(data.portfolio)) {
      // Garante desinversão e integridade dos logos oficiais do portfólio
      let portfolioChanged = false;
      const fixedPortfolio = data.portfolio.map((proj: any) => {
        if (proj.title === 'HUB LabDiv' && proj.image_url !== '/icone-HUBLabDiv.svg') {
          portfolioChanged = true;
          return { ...proj, image_url: '/icone-HUBLabDiv.svg' };
        }
        return proj;
      });
      if (portfolioChanged) {
        updates.portfolio = fixedPortfolio;
        data.portfolio = fixedPortfolio;
        updated = true;
      }
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

  const { features_config, ...scalarFields } = profileData;

  if (Object.keys(scalarFields).length > 0) {
    const { error } = await supabase
      .from('user_profiles')
      .upsert({ id: user.id, ...scalarFields }, { onConflict: 'id' });

    if (error) {
      console.error("Erro ao salvar perfil do usuário:", error);
      throw new Error(error.message);
    }
  }

  if (features_config && typeof features_config === 'object') {
    await mergeUserFeaturesConfigServer(supabase, user.id, features_config);
  }

  revalidatePath('/aurtistic');
  revalidatePath('/');
}

async function mergeUserFeaturesConfigServer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  patch: Record<string, any>
) {
  const cleanPatch = { ...(patch || {}) };
  if (cleanPatch.hub_connection && typeof cleanPatch.hub_connection === 'object') {
    const { encrypted_link_secret: _omit, ...safeHub } = cleanPatch.hub_connection;
    cleanPatch.hub_connection = safeHub;
  }

  const { data, error } = await supabase.rpc('merge_user_features_config', {
    p_patch: cleanPatch,
  });

  if (!error) {
    return data || {};
  }

  // Fallback controlado caso Migration 14 ainda não tenha sido aplicada no Supabase
  if (error.code === '42883' || error.message?.includes('merge_user_features_config')) {
    console.warn('[Migration14 Pendente] merge_user_features_config ausente; aplicando fallback controlado.');
    const { data: profile, error: fetchErr } = await supabase
      .from('user_profiles')
      .select('features_config')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);

    const merged = {
      ...(profile?.features_config || {}),
      ...cleanPatch,
    };

    const { error: upsertErr } = await supabase
      .from('user_profiles')
      .upsert({ id: userId, features_config: merged }, { onConflict: 'id' });

    if (upsertErr) throw new Error(upsertErr.message);
    return merged;
  }

  throw new Error(error.message);
}

export async function updateNotificationConfig(notificationsConfig: any) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  await mergeUserFeaturesConfigServer(supabase, user.id, {
    notifications: notificationsConfig,
  });

  revalidatePath('/configurar-notificacoes');
  revalidatePath('/aurtistic');
  revalidatePath('/');
}

export async function savePortfolioLayoutOrderAction(input: {
  albumOrder?: string[];
  subfolderOrder?: Record<string, string[]>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Usuário não autenticado' };

  const patch: Record<string, any> = {};
  if (input.albumOrder) patch.portfolio_album_order = input.albumOrder;
  if (input.subfolderOrder) patch.portfolio_subfolder_order = input.subfolderOrder;

  try {
    await mergeUserFeaturesConfigServer(supabase, user.id, patch);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Falha ao salvar ordem do layout' };
  }
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

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('features_config')
    .eq('id', user.id)
    .maybeSingle();

  const existingAdvanced = (profile?.features_config?.advanced_settings || {}) as Record<string, any>;
  const fullAdvancedSettings = {
    ...existingAdvanced,
    ...(advancedSettings && typeof advancedSettings === 'object' ? advancedSettings : {}),
  };

  await mergeUserFeaturesConfigServer(supabase, user.id, {
    advanced_settings: fullAdvancedSettings,
  });

  revalidatePath('/configuracoes-avancadas');
  revalidatePath('/');
}

export async function updateThemePreferencesAction(theme: {
  mode: string;
  palette: string;
  overrideOrgTheme?: boolean;
}) {
  const validModes = new Set(['system', 'light', 'dark']);
  const validPalettes = new Set([
    'purple-gold',
    'blue-red',
    'pink-green',
    'cyan-amber',
    'emerald-violet',
    'labdiv',
    'show-da-fisica',
    'hs',
  ]);
  const safeMode = validModes.has(theme.mode) ? theme.mode : 'system';
  const safePalette = validPalettes.has(theme.palette) ? theme.palette : 'purple-gold';
  const safeOverride = Boolean(theme.overrideOrgTheme);

  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const cookieOpts = { path: '/', maxAge: 31536000, sameSite: 'lax' as const };
    cookieStore.set('aurtistic_mode', safeMode, cookieOpts);
    cookieStore.set('aurtistic_palette', safePalette, cookieOpts);
    cookieStore.set('aurtistic_override_org', safeOverride ? '1' : '0', cookieOpts);
  } catch {}

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado' };

  try {
    await mergeUserFeaturesConfigServer(supabase, user.id, {
      theme: {
        mode: safeMode,
        palette: safePalette,
        overrideOrgTheme: safeOverride,
        updated_at: new Date().toISOString(),
      },
    });
    return { ok: true };
  } catch (err: any) {
    console.error('Erro ao salvar tema do usuário:', err);
    return { ok: false, error: err?.message || 'Erro ao salvar tema' };
  }
}

export async function updateModulesConfigAction(modules: {
  tasks: boolean;
  selfCare: boolean;
  resumo: boolean;
  portfolio: boolean;
  curriculo: boolean;
  servidor: boolean;
  defaultRoute: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado' };

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('features_config')
      .eq('id', user.id)
      .maybeSingle();

    const existingModules = (profile?.features_config?.modules || {}) as Record<string, any>;

    await mergeUserFeaturesConfigServer(supabase, user.id, {
      modules: {
        ...existingModules,
        ...modules,
        updated_at: new Date().toISOString(),
      },
    });

    revalidatePath('/');
    return { ok: true };
  } catch (err: any) {
    console.error('Erro ao salvar configuração de módulos:', err);
    return { ok: false, error: err?.message || 'Erro ao salvar módulos' };
  }
}

/**
 * [CORREÇÃO ERRO 403 / A5]: Emite ticket de download autorizado (purpose: 'share', allowDownload: true)
 * validando ownership e garantindo que terceiros só baixem álbuns explicitamente públicos.
 */
export async function getPortfolioAlbumZipUrlAction(input: {
  albumPath: string;
  ownerId?: string;
}): Promise<{ ok: boolean; zipUrl?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const cleanAlbum = String(input.albumPath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .trim();

    if (!cleanAlbum || cleanAlbum.includes('..') || cleanAlbum.includes('\0')) {
      return { ok: false, error: 'Caminho de álbum inválido para download.' };
    }

    const targetOwnerId = input.ownerId || user?.id || PRIMARY_ADMIN_UUID;
    const isOwner = Boolean(user?.id && user.id === targetOwnerId);

    if (!isOwner) {
      const escapedPrefix = cleanAlbum.replace(/[\\%_]/g, (m) => `\\${m}`);
      const { data: publicItems } = await supabase
        .from('user_files_index')
        .select('id')
        .eq('user_id', targetOwnerId)
        .eq('visibility', 'public')
        .eq('show_in_portfolio', true)
        .or(`relative_path.eq.${cleanAlbum},relative_path.ilike.${escapedPrefix}/%`)
        .limit(1);

      if (!publicItems || publicItems.length === 0) {
        return { ok: false, error: 'Álbum não encontrado ou indisponível para download público.' };
      }
    }

    const ticketObj = signEdgeTenantTicket({
      userId: targetOwnerId,
      role: isOwner ? 'admin' : 'member',
      purpose: 'share',
      allowedPrefix: cleanAlbum,
      readOnly: true,
      allowDownload: true,
      ttlMs: 15 * 60 * 1000,
    });

    const serverUrl = getEdgeStorageServerUrl();
    const zipUrl = buildTenantZipUrl(cleanAlbum, ticketObj.ticket, { serverUrl });

    return { ok: true, zipUrl };
  } catch (err: any) {
    console.error('[getPortfolioAlbumZipUrlAction] Erro ao emitir ticket de ZIP:', err);
    return { ok: false, error: err?.message || 'Falha ao gerar link de download' };
  }
}

/**
 * Sincroniza o acervo com os arquivos reais do servidor de armazenamento (Fire Stick).
 * Se forceReset for true, zera o catálogo em memória, no disco e no Supabase.
 */
export async function syncPortfolioAction(options?: {
  forceReset?: boolean;
  wifiOnly?: boolean;
  isUnmeteredWifi?: boolean;
}): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    if (options?.wifiOnly && options?.isUnmeteredWifi === false) {
      return {
        ok: false,
        count: 0,
        error: 'Sincronização bloqueada: trava Somente Wi-Fi ativa.',
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== PRIMARY_ADMIN_UUID) {
      return { ok: false, count: 0, error: 'Apenas o Administrador pode sincronizar o portfólio.' };
    }

    const serverUrl = getEdgeStorageServerUrl();
    const apiKey = resolveEdgeHmacSecret();

    if (options?.forceReset) {
      // 1. Zera catálogo no servidor Edge
      try {
        await fetch(`${serverUrl}/api/portfolio/reset`, {
          method: 'POST',
          headers: {
            'x-storage-key': apiKey,
          },
          signal: AbortSignal.timeout(6000),
        });
      } catch (edgeErr) {
        console.warn('[syncPortfolioAction] Falha ao chamar reset no nó Edge:', edgeErr);
      }

      // 2. Limpa registros de fotos no Supabase
      await supabase
        .from('user_files_index')
        .delete()
        .eq('user_id', user.id)
        .or('show_in_portfolio.eq.true,relative_path.ilike.Portfolio/%');

      revalidatePath('/portfolio');
      return { ok: true, count: 0 };
    }

    // Sincronização normal ou forçada do disco
    const syncRes = await fetch(`${serverUrl}/api/portfolio/sync?force=1`, {
      method: 'POST',
      headers: {
        'x-storage-key': apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!syncRes.ok) {
      return { ok: false, count: 0, error: `Falha HTTP ${syncRes.status} no nó Edge.` };
    }

    const syncData = await syncRes.json();
    const photoCount = syncData.count || 0;

    // Se o disco estiver vazio, limpa o Supabase para sincronizar
    if (photoCount === 0) {
      await supabase
        .from('user_files_index')
        .delete()
        .eq('user_id', user.id)
        .or('show_in_portfolio.eq.true,relative_path.ilike.Portfolio/%');
    }

    revalidatePath('/portfolio');
    return { ok: true, count: photoCount };
  } catch (err: any) {
    console.error('[syncPortfolioAction] Erro ao sincronizar portfólio:', err);
    return { ok: false, count: 0, error: err?.message || 'Falha ao sincronizar acervo.' };
  }
}


