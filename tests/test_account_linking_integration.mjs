// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  signHubSsoTicket,
  verifyHubSsoTicket,
  encryptLinkSecret,
  decryptLinkSecret,
} from '../src/lib/hub-sso.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const env = dotenv.parse(fs.readFileSync(path.join(ROOT_DIR, '.env.local')));
const secret = env.HUB_SSO_SECRET || env.EDGE_HMAC_SECRET || 'test-secret';

console.log('================================================================');
console.log('TESTES DE VINCULAÇÃO DE CONTAS (HUB LABDIV <-> AURTISTIC)');
console.log('================================================================\n');

// 1. Testa Cifragem e Decifragem AES-256-GCM
console.log('--- 1. Cifragem e Decifragem AES-256-GCM de Credencial de Vínculo ---');
const samplePassword = 'AurtisticPassword2026!#';
const encrypted = encryptLinkSecret(samplePassword, secret);
assert.ok(encrypted.includes('.'), 'Payload cifrado deve conter iv, tag e ciphertext separados por ponto');
const [iv, tag, cipher] = encrypted.split('.');
assert.ok(iv && tag && cipher, 'Todos os 3 componentes AEAD devem existir');

const decrypted = decryptLinkSecret(encrypted, secret);
assert.equal(decrypted, samplePassword, 'Texto decifrado deve coincidir estritamente com o original');
console.log('✓ Cifragem e decifragem autenticada validadas com sucesso.');

// 2. Testa Rejeição de Adulteração no Segredo Cifrado
console.log('--- 2. Detecção de Adulteração em Credencial Cifrada (Anti-Tampering) ---');
const tamperedEncrypted = `${iv}.${tag}.${cipher.slice(0, -2)}AA`;
const tamperedResult = decryptLinkSecret(tamperedEncrypted, secret);
assert.equal(tamperedResult, null, 'Cifra adulterada deve falhar autenticação de tag GCM e retornar null');
console.log('✓ Adulteração rejeitada com segurança pelo algoritmo GCM.');

// 3. Testa Redirecionamento da Rota /auth/vincular-conta com Ticket
console.log('--- 3. Verificação da Rota /auth/vincular-conta via HTTP ---');
const testPayload = {
  hubUserId: '8a3e4272-010d-4479-94cb-26178d544ea2',
  email: 'joaopaulostangorlini@usp.br',
  username: 'João Stangorlini',
  fullName: 'Joao Paulo Stangorlini de Carvalho',
  avatarUrl: null,
  isLabdiv: true,
  organizations: ['labdiv'],
  role: 'admin',
};

const ticket = signHubSsoTicket(testPayload, secret, 300);
const res = await fetch(`http://localhost:3000/auth/vincular-conta?ticket=${ticket}&next=/labdiv`);
assert.equal(res.status, 200, 'Página de vinculação deve retornar 200 OK');
const html = await res.text();
assert.ok(html.includes('Joao Paulo Stangorlini'), 'Deve exibir nome do perfil do HUB');
assert.ok(html.includes('Vincular a uma conta existente'), 'Deve conter opção de vincular conta existente');
assert.ok(html.includes('Criar Nova Conta no Aurtistic'), 'Deve conter opção de criar nova conta');
console.log('✓ Tela de vinculação renderizada com sucesso (200 OK).');

// 4. Testa Detecção de Ticket Expirado na Vinculação
console.log('--- 4. Comportamento com Ticket Expirado na Vinculação ---');
const expiredTicket = signHubSsoTicket(testPayload, secret, -10);
const resExpired = await fetch(`http://localhost:3000/auth/vincular-conta?ticket=${expiredTicket}`);
assert.equal(resExpired.status, 200, 'Deve renderizar tela de erro com status 200');
const expiredHtml = await resExpired.text();
assert.ok(expiredHtml.includes('Autorização Expirada'), 'Deve alertar que autorização expirou');
console.log('✓ Ticket expirado tratado com aviso apropriado e botão de retorno.');

console.log('\n================================================================');
console.log('TODOS OS 4 TESTES DE VINCULAÇÃO FORAM APROVADOS COM SUCESSO! ✓');
console.log('================================================================');

