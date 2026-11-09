// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type ThemeMode,
  type ResolvedThemeMode,
  type ThemePaletteId,
  type ThemePreferences,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_PREFERENCES,
  THEME_PALETTES,
} from '@/lib/theme-config';
import { updateThemePreferencesAction } from '@/app/(dashboard)/actions';
import NextTopLoader from 'nextjs-toploader';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

interface ThemeContextType {
  mode: ThemeMode;
  palette: ThemePaletteId;
  resolvedMode: ResolvedThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePalette: (palette: ThemePaletteId) => void;
  paletteDef: (typeof THEME_PALETTES)[ThemePaletteId];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialPreferences(): ThemePreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_PREFERENCES;
  }
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const validPalettes: ThemePaletteId[] = [
        'purple-gold',
        'blue-red',
        'pink-green',
        'cyan-amber',
        'emerald-violet',
      ];
      const validModes: ThemeMode[] = ['system', 'light', 'dark'];
      return {
        mode: validModes.includes(parsed.mode) ? parsed.mode : 'system',
        palette: validPalettes.includes(parsed.palette) ? parsed.palette : 'purple-gold',
      };
    }
  } catch {}

  // Fallback: ler atributos já aplicados pelo script inline no <html>
  const doc = document.documentElement;
  const attrPalette = doc.getAttribute('data-theme-palette') as ThemePaletteId | null;
  return {
    mode: 'system',
    palette: attrPalette && THEME_PALETTES[attrPalette] ? attrPalette : 'purple-gold',
  };
}

function resolveSystemLuminance(): ResolvedThemeMode {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: Partial<ThemePreferences>;
}) {
  const [preferences, setPreferences] = useState<ThemePreferences>(() => {
    const fromStorage = getInitialPreferences();
    return {
      mode: initialTheme?.mode || fromStorage.mode,
      palette: initialTheme?.palette || fromStorage.palette,
    };
  });

  const [systemLuminance, setSystemLuminance] = useState<ResolvedThemeMode>(() =>
    resolveSystemLuminance()
  );

  // Escuta alterações de prefers-color-scheme no SO/Dispositivo
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      setSystemLuminance(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolvedMode: ResolvedThemeMode =
    preferences.mode === 'system' ? systemLuminance : preferences.mode;

  const paletteDef = THEME_PALETTES[preferences.palette] || THEME_PALETTES['purple-gold'];

  // Aplica atributos no DOM e meta tag theme-color
  useEffect(() => {
    const doc = document.documentElement;
    doc.setAttribute('data-theme-mode', resolvedMode);
    doc.setAttribute('data-theme-palette', preferences.palette);
    doc.style.colorScheme = resolvedMode;

    // Atualiza a meta tag de cor da barra do navegador / PWA
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    const themeBg = resolvedMode === 'light' ? '#F4F5F8' : '#121212';
    metaThemeColor.setAttribute('content', themeBg);

    // Atualiza dinamicamente o Favicon, Apple Touch Icon e Manifest da aba com base na paleta ativa
    const iconHref = `/icons/icon-${preferences.palette}.png`;
    const iconRels = ['icon', 'shortcut icon', 'apple-touch-icon'];
    iconRels.forEach((rel) => {
      let linkEl = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (linkEl) {
        linkEl.href = iconHref;
      } else {
        linkEl = document.createElement('link');
        linkEl.rel = rel;
        linkEl.href = iconHref;
        document.head.appendChild(linkEl);
      }
    });

    // Atualiza dinamicamente o Web App Manifest
    const manifestHref = `/api/manifest?palette=${preferences.palette}&mode=${resolvedMode}`;
    let manifestEl = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestEl) {
      manifestEl.href = manifestHref;
    } else {
      manifestEl = document.createElement('link');
      manifestEl.rel = 'manifest';
      manifestEl.href = manifestHref;
      document.head.appendChild(manifestEl);
    }

    // Sincroniza cookie leve para renderização SSR Zero-FOUC da paleta
    try {
      document.cookie = `aurtistic_palette=${preferences.palette}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  }, [resolvedMode, preferences.palette]);

  // Persistência em storage e sincronização assíncrona com Supabase
  const persistPreferences = useCallback((next: ThemePreferences) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {}

    if (Capacitor.isNativePlatform()) {
      Preferences.set({
        key: THEME_STORAGE_KEY,
        value: JSON.stringify(next),
      }).catch(() => {});
    }

    // Persiste no Supabase user_profiles.features_config.theme silenciosamente
    void updateThemePreferencesAction({ mode: next.mode, palette: next.palette });
  }, []);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setPreferences((prev) => {
        const next = { ...prev, mode };
        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences]
  );

  const setThemePalette = useCallback(
    (palette: ThemePaletteId) => {
      setPreferences((prev) => {
        const next = { ...prev, palette };
        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences]
  );

  const contextValue = useMemo(
    () => ({
      mode: preferences.mode,
      palette: preferences.palette,
      resolvedMode,
      setThemeMode,
      setThemePalette,
      paletteDef,
    }),
    [preferences.mode, preferences.palette, resolvedMode, setThemeMode, setThemePalette, paletteDef]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      mode: 'system' as ThemeMode,
      palette: 'purple-gold' as ThemePaletteId,
      resolvedMode: 'dark' as ResolvedThemeMode,
      setThemeMode: () => {},
      setThemePalette: () => {},
      paletteDef: THEME_PALETTES['purple-gold'],
    };
  }
  return ctx;
}

/**
 * TopLoader temático sincronizado com a cor de destaque secundária da paleta atual
 */
export function ThemedTopLoader() {
  const { paletteDef, resolvedMode } = useTheme();
  const accentColor =
    resolvedMode === 'light' ? paletteDef.secondary.light : paletteDef.secondary.dark;

  return (
    <NextTopLoader
      color={accentColor}
      height={3}
      showSpinner={false}
      shadow={`0 0 10px ${accentColor},0 0 5px ${accentColor}`}
    />
  );
}

