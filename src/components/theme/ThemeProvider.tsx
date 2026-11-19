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
  effectivePalette: ThemePaletteId;
  activeOrgPalette: ThemePaletteId | null;
  setActiveOrgPalette: (palette: ThemePaletteId | null) => void;
  overrideOrgTheme: boolean;
  setOverrideOrgTheme: (override: boolean) => void;
  isStudioActive: boolean;
  setIsStudioActive: (active: boolean) => void;
  resolvedMode: ResolvedThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePalette: (palette: ThemePaletteId) => void;
  paletteDef: (typeof THEME_PALETTES)[ThemePaletteId];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const VALID_PALETTES: ThemePaletteId[] = [
  'purple-gold',
  'blue-red',
  'pink-green',
  'cyan-amber',
  'emerald-violet',
  'labdiv',
  'show-da-fisica',
  'hs',
];
const VALID_MODES: ThemeMode[] = ['system', 'light', 'dark'];

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getInitialPreferences(): ThemePreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_PREFERENCES;
  }
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mode: VALID_MODES.includes(parsed.mode) ? parsed.mode : 'system',
        palette: VALID_PALETTES.includes(parsed.palette) ? parsed.palette : 'purple-gold',
        overrideOrgTheme: Boolean(parsed.overrideOrgTheme),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
      };
    }
  } catch {}

  const ckMode = getCookieValue('aurtistic_mode') as ThemeMode | null;
  const ckPalette = getCookieValue('aurtistic_palette') as ThemePaletteId | null;
  const ckOverride = getCookieValue('aurtistic_override_org');
  const doc = document.documentElement;
  const attrPalette = doc.getAttribute('data-theme-palette') as ThemePaletteId | null;
  const resolvedPal = ckPalette && VALID_PALETTES.includes(ckPalette)
    ? ckPalette
    : attrPalette && THEME_PALETTES[attrPalette]
      ? attrPalette
      : 'purple-gold';
  return {
    mode: ckMode && VALID_MODES.includes(ckMode) ? ckMode : 'system',
    palette: resolvedPal,
    overrideOrgTheme: ckOverride === '1',
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
    const storageTs = fromStorage.updatedAt ? Date.parse(fromStorage.updatedAt) : 0;
    const initTs = initialTheme?.updatedAt ? Date.parse(initialTheme.updatedAt) : 0;
    const preferInitial = initTs > storageTs && Boolean(initialTheme?.palette || initialTheme?.mode);
    return {
      mode: (preferInitial ? initialTheme?.mode : fromStorage.mode) || initialTheme?.mode || fromStorage.mode,
      palette: (preferInitial ? initialTheme?.palette : fromStorage.palette) || initialTheme?.palette || fromStorage.palette,
      overrideOrgTheme: preferInitial
        ? Boolean(initialTheme?.overrideOrgTheme)
        : fromStorage.overrideOrgTheme ?? Boolean(initialTheme?.overrideOrgTheme),
      updatedAt: (preferInitial ? initialTheme?.updatedAt : fromStorage.updatedAt) || initialTheme?.updatedAt,
    };
  });

  const [activeOrgPalette, setActiveOrgPalette] = useState<ThemePaletteId | null>(null);
  const [isStudioActive, setIsStudioActive] = useState(false);

  const [systemLuminance, setSystemLuminance] = useState<ResolvedThemeMode>(() =>
    resolveSystemLuminance()
  );

  // Escuta alterações de prefers-color-scheme no SO/Dispositivo e sync multi-aba
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      setSystemLuminance(e.matches ? 'dark' : 'light');
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        setPreferences({
          mode: VALID_MODES.includes(parsed.mode) ? parsed.mode : 'system',
          palette: VALID_PALETTES.includes(parsed.palette) ? parsed.palette : 'purple-gold',
          overrideOrgTheme: Boolean(parsed.overrideOrgTheme),
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
        });
      } catch {}
    };
    mql.addEventListener('change', onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      mql.removeEventListener('change', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const resolvedMode: ResolvedThemeMode =
    preferences.mode === 'system' ? systemLuminance : preferences.mode;

  const effectivePalette: ThemePaletteId =
    activeOrgPalette && !preferences.overrideOrgTheme
      ? activeOrgPalette
      : preferences.palette;

  const paletteDef = THEME_PALETTES[effectivePalette] || THEME_PALETTES['purple-gold'];

  // Aplica atributos no DOM e meta tag theme-color
  useEffect(() => {
    const doc = document.documentElement;
    doc.setAttribute('data-theme-mode', resolvedMode);
    doc.setAttribute('data-theme-palette', effectivePalette);
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

    // Atualiza dinamicamente o Favicon, Apple Touch Icon e Manifest da aba com base na paleta efetiva
    const iconHref = `/icons/icon-${effectivePalette}.png`;
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
    const manifestHref = `/api/manifest?palette=${effectivePalette}&mode=${resolvedMode}`;
    let manifestEl = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestEl) {
      manifestEl.href = manifestHref;
    } else {
      manifestEl = document.createElement('link');
      manifestEl.rel = 'manifest';
      manifestEl.href = manifestHref;
      document.head.appendChild(manifestEl);
    }

    // Sincroniza cookies leves para renderização SSR Zero-FOUC
    try {
      document.cookie = `aurtistic_palette=${encodeURIComponent(preferences.palette)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aurtistic_mode=${encodeURIComponent(preferences.mode)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aurtistic_override_org=${preferences.overrideOrgTheme ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  }, [resolvedMode, effectivePalette, preferences.palette, preferences.mode, preferences.overrideOrgTheme]);

  // Persistência em storage e sincronização assíncrona com Supabase
  const persistPreferences = useCallback((next: ThemePreferences) => {
    const withTs: ThemePreferences = { ...next, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(withTs));
      document.cookie = `aurtistic_palette=${encodeURIComponent(withTs.palette)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aurtistic_mode=${encodeURIComponent(withTs.mode)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aurtistic_override_org=${withTs.overrideOrgTheme ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}

    if (Capacitor.isNativePlatform()) {
      Preferences.set({
        key: THEME_STORAGE_KEY,
        value: JSON.stringify(withTs),
      }).catch(() => {});
    }

    // Persiste no Supabase user_profiles.features_config.theme silenciosamente
    void updateThemePreferencesAction({
      mode: withTs.mode,
      palette: withTs.palette,
      overrideOrgTheme: Boolean(withTs.overrideOrgTheme),
    });
  }, []);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setPreferences((prev) => {
        const next: ThemePreferences = { ...prev, mode, updatedAt: new Date().toISOString() };
        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences]
  );

  const setThemePalette = useCallback(
    (palette: ThemePaletteId) => {
      setPreferences((prev) => {
        const next: ThemePreferences = { ...prev, palette, updatedAt: new Date().toISOString() };
        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences]
  );

  const setOverrideOrgTheme = useCallback(
    (overrideOrgTheme: boolean) => {
      setPreferences((prev) => {
        const next: ThemePreferences = { ...prev, overrideOrgTheme, updatedAt: new Date().toISOString() };
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
      effectivePalette,
      activeOrgPalette,
      setActiveOrgPalette,
      overrideOrgTheme: Boolean(preferences.overrideOrgTheme),
      setOverrideOrgTheme,
      isStudioActive,
      setIsStudioActive,
      resolvedMode,
      setThemeMode,
      setThemePalette,
      paletteDef,
    }),
    [
      preferences.mode,
      preferences.palette,
      preferences.overrideOrgTheme,
      effectivePalette,
      activeOrgPalette,
      isStudioActive,
      resolvedMode,
      setThemeMode,
      setThemePalette,
      setOverrideOrgTheme,
      paletteDef,
    ]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      mode: 'system' as ThemeMode,
      palette: 'purple-gold' as ThemePaletteId,
      effectivePalette: 'purple-gold' as ThemePaletteId,
      activeOrgPalette: null as ThemePaletteId | null,
      setActiveOrgPalette: () => {},
      overrideOrgTheme: false,
      setOverrideOrgTheme: () => {},
      isStudioActive: false,
      setIsStudioActive: () => {},
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

