// Este programa é um software livre (Licença AGPLv3)
import type { ThemePaletteId } from '@/lib/theme-config';
import { AURTISTIC_SURFACE_TOKENS, type InitiativeIdvDefinition } from './types';

const DEFAULT_DISPLAY_FONT = "var(--font-bukra), 'Arial Black', sans-serif";
const DEFAULT_BODY_FONT = "var(--font-open-sans), 'Open Sans', sans-serif";

export const PURPLE_GOLD_IDV: InitiativeIdvDefinition = {
  id: 'purple-gold',
  category: 'native',
  name: 'Roxo & Dourado (Padrão Aurtistic)',
  shortLabel: 'Roxo & Dourado',
  colors: {
    primary: '#9D4EDD',
    primaryContainer: '#8B3DCA',
    secondary: '#FFCC00',
    tertiary: '#F14343',
    bgApp: AURTISTIC_SURFACE_TOKENS.dark.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.dark.bgSurface,
    bgElevated: AURTISTIC_SURFACE_TOKENS.dark.bgElevated,
    onPrimary: '#FFFFFF',
    onSecondary: '#121212',
  },
  lightColors: {
    primary: '#7B2CBF',
    primaryContainer: '#6A24A6',
    secondary: '#F5B800',
    bgApp: AURTISTIC_SURFACE_TOKENS.light.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.light.bgSurface,
    onPrimary: '#FFFFFF',
    onSecondary: '#121212',
  },
  fonts: { display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT },
  shape: 'm3-rounded',
  assets: { faviconPng: '/icons/icon-purple-gold.png' },
};

export const BLUE_RED_IDV: InitiativeIdvDefinition = {
  id: 'blue-red',
  category: 'native',
  name: 'Azul & Vermelho',
  shortLabel: 'Azul & Vermelho',
  colors: {
    primary: '#2563EB',
    primaryContainer: '#1D4ED8',
    secondary: '#E11D48',
    tertiary: '#FFCC00',
    bgApp: AURTISTIC_SURFACE_TOKENS.dark.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.dark.bgSurface,
    bgElevated: AURTISTIC_SURFACE_TOKENS.dark.bgElevated,
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
  },
  lightColors: {
    primary: '#1D4ED8',
    primaryContainer: '#1E40AF',
    secondary: '#BE123C',
    bgApp: AURTISTIC_SURFACE_TOKENS.light.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.light.bgSurface,
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
  },
  fonts: { display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT },
  shape: 'm3-rounded',
  assets: { faviconPng: '/icons/icon-blue-red.png' },
};

export const PINK_GREEN_IDV: InitiativeIdvDefinition = {
  id: 'pink-green',
  category: 'native',
  name: 'Rosa & Verde',
  shortLabel: 'Rosa & Verde',
  colors: {
    primary: '#DB2777',
    primaryContainer: '#BE185D',
    secondary: '#10B981',
    tertiary: '#FFCC00',
    bgApp: AURTISTIC_SURFACE_TOKENS.dark.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.dark.bgSurface,
    bgElevated: AURTISTIC_SURFACE_TOKENS.dark.bgElevated,
    onPrimary: '#FFFFFF',
    onSecondary: '#06281E',
  },
  lightColors: {
    primary: '#BE185D',
    primaryContainer: '#9D174D',
    secondary: '#10B981',
    bgApp: AURTISTIC_SURFACE_TOKENS.light.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.light.bgSurface,
    onPrimary: '#FFFFFF',
    onSecondary: '#06281E',
  },
  fonts: { display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT },
  shape: 'm3-rounded',
  assets: { faviconPng: '/icons/icon-pink-green.png' },
};

export const CYAN_AMBER_IDV: InitiativeIdvDefinition = {
  id: 'cyan-amber',
  category: 'native',
  name: 'Ciano & Âmbar',
  shortLabel: 'Ciano & Âmbar',
  colors: {
    primary: '#06B6D4',
    primaryContainer: '#0891B2',
    secondary: '#F59E0B',
    tertiary: '#F14343',
    bgApp: AURTISTIC_SURFACE_TOKENS.dark.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.dark.bgSurface,
    bgElevated: AURTISTIC_SURFACE_TOKENS.dark.bgElevated,
    onPrimary: '#06262D',
    onSecondary: '#121212',
  },
  lightColors: {
    primary: '#0E7490',
    primaryContainer: '#155E75',
    secondary: '#D97706',
    bgApp: AURTISTIC_SURFACE_TOKENS.light.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.light.bgSurface,
    onPrimary: '#FFFFFF',
    onSecondary: '#121212',
  },
  fonts: { display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT },
  shape: 'm3-rounded',
  assets: { faviconPng: '/icons/icon-cyan-amber.png' },
};

export const EMERALD_VIOLET_IDV: InitiativeIdvDefinition = {
  id: 'emerald-violet',
  category: 'native',
  name: 'Esmeralda & Violeta',
  shortLabel: 'Esmeralda & Violeta',
  colors: {
    primary: '#10B981',
    primaryContainer: '#059669',
    secondary: '#7C3AED',
    tertiary: '#FFCC00',
    bgApp: AURTISTIC_SURFACE_TOKENS.dark.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.dark.bgSurface,
    bgElevated: AURTISTIC_SURFACE_TOKENS.dark.bgElevated,
    onPrimary: '#06281E',
    onSecondary: '#FFFFFF',
  },
  lightColors: {
    primary: '#047857',
    primaryContainer: '#065F46',
    secondary: '#6D28D9',
    bgApp: AURTISTIC_SURFACE_TOKENS.light.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.light.bgSurface,
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
  },
  fonts: { display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT },
  shape: 'm3-rounded',
  assets: { faviconPng: '/icons/icon-emerald-violet.png' },
};

export const LABDIV_IDV: InitiativeIdvDefinition = {
  id: 'labdiv',
  category: 'org',
  name: 'LabDiv IFUSP',
  shortLabel: 'LabDiv',
  colors: {
    primary: '#1F9FCF',
    primaryContainer: '#0F4780',
    secondary: '#FFCC00',
    tertiary: '#F14343',
    bgApp: AURTISTIC_SURFACE_TOKENS.dark.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.dark.bgSurface,
    bgElevated: AURTISTIC_SURFACE_TOKENS.dark.bgElevated,
    onPrimary: '#041222',
    onSecondary: '#121212',
  },
  lightColors: {
    primary: '#0F4780',
    primaryContainer: '#0F6688',
    secondary: '#F14343',
    bgApp: AURTISTIC_SURFACE_TOKENS.light.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.light.bgSurface,
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
  },
  fonts: { display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT },
  shape: 'm3-rounded',
  assets: { faviconPng: '/icone-HUBLabDiv.svg' },
};

export const SHOW_DA_FISICA_IDV: InitiativeIdvDefinition = {
  id: 'show-da-fisica',
  category: 'org',
  name: 'Show de Física',
  shortLabel: 'Show',
  colors: {
    primary: '#0066FF',
    primaryContainer: '#002FFE',
    secondary: '#FF1E56',
    tertiary: '#01F300',
    bgApp: '#040714',
    bgSurface: '#090e24',
    bgElevated: '#0f1733',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
  },
  lightColors: {
    primary: '#0052CC',
    primaryContainer: '#003D99',
    secondary: '#E11D48',
    bgApp: AURTISTIC_SURFACE_TOKENS.light.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.light.bgSurface,
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
  },
  fonts: { display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT },
  shape: 'neon-sharp',
  assets: { bgPatternSvg: '/bg-show.svg' },
};

export const HACKERSPACE_IDV: InitiativeIdvDefinition = {
  id: 'hs',
  category: 'org',
  name: 'Hackerspace IFUSP',
  shortLabel: 'Hackerspace',
  colors: {
    primary: '#00FF66',
    primaryContainer: '#00CC52',
    secondary: '#FFCC00',
    tertiary: '#06B6D4',
    bgApp: '#060a08',
    bgSurface: '#101412',
    bgElevated: '#171d1a',
    onPrimary: '#041A0E',
    onSecondary: '#121212',
  },
  lightColors: {
    primary: '#059669',
    primaryContainer: '#047857',
    secondary: '#D97706',
    bgApp: AURTISTIC_SURFACE_TOKENS.light.bgApp,
    bgSurface: AURTISTIC_SURFACE_TOKENS.light.bgSurface,
    onPrimary: '#FFFFFF',
    onSecondary: '#121212',
  },
  fonts: { display: "'JetBrains Mono', monospace", body: DEFAULT_BODY_FONT },
  shape: 'neon-sharp',
};

export const INITIATIVE_IDV_MAP: Record<ThemePaletteId, InitiativeIdvDefinition> = {
  'purple-gold': PURPLE_GOLD_IDV,
  'blue-red': BLUE_RED_IDV,
  'pink-green': PINK_GREEN_IDV,
  'cyan-amber': CYAN_AMBER_IDV,
  'emerald-violet': EMERALD_VIOLET_IDV,
  labdiv: LABDIV_IDV,
  'show-da-fisica': SHOW_DA_FISICA_IDV,
  hs: HACKERSPACE_IDV,
};

export function getAurtisticIdv(id?: string | null): InitiativeIdvDefinition {
  const key = (id || 'purple-gold').toLowerCase().trim() as ThemePaletteId;
  return INITIATIVE_IDV_MAP[key] || PURPLE_GOLD_IDV;
}
