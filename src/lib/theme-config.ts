// Este programa é um software livre (Licença AGPLv3)

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = 'light' | 'dark';
export type ThemePaletteId =
  | 'purple-gold'
  | 'blue-red'
  | 'pink-green'
  | 'cyan-amber'
  | 'emerald-violet';

export interface ThemePreferences {
  mode: ThemeMode;
  palette: ThemePaletteId;
}

export interface PaletteDefinition {
  id: ThemePaletteId;
  name: string;
  primary: {
    dark: string;
    light: string;
    onDark: string;
    onLight: string;
  };
  secondary: {
    dark: string;
    light: string;
    textLight: string;
    onDark: string;
    onLight: string;
  };
  preview: {
    primary: string;
    secondary: string;
  };
}

export const THEME_STORAGE_KEY = 'aurtistic_theme_v1';

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  mode: 'system',
  palette: 'purple-gold',
};

export const THEME_PALETTES: Record<ThemePaletteId, PaletteDefinition> = {
  'purple-gold': {
    id: 'purple-gold',
    name: 'Roxo & Dourado',
    primary: {
      dark: '#9D4EDD',
      light: '#7B2CBF',
      onDark: '#FFFFFF',
      onLight: '#FFFFFF',
    },
    secondary: {
      dark: '#FFCC00',
      light: '#F5B800',
      textLight: '#9A6B00',
      onDark: '#121212',
      onLight: '#121212',
    },
    preview: {
      primary: '#9D4EDD',
      secondary: '#FFCC00',
    },
  },
  'blue-red': {
    id: 'blue-red',
    name: 'Azul & Vermelho',
    primary: {
      dark: '#2563EB',
      light: '#1D4ED8',
      onDark: '#FFFFFF',
      onLight: '#FFFFFF',
    },
    secondary: {
      dark: '#E11D48',
      light: '#BE123C',
      textLight: '#BE123C',
      onDark: '#FFFFFF',
      onLight: '#FFFFFF',
    },
    preview: {
      primary: '#2563EB',
      secondary: '#E11D48',
    },
  },
  'pink-green': {
    id: 'pink-green',
    name: 'Rosa & Verde',
    primary: {
      dark: '#DB2777',
      light: '#BE185D',
      onDark: '#FFFFFF',
      onLight: '#FFFFFF',
    },
    secondary: {
      dark: '#10B981',
      light: '#10B981',
      textLight: '#047857',
      onDark: '#06281E',
      onLight: '#06281E',
    },
    preview: {
      primary: '#DB2777',
      secondary: '#10B981',
    },
  },
  'cyan-amber': {
    id: 'cyan-amber',
    name: 'Ciano & Âmbar',
    primary: {
      dark: '#06B6D4',
      light: '#0E7490',
      onDark: '#06262D',
      onLight: '#FFFFFF',
    },
    secondary: {
      dark: '#F59E0B',
      light: '#D97706',
      textLight: '#B45309',
      onDark: '#121212',
      onLight: '#121212',
    },
    preview: {
      primary: '#06B6D4',
      secondary: '#F59E0B',
    },
  },
  'emerald-violet': {
    id: 'emerald-violet',
    name: 'Esmeralda & Violeta',
    primary: {
      dark: '#10B981',
      light: '#047857',
      onDark: '#06281E',
      onLight: '#FFFFFF',
    },
    secondary: {
      dark: '#7C3AED',
      light: '#6D28D9',
      textLight: '#6D28D9',
      onDark: '#FFFFFF',
      onLight: '#FFFFFF',
    },
    preview: {
      primary: '#10B981',
      secondary: '#7C3AED',
    },
  },
};

export const PALETTE_LIST = Object.values(THEME_PALETTES);

/**
 * Script inline síncrono para execução no <head> antes do primeiro paint.
 * Lê a preferência salva em localStorage ou detecta prefers-color-scheme do SO,
 * aplicando os atributos data-theme-mode e data-theme-palette imediatamente.
 * Previne Hydration Mismatch e elimina 100% do FOUC (Flash of Unstyled Content).
 */
export function buildThemeInitScript(): string {
  return `(function(){try{var k='${THEME_STORAGE_KEY}';var raw=localStorage.getItem(k);var p=null;if(raw){try{p=JSON.parse(raw)}catch(e){}}var m=(p&&p.mode)?p.mode:'system';var pal=(p&&p.palette)?p.palette:'';if(!pal){var ck=document.cookie.match(/(?:^|; )aurtistic_palette=([^;]*)/);if(ck){pal=decodeURIComponent(ck[1]);}}if(!pal){pal='purple-gold';}var valid=['purple-gold','blue-red','pink-green','cyan-amber','emerald-violet'];if(valid.indexOf(pal)===-1)pal='purple-gold';var res=m;if(m==='system'){var mql=window.matchMedia('(prefers-color-scheme: dark)');res=mql.matches?'dark':'light'}else if(m!=='dark'&&m!=='light'){res='dark'}var d=document.documentElement;d.setAttribute('data-theme-mode',res);d.setAttribute('data-theme-palette',pal);d.style.colorScheme=res}catch(e){}})();`;
}
