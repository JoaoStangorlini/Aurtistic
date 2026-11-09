// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/portfolio/page.tsx
import { createClient } from '@/utils/supabase/server';
import { getUserProfile } from '@/app/(dashboard)/actions';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import PortfolioClient from '@/components/dashboard/PortfolioClient';
import { attachSignedPublicMediaUrls, getEdgeStorageServerUrl } from '@/lib/edge-ticket';
import { ensurePortfolioCatalogLoaded } from '@/lib/portfolio-catalog';
import type { UserFileIndexRow } from '@/types';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getUserProfile();

  // Busca acervo de fotos do usuário (auto-inicializa as 2.012 fotos se for o Admin e estiver vazio)
  const rawPhotos = await ensurePortfolioCatalogLoaded(supabase, user.id, {
    currentAuthUserId: user.id,
  });

  // Assina ticket de mídia com TTL de 2h (otimizado com useSharedPrefix: 'Portfolio')
  const signedPhotos = attachSignedPublicMediaUrls(
    (rawPhotos as UserFileIndexRow[]) || [],
    { omitFullUrls: true, useSharedPrefix: 'Portfolio' }
  );

  const serverUrl = getEdgeStorageServerUrl();
  const publicSlug = profile?.username || undefined;

  return (
    <Suspense
      fallback={
        <div className="h-full bg-app flex items-center justify-center text-fg font-mono text-xs">
          Carregando acervo fotográfico...
        </div>
      }
    >
      <PortfolioClient
        initialProfile={profile}
        portfolioPhotos={signedPhotos}
        publicSlug={publicSlug}
        serverUrl={serverUrl}
        userId={user.id}
      />
    </Suspense>
  );
}
