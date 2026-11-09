// Este programa é um software livre (Licença AGPLv3)
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT_FILE = path.join(ROOT, '.context', 'CODE_MAP.md');

const IGNORE_DIRS = new Set([
  'node_modules', '.next', '.git', 'android', 'public',
  'data', 'storage', '.deploy_backup', 'tmp_deploy', '.context'
]);

function walk(dir, exts, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, exts, fileList);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      fileList.push(full);
    }
  }
  return fileList;
}

function extractSymbols(filePath) {
  const rel = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const symbols = [];

  const patterns = [
    // Funções, Componentes, Hooks, Types e Interfaces em TS/JS
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/,
    /^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/,
    /^export\s+(?:interface|type|enum)\s+([A-Za-z0-9_]+)/,
    // Rotas Express no servidor/server.js
    /^\s*app\.(get|post|put|delete|use)\(\s*['"`]([^'"`]+)['"`]/,
    // Tabelas e RPCs no SQL
    /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|FUNCTION|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_.]+)/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const regex of patterns) {
      const match = line.match(regex);
      if (match) {
        const label = match[2] ? `${match[1].toUpperCase()} ${match[2]}` : match[1];
        symbols.push(`L${i + 1}:${label}`);
        break;
      }
    }
  }

  return { rel, totalLines: lines.length, symbols };
}

const files = [
  ...walk(path.join(ROOT, 'src'), ['.ts', '.tsx']),
  ...walk(path.join(ROOT, 'servidor'), ['.js']),
  ...walk(path.join(ROOT, 'supabase'), ['.sql']),
];

let md = `# 🗺️ Mapa Cirúrgico de Símbolos e Linhas (Auto-Gerado)\n`;
md += `> **Instrução ao Agente:** Use os números de linha \`L<num>\` abaixo para ler apenas o trecho necessário com \`startLine\` e \`endLine\`. NUNCA leia arquivos >120 linhas inteiros.\n\n`;

for (const f of files) {
  const { rel, totalLines, symbols } = extractSymbols(f);
  if (symbols.length === 0 && totalLines < 40) continue;
  md += `- **\`${rel}\`** (${totalLines}L): ${symbols.join(' | ') || 'Sem exports diretos'}\n`;
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, md, 'utf8');
console.log(`✅ CODE_MAP.md atualizado (${files.length} arquivos mapeados).`);
