// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import {
  resolveOrgBrandTokens,
  type OrgBrandTokens,
} from '@/lib/org-brand-tokens';
import { MatrixCodeRain } from './MatrixCodeRain';

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
  const tokens = useMemo(
    () => resolveOrgBrandTokens(orgSlug, brandConfig),
    [orgSlug, brandConfig]
  );

  useEffect(() => {
    const linkId = `org-brand-font-${tokens.themeId}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = tokens.googleFontsHref;
      document.head.appendChild(link);
    }
  }, [tokens.themeId, tokens.googleFontsHref]);

  const cardShadowCss =
    tokens.themeId === 'show-da-fisica'
      ? '0 4px 18px rgba(0, 212, 255, 0.10)'
      : tokens.themeId === 'hs'
        ? '0 4px 16px rgba(0, 255, 102, 0.09)'
        : tokens.themeId === 'profis'
          ? '0 4px 18px rgba(245, 158, 11, 0.10)'
          : '0 4px 18px rgba(31, 159, 207, 0.10)';

  const cardBorderCss =
    tokens.themeId === 'show-da-fisica'
      ? 'rgba(0, 212, 255, 0.25)'
      : tokens.themeId === 'hs'
        ? 'rgba(0, 255, 102, 0.24)'
        : tokens.themeId === 'profis'
          ? 'rgba(245, 158, 11, 0.25)'
          : 'rgba(31, 159, 207, 0.28)';

  const atmosphericBackground =
    tokens.themeId === 'show-da-fisica'
      ? 'radial-gradient(circle at 80% 15%, rgba(0, 212, 255, 0.14) 0%, transparent 45%), radial-gradient(circle at 15% 80%, rgba(255, 30, 86, 0.12) 0%, transparent 45%), #040714'
      : tokens.themeId === 'hs'
        ? 'radial-gradient(circle at 80% 20%, rgba(0, 255, 102, 0.14) 0%, transparent 45%), radial-gradient(circle at 20% 80%, rgba(255, 204, 0, 0.10) 0%, transparent 45%), #060a08'
        : tokens.themeId === 'profis'
          ? 'radial-gradient(circle at 85% 15%, rgba(245, 158, 11, 0.16) 0%, transparent 50%), radial-gradient(circle at 15% 85%, rgba(56, 189, 248, 0.12) 0%, transparent 45%), #080c16'
          : 'radial-gradient(circle at 12% 18%, rgba(15, 71, 128, 0.34) 0%, transparent 48%), radial-gradient(circle at 52% 48%, rgba(241, 67, 67, 0.16) 0%, transparent 50%), radial-gradient(circle at 88% 82%, rgba(255, 204, 0, 0.18) 0%, transparent 48%), linear-gradient(135deg, rgba(31, 159, 207, 0.08) 0%, rgba(241, 67, 67, 0.06) 50%, rgba(255, 204, 0, 0.08) 100%), #070c16';

  const floatingSymbols =
    tokens.themeId === 'show-da-fisica'
      ? [
          { text: 'E = q(v × B)', top: '8%', left: '6%', color: 'rgba(0, 212, 255, 0.20)' },
          { text: 'f = v / λ', top: '24%', right: '7%', color: 'rgba(255, 30, 86, 0.20)' },
          { text: 'τ = r × F', bottom: '18%', left: '8%', color: 'rgba(0, 255, 102, 0.18)' },
          { text: '∇ · E = ρ / ε₀', bottom: '12%', right: '9%', color: 'rgba(255, 230, 0, 0.18)' },
        ]
      : tokens.themeId === 'hs'
        ? [
            { text: '0x7F4A // GPIO_INIT', top: '7%', left: '5%', color: 'rgba(0, 255, 102, 0.18)' },
            { text: 'V = R · I', top: '22%', right: '8%', color: 'rgba(255, 204, 0, 0.18)' },
            { text: '>_ root@hs-ifusp', bottom: '16%', left: '6%', color: 'rgba(6, 182, 212, 0.18)' },
            { text: 'P = V · I', bottom: '10%', right: '7%', color: 'rgba(0, 255, 102, 0.16)' },
          ]
        : tokens.themeId === 'profis'
          ? [
              { text: '∫ₐᵇ f(x)dx = F(b) - F(a)', top: '8%', left: '5%', color: 'rgba(245, 158, 11, 0.18)' },
              { text: '∑ F = dp / dt', top: '26%', right: '7%', color: 'rgba(56, 189, 248, 0.18)' },
              { text: 'E = K + U', bottom: '18%', left: '8%', color: 'rgba(255, 204, 0, 0.18)' },
              { text: 'lim x→∞ (1 + 1/x)ˣ = e', bottom: '11%', right: '6%', color: 'rgba(249, 115, 22, 0.16)' },
            ]
          : [];

  const cssVars = {
    '--org-bg-app': tokens.bgApp,
    '--org-bg-surface': tokens.bgSurface,
    '--org-text-primary': tokens.textPrimary,
    '--org-text-muted': tokens.textMuted,
    '--org-primary': tokens.primaryColor,
    '--org-secondary': tokens.secondaryColor,
    '--org-tertiary': tokens.tertiaryColor,
    '--org-container': tokens.containerColor,
    '--md-sys-color-primary': tokens.primaryColor,
    '--md-sys-color-primary-container': tokens.containerColor,
    '--md-sys-color-secondary': tokens.secondaryColor,
    '--md-sys-color-tertiary': tokens.tertiaryColor,
    '--md-sys-color-surface-container': tokens.bgSurface,
    '--org-font-display': tokens.fontDisplay,
    '--org-font-body': tokens.fontBody,
    '--org-title-shadow': tokens.titleShadowCss,
    '--org-border': tokens.borderStyleCss,
    '--org-border-subtle': cardBorderCss,
    '--org-card-shadow': cardShadowCss,
    // Sobrescreve as variáveis globais do Tailwind para herança automática dos componentes internos
    '--bg-app': tokens.bgApp,
    '--bg-surface': tokens.bgSurface,
    '--bg-hover': `color-mix(in srgb, ${tokens.bgSurface} 80%, ${tokens.primaryColor} 20%)`,
    '--bg-elevated': `color-mix(in srgb, ${tokens.bgSurface} 90%, #ffffff 10%)`,
    '--border-subtle': cardBorderCss,
    '--text-primary': tokens.textPrimary,
    '--text-secondary': tokens.textMuted,
    '--text-muted': tokens.textMuted,
    '--accent-primary': tokens.primaryColor,
    '--accent-secondary': tokens.secondaryColor,
    '--color-teal-300': tokens.primaryColor,
    '--color-teal-400': tokens.primaryColor,
    '--color-teal-500': tokens.primaryColor,
    '--color-teal-600': tokens.primaryColor,
    background: atmosphericBackground,
    color: tokens.textPrimary,
    fontFamily: tokens.fontBody,
  } as React.CSSProperties;

  return (
    <OrganizationBrandContext.Provider value={{ tokens }}>
      <div
        data-org-brand={tokens.themeId}
        style={cssVars}
        className={`relative min-h-full overflow-x-hidden transition-colors duration-300 ${className}`}
      >
        {/* Camada decorativa discreta espelhando a estética cósmica/científica/Matrix/Show do HUB */}
        {tokens.themeId === 'hs' ? (
          <MatrixCodeRain opacity={0.45} />
        ) : tokens.themeId === 'show-da-fisica' ? (
          <div
            aria-hidden="true"
            style={{
              backgroundImage: "url('/bg-show.svg')",
              backgroundSize: '380px 380px',
              backgroundRepeat: 'repeat',
              opacity: 0.28,
            }}
            className="pointer-events-none fixed inset-0 select-none z-0"
          />
        ) : floatingSymbols.length > 0 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 overflow-hidden select-none z-0 opacity-80"
          >
            {floatingSymbols.map((sym, idx) => (
              <span
                key={idx}
                style={{
                  position: 'absolute',
                  top: sym.top,
                  left: sym.left,
                  right: sym.right,
                  bottom: sym.bottom,
                  color: sym.color,
                  fontFamily: tokens.fontDisplay,
                }}
                className="text-xs md:text-sm font-mono font-bold tracking-wider"
              >
                {sym.text}
              </span>
            ))}
          </div>
        ) : null}

        <style
          dangerouslySetInnerHTML={{
            __html: `
              [data-org-brand="${tokens.themeId}"] .bg-surface {
                background-color: ${tokens.bgSurface} !important;
                border-color: ${cardBorderCss} !important;
                box-shadow: ${cardShadowCss} !important;
              }
              [data-org-brand="${tokens.themeId}"] .border-border-subtle {
                border-color: ${cardBorderCss} !important;
              }
              [data-org-brand="${tokens.themeId}"] [data-tour="team-progress-panel"],
              [data-org-brand="${tokens.themeId}"] [data-tour="org-view-mode"],
              [data-org-brand="${tokens.themeId}"] .org-card {
                background-color: ${tokens.bgSurface} !important;
                border-color: ${cardBorderCss} !important;
                box-shadow: ${cardShadowCss} !important;
              }
              [data-org-brand="show-da-fisica"] .neon-border-blue { border-color: #002ffe !important; box-shadow: 0 0 12px rgba(0, 47, 254, 0.35); }
              [data-org-brand="show-da-fisica"] .neon-border-green { border-color: #01f300 !important; box-shadow: 0 0 12px rgba(1, 243, 0, 0.35); }
              [data-org-brand="show-da-fisica"] .neon-border-red { border-color: #f60011 !important; box-shadow: 0 0 12px rgba(246, 0, 17, 0.35); }
              [data-org-brand="show-da-fisica"] .neon-border-yellow { border-color: #ffcc00 !important; box-shadow: 0 0 12px rgba(255, 204, 0, 0.35); }
              [data-org-brand="show-da-fisica"] .neon-text-red { color: #ff3344; text-shadow: 0 0 12px rgba(246, 0, 17, 0.7); }
              [data-org-brand="show-da-fisica"] .neon-text-blue { color: #38bdf8; text-shadow: 0 0 12px rgba(0, 47, 254, 0.8); }
              [data-org-brand="show-da-fisica"] .neon-text-green { color: #01f300; text-shadow: 0 0 12px rgba(1, 243, 0, 0.7); }
              [data-org-brand="show-da-fisica"] h1,
              [data-org-brand="show-da-fisica"] h2,
              [data-org-brand="show-da-fisica"] h3 {
                font-family: ${tokens.fontDisplay} !important;
                letter-spacing: 0.05em !important;
                text-shadow: ${tokens.titleShadowCss} !important;
              }
              [data-org-brand="show-da-fisica"] button.bg-\\[var\\(--accent-primary\\)\\],
              [data-org-brand="show-da-fisica"] button.bg-teal-500 {
                background: linear-gradient(135deg, #00D4FF 0%, #0066FF 100%) !important;
                color: #040714 !important;
                font-weight: 900 !important;
                box-shadow: 0 0 16px rgba(0, 212, 255, 0.45) !important;
              }
              [data-org-brand="show-da-fisica"] .org-card,
              [data-org-brand="hs"] .org-card {
                border-radius: 0px !important;
              }
              [data-org-brand="labdiv"] h1,
              [data-org-brand="labdiv"] h2,
              [data-org-brand="labdiv"] h3 {
                font-family: ${tokens.fontDisplay} !important;
                text-shadow: ${tokens.titleShadowCss} !important;
              }
              [data-org-brand="labdiv"] .org-card,
              [data-org-brand="labdiv"] .bg-surface {
                background-color: rgba(13, 21, 36, 0.88) !important;
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border-radius: 1rem;
                border-color: rgba(31, 159, 207, 0.28) !important;
                box-shadow: 0 8px 32px rgba(15, 71, 128, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
              }
              [data-org-brand="labdiv"] button.bg-\\[var\\(--accent-primary\\)\\],
              [data-org-brand="labdiv"] button.bg-teal-500 {
                background: linear-gradient(135deg, #1F9FCF 0%, #0F4780 100%) !important;
                color: #ffffff !important;
                font-weight: 800 !important;
                box-shadow: 0 4px 16px rgba(31, 159, 207, 0.32) !important;
              }
              [data-org-brand="${tokens.themeId}"] button:focus-visible,
              [data-org-brand="${tokens.themeId}"] a:focus-visible {
                outline: 2px solid ${tokens.primaryColor};
                outline-offset: 2px;
              }
              [data-org-brand="hs"] h1,
              [data-org-brand="hs"] h2,
              [data-org-brand="hs"] h3 {
                font-family: ${tokens.fontDisplay} !important;
                letter-spacing: 0.04em !important;
                text-shadow: ${tokens.titleShadowCss} !important;
              }
              [data-org-brand="hs"] button.bg-\\[var\\(--accent-primary\\)\\],
              [data-org-brand="hs"] button.bg-teal-500 {
                background: linear-gradient(135deg, #00FF66 0%, #10B981 100%) !important;
                color: #04120a !important;
                font-weight: 900 !important;
                box-shadow: 0 0 15px rgba(0, 255, 102, 0.38) !important;
              }
              [data-org-brand="profis"] h1,
              [data-org-brand="profis"] h2,
              [data-org-brand="profis"] h3 {
                font-family: ${tokens.fontDisplay} !important;
                text-shadow: ${tokens.titleShadowCss} !important;
              }
              [data-org-brand="profis"] .org-card,
              [data-org-brand="profis"] .bg-surface {
                background-color: rgba(15, 19, 32, 0.85) !important;
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border-radius: 1rem;
                border-color: rgba(255, 204, 0, 0.28) !important;
                box-shadow: 0 8px 32px rgba(245, 158, 11, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
              }
              [data-org-brand="profis"] button.bg-\\[var\\(--accent-primary\\)\\],
              [data-org-brand="profis"] button.bg-teal-500 {
                background: linear-gradient(135deg, #F59E0B 0%, #FFCC00 100%) !important;
                color: #080c16 !important;
                font-weight: 900 !important;
                box-shadow: 0 4px 16px rgba(245, 158, 11, 0.38) !important;
              }
            `,
          }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    </OrganizationBrandContext.Provider>
  );
}

