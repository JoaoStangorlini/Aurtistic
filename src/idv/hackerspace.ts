/*!
 * Hub de Comunicação Científica Lab-Div V3.0
 * Copyright (C) 2026 João Paulo Stangorlini de Carvalho
 *
 * Este programa é software livre: você pode redistribuí-lo e/ou modificá-lo
 * sob os termos da Licença Pública Geral Affero GNU (AGPLv3) conforme
 * publicada pela Free Software Foundation.
 */

import type { InitiativeIdvDefinition } from './types';

export const HACKERSPACE_IDV: InitiativeIdvDefinition = {
  id: 'hs',
  name: 'Hackerspace IFUSP',
  shortLabel: 'Hackerspace',
  colors: {
    primary: '#00FF66',
    primaryContainer: '#0B2918',
    secondary: '#FFCC00',
    tertiary: '#06B6D4',
    bgApp: '#060a08',
    bgSurface: '#101412',
    brandVariants: ['#00FF66', '#059669', '#FFCC00', '#06B6D4'],
  },
  lightColors: {
    primary: '#059669',
    primaryContainer: '#047857',
    secondary: '#D97706',
    tertiary: '#0891B2',
    bgApp: '#F8FAFC',
    bgSurface: '#FFFFFF',
  },
  fonts: {
    display: '"JetBrains Mono", monospace',
    body: 'var(--font-open-sans), "Open Sans", sans-serif',
  },
  shape: 'neon-sharp',
  backdropPattern: 'matrix-rain',
};
