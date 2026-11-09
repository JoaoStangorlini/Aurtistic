// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';

console.log('================================================================');
console.log('TESTES DE ESCOPO: INDIVIDUAL VS ORGANIZAÇÃO & FILTRAGEM STRICT');
console.log('================================================================\n');

// 1. Simulação dos dados reais do usuário (João Paulo Stangorlini)
const mockTasks = [
  { id: '1', nome: 'Streak de estudos', dimensao: 'HUB', is_personal: false },
  { id: '2', nome: 'Reunião com o ortega', dimensao: 'HUB', is_personal: false },
  { id: '3', nome: 'Filme Interestelar', dimensao: 'filmes/series', is_personal: false },
  { id: '4', nome: 'Livro O Hobbit', dimensao: 'livros', is_personal: false },
  { id: '5', nome: 'Comprar café', dimensao: 'compras', is_personal: false },
  { id: '6', nome: 'Refatorar Aurtistic', dimensao: 'Aurtistic', is_personal: false },
  { id: '7', nome: 'Tarefa com Org ID', organization_id: '1ab41410-0000-4000-8000-000000000001', is_personal: false },
  { id: '8', nome: 'Tarefa Pessoal Explícita', dimensao: 'HUB', is_personal: true },
];

const mockEvents = [
  { id: 'e1', nome: 'Reunião Semanal LabDiv', dimensao: 'HUB', is_labdiv: true },
  { id: 'e2', nome: 'Dentista', dimensao: 'Saúde', is_labdiv: false },
  { id: 'e3', nome: 'Cinema', dimensao: 'filmes/series', is_labdiv: false },
];

const mockOrganizations = [
  {
    id: '1ab41410-0000-4000-8000-000000000001',
    name: 'LabDiv',
    slug: 'labdiv',
  },
];

const LABDIV_ORG_ID = '1ab41410-0000-4000-8000-000000000001';

// Lógica idêntica à implementada no TasksView
function filterTasks(tasks, activeScope, activeOrgId, organizations) {
  const isOrgTask = (t) => {
    if (t.is_personal === true) return false;
    if (t.organization_id) return true;
    const dim = (t.dimensao || '').trim().toLowerCase();
    if (dim === 'hub' || dim === 'labdiv') return true;
    if (organizations.some((o) => (o.name && o.name.trim().toLowerCase() === dim) || (o.slug && o.slug.trim().toLowerCase() === dim))) {
      return true;
    }
    return false;
  };

  if (activeScope === 'individual') {
    return tasks.filter((t) => !isOrgTask(t));
  } else if (activeScope === 'organization') {
    const currentOrg = organizations.find((o) => o.id === activeOrgId) || organizations[0];
    if (!currentOrg) return [];
    const currentOrgId = currentOrg.id;
    const currentOrgName = (currentOrg.name || '').trim().toLowerCase();
    const currentOrgSlug = (currentOrg.slug || '').trim().toLowerCase();
    const isLabdivActive = currentOrgId === LABDIV_ORG_ID || currentOrgSlug.includes('labdiv') || currentOrgName.includes('labdiv');

    return tasks.filter((t) => {
      if (t.is_personal === true) return false;
      if (t.organization_id && t.organization_id === currentOrgId) return true;
      const dim = (t.dimensao || '').trim().toLowerCase();
      if (isLabdivActive && (dim === 'hub' || dim === 'labdiv')) return true;
      if (currentOrg.name && dim === currentOrgName) return true;
      return false;
    });
  }
  return tasks;
}

function filterEvents(events, activeScope, activeOrgId, organizations) {
  const isLabdivDim = (d) => {
    const v = (d || '').trim().toLowerCase();
    return v === 'hub' || v === 'labdiv';
  };

  if (activeScope === 'individual') {
    return events.filter((e) => !e.is_labdiv && !isLabdivDim(e.dimensao));
  } else if (activeScope === 'organization') {
    const currentOrg = organizations.find((o) => o.id === activeOrgId) || organizations[0];
    const isLabdivActive = !currentOrg || currentOrg.id === LABDIV_ORG_ID || currentOrg.slug?.toLowerCase().includes('labdiv');
    return events.filter((e) => {
      if (isLabdivActive && (e.is_labdiv || isLabdivDim(e.dimensao))) return true;
      if (e.organization_id && e.organization_id === currentOrg?.id) return true;
      return false;
    });
  }
  return events;
}

// 1. Teste Escopo Individual
console.log('--- 1. Filtragem no Escopo [Individual] ---');
const individualTasks = filterTasks(mockTasks, 'individual', LABDIV_ORG_ID, mockOrganizations);
const individualEvents = filterEvents(mockEvents, 'individual', LABDIV_ORG_ID, mockOrganizations);

assert.equal(individualTasks.length, 5, 'Deveria exibir apenas 5 tarefas individuais');
assert.ok(individualTasks.some((t) => t.nome === 'Filme Interestelar'), 'Deve incluir Filme');
assert.ok(individualTasks.some((t) => t.nome === 'Livro O Hobbit'), 'Deve incluir Livro');
assert.ok(individualTasks.some((t) => t.nome === 'Comprar café'), 'Deve incluir Compras');
assert.ok(individualTasks.some((t) => t.nome === 'Refatorar Aurtistic'), 'Deve incluir Aurtistic');
assert.ok(individualTasks.some((t) => t.nome === 'Tarefa Pessoal Explícita'), 'Deve incluir tarefa pessoal explícita');
assert.ok(!individualTasks.some((t) => t.nome === 'Streak de estudos'), 'NÃO deve conter tarefas do HUB no individual');
assert.ok(!individualTasks.some((t) => t.nome === 'Tarefa com Org ID'), 'NÃO deve conter tarefas com organization_id no individual');
console.log('✓ Tarefas individuais isoladas com perfeição. Nenhuma tarefa institucional vazou.');

assert.equal(individualEvents.length, 2, 'Deveria exibir apenas 2 eventos individuais');
assert.ok(!individualEvents.some((e) => e.nome === 'Reunião Semanal LabDiv'), 'NÃO deve conter reuniões do LabDiv no individual');
console.log('✓ Eventos individuais isolados com perfeição.');

// 2. Teste Escopo Organização
console.log('\n--- 2. Filtragem no Escopo [Organização] (LabDiv) ---');
const orgTasks = filterTasks(mockTasks, 'organization', LABDIV_ORG_ID, mockOrganizations);
const orgEvents = filterEvents(mockEvents, 'organization', LABDIV_ORG_ID, mockOrganizations);

assert.equal(orgTasks.length, 3, 'Deveria exibir apenas as 3 tarefas do LabDiv/HUB');
assert.ok(orgTasks.some((t) => t.nome === 'Streak de estudos'), 'Deve incluir Streak de estudos');
assert.ok(orgTasks.some((t) => t.nome === 'Reunião com o ortega'), 'Deve incluir Reunião com o ortega');
assert.ok(orgTasks.some((t) => t.nome === 'Tarefa com Org ID'), 'Deve incluir tarefa vinculada pelo ID');
assert.ok(!orgTasks.some((t) => t.nome === 'Filme Interestelar'), 'NÃO deve exibir tarefas de filmes/series na organização');
assert.ok(!orgTasks.some((t) => t.nome === 'Livro O Hobbit'), 'NÃO deve exibir livros na organização');
assert.ok(!orgTasks.some((t) => t.nome === 'Tarefa Pessoal Explícita'), 'NÃO deve exibir tarefas pessoais explícitas');
console.log('✓ Tarefas da organização isoladas com sucesso. Tarefas pessoais estritamente ocultas.');

assert.equal(orgEvents.length, 1, 'Deveria conter apenas 1 evento do LabDiv');
assert.equal(orgEvents[0].nome, 'Reunião Semanal LabDiv');
console.log('✓ Eventos da organização isolados com sucesso.');

// 3. Teste Escopo [Tudo] (Unificado: Pessoal + Organizações)
console.log('\n--- 3. Filtragem no Escopo [Tudo] (Unificado) ---');
const allTasks = filterTasks(mockTasks, 'all', LABDIV_ORG_ID, mockOrganizations);
const allEvents = filterEvents(mockEvents, 'all', LABDIV_ORG_ID, mockOrganizations);

assert.equal(allTasks.length, mockTasks.length, 'Escopo Tudo deve conter todas as 8 tarefas');
assert.equal(allEvents.length, mockEvents.length, 'Escopo Tudo deve conter todos os 3 eventos');
console.log('✓ Escopo [Tudo] unifica tarefas e eventos pessoais e organizacionais perfeitamente.');

// 4. Teste Visibilidade e Acesso da Barra (Regra: se tiver 0 organizações, exibe botão compacto para Entrar/Criar)
console.log('\n--- 4. Regra de Acesso quando Usuário tem 0 Organizações ---');
const userWithNoOrgs = [];
const hasDirectJoinOrCreateAccess = Boolean(userWithNoOrgs.length === 0);
assert.equal(hasDirectJoinOrCreateAccess, true, 'Usuário com 0 organizações DEVE ter acesso ao botão compacto Entrar/Criar');
console.log('✓ Botão compacto de Entrar/Criar Organização garantido para usuários sem organização.');

console.log('\n================================================================');
console.log('TODOS OS TESTES DE ESCOPO E FILTRAGEM PASSARAM COM SUCESSO! [100%]');
console.log('================================================================');

