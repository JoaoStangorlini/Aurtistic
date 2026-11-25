// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/s/[token]/page.tsx
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { ClientProofingView, type ProofingPhotoItem } from '@/components/share/ClientProofingView';
import { attachSignedPublicMediaUrls, getEdgeStorageServerUrl } from '@/lib/edge-ticket';
import { validateShareToken } from '@/lib/validators';
import type { Metadata } from 'next';
import type { UserFileIndexRow } from '@/types';

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = 'force-dynamic';

interface SharePublicMeta {
  found: boolean;
  id?: string;
  album_title?: string;
  folder_path?: string;
  mode?: 'view' | 'proofing' | 'upload_only';
  allow_download?: boolean;
  has_pin?: boolean;
  pin_legacy_only?: boolean;
  expires_at?: string | null;
  organization_id?: string | null;
  org_slug?: string | null;
  org_name?: string | null;
  org_avatar_url?: string | null;
  creator_display_name?: string | null;
  creator_avatar_url?: string | null;
  is_submitted?: boolean;
  submitted_at?: string | null;
  selected_file_paths?: string[];
}

async function fetchSharePublicMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cleanToken: string
): Promise<SharePublicMeta | null> {
  const { data: meta, error } = await supabase.rpc('get_share_link_public_meta', {
    p_token: cleanToken,
  });

  if (!error && meta) {
    return meta as SharePublicMeta;
  }

  // Fallback controlado exclusivamente no servidor caso a RPC falhe (ex.: Migration pendente ou record v_org)
  if (error) {
    const reader = createAdminClient() || supabase;
    const { data: linkRows } = await reader.rpc('get_share_link_by_token_internal', {
      p_token: cleanToken,
    });
    if (!linkRows || linkRows.length === 0) return { found: false };
    const link = linkRows[0];

    let orgName: string | null = null;
    let orgAvatarUrl: string | null = null;
    let orgSlug: string | null = null;
    if (link.organization_id) {
      const { data: org } = await reader
        .from('organizations')
        .select('slug, name, avatar_url')
        .eq('id', link.organization_id)
        .maybeSingle();
      orgSlug = org?.slug || null;
      orgName = org?.name || null;
      orgAvatarUrl = org?.avatar_url || null;
    }

    return {
      found: true,
      id: link.id,
      album_title: link.album_title,
      folder_path: link.folder_path,
      mode: link.mode,
      allow_download: link.allow_download,
      has_pin: Boolean(link.pin_hash || link.pin_pg_hash),
      expires_at: link.expires_at,
      organization_id: link.organization_id,
      org_slug: orgSlug,
      org_name: orgName,
      org_avatar_url: orgAvatarUrl,
      creator_display_name: orgName || 'Acervo Compartilhado',
      creator_avatar_url: orgAvatarUrl || null,
      is_submitted: link.is_submitted,
      submitted_at: link.submitted_at,
      selected_file_paths: link.selected_file_paths || [],
    };
  }

  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const tokenRes = validateShareToken(token);
  if (!tokenRes.ok) {
    return { title: 'Link de Prova | Aurtistic' };
  }
  const cleanToken = tokenRes.data;

  const supabase = await createClient();
  const meta = await fetchSharePublicMeta(supabase, cleanToken);

  if (!meta || !meta.found || !meta.album_title) {
    return { title: 'Álbum Expirado | Aurtistic' };
  }

  return {
    title: `${meta.album_title} — Seleção de Fotos | Aurtistic`,
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
  const meta = await fetchSharePublicMeta(supabase, cleanToken);

  if (!meta || !meta.found) {
    return (
      <ExpiredOrNotFoundView message="Este link de prova expirou ou não está mais disponível. Entre em contato com o fotógrafo para solicitar um novo acesso." />
    );
  }

  const hasPin = Boolean(meta.has_pin);
  const resolvedCreatorName = meta.org_name || meta.creator_display_name || 'Acervo Compartilhado';
  const resolvedCreatorAvatarUrl = meta.org_avatar_url || meta.creator_avatar_url || null;

  let initialFiles: ProofingPhotoItem[] = [];
  if (!hasPin) {
    const { data: unlocked, error: unlockErr } = await supabase.rpc('unlock_and_list_share_link', {
      p_token: cleanToken,
      p_pin: null,
    });

    if (!unlockErr && unlocked?.ok && Array.isArray(unlocked.files)) {
      const orgCtx =
        unlocked.link?.organization_id && unlocked.link?.org_slug
          ? { organizationId: unlocked.link.organization_id, orgSlug: unlocked.link.org_slug }
          : null;
      initialFiles = attachSignedPublicMediaUrls(
        unlocked.files as UserFileIndexRow[],
        {
          omitFullUrls: true,
          allowDownload: Boolean(meta.allow_download),
          orgContext: orgCtx,
        }
      );
    } else if (unlockErr?.code === '42883' || unlockErr?.message?.includes('unlock_and_list_share_link')) {
      const { data: filesData } = await supabase.rpc('get_share_link_files_by_token', {
        p_token: cleanToken,
      });
      if (filesData && Array.isArray(filesData)) {
        const orgCtx =
          meta.organization_id && meta.org_slug
            ? { organizationId: meta.organization_id, orgSlug: meta.org_slug }
            : null;
        initialFiles = attachSignedPublicMediaUrls(
          filesData as UserFileIndexRow[],
          {
            omitFullUrls: true,
            allowDownload: Boolean(meta.allow_download),
            orgContext: orgCtx,
          }
        );
      }
    }
  }

  const serverUrl = getEdgeStorageServerUrl();

  return (
    <ClientProofingView
      token={cleanToken}
      albumTitle={meta.album_title || 'Álbum Compartilhado'}
      creatorName={resolvedCreatorName}
      creatorAvatarUrl={resolvedCreatorAvatarUrl}
      hasPin={hasPin}
      allowDownload={Boolean(meta.allow_download)}
      mode={meta.mode || 'proofing'}
      expiresAt={meta.expires_at ?? null}
      initialFiles={initialFiles}
      initialSelectedPaths={meta.selected_file_paths || []}
      isAlreadySubmitted={Boolean(meta.is_submitted)}
      submittedAt={meta.submitted_at ?? null}
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
