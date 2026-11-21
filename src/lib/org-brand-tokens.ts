// Este programa é um software livre (Licença AGPLv3)
// Motor compartilhado de Identidade Visual (IDV) por Organização

export type OrgBrandSlug = 'show-da-fisica' | 'labdiv' | 'hs';

export interface OrgBrandTokens {
  themeId: OrgBrandSlug;
  displayName: string;
  badgeTag: string;
  bgApp: string;
  bgSurface: string;
  textPrimary: string;
  textMuted: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  containerColor: string;
  accents: string[];
  fontDisplay: string;
  fontBody: string;
  googleFontsHref: string;
  uppercaseTitles: boolean;
  letterSpacingTitle: string;
  glowIntensity: number;
  titleShadowCss: string;
  borderStyleCss: string;
  tricolorTitlePreset: boolean;
  defaultPostTitle: string;
  defaultPostBody: string;
}

export const ORG_BRAND_PRESETS: Record<string, OrgBrandTokens> = {
  'show-da-fisica': {
    themeId: 'show-da-fisica',
    displayName: 'Show de Física',
    badgeTag: 'SHOW DE FÍSICA • IFUSP',
    bgApp: '#040714',
    bgSurface: '#090e24',
    textPrimary: '#ffffff',
    textMuted: '#93c5fd',
    primaryColor: '#00D4FF',
    secondaryColor: '#FFE600',
    tertiaryColor: '#FF1E56',
    containerColor: '#002FFE',
    accents: ['#FF1E56', '#00D4FF', '#00FF66', '#FFE600'],
    fontDisplay: "'Orbitron', sans-serif",
    fontBody: "'Inter', 'Plus Jakarta Sans', sans-serif",
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Orbitron:wght@700;800;900&display=swap',
    uppercaseTitles: true,
    letterSpacingTitle: '0.08em',
    glowIntensity: 1.2,
    titleShadowCss: '0 0 10px rgba(0, 212, 255, 0.8), 0 0 25px rgba(255, 30, 86, 0.5), 0 0 45px rgba(0, 102, 255, 0.4)',
    borderStyleCss: '1.5px solid rgba(0, 212, 255, 0.5)',
    tricolorTitlePreset: true,
    defaultPostTitle: '[r:SHOW] [b:DE] [g:FÍSICA]',
    defaultPostBody:
      'Você sabia que *Marie Curie* foi a primeira pessoa a ganhar *dois Prêmios Nobel* em campos diferentes?',
  },
  labdiv: {
    themeId: 'labdiv',
    displayName: 'LabDiv IFUSP',
    badgeTag: 'LABDIV • DIVULGAÇÃO CIENTÍFICA',
    bgApp: '#070c16',
    bgSurface: '#0d1524',
    textPrimary: '#f8fafc',
    textMuted: '#94a3b8',
    primaryColor: '#1F9FCF',
    secondaryColor: '#FFCC00',
    tertiaryColor: '#F14343',
    containerColor: '#0F4780',
    accents: ['#1F9FCF', '#F14343', '#FFCC00', '#0F4780'],
    fontDisplay: "'Space Grotesk', 'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Space+Grotesk:wght@600;700&display=swap',
    uppercaseTitles: false,
    letterSpacingTitle: '-0.02em',
    glowIntensity: 0.75,
    titleShadowCss: '0 0 14px rgba(31, 159, 207, 0.35), 0 4px 20px rgba(241, 67, 67, 0.20)',
    borderStyleCss: '1.5px solid rgba(31, 159, 207, 0.35)',
    tricolorTitlePreset: false,
    defaultPostTitle: 'Ciência Aberta no *IFUSP*',
    defaultPostBody:
      'Comunicação científica acessível, visual e conectada com quem faz pesquisa na universidade pública.',
  },
  hs: {
    themeId: 'hs',
    displayName: 'Hackerspace IFUSP',
    badgeTag: '[SYSTEM] HACKERSPACE • IFUSP',
    bgApp: '#080808',
    bgSurface: '#101412',
    textPrimary: '#e2f1e8',
    textMuted: '#86efac',
    primaryColor: '#00ff66',
    secondaryColor: '#ffcc00',
    tertiaryColor: '#06b6d4',
    containerColor: '#0b2918',
    accents: ['#00ff66', '#ffcc00', '#06b6d4'],
    fontDisplay: "'JetBrains Mono', monospace",
    fontBody: "'Open Sans', 'Inter', sans-serif",
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700;800&family=Open+Sans:wght@400;600;700&display=swap',
    uppercaseTitles: true,
    letterSpacingTitle: '0.06em',
    glowIntensity: 0.75,
    titleShadowCss: '0 0 10px rgba(0, 255, 102, 0.6)',
    borderStyleCss: '1px solid rgba(0, 255, 102, 0.35)',
    tricolorTitlePreset: false,
    defaultPostTitle: '[g:> HACKERSPACE] [y:OFICINA]',
    defaultPostBody:
      'Bancadas abertas de *eletrônica*, *impressão 3D* e hardware livre todas as semanas no IFUSP.',
  },
};

export function normalizeOrgBrandSlug(slugOrName?: string | null): string {
  const raw = (slugOrName || '').toLowerCase().trim();
  if (!raw) return 'labdiv';
  if (raw.includes('show') || raw === 'sdf') return 'show-da-fisica';
  if (raw === 'hs' || raw.includes('hacker')) return 'hs';
  if (raw === 'labdiv' || raw.includes('divulgacao') || raw.includes('divulgação')) return 'labdiv';
  return raw;
}

export function resolveOrgBrandTokens(
  slug?: string | null,
  brandConfig?: Record<string, unknown> | null
): OrgBrandTokens {
  const key = normalizeOrgBrandSlug(slug);
  const preset = ORG_BRAND_PRESETS[key as OrgBrandSlug] || ORG_BRAND_PRESETS['labdiv'];
  // Organizações oficiais do ecossistema preservam estritamente seu preset canônico de IDV
  if (key === 'labdiv' || key === 'show-da-fisica' || key === 'hs') {
    return preset;
  }
  if (!brandConfig || typeof brandConfig !== 'object') return preset;

  return {
    ...preset,
    bgApp: typeof brandConfig.bgApp === 'string' ? brandConfig.bgApp : preset.bgApp,
    bgSurface: typeof brandConfig.bgSurface === 'string' ? brandConfig.bgSurface : preset.bgSurface,
    textPrimary: typeof brandConfig.textPrimary === 'string' ? brandConfig.textPrimary : preset.textPrimary,
    accents: Array.isArray(brandConfig.accents) && brandConfig.accents.length > 0
      ? (brandConfig.accents as string[])
      : preset.accents,
    uppercaseTitles:
      typeof brandConfig.uppercaseTitles === 'boolean'
        ? brandConfig.uppercaseTitles
        : preset.uppercaseTitles,
    glowIntensity:
      typeof brandConfig.glowIntensity === 'number'
        ? brandConfig.glowIntensity
        : preset.glowIntensity,
  };
}

export function resolvePersonalStudioTokens(
  palette?: string[] | null,
  mode?: 'dark' | 'light'
): OrgBrandTokens {
  const isDark = mode !== 'light';
  const accents = Array.isArray(palette) && palette.length > 0
    ? palette
    : ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981'];

  return {
    themeId: 'hs',
    displayName: 'Meu Studio',
    badgeTag: 'STUDIO PESSOAL',
    bgApp: isDark ? '#090d16' : '#f8fafc',
    bgSurface: isDark ? '#111827' : '#ffffff',
    textPrimary: isDark ? '#f9fafb' : '#0f172a',
    textMuted: isDark ? '#9ca3af' : '#64748b',
    primaryColor: accents[0] || '#3b82f6',
    secondaryColor: accents[1] || '#8b5cf6',
    tertiaryColor: accents[2] || '#ec4899',
    containerColor: isDark ? '#1e293b' : '#f1f5f9',
    accents,
    fontDisplay: "'Plus Jakarta Sans', 'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap',
    uppercaseTitles: false,
    letterSpacingTitle: '-0.02em',
    glowIntensity: 0.6,
    titleShadowCss: 'none',
    borderStyleCss: '1px solid rgba(255, 255, 255, 0.1)',
    tricolorTitlePreset: false,
    defaultPostTitle: 'Meu Novo Projeto',
    defaultPostBody: 'Crie posts, carrosséis e histórias com a sua identidade visual pessoal.',
  };
}

