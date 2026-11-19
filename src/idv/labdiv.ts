/*!
 * Hub de Comunicação Científica Lab-Div V3.0
 * Copyright (C) 2026 João Paulo Stangorlini de Carvalho
 *
 * Este programa é software livre: você pode redistribuí-lo e/ou modificá-lo
 * sob os termos da Licença Pública Geral Affero GNU (AGPLv3) conforme
 * publicada pela Free Software Foundation.
 */

import type { InitiativeIdvDefinition } from './types';

export const LABDIV_IDV: InitiativeIdvDefinition = {
  id: 'labdiv',
  name: 'LabDiv IFUSP',
  shortLabel: 'LabDiv',
  colors: {
    primary: '#1F9FCF',
    primaryContainer: '#0F4780',
    secondary: '#FFCC00',
    tertiary: '#F14343',
    bgApp: '#121212',
    bgSurface: '#1E1E1E',
    brandVariants: ['#0F4780', '#1F9FCF', '#FFCC00', '#F14343', '#0F6688'],
  },
  lightColors: {
    primary: '#0F4780',
    primaryContainer: '#1F9FCF',
    secondary: '#FFCC00',
    tertiary: '#F14343',
    bgApp: '#F8FAFC',
    bgSurface: '#FFFFFF',
  },
  fonts: {
    display: 'var(--font-bukra), "29LT Bukra Semi Wide Bold", sans-serif',
    body: 'var(--font-open-sans), "Open Sans", sans-serif',
  },
  shape: 'm3-rounded',
  backdropPattern: 'labdiv-aura',
  assets: {
    logoSvg: '/icone-HUBLabDiv.svg',
    faviconSvg: '/icone-HUBLabDiv-circular.svg',
    bgPatternSvg: '/bg-if.svg',
  },
};
