/*!
 * Hub de Comunicação Científica Lab-Div V3.0
 * Copyright (C) 2026 João Paulo Stangorlini de Carvalho
 *
 * Este programa é software livre: você pode redistribuí-lo e/ou modificá-lo
 * sob os termos da Licença Pública Geral Affero GNU (AGPLv3) conforme
 * publicada pela Free Software Foundation.
 */

import type { InitiativeIdvDefinition } from './types';

export const SHOW_DA_FISICA_IDV: InitiativeIdvDefinition = {
  id: 'show-da-fisica',
  name: 'Show de Física',
  shortLabel: 'Show',
  colors: {
    primary: '#00D4FF',
    primaryContainer: '#002FFE',
    secondary: '#FFE600',
    tertiary: '#FF1E56',
    bgApp: '#040714',
    bgSurface: '#090e24',
    // Paleta completa (telão ao vivo + bg-show.svg + badges do espetáculo)
    brandVariants: ['#002FFE', '#00D4FF', '#01F300', '#F60011', '#FF1E56', '#FFE600'],
  },
  lightColors: {
    primary: '#002FFE',
    primaryContainer: '#0052CC',
    secondary: '#FFCC00',
    tertiary: '#F60011',
    bgApp: '#F8FAFC',
    bgSurface: '#FFFFFF',
  },
  fonts: {
    display: '"Orbitron", var(--font-bukra), sans-serif',
    body: 'var(--font-open-sans), "Open Sans", sans-serif',
  },
  shape: 'neon-sharp',
  backdropPattern: 'show-svg',
  assets: {
    bgPatternSvg: '/bg-show.svg',
  },
};
