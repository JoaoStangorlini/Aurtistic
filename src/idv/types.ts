// Este programa é um software livre (Licença AGPLv3)
import type { ThemePaletteId } from '@/lib/theme-config';

export interface InitiativeIdvDefinition {
  id: ThemePaletteId;
  category?: 'native' | 'org';
  name: string;
  shortLabel: string;
  colors: {
    primary: string;
    primaryContainer: string;
    secondary: string;
    tertiary: string;
    bgApp: string;
    bgSurface: string;
    bgElevated?: string;
    onPrimary?: string;
    onSecondary?: string;
    brandVariants?: string[];
  };
  lightColors: {
    primary: string;
    primaryContainer: string;
    secondary: string;
    tertiary?: string;
    bgApp: string;
    bgSurface: string;
    onPrimary?: string;
    onSecondary?: string;
  };
  fonts: {
    display: string;
    body: string;
  };
  shape: 'm3-rounded' | 'neon-sharp';
  backdropPattern?: string;
  assets?: {
    faviconPng?: string;
    faviconSvg?: string;
    bgPatternSvg?: string;
    logoSvg?: string;
  };
}

export const AURTISTIC_SURFACE_TOKENS = {
  dark: {
    bgApp: '#121212',
    bgSurface: '#1A1A1A',
    bgElevated: '#242424',
    bgHover: '#2D2D2D',
    borderSubtle: '#2D2D2D',
    textPrimary: '#F5F5F5',
    textSecondary: '#A0A0A0',
    textMuted: '#8E8E8E',
  },
  light: {
    bgApp: '#F4F5F8',
    bgSurface: '#FFFFFF',
    bgElevated: '#ECEEF3',
    bgHover: '#E2E5EC',
    borderSubtle: '#D8DCE6',
    textPrimary: '#14161A',
    textSecondary: '#4E5564',
    textMuted: '#6E7687',
  },
} as const;

export const LABDIV_OFFICIAL_PALETTE = {
  yellow: '#FFCC00',
  red: '#F14343',
  blueDeep: '#0F4780',
  blueCyan: '#1F9FCF',
} as const;
