// Este programa é um software livre (Licença AGPLv3)
'use server';

import { createClient } from '@/utils/supabase/server';
import { signEdgeTenantTicket } from '@/lib/edge-ticket';
import { buildTenantStreamUrl, buildTenantThumbUrl } from '@/lib/edge-urls';

export interface StudioGalleryMediaItem {
  id: string;
  fileName: string;
  relativePath: string;
  thumbUrl: string;
  streamUrl: string;
  source: 'org_acervo' | 'org_vault' | 'personal' | 'portfolio' | 'org';
  category?: string;
  label?: string;
}

const SHOW_DA_FISICA_ACERVO: StudioGalleryMediaItem[] = [
  {
    id: 'show-basket',
    fileName: 'IMG_8833.JPG',
    label: 'Basket — Cinemática & Física do Esporte',
    category: 'Mecânica',
    relativePath: '/show/IMG_8833.JPG',
    thumbUrl: '/show/IMG_8833.JPG',
    streamUrl: '/show/IMG_8833.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-galao',
    fileName: 'IMG_8869.JPG',
    label: 'Galão — Pressão Atmosférica & Vácuo',
    category: 'Termodinâmica',
    relativePath: '/show/IMG_8869.JPG',
    thumbUrl: '/show/IMG_8869.JPG',
    streamUrl: '/show/IMG_8869.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-torque',
    fileName: 'IMG_8876.JPG',
    label: 'Torque — Giroscópios & Momento Angular',
    category: 'Mecânica Rotacional',
    relativePath: '/show/IMG_8876.JPG',
    thumbUrl: '/show/IMG_8876.JPG',
    streamUrl: '/show/IMG_8876.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-palco-luz',
    fileName: 'IMG_8891.JPG',
    label: 'Demonstrações de Palco & Luz (Show ao Vivo)',
    category: 'Palco & Sessões',
    relativePath: '/show/IMG_8891.JPG',
    thumbUrl: '/show/IMG_8891.JPG',
    streamUrl: '/show/IMG_8891.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-optica-laser',
    fileName: 'IMG_8990.JPG',
    label: 'Bancada Experimental — Laser & Óptica',
    category: 'Óptica',
    relativePath: '/show/IMG_8990.JPG',
    thumbUrl: '/show/IMG_8990.JPG',
    streamUrl: '/show/IMG_8990.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-van-de-graaff',
    fileName: 'IMG_00004.JPG',
    label: 'Gerador Van de Graaff — Eletrostática',
    category: 'Eletromagnetismo',
    relativePath: '/show/IMG_00004.JPG',
    thumbUrl: '/show/IMG_00004.JPG',
    streamUrl: '/show/IMG_00004.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-fluidos',
    fileName: 'IMG_00031.JPG',
    label: 'Fluidos e Termodinâmica Experimental',
    category: 'Termodinâmica',
    relativePath: '/show/IMG_00031.JPG',
    thumbUrl: '/show/IMG_00031.JPG',
    streamUrl: '/show/IMG_00031.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-ondas',
    fileName: 'IMG_00143.JPG',
    label: 'Ondulatória e Ressonância Acústica',
    category: 'Ondulatória',
    relativePath: '/show/IMG_00143.JPG',
    thumbUrl: '/show/IMG_00143.JPG',
    streamUrl: '/show/IMG_00143.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-mecanica',
    fileName: 'IMG_00224.JPG',
    label: 'Mecânica Clássica e Colisões',
    category: 'Mecânica',
    relativePath: '/show/IMG_00224.JPG',
    thumbUrl: '/show/IMG_00224.JPG',
    streamUrl: '/show/IMG_00224.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-plateia',
    fileName: 'IMG_00312.JPG',
    label: 'Plateia e Interação Científica ao Vivo',
    category: 'Plateia & Eventos',
    relativePath: '/show/IMG_00312.JPG',
    thumbUrl: '/show/IMG_00312.JPG',
    streamUrl: '/show/IMG_00312.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-aparatos',
    fileName: 'IMG_8793.JPG',
    label: 'Montagem e Preparação de Aparatos',
    category: 'Bancada & Oficina',
    relativePath: '/show/IMG_8793.JPG',
    thumbUrl: '/show/IMG_8793.JPG',
    streamUrl: '/show/IMG_8793.JPG',
    source: 'org_acervo',
  },
  {
    id: 'show-bastidores',
    fileName: 'IMG_8797.JPG',
    label: 'Bastidores do Show — Equipe de Monitores',
    category: 'Equipe & Bastidores',
    relativePath: '/show/IMG_8797.JPG',
    thumbUrl: '/show/IMG_8797.JPG',
    streamUrl: '/show/IMG_8797.JPG',
    source: 'org_acervo',
  },
];

const LABDIV_ACERVO: StudioGalleryMediaItem[] = [
  {
    id: 'labdiv-foto-1',
    fileName: 'galeria1.jpg',
    label: 'Divulgação Científica & Fotografia Editorial',
    category: 'Comunicação',
    relativePath: '/galeria1.jpg',
    thumbUrl: '/galeria1.jpg',
    streamUrl: '/galeria1.jpg',
    source: 'org_acervo',
  },
  {
    id: 'labdiv-foto-2',
    fileName: 'galeria2.jpg',
    label: 'Produção Científica & Laboratório',
    category: 'Pesquisa',
    relativePath: '/galeria2.jpg',
    thumbUrl: '/galeria2.jpg',
    streamUrl: '/galeria2.jpg',
    source: 'org_acervo',
  },
  {
    id: 'labdiv-brand',
    fileName: 'bd_Labdiv.png',
    label: 'Identidade Visual & Comunicação LabDiv',
    category: 'Design & Marca',
    relativePath: '/bd_Labdiv.png',
    thumbUrl: '/bd_Labdiv.png',
    streamUrl: '/bd_Labdiv.png',
    source: 'org_acervo',
  },
  {
    id: 'labdiv-logo',
    fileName: 'Logo_Labdiv.png',
    label: 'Logo Oficial LabDiv IFUSP',
    category: 'Marca',
    relativePath: '/Logo_Labdiv.png',
    thumbUrl: '/Logo_Labdiv.png',
    streamUrl: '/Logo_Labdiv.png',
    source: 'org_acervo',
  },
];

const HS_ACERVO: StudioGalleryMediaItem[] = [
  {
    id: 'hs-bancada-1',
    fileName: 'IMG_8990.JPG',
    label: 'Bancada Maker, Eletrônica & Sensores',
    category: 'Hardware',
    relativePath: '/show/IMG_8990.JPG',
    thumbUrl: '/show/IMG_8990.JPG',
    streamUrl: '/show/IMG_8990.JPG',
    source: 'org_acervo',
  },
  {
    id: 'hs-oficina-1',
    fileName: 'IMG_8793.JPG',
    label: 'Oficina, Impressoras 3D & Reparos',
    category: 'Fabricação Digital',
    relativePath: '/show/IMG_8793.JPG',
    thumbUrl: '/show/IMG_8793.JPG',
    streamUrl: '/show/IMG_8793.JPG',
    source: 'org_acervo',
  },
];

const PROFIS_ACERVO: StudioGalleryMediaItem[] = [
  {
    id: 'profis-acervo-1',
    fileName: 'IMG_00312.JPG',
    label: 'Monitoria, Apoio Acadêmico & Nivelamento',
    category: 'Ensino',
    relativePath: '/show/IMG_00312.JPG',
    thumbUrl: '/show/IMG_00312.JPG',
    streamUrl: '/show/IMG_00312.JPG',
    source: 'org_acervo',
  },
  {
    id: 'profis-acervo-2',
    fileName: 'IMG_8891.JPG',
    label: 'Seminários, Pesquisa & Iniciação Científica',
    category: 'Pesquisa',
    relativePath: '/show/IMG_8891.JPG',
    thumbUrl: '/show/IMG_8891.JPG',
    streamUrl: '/show/IMG_8891.JPG',
    source: 'org_acervo',
  },
];

export async function getStudioGalleryMediaAction(input?: {
  organizationId?: string | null;
  orgSlug?: string | null;
  limit?: number;
}): Promise<{ ok: boolean; items: StudioGalleryMediaItem[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, items: [], error: 'Usuário não autenticado.' };
  }

  const limit = Math.min(80, Math.max(12, input?.limit ?? 48));
  const orgId = input?.organizationId || null;
  const rawSlug = (input?.orgSlug || '').trim().toLowerCase().replace(/_/g, '-');

  try {
    // 1. Acervo Oficial da Organização Solicitada
    const orgAcervo: StudioGalleryMediaItem[] = [];
    if (rawSlug === 'show-da-fisica' || rawSlug === 'showdefisica' || orgId === '1ab41410-0000-4000-8000-000000000002') {
      orgAcervo.push(...SHOW_DA_FISICA_ACERVO);
    } else if (rawSlug === 'labdiv' || orgId === '1ab41410-0000-4000-8000-000000000001') {
      orgAcervo.push(...LABDIV_ACERVO);
    } else if (rawSlug === 'hs' || rawSlug === 'hackerspace' || orgId === '1ab41410-0000-4000-8000-000000000003') {
      orgAcervo.push(...HS_ACERVO);
    } else if (rawSlug === 'profis' || rawSlug === 'pro-fis' || orgId === '1ab41410-0000-4000-8000-000000000004') {
      orgAcervo.push(...PROFIS_ACERVO);
    }

    // 2. Fotos indexadas no Servidor (Cofre da Organização e Cofre Pessoal)
    let query = supabase
      .from('user_files_index')
      .select('id, user_id, organization_id, filename, relative_path, mime_type, show_in_portfolio')
      .eq('is_directory', false)
      .or(
        'mime_type.ilike.image/%,filename.ilike.%.jpg,filename.ilike.%.jpeg,filename.ilike.%.png,filename.ilike.%.webp,filename.ilike.%.avif,filename.ilike.%.gif'
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (orgId) {
      query = query.or(
        `organization_id.eq.${orgId},user_id.eq.${user.id},show_in_portfolio.eq.true`
      );
    } else {
      query = query.or(`user_id.eq.${user.id},show_in_portfolio.eq.true`);
    }

    const { data, error } = await query;
    if (error) {
      // Se a tabela do banco der erro temporário, retorna com resiliência o acervo da organização
      return { ok: true, items: orgAcervo };
    }

    const serverItems: StudioGalleryMediaItem[] = (data || [])
      .filter((row: any) => Boolean(row.relative_path))
      .map((row: any) => {
        const isOrgVault = Boolean(orgId && row.organization_id === orgId);
        const signed = signEdgeTenantTicket({
          userId: row.user_id || user.id,
          scopeType: isOrgVault ? 'org' : 'user',
          orgSlug: isOrgVault && rawSlug ? rawSlug : undefined,
          organizationId: isOrgVault && orgId ? orgId : undefined,
          role: 'member',
          purpose: 'share',
          allowedPaths: [row.relative_path],
          readOnly: true,
          allowDownload: true,
          ttlMs: 2 * 60 * 60 * 1000,
        });

        const source: StudioGalleryMediaItem['source'] = isOrgVault
          ? 'org_vault'
          : row.user_id === user.id
            ? 'personal'
            : 'portfolio';

        return {
          id: row.id,
          fileName: row.filename || row.relative_path.split('/').pop() || 'foto.jpg',
          label: row.filename || 'Foto do Cofre da Organização',
          relativePath: row.relative_path,
          thumbUrl: buildTenantThumbUrl(row.relative_path, signed.ticket),
          streamUrl: buildTenantStreamUrl(row.relative_path, signed.ticket, { download: true }),
          source,
          category: isOrgVault ? 'Cofre da Organização' : 'Servidor',
        };
      });

    // 3. Resolve fotos dentro de pastas de Atalho no Cofre da Organização (Ponto 10)
    const shortcutItems: StudioGalleryMediaItem[] = [];
    if (orgId) {
      const { data: shortcutRows } = await supabase
        .from('user_files_index')
        .select('id, user_id, relative_path, filename, exif_data')
        .eq('organization_id', orgId)
        .eq('mime_type', 'inode/directory+shortcut')
        .limit(20);

      for (const sc of shortcutRows || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exif = ((sc as any).exif_data || {}) as Record<string, unknown>;
        const targetRel = String(exif.shortcutTarget || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const ownerId = String(exif.ownerUserId || sc.user_id || user.id);
        const targetOrg = exif.targetOrgId ? String(exif.targetOrgId) : null;
        if (!targetRel && !targetOrg) continue;

        let scPhotoQuery = supabase
          .from('user_files_index')
          .select('id, user_id, organization_id, filename, relative_path, mime_type, show_in_portfolio')
          .eq('is_directory', false)
          .or(
            'mime_type.ilike.image/%,filename.ilike.%.jpg,filename.ilike.%.jpeg,filename.ilike.%.png,filename.ilike.%.webp,filename.ilike.%.avif,filename.ilike.%.gif'
          )
          .limit(24);

        if (targetOrg) {
          scPhotoQuery = scPhotoQuery.eq('organization_id', targetOrg);
          if (targetRel) scPhotoQuery = scPhotoQuery.ilike('relative_path', `${targetRel}/%`);
        } else {
          scPhotoQuery = scPhotoQuery.eq('user_id', ownerId).is('organization_id', null);
          if (targetRel.toLowerCase().startsWith('portfolio')) {
            scPhotoQuery = scPhotoQuery.or(`relative_path.ilike.${targetRel}/%,show_in_portfolio.eq.true`);
          } else if (targetRel) {
            scPhotoQuery = scPhotoQuery.ilike('relative_path', `${targetRel}/%`);
          }
        }

        const { data: scPhotos } = await scPhotoQuery;
        const isOrgTarget = Boolean(targetOrg && exif.targetOrgSlug);
        const targetOrgSlug = exif.targetOrgSlug ? String(exif.targetOrgSlug).toLowerCase().trim() : undefined;
        const targetOwnerUserId = String(ownerId || user.id);

        for (const pRow of scPhotos || []) {
          if (!pRow.relative_path) continue;
          const scDisplayPath = sc.relative_path
            ? `${sc.relative_path}/${pRow.filename || pRow.relative_path.split('/').pop()}`
            : pRow.relative_path;

          const signed = signEdgeTenantTicket({
            userId: isOrgTarget ? (pRow.user_id || user.id) : targetOwnerUserId,
            scopeType: isOrgTarget ? 'org' : 'user',
            orgSlug: isOrgTarget ? targetOrgSlug : undefined,
            organizationId: targetOrg || undefined,
            allowedOrgSlugs: targetOrgSlug ? [targetOrgSlug] : undefined,
            role: 'member',
            purpose: 'share',
            allowedPaths: [pRow.relative_path],
            readOnly: true,
            allowDownload: true,
            ttlMs: 2 * 60 * 60 * 1000,
          });
          shortcutItems.push({
            id: `sc-${sc.id}-${pRow.id}`,
            fileName: pRow.filename || scDisplayPath.split('/').pop() || 'foto.jpg',
            label: `${pRow.filename || 'Foto'} (${sc.filename || 'Atalho'})`,
            relativePath: scDisplayPath,
            thumbUrl: buildTenantThumbUrl(pRow.relative_path, signed.ticket),
            streamUrl: buildTenantStreamUrl(pRow.relative_path, signed.ticket, { download: true }),
            source: 'org_vault',
            category: `Atalho: ${sc.filename || targetRel}`,
          });
        }
      }
    }

    // Combina: Acervo Oficial + Fotos do Cofre + Fotos de Atalhos da Organização
    const seenIds = new Set<string>();
    const allItems: StudioGalleryMediaItem[] = [];
    for (const item of [...orgAcervo, ...serverItems, ...shortcutItems]) {
      const dedupKey = item.streamUrl;
      if (seenIds.has(dedupKey)) continue;
      seenIds.add(dedupKey);
      allItems.push(item);
    }

    return { ok: true, items: allItems };
  } catch (err: unknown) {
    return {
      ok: false,
      items: [],
      error: err instanceof Error ? err.message : 'Erro ao listar mídia da galeria.',
    };
  }
}

export async function rehydrateStudioDraftAction(
  draft: import('@/components/organizacoes/studio/types').StudioDraft,
  orgSlug: string
): Promise<{ ok: boolean; draft: import('@/components/organizacoes/studio/types').StudioDraft }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = user?.id || 'studio-vault-user';

    const rehydratedSlides = draft.slides.map((slide) => ({
      ...slide,
      layers: slide.layers.map((layer) => {
        if (layer.type !== 'image') return layer;
        const img = layer as import('@/components/organizacoes/studio/types').StudioImageLayer;
        if (!img.vaultRelativePath) return img;

        if (img.vaultRelativePath.startsWith('http') || img.vaultRelativePath.startsWith('/galeria') || img.vaultRelativePath.startsWith('/show') || img.vaultRelativePath.startsWith('/Logo')) {
          return { ...img, resolvedUrl: img.vaultRelativePath, src: img.vaultRelativePath };
        }

        try {
          const signed = signEdgeTenantTicket({
            userId,
            scopeType: 'org',
            orgSlug,
            role: 'member',
            purpose: 'share',
            allowedPaths: [img.vaultRelativePath],
            readOnly: true,
            allowDownload: true,
            ttlMs: 24 * 60 * 60 * 1000,
          });
          const streamUrl = buildTenantStreamUrl(img.vaultRelativePath, signed.ticket);
          return { ...img, resolvedUrl: streamUrl, src: streamUrl };
        } catch {
          return img;
        }
      }),
    }));

    return { ok: true, draft: { ...draft, slides: rehydratedSlides } };
  } catch {
    return { ok: true, draft };
  }
}
