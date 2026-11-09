// Este programa é um software livre (Licença AGPLv3)
import fs from 'node:fs';
import path from 'node:path';

console.log('================================================================');
console.log('AUDITORIA AUTOMATIZADA: TEMA, COACH MARKS, DOCUMENTAÇÃO E AGPLv3');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    failedTests++;
  }
}

// -----------------------------------------------------------------------------
// 1. CÁLCULO E VALIDAÇÃO DE CONTRASTE WCAG AA (>= 4.5:1)
// -----------------------------------------------------------------------------
console.log('--- 1. Verificação Matemática de Contraste WCAG AA (10 Combinações) ---');

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function getRelativeLuminance([r8, g8, b8]) {
  const [r, g, b] = [r8, g8, b8].map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hexToRgb(hex1));
  const l2 = getRelativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Definições das 5 paletas rigorosamente calibradas para WCAG AA >= 4.5:1
const palettes = [
  {
    id: 'purple-gold',
    name: 'Roxo & Dourado',
    dark: {
      primaryBg: '#9D4EDD',
      onPrimary: '#FFFFFF',
      secondaryBg: '#FFCC00',
      onSecondary: '#121212',
    },
    light: {
      primaryBg: '#7B2CBF',
      onPrimary: '#FFFFFF',
      secondaryBg: '#F5B800',
      onSecondary: '#121212',
      secondaryText: '#9A6B00',
      surface: '#FFFFFF',
    },
  },
  {
    id: 'blue-red',
    name: 'Azul & Vermelho',
    dark: {
      primaryBg: '#2563EB',
      onPrimary: '#FFFFFF',
      secondaryBg: '#E11D48',
      onSecondary: '#FFFFFF',
    },
    light: {
      primaryBg: '#1D4ED8',
      onPrimary: '#FFFFFF',
      secondaryBg: '#BE123C',
      onSecondary: '#FFFFFF',
      secondaryText: '#BE123C',
      surface: '#FFFFFF',
    },
  },
  {
    id: 'pink-green',
    name: 'Rosa & Verde',
    dark: {
      primaryBg: '#DB2777',
      onPrimary: '#FFFFFF',
      secondaryBg: '#10B981',
      onSecondary: '#06281E',
    },
    light: {
      primaryBg: '#BE185D',
      onPrimary: '#FFFFFF',
      secondaryBg: '#10B981',
      onSecondary: '#06281E',
      secondaryText: '#047857',
      surface: '#FFFFFF',
    },
  },
  {
    id: 'cyan-amber',
    name: 'Ciano & Âmbar',
    dark: {
      primaryBg: '#06B6D4',
      onPrimary: '#06262D',
      secondaryBg: '#F59E0B',
      onSecondary: '#121212',
    },
    light: {
      primaryBg: '#0E7490',
      onPrimary: '#FFFFFF',
      secondaryBg: '#D97706',
      onSecondary: '#121212',
      secondaryText: '#B45309',
      surface: '#FFFFFF',
    },
  },
  {
    id: 'emerald-violet',
    name: 'Esmeralda & Violeta',
    dark: {
      primaryBg: '#10B981',
      onPrimary: '#06281E',
      secondaryBg: '#7C3AED',
      onSecondary: '#FFFFFF',
    },
    light: {
      primaryBg: '#047857',
      onPrimary: '#FFFFFF',
      secondaryBg: '#6D28D9',
      onSecondary: '#FFFFFF',
      secondaryText: '#6D28D9',
      surface: '#FFFFFF',
    },
  },
];

for (const p of palettes) {
  // 1. Escuro: Botão Primário
  const cDarkPri = getContrastRatio(p.dark.primaryBg, p.dark.onPrimary);
  assert(
    cDarkPri >= 4.5,
    `${p.name} [Dark]: Botão Primário (${p.dark.onPrimary} sobre ${p.dark.primaryBg}) ratio = ${cDarkPri.toFixed(2)}:1 >= 4.5:1`
  );

  // 2. Escuro: Botão Secundário
  const cDarkSec = getContrastRatio(p.dark.secondaryBg, p.dark.onSecondary);
  assert(
    cDarkSec >= 4.5,
    `${p.name} [Dark]: Botão Secundário (${p.dark.onSecondary} sobre ${p.dark.secondaryBg}) ratio = ${cDarkSec.toFixed(2)}:1 >= 4.5:1`
  );

  // 3. Claro: Botão Primário
  const cLightPri = getContrastRatio(p.light.primaryBg, p.light.onPrimary);
  assert(
    cLightPri >= 4.5,
    `${p.name} [Light]: Botão Primário (${p.light.onPrimary} sobre ${p.light.primaryBg}) ratio = ${cLightPri.toFixed(2)}:1 >= 4.5:1`
  );

  // 4. Claro: Botão Secundário
  const cLightSec = getContrastRatio(p.light.secondaryBg, p.light.onSecondary);
  assert(
    cLightSec >= 4.5,
    `${p.name} [Light]: Botão Secundário (${p.light.onSecondary} sobre ${p.light.secondaryBg}) ratio = ${cLightSec.toFixed(2)}:1 >= 4.5:1`
  );

  // 5. Claro: Texto de Destaque Secundário sobre Superfície Branca
  const cLightText = getContrastRatio(p.light.secondaryText, p.light.surface);
  assert(
    cLightText >= 4.5,
    `${p.name} [Light]: Texto Secundário (${p.light.secondaryText} sobre ${p.light.surface}) ratio = ${cLightText.toFixed(2)}:1 >= 4.5:1`
  );
}

// -----------------------------------------------------------------------------
// 2. VERIFICAÇÃO DE SELETORES DO TOUR COACH MARKS ('?')
// -----------------------------------------------------------------------------
console.log('\n--- 2. Verificação de Seletores data-tour nos Componentes ---');

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkFiles(p, exts, out);
    } else if (exts.some((ext) => e.name.endsWith(ext))) {
      out.push(p);
    }
  }
  return out;
}

const stepsFilePath = path.join('src', 'lib', 'coach-marks-steps.ts');
assert(fs.existsSync(stepsFilePath), 'Arquivo src/lib/coach-marks-steps.ts existe');

const stepsContent = fs.readFileSync(stepsFilePath, 'utf8');
const selectorMatches = [...stepsContent.matchAll(/selector:\s*'\[data-tour="([^"]+)"\]'/g)].map(
  (m) => m[1]
);
const uniqueSelectors = Array.from(new Set(selectorMatches));

console.log(`Seletores únicos catalogados no Coach Marks: ${uniqueSelectors.length}`);

const componentFiles = walkFiles(path.join('src', 'components'), ['.tsx', '.ts']);
let combinedComponentsCode = '';
for (const file of componentFiles) {
  combinedComponentsCode += fs.readFileSync(file, 'utf8') + '\n';
}

for (const sel of uniqueSelectors) {
  const hasAttr = combinedComponentsCode.includes(`data-tour="${sel}"`);
  assert(hasAttr, `Elemento com data-tour="${sel}" encontrado nos componentes JSX`);
}

// -----------------------------------------------------------------------------
// 3. AUDITORIA DE README.md EM TODAS AS PASTAS E LICENÇA AGPLv3
// -----------------------------------------------------------------------------
console.log('\n--- 3. Verificação de README.md em Todas as Pastas e Licença AGPLv3 ---');

const expectedReadmes = [
  'README.md',
  'src/app/README.md',
  'src/components/README.md',
  'src/lib/README.md',
  'src/hooks/README.md',
  'src/types/README.md',
  'src/utils/README.md',
  'servidor/README.md',
  'supabase/README.md',
  'tests/README.md',
  'scripts/README.md',
  'LICENSE',
];

for (const doc of expectedReadmes) {
  assert(fs.existsSync(doc), `Documento estrutural obrigatório presente: ${doc}`);
}

// Auditoria de cabeçalho AGPLv3 em 100% dos arquivos de código
const codeTargets = ['src', 'servidor', 'supabase', 'tests', 'scripts'];
let allCodeFiles = [];
for (const t of codeTargets) {
  walkFiles(t, ['.ts', '.tsx', '.css', '.js', '.sh', '.sql', '.mjs', '.py'], allCodeFiles);
}

let missingLicense = [];
for (const f of allCodeFiles) {
  const content = fs.readFileSync(f, 'utf8');
  const firstChunk = content.slice(0, 300);
  if (!firstChunk.includes('AGPLv3') && !firstChunk.includes('Licença AGPLv3')) {
    missingLicense.push(f);
  }
}

assert(
  missingLicense.length === 0,
  `100% dos arquivos de código auditados (${allCodeFiles.length} arquivos) contêm cabeçalho AGPLv3`
);

if (missingLicense.length > 0) {
  console.error('Arquivos sem licença:', missingLicense);
}

// -----------------------------------------------------------------------------
// 4. TESTES DE REGRESSÃO CRÍTICA DOS 22 ITENS DE PRODUÇÃO
// -----------------------------------------------------------------------------
console.log('\n--- 4. Testes de Regressão Crítica dos 22 Itens de Produção ---');

// 4.1 Segurança HMAC em produção
const edgeTicketSrc = fs.readFileSync('src/lib/edge-ticket.ts', 'utf8');
assert(
  edgeTicketSrc.includes("NODE_ENV === 'production'") &&
    edgeTicketSrc.includes('EDGE_HMAC_SECRET não configurada em ambiente de produção'),
  'Segredo HMAC previsível derivado de Supabase bloqueado em produção (Item 1)'
);

// 4.2 Isolamento multi-tenant do acervo fotográfico
const catalogSrc = fs.readFileSync('src/lib/portfolio-catalog.ts', 'utf8');
assert(
  catalogSrc.includes('PRIMARY_ADMIN_UUID') &&
    catalogSrc.includes('userId !== PRIMARY_ADMIN_UUID'),
  'Trava PRIMARY_ADMIN_UUID ativa no catálogo pessoal (Item 2)'
);
assert(
  catalogSrc.includes("visibility', 'public'") &&
    catalogSrc.includes('options?.currentAuthUserId === userId'),
  'Filtro de privacidade e restrição de upsert apenas para o dono (Item 2)'
);

// 4.3 Fallback de seed Vercel Serverless
assert(
  fs.existsSync('src/lib/portfolio-catalog-seed.json'),
  'Seed empacotado src/lib/portfolio-catalog-seed.json existe no repositório (Item 3)'
);

// 4.4 Pilar de nutrição / refeições e timers
const selfCareSrc = fs.readFileSync('src/lib/self-care-config.ts', 'utf8');
assert(
  selfCareSrc.includes('nutrition_meals') && selfCareSrc.includes('Comer / Refeições'),
  'Pilar obrigatório nutrition_meals catalogado com horários fixos (Item 11)'
);

// 4.5 Configuração modular e presets
const modulesSrc = fs.readFileSync('src/lib/modules-config.ts', 'utf8');
assert(
  modulesSrc.includes('server-only') &&
    modulesSrc.includes('server-portfolio') &&
    modulesSrc.includes('business-card') &&
    modulesSrc.includes('tasks-care') &&
    modulesSrc.includes('full'),
  'Todos os 5 Presets modulares implementados em modules-config.ts (Item 10)'
);

// 4.6 ThemedTopLoader e Loading adaptativo
const loadingSrc = fs.readFileSync('src/app/loading.tsx', 'utf8');
assert(
  loadingSrc.includes('ThemedAurtisticLogo'),
  'src/app/loading.tsx utiliza ThemedAurtisticLogo (Item 9)'
);

const layoutSrc = fs.readFileSync('src/app/layout.tsx', 'utf8');
assert(
  layoutSrc.includes('<ThemedTopLoader />'),
  'ThemedTopLoader renderizado no layout raiz (Item 9)'
);

// 4.7 Ação de download de Álbum ZIP
const dashboardActionsSrc = fs.readFileSync('src/app/(dashboard)/actions.ts', 'utf8');
assert(
  dashboardActionsSrc.includes('getPortfolioAlbumZipUrlAction'),
  'Server Action getPortfolioAlbumZipUrlAction implementada (Item 6)'
);

// 4.8 Hooks customizados
assert(
  fs.existsSync('src/hooks/useEdgeUpload.ts') && fs.existsSync('src/hooks/useTenantTicketRefresh.ts'),
  'Hooks useEdgeUpload.ts e useTenantTicketRefresh.ts presentes em src/hooks/ (Item 17)'
);

// 4.9 Logotipos Autênticos e Ícones Temáticos
console.log('\n--- 5. Validação dos Logotipos e Ícones Oficiais Autênticos ---');
const palettesList = ['purple-gold', 'blue-red', 'pink-green', 'cyan-amber', 'emerald-violet'];
for (const p of palettesList) {
  assert(
    fs.existsSync(`public/logos/logo-${p}-dark.png`) &&
      fs.existsSync(`public/logos/logo-${p}-light.png`),
    `Logotipos autênticos gerados para ${p} (Dark e Light)`
  );
  assert(
    fs.existsSync(`public/icons/icon-${p}.png`),
    `Ícone temático gerado para Favicon/PWA (${p})`
  );
}

const logoCompSrc = fs.readFileSync('src/components/theme/ThemedAurtisticLogo.tsx', 'utf8');
assert(
  logoCompSrc.includes('/logos/logo-') && logoCompSrc.includes('aurtistic_logo_white_v3.png'),
  'ThemedAurtisticLogo renderiza imagens autênticas com fallback para o logotipo original'
);

const themeProviderSrc = fs.readFileSync('src/components/theme/ThemeProvider.tsx', 'utf8');
assert(
  themeProviderSrc.includes('/icons/icon-') && themeProviderSrc.includes('link[rel='),
  'ThemeProvider atualiza dinamicamente o favicon e apple-touch-icon no DOM da aba'
);

console.log('\n================================================================');
console.log(`RESULTADO FINAL: ${passedTests} testes passaram, ${failedTests} falharam (Total: ${totalTests})`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
