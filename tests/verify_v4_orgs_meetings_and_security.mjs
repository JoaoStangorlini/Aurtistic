// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: tests/verify_v4_orgs_meetings_and_security.mjs
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('AUDITORIA DE SEGURANÇA E ARQUITETURA: MULTI-ORGS, REUNIÕES E CORREÇÕES');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err.message}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// [CORREÇÃO OBRIGATÓRIA 1]: Prevenção do erro PostgREST 42P10
// -----------------------------------------------------------------------------
test('1.1. public.user_files_index possui coluna gerada vault_scope_key', () => {
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase/migrations/newsqls/06_multi_organizations_v4_complete.sql'),
    'utf-8'
  );
  assert(
    sql.includes("vault_scope_key TEXT GENERATED ALWAYS AS"),
    'Coluna gerada vault_scope_key ausente no SQL v4'
  );
  assert(
    sql.includes("org:' || organization_id::text"),
    'Lógica de org:id ausente no CASE de vault_scope_key'
  );
  assert(
    sql.includes("usr:' || user_id::text"),
    'Lógica de usr:id ausente no CASE de vault_scope_key'
  );
});

test('1.2. Constraint de unicidade real em (vault_scope_key, relative_path)', () => {
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase/migrations/newsqls/06_multi_organizations_v4_complete.sql'),
    'utf-8'
  );
  assert(
    sql.includes("uq_user_files_scope_path UNIQUE (vault_scope_key, relative_path)"),
    'Constraint uq_user_files_scope_path ausente no SQL'
  );
});

test('1.3. Server actions utilizam onConflict: vault_scope_key,relative_path', () => {
  const actionsCode = fs.readFileSync(
    path.join(ROOT_DIR, 'src/app/(dashboard)/servidor/actions.ts'),
    'utf-8'
  );
  assert(
    actionsCode.includes("onConflict: 'vault_scope_key,relative_path'"),
    "actions.ts não utiliza onConflict: 'vault_scope_key,relative_path'"
  );
});

// -----------------------------------------------------------------------------
// [CORREÇÃO OBRIGATÓRIA 2]: Ordem topológica de migrações
// -----------------------------------------------------------------------------
test('2.1. Arquivo 06_multi_organizations_v4_complete.sql cria tabelas e seeds na ordem correta', () => {
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase/migrations/newsqls/06_multi_organizations_v4_complete.sql'),
    'utf-8'
  );
  const orgPos = sql.indexOf('CREATE TABLE IF NOT EXISTS public.organizations');
  const subteamPos = sql.indexOf('CREATE TABLE IF NOT EXISTS public.organization_subteams');
  const memberPos = sql.indexOf('CREATE TABLE IF NOT EXISTS public.organization_members');
  const meetingPos = sql.indexOf('CREATE TABLE IF NOT EXISTS public.organization_meetings');

  assert(orgPos !== -1 && subteamPos > orgPos && memberPos > subteamPos && meetingPos > memberPos,
    'Tabelas não estão declaradas na ordem topológica correta'
  );
});

test('2.2. Arquivo 07_atomic_cascades_and_auth_provisioning.sql depende de 06 e define cascades com p_organization_id', () => {
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase/migrations/newsqls/07_atomic_cascades_and_auth_provisioning.sql'),
    'utf-8'
  );
  assert(
    sql.includes('p_organization_id UUID DEFAULT NULL'),
    'RPC de cascata não aceita p_organization_id'
  );
  assert(
    sql.includes('cascade_rename_user_files_index'),
    'RPC cascade_rename_user_files_index ausente em 07'
  );
  assert(
    sql.includes('handle_auth_user_provisioning'),
    'Trigger de provisionamento de novo usuário ausente em 07'
  );
});

// -----------------------------------------------------------------------------
// [CORREÇÃO OBRIGATÓRIA 3]: Isolamento estrito entre Cofre Pessoal e Org Vault
// -----------------------------------------------------------------------------
test('3.1. RLS de user_files_index isola cofre pessoal e restringe org vault a membros autorizados', () => {
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase/migrations/newsqls/06_multi_organizations_v4_complete.sql'),
    'utf-8'
  );
  assert(
    sql.includes('organization_id IS NULL AND user_id = auth.uid()'),
    'RLS não isola cofre pessoal para user_id = auth.uid()'
  );
  assert(
    sql.includes('public.can_write_org_vault(organization_id)'),
    'RLS não restringe escrita do org vault via can_write_org_vault'
  );
});

// -----------------------------------------------------------------------------
// [CORREÇÃO OBRIGATÓRIA 4]: Isolamento no servidor/server.js
// -----------------------------------------------------------------------------
test('4.1. server.js valida scopeType !== org antes de ativar ponte PORTFOLIO_DIR pessoal', () => {
  const serverCode = fs.readFileSync(
    path.join(ROOT_DIR, 'servidor/server.js'),
    'utf-8'
  );
  assert(
    serverCode.includes("scopeType !== 'org'") || serverCode.includes("scopeType === 'org'"),
    'server.js não verifica scopeType para desativar ponte PORTFOLIO_DIR'
  );
  assert(
    serverCode.includes("ORGS_ROOT_DIR = path.join(STORAGE_DIR, 'orgs')"),
    'ORGS_ROOT_DIR não definido em server.js'
  );
});

test('4.2. server.js indexa cache de quota por pinNamespaceId (org:slug vs userId)', () => {
  const serverCode = fs.readFileSync(
    path.join(ROOT_DIR, 'servidor/server.js'),
    'utf-8'
  );
  assert(
    serverCode.includes('pinNamespaceId'),
    'server.js não indexa tenant por pinNamespaceId'
  );
});

// -----------------------------------------------------------------------------
// [CORREÇÃO OBRIGATÓRIA 5]: Suporte a organizationId em actions.ts do /servidor
// -----------------------------------------------------------------------------
test('5.1. syncUserFileIndexAction não atualiza profile pessoal quando organizationId é passado', () => {
  const actionsCode = fs.readFileSync(
    path.join(ROOT_DIR, 'src/app/(dashboard)/servidor/actions.ts'),
    'utf-8'
  );
  assert(
    actionsCode.includes('if (organizationId)') &&
      actionsCode.includes('sync_user_storage_used_bytes'),
    'actions.ts atualiza storage pessoal indevidamente quando organizationId está presente'
  );
  assert(
    actionsCode.includes('recalc_org_vault_used_bytes'),
    'actions.ts não chama recalc_org_vault_used_bytes para organizações'
  );
});

// -----------------------------------------------------------------------------
// [CORREÇÃO OBRIGATÓRIA 6]: Trigger de proteção de publicação de atas
// -----------------------------------------------------------------------------
test('6.1. Trigger protect_meeting_review_publication protege publicação de atas não revisadas', () => {
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase/migrations/newsqls/06_multi_organizations_v4_complete.sql'),
    'utf-8'
  );
  assert(
    sql.includes('protect_meeting_review_publication'),
    'Trigger protect_meeting_review_publication ausente no SQL v4'
  );
  assert(
    sql.includes('A ata não pode ser publicada sem aprovação formal na revisão') ||
      sql.includes('Apenas o revisor designado ou um administrador da organização podem publicar a ata'),
    'Mensagem de exceção do trigger ausente no SQL'
  );
});

// -----------------------------------------------------------------------------
// [CORREÇÃO OBRIGATÓRIA 7]: Captura Híbrida e AudioContext
// -----------------------------------------------------------------------------
test('7.1. useBackgroundSpeechTranscription usa taxa nativa sem sampleRate fixo de 16kHz', () => {
  const hookCode = fs.readFileSync(
    path.join(ROOT_DIR, 'src/hooks/useBackgroundSpeechTranscription.ts'),
    'utf-8'
  );
  assert(
    !hookCode.includes('{ sampleRate: 16000 }'),
    'AudioContext ainda está forçando 16kHz em vez da taxa nativa'
  );
  assert(
    hookCode.includes('displayAudioTracks[0].onended'),
    'Listener onended ausente na trilha de áudio do sistema'
  );
  assert(
    hookCode.includes('stopAndFlushRecording'),
    'Função stopAndFlushRecording ausente no hook'
  );
});

// -----------------------------------------------------------------------------
// [CORREÇÃO OBRIGATÓRIA 8]: Android Widget Timezone e AGPLv3
// -----------------------------------------------------------------------------
test('8.1. EventsWidgetService.kt contém cabeçalho AGPLv3 na linha 1', () => {
  const ktCode = fs.readFileSync(
    path.join(ROOT_DIR, 'android/app/src/main/java/com/stangorlini/web/EventsWidgetService.kt'),
    'utf-8'
  );
  const firstLine = ktCode.split('\n')[0].trim();
  assert(
    firstLine.includes('AGPLv3'),
    `Linha 1 do EventsWidgetService.kt não possui licença AGPLv3: "${firstLine}"`
  );
});

test('8.2. EventsWidgetService.kt usa timezone America/Sao_Paulo para formatação local', () => {
  const ktCode = fs.readFileSync(
    path.join(ROOT_DIR, 'android/app/src/main/java/com/stangorlini/web/EventsWidgetService.kt'),
    'utf-8'
  );
  assert(
    ktCode.includes('America/Sao_Paulo'),
    'Timezone America/Sao_Paulo ausente no EventsWidgetService.kt'
  );
  assert(
    ktCode.includes('text.contains("labdiv")'),
    'Badge de dimensão LabDiv ausente em getDimensionDrawables'
  );
});

// -----------------------------------------------------------------------------
// [REGRA DE CONCORRÊNCIA]: Zero WebSocket / Realtime Channels
// -----------------------------------------------------------------------------
test('9.1. Zero uso de Supabase Realtime Channels no ecossistema', () => {
  const filesToCheck = [
    'src/components/organizacoes/TeamProgressPanel.tsx',
    'src/components/organizacoes/When2MeetSchedulerGrid.tsx',
    'src/components/organizacoes/LiveMeetingSplitWorkspace.tsx',
    'src/components/organizacoes/LabDivWorkspaceClient.tsx',
    'src/components/dashboard/TasksView.tsx',
    'src/app/(dashboard)/organizacoes/actions.ts',
  ];

  for (const relPath of filesToCheck) {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (fs.existsSync(fullPath)) {
      const code = fs.readFileSync(fullPath, 'utf-8');
      assert(
        !code.includes('.channel('),
        `Canal WebSocket Realtime detectado em ${relPath}. O sistema deve usar apenas HTTP/RPCs!`
      );
    }
  }
});

// -----------------------------------------------------------------------------
// [LICENÇA AGPLv3]: Linha 1 de 100% dos novos componentes
// -----------------------------------------------------------------------------
test('10.1. Todos os componentes de organizacoes possuem AGPLv3 na linha 1', () => {
  const dir = path.join(ROOT_DIR, 'src/components/organizacoes');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

  for (const f of files) {
    const code = fs.readFileSync(path.join(dir, f), 'utf-8');
    const firstLine = code.split('\n')[0].trim();
    assert(
      firstLine.includes('AGPLv3'),
      `Linha 1 de ${f} não possui licença AGPLv3: "${firstLine}"`
    );
  }
});

console.log('\n================================================================');
console.log(`RESULTADO DA AUDITORIA: ${passCount} passaram, ${failCount} falharam (Total: ${passCount + failCount})`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
