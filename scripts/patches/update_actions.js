const fs = require('fs');

const path = './src/app/(dashboard)/actions.ts';
let code = fs.readFileSync(path, 'utf8');

// Replace the top of saveTask
const saveTaskOldStart = `export async function saveTask(taskData: Partial<Task>) {
  const supabase = await createClient();

  // Se a tarefa foi marcada como "completa" e tem "frequencia", empurra para a frente
  let dataToSave = { ...taskData };
  
  if (dataToSave.status === 'completa' && dataToSave.frequencia) {`;

const saveTaskNewStart = `export async function saveTask(taskData: Partial<Task>) {
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
  
  if (isCompleted && dataToSave.frequencia) {`;

code = code.replace(saveTaskOldStart, saveTaskNewStart);

// Fix else if (dataToSave.status === 'completa') in saveTask
code = code.replace(
  "} else if (dataToSave.status === 'completa') {",
  "} else if (isCompleted) {"
);

// Fix user extraction on line 70
code = code.replace(
  "const { data: { user } } = await supabase.auth.getUser();\n  if (user && !dataToSave.user_id) {\n    dataToSave.user_id = user.id;\n  }",
  "if (actionUser && !dataToSave.user_id) {\n    dataToSave.user_id = actionUser.id;\n  }"
);

// Fix propagate logic in saveTask
code = code.replace(
  "if (fieldsToPropagate.status === 'completa') fieldsToPropagate.concluida_em = dataToSave.concluida_em;\n       if (fieldsToPropagate.status && fieldsToPropagate.status !== 'completa') fieldsToPropagate.concluida_em = null;",
  "if (fieldsToPropagate.status && completionStatuses.includes(fieldsToPropagate.status.toLowerCase())) fieldsToPropagate.concluida_em = dataToSave.concluida_em;\n       if (fieldsToPropagate.status && !completionStatuses.includes(fieldsToPropagate.status.toLowerCase())) fieldsToPropagate.concluida_em = null;"
);

// Now for updateMultipleTasks
const multiOld = `  // Se marcou o status como "completa" na edição múltipla, vamos tratar o concluida_em simplificadamente.
  // Note: a lógica complexa de recorrência será ignorada para edições em massa por segurança (para evitar dupes).
  if (dataToSave.status === 'completa') {
    dataToSave.concluida_em = new Date().toISOString();
  } else if (dataToSave.status && dataToSave.status !== 'completa') {
    dataToSave.concluida_em = null;
  }`;

const multiNew = `  const { data: { user: multiUser } } = await supabase.auth.getUser();
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
  }`;

code = code.replace(multiOld, multiNew);

// Add updateAdvancedConfig at the end of the file
const exportAdvancedConfig = `
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
`;

if (!code.includes('updateAdvancedConfig')) {
  code += exportAdvancedConfig;
}

fs.writeFileSync(path, code);
console.log('actions.ts updated successfully.');
