// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/curriculo/page.tsx
import { createClient } from '@/utils/supabase/server';
import { getUserProfile } from '@/app/(dashboard)/actions';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import CurriculoClient from '@/components/dashboard/CurriculoClient';
import { attachSignedPublicMediaUrls, getEdgeStorageServerUrl } from '@/lib/edge-ticket';
import type { UserFileIndexRow } from '@/types';

export const dynamic = 'force-dynamic';

export default async function CurriculoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getUserProfile();

  // Busca documentos e certificados marcados para o currículo
  const { data: rawDocs } = await supabase
    .from('user_files_index')
    .select('*')
    .eq('user_id', user.id)
    .eq('show_in_curriculum', true)
    .order('created_at', { ascending: false });

  // Assina 1 ticket individual com permissão de visualização e download
  const signedDocs = attachSignedPublicMediaUrls(
    (rawDocs as UserFileIndexRow[]) || [],
    { allowDownload: true, omitFullUrls: false }
  );

  const serverUrl = getEdgeStorageServerUrl();

  return (
    <Suspense
      fallback={
        <div className="h-full bg-app flex items-center justify-center text-fg">
          Carregando currículo...
        </div>
      }
    >
      <CurriculoClient
        initialProfile={profile}
        curriculumDocs={signedDocs}
        serverUrl={serverUrl}
        userId={user.id}
      />
    </Suspense>
  );
}
