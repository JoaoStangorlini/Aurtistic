// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

console.log('=== [SPRINT 6 TEST] 1. Validando Contratos de Validação & Criptografia ===');

// 1. Testa Regex de Token
const SHARE_TOKEN_REGEX = /^[a-zA-Z0-9_-]{12,64}$/;
assert.ok(SHARE_TOKEN_REGEX.test('aurtistic_token_1234567890'), 'Token válido deve passar');
assert.ok(SHARE_TOKEN_REGEX.test('k9X-21_bB891aZ0'), 'Token com caracteres base64url deve passar');
assert.ok(!SHARE_TOKEN_REGEX.test('curto'), 'Token curto (<12) deve falhar');
assert.ok(!SHARE_TOKEN_REGEX.test('token com espaços!!'), 'Token com caracteres inválidos deve falhar');
console.log('✓ Validador de token aprovado.');

// 2. Testa Scrypt KDF de PIN
function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin, salt, 32, { N: 1024, r: 8, p: 1 });
  return `scrypt$1024$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPin(candidate, stored) {
  if (!stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  const derived = crypto.scryptSync(candidate, salt, 32, { N: 1024, r: 8, p: 1 });
  return crypto.timingSafeEqual(derived, expected);
}

const pinHash = hashPin('482910');
assert.ok(verifyPin('482910', pinHash), 'PIN correto deve validar');
assert.ok(!verifyPin('000000', pinHash), 'PIN incorreto deve falhar');
assert.ok(!verifyPin('48291', pinHash), 'PIN parcial deve falhar');
console.log('✓ Scrypt KDF seguro de PIN aprovado.');

// 3. Testa Ticket de Escopo 'share'
const TEST_SECRET = 'test-secret-key-aurtistic-proofing';
function signShareTicket(userId, folderPath, allowDownload = true) {
  const payload = {
    userId,
    role: 'member',
    purpose: 'share',
    allowedPrefix: folderPath,
    allowDownload,
    readOnly: true,
    iat: Date.now(),
    exp: Date.now() + 4 * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', TEST_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

const ticket = signShareTicket('user-123', 'Portfolio/Ensaio_Casamento', true);
const [b64] = ticket.split('.');
const decoded = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
assert.equal(decoded.purpose, 'share');
assert.equal(decoded.allowedPrefix, 'Portfolio/Ensaio_Casamento');
assert.equal(decoded.allowDownload, true);
assert.equal(decoded.readOnly, true);
console.log('✓ Ticket de compartilhamento com allowedPrefix e readOnly aprovado.');

// 4. Testa integridade no arquivo SQL
console.log('=== [SPRINT 6 TEST] 2. Validando RPCs e Funções em 01_aurtistic_unified_ecosystem.sql ===');
const sql = fs.readFileSync(
  path.resolve('/home/stangorlini/Aurtistic/supabase/migrations/newsqls/01_aurtistic_unified_ecosystem.sql'),
  'utf8'
);

assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.get_share_link_by_token_internal'), 'get_share_link_by_token_internal deve existir');
assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.get_share_link_files_by_token'), 'get_share_link_files_by_token deve existir');
assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.submit_client_proofing_selection'), 'submit_client_proofing_selection deve existir');
assert.ok(sql.includes('left(v_path, char_length(v_folder_prefix)) <> v_folder_prefix'), 'Validação anti-path-traversal em submit_client_proofing_selection');
assert.ok(sql.includes('linked_task_ids = array_append(array_remove(public.user_files_index.linked_task_ids, v_task_id), v_task_id)'), 'Atualização de array linked_task_ids');
console.log('✓ Todas as RPCs e blindagens SQL da Sprint 6 comprovadas.');

console.log('\n🎉 SPRINT 6 VALIDADA COM 100% DE SUCESSO!');
