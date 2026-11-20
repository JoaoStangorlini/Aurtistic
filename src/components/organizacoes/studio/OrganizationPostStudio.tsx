// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { StudioProvider, useStudio } from './StudioContext';
import { useTheme } from '@/components/theme/ThemeProvider';
import type { StudioStage } from './types';

export interface OrganizationPostStudioProps {
  organizationId?: string | null;
  orgSlug?: string | null;
  onStageChange?: (stage: StudioStage) => void;
}

const StudioLauncherView = dynamic(
  () => import('./StudioLauncherView').then((m) => m.StudioLauncherView),
  {
    loading: () => (
      <div className="min-h-[400px] flex items-center justify-center text-xs text-slate-400 font-mono animate-pulse">
        Carregando Estúdio da Organização...
      </div>
    ),
    ssr: false,
  }
);

const StudioWorkspaceView = dynamic(
  () => import('./StudioWorkspaceView').then((m) => m.StudioWorkspaceView),
  {
    loading: () => (
      <div className="min-h-[400px] flex items-center justify-center text-xs text-slate-400 font-mono animate-pulse">
        Carregando Mesa de Trabalho...
      </div>
    ),
    ssr: false,
  }
);

const StudioPublishModal = dynamic(
  () => import('./StudioPublishModal').then((m) => m.StudioPublishModal),
  { ssr: false }
);

function StudioStageRouter({ orgSlug, onStageChange }: { orgSlug?: string | null; onStageChange?: (stage: StudioStage) => void }) {
  const { stage } = useStudio();

  useEffect(() => {
    onStageChange?.(stage);
  }, [stage, onStageChange]);

  if (stage === 'launcher') {
    return <StudioLauncherView orgSlug={orgSlug} />;
  }

  return (
    <>
      <StudioWorkspaceView />
      <StudioPublishModal orgSlug={orgSlug} />
    </>
  );
}

export function OrganizationPostStudio({ organizationId, orgSlug, onStageChange }: OrganizationPostStudioProps) {
  const { setIsStudioActive } = useTheme();

  useEffect(() => {
    return () => {
      setIsStudioActive(false);
    };
  }, [setIsStudioActive]);

  return (
    <StudioProvider organizationId={organizationId} orgSlug={orgSlug}>
      <div className="text-fg flex-1 min-h-0 flex flex-col">
        <StudioStageRouter orgSlug={orgSlug} onStageChange={onStageChange} />
      </div>
    </StudioProvider>
  );
}
