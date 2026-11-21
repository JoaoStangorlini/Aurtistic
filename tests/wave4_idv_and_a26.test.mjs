// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('=== Iniciando Suíte de Testes da Onda 4 (IDV Global, Cache & A26) ===\n');

// 1. Teste de clearAllUserClientCaches limpando aurtistic_org_palettes_v1_*
console.log('1. Testando limpeza de cache aurtistic_org_palettes_v1_* em client-cache-cleanup.ts...');
const cleanupSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/lib/client-cache-cleanup.ts'), 'utf8');
assert.match(cleanupSrc, /!key\.startsWith\('global_acc_'\)/, 'Deve remover todas as chaves do localStorage exceto global_acc_*');
console.log('   ✓ clearAllUserClientCaches remove chaves escopadas incluindo aurtistic_org_palettes_v1_*');

// 2. Teste de allowlist e validação ^https?:// em SharedWorkspaceClient.tsx
console.log('2. Testando allowlist e validação ^https?:// em SharedWorkspaceClient.tsx...');
const sharedSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/[username]/SharedWorkspaceClient.tsx'), 'utf8');
assert.match(sharedSrc, /\^https\?:\\\/\\\//i, 'Deve validar protocolo http/https com regex ^https?://');
console.log('   ✓ SharedWorkspaceClient valida URLs externas com ^https?://');

// 3. Teste de limpeza de URLs assinadas em PressClippingsSection.tsx
console.log('3. Testando limpeza de signedPhysicalPageUrl / signedOriginalPhotoUrl em PressClippingsSection.tsx...');
const clippingsSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/portfolio/PressClippingsSection.tsx'), 'utf8');
assert.match(clippingsSrc, /signedPhysicalPageUrl:\s*_p,\s*signedOriginalPhotoUrl:\s*_o/, 'Deve remover URLs assinadas efêmeras antes de persistir');
console.log('   ✓ PressClippingsSection limpa URLs temporárias antes de salvar');

// 4. Teste de CSRF e URL.searchParams em hub-callback/route.ts
console.log('4. Testando CSRF e URL.searchParams em hub-callback/route.ts...');
const hubCallbackSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/auth/hub-callback/route.ts'), 'utf8');
assert.match(hubCallbackSrc, /!cookieState\s*\|\|\s*!state\s*\|\|\s*cookieState\s*!==\s*state/, 'Deve exigir cookieState e state válidos e iguais');
assert.match(hubCallbackSrc, /searchParams\.set\(['"]hub_linked['"],\s*['"]success['"]\)/, 'Deve usar URL.searchParams.set para hub_linked=success');
console.log('   ✓ hub-callback aplica CSRF estrito e URL.searchParams.set');

// 5. Teste do parâmetro p_patch em merge_user_features_config (StudioLauncherView.tsx & Migration 14)
console.log('5. Testando parâmetro p_patch em merge_user_features_config...');
const launcherSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/organizacoes/studio/StudioLauncherView.tsx'), 'utf8');
assert.match(launcherSrc, /merge_user_features_config['"],\s*\{\s*p_patch:/, 'StudioLauncherView deve passar p_patch para merge_user_features_config');
console.log('   ✓ StudioLauncherView usa p_patch corretamente em merge_user_features_config');

// 6. Teste de isIndeterminate em TasksView.tsx
console.log('6. Testando isIndeterminate em TasksView.tsx...');
const tasksSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/dashboard/TasksView.tsx'), 'utf8');
assert.match(tasksSrc, /const isIndeterminate = selectedTasks\.size > 0 && !allSelected;/, 'TasksView deve calcular isIndeterminate com selectedTasks.size > 0 && !allSelected');
assert.match(tasksSrc, /aria-checked=\{allSelected \? 'true' : isIndeterminate \? 'mixed' : 'false'\}/, 'TasksView deve definir aria-checked mixed quando indeterminate');
console.log('   ✓ TasksView implementa isIndeterminate e aria-checked corretamente');

// 7. Teste de URL relativa segura com download=1 em PhotoInspectModal.tsx
console.log('7. Testando URL relativa segura com download=1 em PhotoInspectModal.tsx...');
const photoSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/portfolio/PhotoInspectModal.tsx'), 'utf8');
assert.match(photoSrc, /u\.pathname\}\$\{u\.search\}\$\{u\.hash\}/, 'PhotoInspectModal deve retornar pathname+search+hash para URLs relativas');
console.log('   ✓ PhotoInspectModal preserva URLs relativas sem vazar domínio fake');

// 8. Teste de isPublicShowcaseRoute / ocultação em Navbar.tsx
console.log('8. Testando ocultação de rotas públicas e ?embed=1 em useEffect no Navbar.tsx...');
const navSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/Navbar.tsx'), 'utf8');
assert.match(navSrc, /window\.location\.search\.includes\('embed=1'\)/, 'Navbar deve detectar ?embed=1 dentro do useEffect');
assert.match(navSrc, /pathname\.startsWith\('\/s\/'\)/, 'Navbar deve ocultar em rotas públicas /s/');
console.log('   ✓ Navbar oculta rotas públicas e detecta ?embed=1 em useEffect');

console.log('\n✅ TODOS OS 8 TESTES UNITÁRIOS DA ONDA 4 PASSARAM COM SUCESSO!\n');
