// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { MatrixCodeRain } from '@/components/organizacoes/MatrixCodeRain';

const AUTH_PREFIXES = [
  '/labdiv',
  '/show-da-fisica',
  '/hackerspace',
  '/organizacoes',
  '/servidor',
  '/curriculo',
  '/resumo',
  '/galeria',
  '/configuracoes-avancadas',
  '/configurar-notificacoes',
  '/configurar-widget',
  '/exportar-importar',
  '/relatar-bug',
  '/aurtistic',
];

function isPublicShowcaseRoute(pathname: string): boolean {
  if (!pathname) return false;
  if (
    pathname.startsWith('/portfolio/') ||
    pathname.startsWith('/s/') ||
    pathname.startsWith('/convite/') ||
    pathname.startsWith('/embed/') ||
    pathname === '/login' ||
    pathname === '/divulgacao' ||
    pathname === '/privacy-policy' ||
    pathname === '/delete-account'
  ) {
    return true;
  }
  if (pathname === '/' || pathname === '/portfolio') return false;
  if (AUTH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  return true;
}

export function GlobalOrgThemeBackdrop() {
  const pathname = usePathname();
  const { effectivePalette, resolvedMode, isStudioActive } = useTheme();
  const isLight = resolvedMode === 'light';

  useEffect(() => {
    const doc = document.documentElement;
    if (isPublicShowcaseRoute(pathname)) {
      doc.removeAttribute('data-org-backdrop');
    } else {
      doc.setAttribute('data-org-backdrop', effectivePalette);
    }
  }, [pathname, effectivePalette]);

  if (isPublicShowcaseRoute(pathname)) return null;

  if (effectivePalette === 'hs') {
    return (
      <MatrixCodeRain
        opacity={isLight ? 0.14 : 0.36}
        speed={40}
        paused={isStudioActive}
      />
    );
  }

  if (effectivePalette === 'show-da-fisica') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 select-none z-0"
        style={{
          background: isLight
            ? 'radial-gradient(circle at 80% 15%, rgba(0, 47, 254, 0.10) 0%, transparent 48%), radial-gradient(circle at 15% 80%, rgba(246, 0, 17, 0.08) 0%, transparent 48%)'
            : 'radial-gradient(circle at 80% 15%, rgba(0, 212, 255, 0.16) 0%, transparent 45%), radial-gradient(circle at 15% 80%, rgba(255, 30, 86, 0.12) 0%, transparent 45%), radial-gradient(circle at 50% 50%, rgba(0, 47, 254, 0.10) 0%, transparent 55%)',
        }}
      >
        <div
          style={{
            backgroundImage: "url('/bg-show.svg')",
            backgroundSize: '360px 360px',
            backgroundRepeat: 'repeat',
            opacity: isLight ? 0.20 : 0.28,
          }}
          className="absolute inset-0"
        />
      </div>
    );
  }

  if (effectivePalette === 'labdiv') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 select-none z-0"
        style={{
          background: isLight
            ? 'radial-gradient(circle at 10% 16%, rgba(15, 71, 128, 0.16) 0%, transparent 46%), radial-gradient(circle at 52% 48%, rgba(241, 67, 67, 0.10) 0%, transparent 48%), radial-gradient(circle at 88% 82%, rgba(255, 204, 0, 0.16) 0%, transparent 46%)'
            : 'radial-gradient(circle at 12% 18%, rgba(15, 71, 128, 0.30) 0%, transparent 48%), radial-gradient(circle at 52% 48%, rgba(241, 67, 67, 0.14) 0%, transparent 50%), radial-gradient(circle at 88% 82%, rgba(255, 204, 0, 0.14) 0%, transparent 48%)',
        }}
      />
    );
  }

  return null;
}
