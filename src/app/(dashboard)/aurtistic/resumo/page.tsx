// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/(dashboard)/aurtistic/resumo/page.tsx
import { createClient } from '@/utils/supabase/server';
import { getUserProfile } from '@/app/(dashboard)/actions';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import ResumoClient from '@/components/dashboard/ResumoClient';
import { attachSignedPublicMediaUrls, getEdgeStorageServerUrl } from '@/lib/edge-ticket';
import type { UserFileIndexRow } from '@/types';

export const dynamic = 'force-dynamic';

export default async function ResumoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getUserProfile();

  const { data: rawFavorites } = await supabase
    .from('user_files_index')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_favorite', true)
    .order('created_at', { ascending: false });

  const signedFavorites = attachSignedPublicMediaUrls(
    (rawFavorites as UserFileIndexRow[]) || [],
    { omitFullUrls: true }
  );

  const serverUrl = getEdgeStorageServerUrl();

  return (
    <Suspense
      fallback={
        <div className="h-full bg-app flex items-center justify-center text-fg">
          Carregando resumo...
        </div>
      }
    >
      <ResumoClient
        initialProfile={profile}
        favoritePhotos={signedFavorites}
        serverUrl={serverUrl}
        userId={user.id}
      />
    </Suspense>
  );
}
