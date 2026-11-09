// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/s/[token]/page.tsx
import { createClient } from '@/utils/supabase/server';
import { ClientProofingView, type ProofingPhotoItem } from '@/components/share/ClientProofingView';
import { attachSignedPublicMediaUrls, getEdgeStorageServerUrl } from '@/lib/edge-ticket';
import { validateShareToken } from '@/lib/validators';
import type { Metadata } from 'next';
import type { UserFileIndexRow } from '@/types';

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const tokenRes = validateShareToken(token);
  if (!tokenRes.ok) {
    return { title: 'Link de Prova | Aurtistic' };
  }
  const cleanToken = tokenRes.data;

  const supabase = await createClient();
  const { data: linkRows } = await supabase.rpc('get_share_link_by_token_internal', {
    p_token: cleanToken,
  });

  if (!linkRows || linkRows.length === 0) {
    return { title: 'Álbum Expirado | Aurtistic' };
  }

  const link = linkRows[0];
  return {
    title: `${link.album_title} — Seleção de Fotos | Aurtistic`,
    description: `Acesse o álbum compartilhado e selecione suas fotografias favoritas.`,
  };
}

export default async function ClientProofingPage({ params }: PageProps) {
  const { token } = await params;
  const tokenRes = validateShareToken(token);

  if (!tokenRes.ok) {
    return <ExpiredOrNotFoundView message="O endereço deste link de prova é inválido." />;
  }
  const cleanToken = tokenRes.data;

  const supabase = await createClient();

  // 1. Busca metadados do link de compartilhamento via RPC interna SECURITY DEFINER
  const { data: linkRows, error: linkErr } = await supabase.rpc(
    'get_share_link_by_token_internal',
    { p_token: cleanToken }
  );

  if (linkErr || !linkRows || linkRows.length === 0) {
    return (
      <ExpiredOrNotFoundView message="Este link de prova expirou ou não está mais disponível. Entre em contato com o fotógrafo para solicitar um novo acesso." />
    );
  }

  const link = linkRows[0];
  const hasPin = Boolean(link.pin_hash);

  // 2. Busca perfil do criador do álbum
  const { data: creatorProfile } = await supabase
    .from('user_profiles')
    .select('full_name, username, avatar_url')
    .eq('id', link.user_id)
    .maybeSingle();

  const creatorName =
    creatorProfile?.full_name || creatorProfile?.username || 'Fotógrafo Responsável';
  const creatorAvatarUrl = creatorProfile?.avatar_url || null;

  // 3. Se o link não tiver PIN, pré-carrega as fotos no SSR
  let initialFiles: ProofingPhotoItem[] = [];
  if (!hasPin) {
    const { data: filesData } = await supabase.rpc('get_share_link_files_by_token', {
      p_token: cleanToken,
    });

    if (filesData && Array.isArray(filesData)) {
      initialFiles = attachSignedPublicMediaUrls(
        filesData as UserFileIndexRow[],
        {
          omitFullUrls: true,
          allowDownload: Boolean(link.allow_download),
        }
      );
    }
  }

  const serverUrl = getEdgeStorageServerUrl();

  return (
    <ClientProofingView
      token={cleanToken}
      albumTitle={link.album_title}
      creatorName={creatorName}
      creatorAvatarUrl={creatorAvatarUrl}
      hasPin={hasPin}
      allowDownload={Boolean(link.allow_download)}
      mode={link.mode}
      expiresAt={link.expires_at}
      initialFiles={initialFiles}
      initialSelectedPaths={link.selected_file_paths || []}
      isAlreadySubmitted={Boolean(link.is_submitted)}
      submittedAt={link.submitted_at}
      serverUrl={serverUrl}
    />
  );
}

function ExpiredOrNotFoundView({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-border-subtle rounded-2xl p-8 text-center space-y-5 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-[#FFCC00]/10 border border-[#FFCC00]/30 flex items-center justify-center mx-auto text-[#FFCC00]">
          <span className="material-symbols-outlined text-[36px]">schedule</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-fg font-['Bukra']">
            Álbum Indisponível
          </h1>
          <p className="text-xs text-fg-secondary leading-relaxed">{message}</p>
        </div>

        <div className="pt-2">
          <span className="text-[11px] text-fg-muted font-mono">
            Aurtistic Media Ecosystem
          </span>
        </div>
      </div>
    </div>
  );
}
