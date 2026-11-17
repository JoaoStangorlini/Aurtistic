// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { StudioProvider, useStudio } from './StudioContext';

export interface OrganizationPostStudioProps {
  organizationId?: string | null;
  orgSlug?: string | null;
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

function StudioStageRouter({ orgSlug }: { orgSlug?: string | null }) {
  const { stage } = useStudio();

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

export function OrganizationPostStudio({ organizationId: _organizationId, orgSlug }: OrganizationPostStudioProps) {
  return (
    <StudioProvider orgSlug={orgSlug}>
      <div className="rounded-2xl border border-white/10 bg-[#07090e] p-3 md:p-5 shadow-2xl text-fg">
        <StudioStageRouter orgSlug={orgSlug} />
      </div>
    </StudioProvider>
  );
}
