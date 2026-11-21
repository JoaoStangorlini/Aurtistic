// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadTsModule(tsFiles) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurt-ts-test-wave3-'));
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
    requireFromOutDir(relJs) {
      return require(path.join(outDir, relJs));
    },
    cleanup() {
      fs.rmSync(outDir, { recursive: true, force: true });
    },
  };
}

console.log('=== Iniciando Suíte de Testes da Onda 3 (Studio Profissional) ===\n');

const tsLoader = loadTsModule([
  'src/components/organizacoes/studio/types.ts',
  'src/components/organizacoes/studio/studio-helpers.ts',
  'src/lib/org-brand-tokens.ts',
  'src/lib/studio/studio-idb.ts',
  'src/lib/studio/stage-geometry.ts',
]);

try {
  const { createBlankSlide, sanitizeCustomTemplate } = tsLoader.requireFromOutDir('src/components/organizacoes/studio/studio-helpers.js');
  const { resolvePersonalStudioTokens } = tsLoader.requireFromOutDir('src/lib/org-brand-tokens.js');
  const { buildStorageKey } = tsLoader.requireFromOutDir('src/lib/studio/studio-idb.js');

  console.log('1. Testando createBlankSlide...');
  const slide = createBlankSlide('test-blank-1', '4:5', '#0A0D14');
  assert.equal(slide.id, 'test-blank-1');
  assert.equal(slide.aspectRatio, '4:5');
  assert.equal(slide.backgroundColor, '#0A0D14');
  assert.equal(slide.showBrandBadge, false);
  assert.equal(slide.layers.length, 0);
  console.log('   ✓ createBlankSlide inicializa slide limpo com 0 camadas');

  console.log('2. Testando sanitizeCustomTemplate para template válido...');
  const validSlide = {
    id: 'template-valid',
    title: 'Template Válido',
    aspectRatio: '1:1',
    backgroundColor: '#111827',
    showBrandBadge: false,
    layers: [
      {
        id: 'img-1',
        type: 'image',
        src: '/api/tenant/file?path=img.png&ticket=xyz123',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    ],
  };
  const resValid = sanitizeCustomTemplate(validSlide);
  assert.equal(resValid.ok, true);
  if (resValid.ok) {
    assert.equal(resValid.sanitized.layers[0].src, '/api/tenant/file?path=img.png');
  }
  console.log('   ✓ sanitizeCustomTemplate aprova template válido e remove query params efêmeros');

  console.log('3. Testando sanitizeCustomTemplate com Base64...');
  const base64Slide = {
    id: 'template-base64',
    title: 'Template com Base64',
    aspectRatio: '1:1',
    backgroundColor: '#111827',
    showBrandBadge: false,
    layers: [
      {
        id: 'img-b64',
        type: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    ],
  };
  const resB64 = sanitizeCustomTemplate(base64Slide);
  assert.equal(resB64.ok, false);
  if (!resB64.ok) {
    assert.match(resB64.error, /Base64/);
  }
  console.log('   ✓ sanitizeCustomTemplate rejeita camadas com imagens em Base64');

  console.log('4. Testando sanitizeCustomTemplate com limite > 64 KB...');
  const giantLayers = [];
  for (let i = 0; i < 600; i++) {
    giantLayers.push({
      id: `layer-${i}`,
      type: 'text',
      name: `Camada de texto longo ${i} com propriedades repetitivas para encher o payload`,
      text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.2,
    });
  }
  const giantSlide = {
    id: 'template-giant',
    title: 'Template Gigante',
    aspectRatio: '1:1',
    backgroundColor: '#111827',
    showBrandBadge: false,
    layers: giantLayers,
  };
  const resGiant = sanitizeCustomTemplate(giantSlide);
  assert.equal(resGiant.ok, false);
  if (!resGiant.ok) {
    assert.match(resGiant.error, /excede o limite máximo de 64 KB/);
  }
  console.log('   ✓ sanitizeCustomTemplate rejeita templates gigantes (> 64 KB)');

  console.log('5. Testando resolvePersonalStudioTokens...');
  const darkTokens = resolvePersonalStudioTokens(['#FF5722', '#00BCD4'], 'dark');
  assert.equal(darkTokens.badgeTag, 'STUDIO PESSOAL');
  assert.equal(darkTokens.primaryColor, '#FF5722');
  assert.equal(darkTokens.secondaryColor, '#00BCD4');
  assert.equal(darkTokens.bgApp, '#090d16');

  const lightTokens = resolvePersonalStudioTokens(null, 'light');
  assert.equal(lightTokens.badgeTag, 'STUDIO PESSOAL');
  assert.equal(lightTokens.bgApp, '#f8fafc');
  assert.equal(lightTokens.textPrimary, '#0f172a');
  console.log('   ✓ resolvePersonalStudioTokens gera paletas e contrastes corretos para claro e escuro');

  console.log('6. Testando buildStorageKey e isolamento de slots...');
  const personalKey = buildStorageKey('personal:user-123', 1);
  const orgKey = buildStorageKey('org:labdiv', 1);
  assert.equal(personalKey, 'personal:user-123:1');
  assert.equal(orgKey, 'org:labdiv:1');
  assert.notEqual(personalKey, orgKey);
  console.log('   ✓ buildStorageKey cria chaves únicas indexáveis por scopeKey:slotIndex');

  console.log('7. Testando Migration 17 (17_studio_personal_drafts_scope.sql)...');
  const sqlPath = path.resolve(ROOT_DIR, 'supabase/migrations/newsqls/17_studio_personal_drafts_scope.sql');
  assert.equal(fs.existsSync(sqlPath), true, 'Arquivo de migração 17 deve existir');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assert.match(sql, /ALTER COLUMN org_id DROP NOT NULL/);
  assert.match(sql, /scope_key TEXT/);
  assert.match(sql, /ALTER COLUMN scope_key SET NOT NULL/);
  assert.match(sql, /uq_studio_draft_user_scope_slot/);
  assert.match(sql, /personal:/);
  console.log('   ✓ Migration 17 contém schema DDL e RLS compatíveis com rascunhos pessoais e de organizações');

  console.log('\n✅ TODOS OS 7 TESTES DA ONDA 3 PASSARAM COM SUCESSO!\n');

  // ---- Testes 8-10 ----
  const { stageAspect } = tsLoader.requireFromOutDir('src/lib/studio/stage-geometry.js');
  const { sanitizeDraftForStorage } = tsLoader.requireFromOutDir('src/lib/studio/studio-idb.js');
  const idbSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/lib/studio/studio-idb.ts'), 'utf8');

  console.log('8. Testando stageAspect em stage-geometry.ts...');
  assert.ok(typeof stageAspect === 'function', 'stageAspect deve ser uma função exportada');
  assert.ok(Math.abs(stageAspect(1080, 1920) - 0.5625) < 0.0001, 'stageAspect(1080,1920) ≈ 0.5625');
  assert.strictEqual(stageAspect(1080, 1080), 1, 'stageAspect(1080,1080) === 1');
  console.log('   ✓ stageAspect calcula proporção corretamente');

  console.log('9. Testando IDB V1→V2 migration (studio-idb.ts)...');
  assert.match(idbSrc, /DB_VERSION\s*=\s*2/, 'DB_VERSION deve ser 2');
  assert.match(idbSrc, /onupgradeneeded/, 'deve ter handler onupgradeneeded');
  assert.match(idbSrc, /oldVersion\s*<\s*2/, 'deve verificar oldVersion < 2');
  assert.match(idbSrc, /keyPath:\s*['"]storageKey['"]/, "deve usar keyPath: 'storageKey'");
  assert.match(idbSrc, /function buildStorageKey/, 'deve exportar buildStorageKey');
  console.log('   ✓ studio-idb.ts contém migração V1→V2 correta');

  console.log('10. Testando sanitizeDraftForStorage...');
  assert.ok(typeof sanitizeDraftForStorage === 'function', 'sanitizeDraftForStorage deve ser uma função');
  const draftWithResolved = {
    id: 'draft-test',
    storageKey: 'personal:user-1:1',
    slotIndex: 1,
    slides: [
      {
        id: 'slide-1',
        layers: [
          { id: 'img-1', type: 'image', src: 'blob:http://localhost/abc', resolvedUrl: 'blob:http://localhost/abc', vaultRelativePath: 'img.png' },
        ],
      },
    ],
  };
  const sanitized = sanitizeDraftForStorage(draftWithResolved);
  const sanitizedLayer = sanitized.slides[0].layers[0];
  assert.ok(!sanitizedLayer.resolvedUrl, 'sanitizeDraftForStorage deve remover resolvedUrl');
  console.log('   ✓ sanitizeDraftForStorage remove resolvedUrl antes de persistir');

  console.log('\n✅ TODOS OS 10 TESTES DA ONDA 3 PASSARAM COM SUCESSO!\n');
} finally {
  tsLoader.cleanup();
}
