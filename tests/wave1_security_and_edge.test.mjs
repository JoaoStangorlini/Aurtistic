// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const TrashManager = require('../servidor/lib/trash-manager.js');
const WebdavServer = require('../servidor/lib/webdav-server.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadTsModule(tsFiles) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurt-ts-test-'));
  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    skipLibCheck: true,
  };
  for (const rel of tsFiles) {
    const srcPath = path.join(ROOT_DIR, rel);
    const code = fs.readFileSync(srcPath, 'utf8');
    const out = ts.transpileModule(code, { compilerOptions, fileName: srcPath });
    const targetPath = path.join(outDir, rel.replace(/\.tsx?$/, '.js'));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, out.outputText, 'utf8');
  }
  return {
    outDir,
    requireRel: (rel) => require(path.join(outDir, rel.replace(/\.tsx?$/, '.js'))),
    cleanup: () => fs.rmSync(outDir, { recursive: true, force: true }),
  };
}

function decodeTicketPayload(ticket) {
  const [payloadB64] = String(ticket).split('.');
  assert.ok(payloadB64, 'Ticket deve possuir payload base64url');
  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
}

console.log('=== Testes Unitários da Onda 1 (Segurança, Edge Dinâmico & Migration 14) ===');

// 1. Edge Ticket: allowedOrgSlugs sempre serializado como Array (fail-closed)
{
  const bundle = loadTsModule(['src/lib/edge-urls.ts', 'src/lib/edge-ticket.ts']);
  try {
    const {
      signEdgeTenantTicket,
      attachSignedPublicMediaUrls,
      PRIMARY_ADMIN_UUID,
    } = bundle.requireRel('src/lib/edge-ticket.ts');

    const ticketNoOrgs = signEdgeTenantTicket({
      userId: 'user-1234',
      purpose: 'vault',
    });
    const payloadNoOrgs = decodeTicketPayload(ticketNoOrgs.ticket);
    assert.ok(Array.isArray(payloadNoOrgs.allowedOrgSlugs), 'allowedOrgSlugs nunca deve ser omitido');
    assert.equal(payloadNoOrgs.allowedOrgSlugs.length, 0);

    const ticketWithOrgs = signEdgeTenantTicket({
      userId: 'user-1234',
      purpose: 'vault',
      allowedOrgSlugs: ['LabDiv', ' HS '],
    });
    const payloadWithOrgs = decodeTicketPayload(ticketWithOrgs.ticket);
    assert.deepEqual(payloadWithOrgs.allowedOrgSlugs, ['labdiv', 'hs']);

    const signedOrgMedia = attachSignedPublicMediaUrls(
      [{ user_id: PRIMARY_ADMIN_UUID, relative_path: 'Portfolio/Show/foto.jpg' }],
      {
        omitFullUrls: true,
        allowDownload: true,
        orgContext: {
          organizationId: '1ab41410-0000-4000-8000-000000000001',
          orgSlug: 'labdiv',
        },
      }
    );
    const mediaPayload = decodeTicketPayload(signedOrgMedia[0].itemTicket);
    assert.equal(mediaPayload.scopeType, 'org');
    assert.equal(mediaPayload.orgSlug, 'labdiv');
    assert.deepEqual(mediaPayload.allowedOrgSlugs, ['labdiv']);
    assert.equal(mediaPayload.purpose, 'public_media');
    console.log('✓ [1] signEdgeTenantTicket e attachSignedPublicMediaUrls respeitam allowedOrgSlugs e orgContext.');
  } finally {
    bundle.cleanup();
  }
}

// 2. TrashManager.setBaseDir e WebdavServer.setRootDir dinâmicos (Pedidos 14 & 7)
{
  const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'aurt-w1-a-'));
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'aurt-w1-b-'));
  try {
    const trash = new TrashManager(tmpA);
    assert.equal(trash.storageDir, path.resolve(tmpA));
    assert.equal(trash.trashDir, path.join(path.resolve(tmpA), '.trash'));

    trash.setBaseDir(tmpB);
    assert.equal(trash.storageDir, path.resolve(tmpB));
    assert.equal(trash.trashDir, path.join(path.resolve(tmpB), '.trash'));
    assert.equal(trash.manifestPath, path.join(path.resolve(tmpB), '.trash', 'trash_manifest.json'));
    assert.ok(fs.existsSync(trash.trashDir), 'Nova pasta .trash deve ser criada ao trocar storageDir');

    const webdav = new WebdavServer(tmpA, { trashManager: trash });
    assert.equal(webdav.rootDir, path.resolve(tmpA));
    webdav.setRootDir(tmpB);
    assert.equal(webdav.rootDir, path.resolve(tmpB));
    assert.equal(webdav.resolveSafePath('/webdav/teste.txt'), path.join(path.resolve(tmpB), 'teste.txt'));
    console.log('✓ [2] TrashManager.setBaseDir e WebdavServer.setRootDir atualizam dinamicamente sem reiniciar.');
  } finally {
    fs.rmSync(tmpA, { recursive: true, force: true });
    fs.rmSync(tmpB, { recursive: true, force: true });
  }
}

// 3. Pedido 13: TaskFormModal não chama hooks após early return
{
  const taskModalSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/components/dashboard/TaskFormModal.tsx'),
    'utf8'
  );
  const earlyReturnIdx = taskModalSrc.indexOf('if (!isOpen) return null;');
  assert.ok(earlyReturnIdx > 0, 'Early return deve existir em TaskFormModal');
  const afterReturn = taskModalSrc.slice(earlyReturnIdx);
  assert.equal(
    /\buse(Ref|State|Effect|Callback|Memo|Reducer|Context)\s*\(/.test(afterReturn),
    false,
    'Nenhum hook React deve existir após if (!isOpen) return null;'
  );
  console.log('✓ [3] TaskFormModal livre de chamada condicional de hooks.');
}

// 4. A1: Funções de bypass sem senha removidas de login/actions.ts
{
  const loginActionsSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/app/login/actions.ts'),
    'utf8'
  );
  assert.equal(loginActionsSrc.includes('loginHubMemberDirectAction'), false);
  assert.equal(loginActionsSrc.includes('getHubLabDivMembersAction'), false);
  console.log('✓ [4] Bypass loginHubMemberDirectAction / getHubLabDivMembersAction removido.');
}

// 5. Edge server.js: A2, A3, A4, A5 + Hotplug dinâmico e proteção contra wipe do catálogo
{
  const serverSrc = fs.readFileSync(path.join(ROOT_DIR, 'servidor/server.js'), 'utf8');
  assert.ok(serverSrc.includes('function syncDerivedStoragePaths()'));
  assert.equal(/\nconst TENANT_BASE_DIR\b/.test(serverSrc), false, 'TENANT_BASE_DIR não deve ser const');
  assert.equal(/\nconst PORTFOLIO_DIR\b/.test(serverSrc), false, 'PORTFOLIO_DIR não deve ser const');
  assert.equal(serverSrc.includes('if (force || albumDirs.length === 0)'), false, 'Catálogo não deve zerar sem force');
  assert.ok(
    serverSrc.includes('(!Array.isArray(options.allowedOrgSlugs) || !options.allowedOrgSlugs.includes(targetSlug))'),
    'A2: allowedOrgSlugs deve ser fail-closed em atalhos'
  );
  assert.ok(
    serverSrc.includes("(purpose === 'public_media' || purpose === 'share') && allowedPathsArr.length === 0 && !payload.allowedPrefix"),
    'A3: ticket share sem escopo explícito deve retornar 403'
  );
  assert.ok(
    serverSrc.includes("req.tenant.purpose === 'share' && !req.tenant.allowedPrefix"),
    'A5: GET /api/tenant/zip deve bloquear ticket share sem allowedPrefix'
  );
  assert.ok(
    serverSrc.includes('diskUsedBytes: tenantUsedBytes'),
    'Telemetria não deve usar PRIMARY_ADMIN_UUID fixo'
  );
  assert.ok(
    serverSrc.includes('if (targetUserId !== PRIMARY_ADMIN_UUID || !isPortfolioRelatedRelPath(clean))'),
    'A4: resolvePortAwareTargetDir deve isolar fallbacks exclusivamente para PRIMARY_ADMIN_UUID em Portfolio'
  );
  console.log('✓ [5] Invariantes A2–A5, paths dinâmicos e telemetria no servidor/server.js validados.');
}

// 6. Migration 14 completa e idempotente
{
  const migSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase/migrations/newsqls/14_security_rls_directory_and_atomic_features.sql'),
    'utf8'
  );
  for (const requiredToken of [
    'public.user_private_secrets',
    'REVOKE ALL ON TABLE public.user_private_secrets FROM PUBLIC, anon, authenticated',
    'public.get_org_member_directory',
    'public.merge_user_features_config',
    'INSERT INTO public.user_profiles (id, features_config)',
    'ON CONFLICT (id) DO UPDATE',
    'trg_protect_org_member_privileges',
    'REVOKE ALL ON FUNCTION public.ensure_sso_member(UUID, TEXT) FROM PUBLIC, anon, authenticated',
    'REVOKE ALL ON FUNCTION public.get_share_link_by_token_internal(TEXT) FROM PUBLIC, anon, authenticated',
    'REVOKE ALL ON FUNCTION public.get_share_link_files_by_token(TEXT) FROM PUBLIC, anon, authenticated',
    'REVOKE ALL ON FUNCTION public.submit_client_proofing_selection(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated',
    "extensions.gen_salt('bf', 10)",
    'failed_pin_attempts',
    'pin_locked_until',
    'PIN_LEGACY_SERVICE_REQUIRED',
    'public.submit_client_proofing_selection_v2',
  ]) {
    assert.ok(migSrc.includes(requiredToken), `Migration 14 deve conter: ${requiredToken}`);
  }
  console.log('✓ [6] Migration 14 validada com todas as blindagens e fallback idempotente.');
}

console.log('\nTodos os 6 conjuntos de testes da Onda 1 passaram com sucesso.');
