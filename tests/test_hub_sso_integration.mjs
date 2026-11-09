// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { signHubSsoTicket, verifyHubSsoTicket } from '../src/lib/hub-sso.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Carrega .env.local do Aurtistic
const env = dotenv.parse(fs.readFileSync(path.join(ROOT_DIR, '.env.local')));
const secret = env.HUB_SSO_SECRET || env.EDGE_HMAC_SECRET || 'test-secret';

console.log('================================================================');
console.log('TESTES DE INTEGRAÇÃO: SINGLE SIGN-ON (SSO) HUB LABDIV <-> AURTISTIC');
console.log('================================================================\n');

// 1. Testa Assinatura e Verificação de Ticket Válido
console.log('--- 1. Assinatura e Verificação Criptográfica de Ticket SSO ---');
const samplePayload = {
  hubUserId: '8a3e4272-010d-4479-94cb-26178d544ea2',
  email: 'joaopaulostangorlini@usp.br',
  username: 'João Stangorlini',
  fullName: 'Joao Paulo Stangorlini de Carvalho',
  avatarUrl: 'https://lh3.googleusercontent.com/avatar.jpg',
  isLabdiv: true,
  organizations: ['labdiv'],
  role: 'admin',
};

const validTicket = signHubSsoTicket(samplePayload, secret, 300);
assert.ok(validTicket.includes('.'), 'Ticket deve conter separador de payload e assinatura');

const result = verifyHubSsoTicket(validTicket, secret);
assert.equal(result.valid, true, 'Ticket válido deve ser aceito');
assert.equal(result.payload?.hubUserId, samplePayload.hubUserId, 'hubUserId deve bater');
assert.equal(result.payload?.username, samplePayload.username, 'username deve bater');
assert.equal(result.payload?.isLabdiv, true, 'isLabdiv deve ser true');
assert.deepEqual(result.payload?.organizations, ['labdiv'], 'organizations deve conter labdiv');
console.log('✓ Ticket gerado e validado com integridade HMAC-SHA256.');

// 2. Testa Rejeição de Ticket Adulterado
console.log('--- 2. Segurança Contra Adulteração (Tampering) ---');
const [payloadB64, sig] = validTicket.split('.');
const tamperedPayloadB64 = Buffer.from(
  JSON.stringify({ ...JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')), role: 'superadmin_hacked' })
).toString('base64url');
const tamperedTicket = `${tamperedPayloadB64}.${sig}`;

const tamperedResult = verifyHubSsoTicket(tamperedTicket, secret);
assert.equal(tamperedResult.valid, false, 'Ticket adulterado deve ser rejeitado');
assert.ok(
  tamperedResult.error?.includes('Assinatura criptográfica'),
  'Erro deve reportar falha na assinatura criptográfica'
);
console.log('✓ Tentativa de adulteração detectada e bloqueada com sucesso.');

// 3. Testa Expiração de Ticket (Replay Attack Prevention)
console.log('--- 3. Prevenção de Ataques de Repetição (Expiration Check) ---');
const expiredTicket = signHubSsoTicket(samplePayload, secret, -10); // expirou há 10 segundos
const expiredResult = verifyHubSsoTicket(expiredTicket, secret);
assert.equal(expiredResult.valid, false, 'Ticket expirado deve ser rejeitado');
assert.ok(expiredResult.error?.includes('expirado'), 'Erro deve reportar expiração');
console.log('✓ Ticket expirado bloqueado automaticamente.');

// 4. Testa Verificação de Membros Cadastrados no HUB Supabase
console.log('--- 4. Conectividade Direta com Banco Supabase do HUB ---');
const { createClient } = await import('@supabase/supabase-js');
const hubClient = createClient(env.HUB_SUPABASE_URL, env.HUB_SUPABASE_ANON_KEY);

const { data: hubProfiles, error: hubErr } = await hubClient
  .from('profiles')
  .select('id, full_name, username, email, is_labdiv')
  .eq('is_labdiv', true);

assert.equal(hubErr, null, 'Consulta ao banco do HUB não deve ter erro');
assert.ok(Array.isArray(hubProfiles) && hubProfiles.length > 0, 'Deve retornar membros ativos do LabDiv');
console.log(`✓ Conectado ao HUB: ${hubProfiles.length} membros do LabDiv identificados.`);

console.log('\n================================================================');
console.log('TODOS OS 4 TESTES DE INTEGRAÇÃO SSO PASSARAM COM SUCESSO! [100%]');
console.log('================================================================');

