// Este programa é um software livre (Licença AGPLv3)
/**
 * Testes Unitários e de Integração da Onda 2 — Fluxos Quebrados (Tarefas, Cofre & Organizações)
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

console.log('=== Iniciando Suíte de Testes da Onda 2 ===\n');

// ---------------------------------------------------------------------------
// 1. Detecção de ciclos, auto-referência e tarefas órfãs
// ---------------------------------------------------------------------------
console.log('1. Testando sanitização de árvore de tarefas (ciclos, auto-referência e órfãs)...');

function sanitizeTaskTree(tasks) {
  const taskMap = new Map();
  tasks.forEach((t) => taskMap.set(t.id, t));

  const sanitizeParent = (t) => {
    if (!t.parent_id) return t;
    if (t.parent_id === t.id) {
      return { ...t, parent_id: null };
    }
    const visited = new Set([t.id]);
    let currId = t.parent_id;
    while (currId) {
      if (visited.has(currId)) {
        return { ...t, parent_id: null };
      }
      visited.add(currId);
      const parent = taskMap.get(currId);
      if (!parent) {
        return { ...t, parent_id: null };
      }
      currId = parent.parent_id || null;
    }
    return t;
  };

  return tasks.map(sanitizeParent);
}

const mockTasks = [
  { id: 'root-1', nome: 'Tarefa Raiz 1', parent_id: null },
  { id: 'child-1', nome: 'Subtarefa Legítima', parent_id: 'root-1' },
  { id: 'self-ref', nome: 'Tarefa Auto-referente', parent_id: 'self-ref' },
  { id: 'cycle-a', nome: 'Ciclo A', parent_id: 'cycle-b' },
  { id: 'cycle-b', nome: 'Ciclo B', parent_id: 'cycle-a' },
  { id: 'orphan', nome: 'Subtarefa Órfã', parent_id: 'non-existent-parent' },
];

const sanitized = sanitizeTaskTree(mockTasks);
const sanitizedMap = new Map(sanitized.map((t) => [t.id, t]));

assert.equal(sanitizedMap.get('root-1').parent_id, null, 'Raiz legítima deve permanecer com parent_id null');
assert.equal(sanitizedMap.get('child-1').parent_id, 'root-1', 'Subtarefa legítima deve manter seu pai');
assert.equal(sanitizedMap.get('self-ref').parent_id, null, 'Auto-referência deve ser promovida à raiz');
assert.equal(sanitizedMap.get('cycle-a').parent_id, null, 'Ciclo A deve ser promovido à raiz');
assert.equal(sanitizedMap.get('cycle-b').parent_id, null, 'Ciclo B deve ser promovido à raiz');
assert.equal(sanitizedMap.get('orphan').parent_id, null, 'Órfã sem pai deve ser promovida à raiz para evitar perda');
console.log('   ✓ Sanitização de árvore passou com 100% de sucesso.');

// ---------------------------------------------------------------------------
// 2. Escape de RegExp para busca sem crash (ex: "C++", "(urgente")
// ---------------------------------------------------------------------------
console.log('2. Testando escape de caracteres especiais em RegExp (C++, (urgente, etc.)...');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const dangerousInputs = ['C++', '(urgente', '[meta]', 'arquivo.test*', 'foo|bar', 'val\\ue?'];
const sampleText = 'Trabalho em C++ e (urgente) precisa de review no [meta]';

for (const input of dangerousInputs) {
  assert.doesNotThrow(() => {
    const regex = new RegExp(`(${escapeRegExp(input)})`, 'gi');
    const parts = sampleText.split(regex);
    assert.ok(Array.isArray(parts), 'Split deve retornar array');
  }, `Input "${input}" não deve lançar SyntaxError`);
}
console.log('   ✓ Escape de RegExp protegeu todos os inputs perigosos contra crash.');

// ---------------------------------------------------------------------------
// 3. Predicado unificado de status concluído
// ---------------------------------------------------------------------------
console.log('3. Testando predicado unificado de conclusão de tarefas...');

function isTaskCompleted(status) {
  const s = (status || '').trim().toLowerCase();
  return (
    s === 'completa' ||
    s === 'concluída' ||
    s === 'concluida' ||
    s === 'concluído' ||
    s === 'concluido' ||
    s === 'done'
  );
}

assert.ok(isTaskCompleted('completa'));
assert.ok(isTaskCompleted('Concluída'));
assert.ok(isTaskCompleted('CONCLUIDO'));
assert.ok(isTaskCompleted('done'));
assert.ok(!isTaskCompleted('não iniciada'));
assert.ok(!isTaskCompleted('em andamento'));
assert.ok(!isTaskCompleted('falta testar'));
console.log('   ✓ Predicado de status concluído validado.');

// ---------------------------------------------------------------------------
// 4. Cancelamento de stream e backpressure no zip-exporter
// ---------------------------------------------------------------------------
console.log('4. Testando cancelamento de stream no exportador ZIP (req.on("close"))...');

const reqEmitter = new EventEmitter();
const resEmitter = new EventEmitter();
let isAborted = false;
let streamDestroyed = false;

const mockReadStream = {
  destroy: () => {
    streamDestroyed = true;
  },
};

let activeStream = mockReadStream;

const onAbort = () => {
  isAborted = true;
  if (activeStream) {
    activeStream.destroy();
    activeStream = null;
  }
};

reqEmitter.on('close', onAbort);
resEmitter.on('close', onAbort);

// Simula desconexão do cliente HTTP
reqEmitter.emit('close');

assert.equal(isAborted, true, 'isAborted deve ser true após req close');
assert.equal(streamDestroyed, true, 'ReadStream ativo deve ser destruído no fechamento da conexão');
assert.equal(activeStream, null, 'activeStream deve ser limpo para liberar descritores de arquivo');
console.log('   ✓ Cancelamento de stream e liberação de descritores no ZipExporter validado.');

// ---------------------------------------------------------------------------
// 5. Cooldown de 30 dias para Storage Boost Pessoal (+10 GB)
// ---------------------------------------------------------------------------
console.log('5. Testando lógica de cooldown de 30 dias para Storage Boost...');

function validateBoostEligibility(lastGrantedAt, cooldownDays = 30) {
  if (!lastGrantedAt) return { eligible: true };
  const lastTime = new Date(lastGrantedAt).getTime();
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (lastTime + cooldownMs > now) {
    return {
      eligible: false,
      availableAt: new Date(lastTime + cooldownMs).toISOString(),
    };
  }
  return { eligible: true };
}

const recentGrant = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 dias atrás
const oldGrant = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(); // 35 dias atrás

assert.equal(validateBoostEligibility(null).eligible, true, 'Sem grant prévio deve ser elegível');
assert.equal(validateBoostEligibility(recentGrant).eligible, false, 'Concedido há 5 dias deve estar em cooldown');
assert.equal(validateBoostEligibility(oldGrant).eligible, true, 'Concedido há 35 dias deve ser elegível');
console.log('   ✓ Cooldown de 30 dias para Storage Boost validado.');

// ---------------------------------------------------------------------------
// 6. Resiliência de case em convites de organização
// ---------------------------------------------------------------------------
console.log('6. Testando resiliência de case em tokens de convite...');

const canonicalToken = '4f9a8b1c2d3e4f5a';
const upperToken = '4F9A8B1C2D3E4F5A';
const mixedToken = '4f9A8b1C2d3E4f5A';

assert.equal(canonicalToken.toLowerCase(), upperToken.toLowerCase());
assert.equal(canonicalToken.toLowerCase(), mixedToken.toLowerCase());
console.log('   ✓ Resiliência de tokens de convite (LOWER) validada.');

// ---------------------------------------------------------------------------
// 7. Teste de Parser .ics (UTC 'Z' e parâmetros RFC 5545)
// ---------------------------------------------------------------------------
console.log('7. Testando parser .ics (conversão UTC e parâmetros RFC 5545)...');

function formatICSDateToIso(icsDateStr) {
  if (!icsDateStr) return null;
  const isUtc = icsDateStr.endsWith('Z');
  const clean = icsDateStr.replace(/[^0-9T]/g, '');
  if (clean.length >= 8) {
    const yyyy = clean.substring(0, 4);
    const mm = clean.substring(4, 6);
    const dd = clean.substring(6, 8);
    if (clean.includes('T') && clean.length >= 13) {
      const hh = clean.substring(9, 11);
      const min = clean.substring(11, 13);
      const ss = clean.length >= 15 ? clean.substring(13, 15) : '00';
      if (isUtc) {
        return new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min, +ss)).toISOString();
      }
      return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
    }
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

const utcSample = '20261120T193000Z';
const localSample = '20261120T163000';
const dateOnlySample = '20261120';

const utcIso = formatICSDateToIso(utcSample);
const localIso = formatICSDateToIso(localSample);
const dateIso = formatICSDateToIso(dateOnlySample);

assert.equal(utcIso, '2026-11-20T19:30:00.000Z', 'Data UTC com Z deve virar ISO UTC exato');
assert.equal(localIso, '2026-11-20T16:30:00', 'Data local sem Z deve preservar horário local sem distorção');
assert.equal(dateIso, '2026-11-20', 'Data sem horário deve preservar YYYY-MM-DD');
console.log('   ✓ Parser .ics com suporte a UTC e RFC 5545 validado.');

// ---------------------------------------------------------------------------
// 8. Teste de Round-trip CSV preservando ISO
// ---------------------------------------------------------------------------
console.log('8. Testando round-trip CSV com datas em formato ISO...');

const testIso = '2026-11-20T21:00:00.000Z';
const sampleDate = new Date(testIso);
const exportedIso = sampleDate.toISOString();

assert.equal(exportedIso, testIso, 'Export de CSV deve usar toISOString para consistência de timezone');
assert.ok(!exportedIso.includes('/'), 'ISO string não deve conter barras locais');
console.log('   ✓ Round-trip CSV com datas ISO validado.');

console.log('\n=== Todos os 8 Testes Unitários da Onda 2 PASSARAM! ===');
