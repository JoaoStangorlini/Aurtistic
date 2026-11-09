// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/portfolio/[username]/page.tsx
import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import SharedWorkspaceClient from '@/app/[username]/SharedWorkspaceClient';
import { attachSignedPublicMediaUrls, getEdgeStorageServerUrl } from '@/lib/edge-ticket';
import { ensurePortfolioCatalogLoaded } from '@/lib/portfolio-catalog';
import type { UserFileIndexRow } from '@/types';

interface PageProps {
  params: Promise<{ username: string }>;
}

export const dynamic = 'force-dynamic';

export default async function PublicPortfolioPage({ params }: PageProps) {
  const { username } = await params;
  const supabase = await createClient();

  // 1. Resolve criador via RPC unificada (busca por username ou public_slug)
  const { data: resolved, error: rpcError } = await supabase.rpc(
    'resolve_public_creator_profile',
    {
      p_slug: username,
    }
  );

  if (rpcError || !resolved || !resolved.userId || !resolved.userProfile) {
    notFound();
  }

  const userId = resolved.userId as string;
  const publicSlug = (resolved.publicSlug as string) || username;
  const userProfile = resolved.userProfile;
  const creatorPalette = userProfile?.features_config?.theme?.palette;

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  // 2. Busca acervo público de fotografias do criador (com auto-seeding do catálogo de 2.012 itens)
  let { data: rawPhotos } = await supabase
    .from('user_files_index')
    .select('*')
    .eq('user_id', userId)
    .eq('visibility', 'public')
    .eq('show_in_portfolio', true)
    .order('created_at', { ascending: false });

  if (!rawPhotos || rawPhotos.length === 0) {
    rawPhotos = await ensurePortfolioCatalogLoaded(supabase, userId, {
      isPublicRoute: true,
      currentAuthUserId: currentUser?.id,
    });
  }

  // 3. Busca certificados públicos do criador
  const { data: rawDocs } = await supabase
    .from('user_files_index')
    .select('*')
    .eq('user_id', userId)
    .eq('visibility', 'public')
    .eq('show_in_curriculum', true)
    .order('created_at', { ascending: false });

  // 4. Assina 1 ticket curto por item público (allowedPaths: [item.relative_path], TTL 2h)
  const signedPhotos = attachSignedPublicMediaUrls(
    (rawPhotos as UserFileIndexRow[]) || [],
    { omitFullUrls: true, allowDownload: false }
  );

  const signedDocs = attachSignedPublicMediaUrls(
    (rawDocs as UserFileIndexRow[]) || [],
    { omitFullUrls: false, allowDownload: true }
  );

  const serverUrl = getEdgeStorageServerUrl();

  return (
    <div className="min-h-screen bg-app text-fg-secondary">
      <SharedWorkspaceClient
        profile={userProfile}
        initialTab="portfolio"
        publicPhotos={signedPhotos}
        publicDocs={signedDocs}
        publicSlug={publicSlug}
        serverUrl={serverUrl}
        creatorPalette={creatorPalette}
      />
    </div>
  );
}

