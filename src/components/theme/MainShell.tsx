// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import { useTheme } from './ThemeProvider';

export function AppViewportShell({ children }: { children: React.ReactNode }) {
  const { isStudioActive } = useTheme();

  return (
    <div
      style={isStudioActive ? { height: '100dvh' } : undefined}
      className={
        isStudioActive
          ? 'h-dvh overflow-hidden flex flex-col'
          : 'flex-1 min-h-0 flex flex-col'
      }
    >
      {children}
    </div>
  );
}

export function MainShell({ children }: { children: React.ReactNode }) {
  const { isStudioActive } = useTheme();

  return (
    <main
      style={isStudioActive ? { flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}
      className={`relative z-10 flex-1 min-h-0 flex flex-col bg-transparent ${
        isStudioActive ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'
      }`}
    >
      {children}
    </main>
  );
}
