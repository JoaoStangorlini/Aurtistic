// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function loadTsModule(relPath) {
  const fullPath = new URL(`../${relPath}`, import.meta.url).pathname;
  const source = fs.readFileSync(fullPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const mod = { exports: {} };
  const localRequire = (specifier) => {
    throw new Error(`Unexpected runtime require in pure auth module: ${specifier}`);
  };
  const fn = new Function('exports', 'require', 'module', compiled);
  fn(mod.exports, localRequire, mod);
  return mod.exports;
}

const authId = loadTsModule('src/lib/auth-identifier.ts');
const legalDocs = loadTsModule('src/lib/legal-documents.ts');

function computePublicSlugLikeSql(rawInput, uuid) {
  const cleaned = String(rawInput || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = cleaned || 'user';
  return `${base}-${String(uuid).slice(0, 6)}`;
}

async function run() {
  // 1. normalizeAuthIdentifier (strictUsername: true)
  const okSimple = authId.normalizeAuthIdentifier('jorge', { strictUsername: true });
  assert.equal(okSimple.ok, true);
  assert.equal(okSimple.email, 'jorge@aurtistic.local');
  assert.equal(okSimple.username, 'jorge');

  const okAt = authId.normalizeAuthIdentifier('@Jorge.Silva_01', { strictUsername: true });
  assert.equal(okAt.ok, true);
  assert.equal(okAt.email, 'jorge.silva_01@aurtistic.local');

  const okEmail = authId.normalizeAuthIdentifier('User@Exemplo.COM', { strictUsername: true });
  assert.equal(okEmail.ok, true);
  assert.equal(okEmail.kind, 'email');
  assert.equal(okEmail.email, 'user@exemplo.com');

  for (const invalid of ['ab', 'joao silva', 'joão', 'joao..silva', '.joao', 'joao.', '@@@', '']) {
    const res = authId.normalizeAuthIdentifier(invalid, { strictUsername: true });
    assert.equal(res.ok, false, `Username "${invalid}" deveria ser rejeitado no cadastro estrito`);
  }

  // Compatibilidade legada no login (strictUsername: false)
  const legacyLogin = authId.normalizeAuthIdentifier('João!', { strictUsername: false });
  assert.equal(legacyLogin.ok, true);
  assert.equal(legacyLogin.email, 'joao@aurtistic.local');

  // 2. validateSignupInputs (senha >= 8, confirmação, aceite de termos)
  assert.equal(
    authId.validateSignupInputs({
      rawIdentifier: 'jorge',
      password: '1234567',
      confirmPassword: '1234567',
      acceptTerms: true,
    }).ok,
    false,
    'Deve rejeitar senha com menos de 8 caracteres'
  );

  assert.equal(
    authId.validateSignupInputs({
      rawIdentifier: 'jorge',
      password: 'balaomagico',
      confirmPassword: 'outrasenha',
      acceptTerms: true,
    }).ok,
    false,
    'Deve rejeitar confirmação divergente'
  );

  const noTermsRes = authId.validateSignupInputs({
    rawIdentifier: 'jorge',
    password: 'balaomagico',
    confirmPassword: 'balaomagico',
    acceptTerms: false,
  });
  assert.equal(noTermsRes.ok, false, 'Deve rejeitar cadastro server-side sem aceite dos termos');
  assert.match(noTermsRes.error, /Termos de Uso/);

  const validSignup = authId.validateSignupInputs({
    rawIdentifier: 'jorge',
    password: 'balaomagico',
    confirmPassword: 'balaomagico',
    acceptTerms: true,
  });
  assert.equal(validSignup.ok, true);
  assert.equal(validSignup.identifier.email, 'jorge@aurtistic.local');

  // 3. formatSupabaseAuthError nunca devolve {}
  assert.notEqual(authId.formatSupabaseAuthError({ message: '{}' }), '{}');
  assert.notEqual(authId.formatSupabaseAuthError({}), '{}');
  assert.notEqual(authId.formatSupabaseAuthError(null), '{}');
  assert.match(
    authId.formatSupabaseAuthError({ message: 'Database error saving new user' }),
    /banco de dados/i
  );

  // 4. Verificação estática e lógica da Migration 18 (provisionamento + SSO HUB + service_role RPC + public_slug)
  const migrationSql = fs.readFileSync(
    path.resolve('supabase/migrations/newsqls/18_fix_auth_provisioning_and_terms.sql'),
    'utf8'
  );
  assert.equal(
    /INTO\s+public\.profiles\b/i.test(migrationSql),
    false,
    'Migration 18 nunca deve inserir em public.profiles'
  );
  assert.ok(migrationSql.includes('INTO public.user_profiles'));
  assert.ok(migrationSql.includes('DROP TRIGGER IF EXISTS on_auth_user_created_storage ON auth.users;'));
  assert.ok(migrationSql.includes('trg_protect_user_profile_terms'));
  assert.ok(migrationSql.includes('AND deleted_at IS NULL'));
  assert.ok(migrationSql.includes('REVOKE ALL ON FUNCTION public.check_auth_identifier_exists(TEXT) FROM anon;'));
  assert.ok(migrationSql.includes('REVOKE ALL ON FUNCTION public.check_auth_identifier_exists(TEXT) FROM authenticated;'));
  assert.ok(migrationSql.includes('GRANT EXECUTE ON FUNCTION public.check_auth_identifier_exists(TEXT) TO service_role;'));
  assert.equal(
    /GRANT EXECUTE ON FUNCTION public\.check_auth_identifier_exists.*TO\s+(anon|authenticated)/i.test(migrationSql),
    false,
    'RPC check_auth_identifier_exists nunca pode ser concedida a anon ou authenticated'
  );
  assert.ok(
    migrationSql.includes('WHEN v_terms_version IS NOT NULL THEN timezone'),
    'terms_accepted_at deve ser gerado no Postgres sem cast de metadata externa e tolerar NULL (SSO HUB)'
  );

  // Simulação de colisão de public_slug (incluindo chars especiais, vazio e dois UUIDs diferentes)
  const slug1 = computePublicSlugLikeSql('João!!', '11111111-2222-3333-4444-555555555555');
  const slug2 = computePublicSlugLikeSql('João!!', 'aaaaaaaa-2222-3333-4444-555555555555');
  const slugEmpty = computePublicSlugLikeSql('!!!', 'bbbbbbbb-2222-3333-4444-555555555555');
  assert.notEqual(slug1, slug2, 'Dois usuários com mesmo nome nunca podem colidir em public_slug');
  assert.ok(slugEmpty.startsWith('user-bbbbbb'), `Esperado fallback seguro user-*, veio ${slugEmpty}`);

  // 5. Documentos legais v2026-11 + rota check-identifier via createAdminClient + auth-actions-core sem escrita dupla
  assert.equal(legalDocs.LEGAL_DOCS_VERSION, '2026-11');
  const privacyText = legalDocs.PRIVACY_POLICY_SECTIONS.map((s) => `${s.title} ${s.paragraphs.join(' ')}`).join('\n');
  const termsText = legalDocs.TERMS_OF_USE_SECTIONS.map((s) => `${s.title} ${s.paragraphs.join(' ')}`).join('\n');
  for (const kw of ['Art. 11', 'Art. 18', 'Art. 33', '15 dias', 'Supabase', 'Vercel', 'scrypt', '.trash']) {
    assert.ok(privacyText.includes(kw), `Política de Privacidade deve citar "${kw}"`);
  }
  assert.ok(termsText.includes('AGPLv3'), 'Termos devem esclarecer licença AGPLv3 do código vs serviço');

  const routeSrc = fs.readFileSync(path.resolve('src/app/api/auth/check-identifier/route.ts'), 'utf8');
  assert.ok(routeSrc.includes('createAdminClient()'), 'check-identifier deve usar exclusivamente createAdminClient()');
  assert.ok(routeSrc.includes('RateLimitStore'), 'check-identifier deve expor abstração RateLimitStore');

  const coreActionsSrc = fs.readFileSync(path.resolve('src/lib/auth-actions-core.ts'), 'utf8');
  assert.equal(
    coreActionsSrc.includes("from('user_profiles').upsert") || coreActionsSrc.includes("from('user_profiles').insert"),
    false,
    'performSignup não deve duplicar escrita de criação em user_profiles (trigger é fonte única)'
  );

  // Regressão SSO HUB LabDiv
  const hubCallbackSrc = fs.readFileSync(path.resolve('src/app/auth/hub-callback/route.ts'), 'utf8');
  assert.ok(hubCallbackSrc.includes('signUp(') && hubCallbackSrc.includes('hub_user_id: payload.hubUserId'));

  console.log('ALL_AUTH_FLOW_TESTS_PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
