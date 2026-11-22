// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import {
  resolveOrgBrandTokens,
  resolvePersonalStudioTokens,
  type OrgBrandTokens,
} from '@/lib/org-brand-tokens';
import { useTheme } from '@/components/theme/ThemeProvider';

interface OrganizationBrandContextValue {
  tokens: OrgBrandTokens;
}

const OrganizationBrandContext = createContext<OrganizationBrandContextValue>({
  tokens: resolveOrgBrandTokens('labdiv'),
});

export function useOrganizationBrand() {
  return useContext(OrganizationBrandContext);
}

interface OrganizationBrandProviderProps {
  orgSlug?: string | null;
  brandConfig?: Record<string, unknown> | null;
  children: React.ReactNode;
  className?: string;
  /** Modo neutro (Studio Pessoal): não aplica tema de org e herda a paleta/modo atuais do usuário. */
  neutral?: boolean;
}

export function OrganizationBrandProvider({
  orgSlug,
  brandConfig,
  children,
  className = '',
  neutral = false,
}: OrganizationBrandProviderProps) {
  const { setActiveOrgPalette, overrideOrgTheme, resolvedMode, isStudioActive, paletteDef } = useTheme();
  const isLight = resolvedMode === 'light';
  const userPrimary = paletteDef?.preview?.primary;
  const userSecondary = paletteDef?.preview?.secondary;

  const baseTokens = useMemo(() => {
    if (neutral) {
      const accents = [userPrimary, userSecondary].filter((c): c is string => Boolean(c));
      return resolvePersonalStudioTokens(accents.length > 0 ? accents : undefined, resolvedMode);
    }
    if (orgSlug === 'personal') {
      return resolvePersonalStudioTokens(undefined, resolvedMode);
    }
    return resolveOrgBrandTokens(orgSlug, brandConfig);
  }, [neutral, userPrimary, userSecondary, orgSlug, brandConfig, resolvedMode]);

  const tokens = useMemo<OrgBrandTokens>(() => {
    if (neutral || !isLight) return baseTokens;
    const lightMap: Record<string, { bgApp: string; bgSurface: string; primaryColor?: string }> = {
      'show-da-fisica': { bgApp: '#F2F6FF', bgSurface: '#FFFFFF', primaryColor: '#0052CC' },
      hs: { bgApp: '#F2FBF6', bgSurface: '#FFFFFF', primaryColor: '#059669' },
      labdiv: { bgApp: '#F0F7FF', bgSurface: '#FFFFFF', primaryColor: '#0F4780' },
    };
    const override = lightMap[baseTokens.themeId] || lightMap.labdiv;
    return {
      ...baseTokens,
      bgApp: override.bgApp,
      bgSurface: override.bgSurface,
      textPrimary: '#0F172A',
      textMuted: '#475569',
      primaryColor: override.primaryColor || baseTokens.primaryColor,
    };
  }, [baseTokens, isLight, neutral]);

  useLayoutEffect(() => {
    // Neutro: libera o tema da org para que a paleta escolhida pelo usuário volte a valer
    setActiveOrgPalette(neutral ? null : tokens.themeId);
    return () => {
      setActiveOrgPalette(null);
    };
  }, [neutral, tokens.themeId, setActiveOrgPalette]);

  const studioFlexStyle = isStudioActive
    ? ({ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column' } as React.CSSProperties)
    : undefined;

  return (
    <OrganizationBrandContext.Provider value={{ tokens }}>
      <div
        data-org-brand={overrideOrgTheme || neutral ? undefined : tokens.themeId}
        data-theme-mode={resolvedMode}
        style={studioFlexStyle}
        className={`relative overflow-x-hidden transition-colors duration-300 ${isStudioActive ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'min-h-full'
          } ${className}`}
      >
        <div
          style={studioFlexStyle}
          className={isStudioActive ? 'relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden' : 'relative z-10'}
        >
          {children}
        </div>
      </div>
    </OrganizationBrandContext.Provider>
  );
}
