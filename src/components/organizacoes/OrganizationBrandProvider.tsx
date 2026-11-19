// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import {
  resolveOrgBrandTokens,
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
}

export function OrganizationBrandProvider({
  orgSlug,
  brandConfig,
  children,
  className = '',
}: OrganizationBrandProviderProps) {
  const { setActiveOrgPalette, overrideOrgTheme, resolvedMode } = useTheme();
  const isLight = resolvedMode === 'light';

  const baseTokens = useMemo(
    () => resolveOrgBrandTokens(orgSlug, brandConfig),
    [orgSlug, brandConfig]
  );

  const tokens = useMemo<OrgBrandTokens>(() => {
    if (!isLight) return baseTokens;
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
  }, [baseTokens, isLight]);

  useLayoutEffect(() => {
    setActiveOrgPalette(tokens.themeId);
    return () => {
      setActiveOrgPalette(null);
    };
  }, [tokens.themeId, setActiveOrgPalette]);

  return (
    <OrganizationBrandContext.Provider value={{ tokens }}>
      <div
        data-org-brand={overrideOrgTheme ? undefined : tokens.themeId}
        data-theme-mode={resolvedMode}
        className={`relative min-h-full overflow-x-hidden transition-colors duration-300 ${className}`}
      >
        <div className="relative z-10">{children}</div>
      </div>
    </OrganizationBrandContext.Provider>
  );
}
