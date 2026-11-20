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

  // 2. Busca perfil público do criador (ou organização) funcionando logado e anônimo
  let creatorName: string | null = null;
  let creatorAvatarUrl: string | null = null;
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminClient = sbUrl && serviceKey
      ? (await import('@supabase/supabase-js')).createClient(sbUrl, serviceKey, { auth: { persistSession: false } })
      : null;
    const reader = adminClient || supabase;

    if (link.organization_id) {
      const { data: org } = await reader
        .from('organizations')
        .select('name, logo_url')
        .eq('id', link.organization_id)
        .maybeSingle();
      if (org?.name) creatorName = org.name;
      if (org?.logo_url) creatorAvatarUrl = org.logo_url;
    }

    const ownerId = link.user_id || link.owner_id || link.created_by;
    if (ownerId) {
      // Mesma prioridade da AurtisticNavbar:
      // 1) auth.user_metadata.full_name / email.split('@')[0] (adminClient ou sessão ativa)
      // 2) user_profiles.full_name / avatar_url (nunca deixando username/public_slug 'joao' vencer sobre o nome da navbar)
      if (adminClient) {
        const { data: authRes } = await adminClient.auth.admin.getUserById(ownerId).catch(() => ({ data: null }));
        const meta = authRes?.user?.user_metadata;
        const emailHandle = authRes?.user?.email?.split('@')[0] || null;
        creatorName = creatorName || meta?.full_name || meta?.name || emailHandle || null;
        creatorAvatarUrl = creatorAvatarUrl || meta?.avatar_url || meta?.picture || null;
      }

      if (!creatorName || !creatorAvatarUrl) {
        const { data: authUser } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
        const currentUser = authUser?.user;
        if (currentUser && currentUser.id === ownerId) {
          const meta = currentUser.user_metadata;
          const emailHandle = currentUser.email?.split('@')[0] || null;
          creatorName = creatorName || meta?.full_name || meta?.name || emailHandle || null;
          creatorAvatarUrl = creatorAvatarUrl || meta?.avatar_url || meta?.picture || null;
        }
      }

      const { data: prof } = await reader
        .from('user_profiles')
        .select('full_name, username, avatar_url, features_config')
        .eq('id', ownerId)
        .maybeSingle();

      if (prof?.full_name) {
        creatorName = creatorName || prof.full_name;
      }
      if (prof?.avatar_url) {
        creatorAvatarUrl = creatorAvatarUrl || prof.avatar_url;
      }
      if (
        !creatorAvatarUrl &&
        ownerId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' &&
        prof?.features_config?.advanced_settings?.sync_curriculum_photo !== false
      ) {
        creatorAvatarUrl = '/perfil.jpeg';
      }

      // Fallback via RPC pública (funciona mesmo sem service role)
      if (!creatorName || !creatorAvatarUrl) {
        const { data: sp } = await reader
          .from('user_storage_profiles')
          .select('public_slug')
          .eq('user_id', ownerId)
          .maybeSingle();
        const slugCandidate = prof?.username || sp?.public_slug;
        if (slugCandidate) {
          const { data: rpcProf } = await supabase.rpc('resolve_public_creator_profile', {
            p_slug: slugCandidate,
          });
          const rUp = rpcProf?.userProfile;
          if (rUp) {
            creatorName = creatorName || rUp.full_name || rUp.username || null;
            creatorAvatarUrl = creatorAvatarUrl || rUp.avatar_url || null;
          }
        }
      }

      // Último recurso: username do perfil
      if (!creatorName && prof?.username) {
        creatorName = prof.username;
      }
    }
  } catch {}

  const resolvedCreatorName = creatorName || 'Acervo Compartilhado';
  const resolvedCreatorAvatarUrl = creatorAvatarUrl || null;

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
      creatorName={resolvedCreatorName}
      creatorAvatarUrl={resolvedCreatorAvatarUrl}
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
