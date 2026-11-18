#!/usr/bin/env node
// Este programa é um software livre (Licença AGPLv3)
/**
 * scripts/audit-card-nesting.mjs
 *
 * Auditoria arquitetural de UI em todo o Aurtistic:
 * Regra: Fundo (Tema/BG) -> no máximo 1 Card Principal -> Conteúdo / Botões (sem card dentro de card).
 * Também detecta containers dark hardcoded fora de lightboxes/darkroom.
 *
 * Uso:
 *   node scripts/audit-card-nesting.mjs
 *   node scripts/audit-card-nesting.mjs --fix-dark-cards
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = [path.join(ROOT, 'src/components'), path.join(ROOT, 'src/app')];
const FIX_DARK = process.argv.includes('--fix-dark-cards');

const DARK_CARD_RE = /\bbg-\[(#07090e|#0a0f1d|#0c1220|#0f172a|#0b1121|#121724|#141a28)\]\b/gi;
const CARD_CONTAINER_RE = /\b(bg-surface(?:\/\d+)?|org-card|bg-card)\b/;
const ROUNDED_CARD_RE = /\brounded-(2xl|3xl|xl)\b/;
const IGNORE_FILES = new Set(['canvas-renderer.ts']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function countTagDelta(line) {
  const opens = (line.match(/<(div|section|article|aside|nav|form)\b/g) || []).length;
  const closes = (line.match(/<\/(div|section|article|aside|nav|form)>/g) || []).length;
  return opens - closes;
}

function auditFile(filePath) {
  if (IGNORE_FILES.has(path.basename(filePath))) return { darkHits: [], nestedHits: [] };
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  const rel = path.relative(ROOT, filePath);

  const darkHits = [];
  const nestedHits = [];

  let depth = 0;
  const activeCardDepths = [];

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const isDarkroomOrCanvas =
      line.includes('data-darkroom') ||
      line.includes('<canvas') ||
      line.includes('<iframe') ||
      line.includes('fixed inset-0');

    // 1. Dark hardcoded cards
    if (!isDarkroomOrCanvas && DARK_CARD_RE.test(line)) {
      darkHits.push({ file: rel, line: lineNum, text: line.trim().slice(0, 110) });
    }
    DARK_CARD_RE.lastIndex = 0;

    // 2. Card-in-card nesting (heurística de profundidade JSX)
    const opensContainer = /<(div|section|article|aside)\b/.test(line);
    const hasCardBg = CARD_CONTAINER_RE.test(line) && ROUNDED_CARD_RE.test(line) && /\bp-[3-8]\b/.test(line);

    if (opensContainer && hasCardBg && !isDarkroomOrCanvas) {
      if (activeCardDepths.length > 0) {
        nestedHits.push({
          file: rel,
          line: lineNum,
          parentLine: activeCardDepths[activeCardDepths.length - 1].line,
          text: line.trim().slice(0, 110),
        });
      }
      activeCardDepths.push({ depth, line: lineNum });
    }

    depth += countTagDelta(line);
    while (activeCardDepths.length > 0 && depth <= activeCardDepths[activeCardDepths.length - 1].depth) {
      activeCardDepths.pop();
    }
  });

  if (FIX_DARK && darkHits.length > 0) {
    const updated = lines
      .map((line) => {
        if (line.includes('data-darkroom') || line.includes('<canvas') || line.includes('<iframe')) {
          return line;
        }
        return line.replace(DARK_CARD_RE, 'bg-surface');
      })
      .join('\n');
    if (updated !== raw) {
      fs.writeFileSync(filePath, updated, 'utf8');
    }
  }

  return { darkHits, nestedHits };
}

const files = TARGET_DIRS.flatMap((d) => walk(d));
let totalDark = 0;
let totalNested = 0;
const summaryByFile = [];

for (const f of files) {
  const { darkHits, nestedHits } = auditFile(f);
  totalDark += darkHits.length;
  totalNested += nestedHits.length;
  if (darkHits.length || nestedHits.length) {
    summaryByFile.push({ file: path.relative(ROOT, f), darkHits, nestedHits });
  }
}

console.log(`\n🔍 Auditoria de Cards & Contraste (${files.length} arquivos .tsx)`);
console.log(`   • Fundos dark hardcoded fora de canvas/darkroom: ${totalDark}${FIX_DARK ? ' (corrigidos para bg-surface)' : ''}`);
console.log(`   • Cards aninhados (card dentro de card): ${totalNested}\n`);

for (const item of summaryByFile.slice(0, 25)) {
  console.log(`📄 ${item.file}`);
  for (const d of item.darkHits.slice(0, 5)) {
    console.log(`   [DARK L${d.line}] ${d.text}`);
  }
  for (const n of item.nestedHits.slice(0, 5)) {
    console.log(`   [CARD-IN-CARD L${n.line} <= L${n.parentLine}] ${n.text}`);
  }
}
if (summaryByFile.length > 25) {
  console.log(`\n... e mais ${summaryByFile.length - 25} arquivo(s).`);
}

