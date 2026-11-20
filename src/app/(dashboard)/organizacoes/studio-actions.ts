// Este programa é um software livre (Licença AGPLv3)
'use server';

import { createClient } from '@/utils/supabase/server';
import { signEdgeTenantTicket } from '@/lib/edge-ticket';
import { buildTenantStreamUrl, buildTenantThumbUrl, resolveClientEdgeServerUrl } from '@/lib/edge-urls';

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
          streamUrl: buildTenantStreamUrl(row.relative_path, signed.ticket, { download: false }),
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
            streamUrl: buildTenantStreamUrl(pRow.relative_path, signed.ticket, { download: false }),
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

// ─── Tipos para o browser de pastas do Studio ───────────────────────────────

export interface VaultFolderEntry {
  name: string;
  path: string;
  isLocked?: boolean;
  color?: string | null;
  icon?: string | null;
  isShortcut?: boolean;
  shortcutOwner?: string;
  shortcutType?: string;
  shortcutTarget?: string;
}

export interface VaultFileEntry {
  name: string;
  path: string;
  kind: string;
  mimeType?: string;
  sizeBytes?: number;
  thumbUrl: string | null;
  streamUrl: string;
}

export interface ListVaultFolderResult {
  ok: boolean;
  folders: VaultFolderEntry[];
  files: VaultFileEntry[];
  breadcrumbs: { name: string; path: string }[];
  error?: string;
}

function normalizeVaultSlug(rawSlug?: string): string | undefined {
  if (!rawSlug) return undefined;
  const s = rawSlug.trim().toLowerCase().replace(/_/g, '-');
  if (s === 'showdefisica' || s === 'show-de-fisica' || s.includes('show')) return 'show-da-fisica';
  if (s === 'hackerspace' || s === 'hs') return 'hs';
  return s;
}

function stripVaultAccents(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function splitVaultSegments(rel: string): string[] {
  return String(rel || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeVaultLikePattern(val: string): string {
  return String(val || '').replace(/[\\%_]/g, (m) => `\\${m}`);
}

function buildVaultBreadcrumbs(rootLabel: string, cleanFolder: string): { name: string; path: string }[] {
  const segs = splitVaultSegments(cleanFolder);
  return [
    { name: rootLabel, path: '' },
    ...segs.map((seg, i, arr) => ({
      name: seg,
      path: arr.slice(0, i + 1).join('/'),
    })),
  ];
}

interface ResolvedStudioShortcutMeta {
  scRel: string;
  name: string;
  ownerUserId: string;
  targetRelPath: string;
  targetOrgSlug?: string;
  targetOrgId?: string;
  shortcutOwner: string;
  shortcutType: string;
}

function matchShortcutBySegments(
  cleanPath: string,
  shortcuts: ResolvedStudioShortcutMeta[]
): { shortcut: ResolvedStudioShortcutMeta; subRel: string } | null {
  const pathSegs = splitVaultSegments(cleanPath);
  if (pathSegs.length === 0 || shortcuts.length === 0) return null;
  const normPathSegs = pathSegs.map(stripVaultAccents);

  const sorted = [...shortcuts].sort(
    (a, b) => splitVaultSegments(b.scRel).length - splitVaultSegments(a.scRel).length
  );

  for (const sc of sorted) {
    const scSegs = splitVaultSegments(sc.scRel).map(stripVaultAccents);
    if (scSegs.length === 0 || pathSegs.length < scSegs.length) continue;
    let matched = true;
    for (let i = 0; i < scSegs.length; i++) {
      if (normPathSegs[i] !== scSegs[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return {
        shortcut: sc,
        subRel: pathSegs.slice(scSegs.length).join('/'),
      };
    }
  }
  return null;
}

async function loadOrgShortcutsForStudio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId?: string
): Promise<ResolvedStudioShortcutMeta[]> {
  if (!orgId) return [];
  const list: ResolvedStudioShortcutMeta[] = [];
  try {
    const { data: shortcutRows } = await supabase
      .from('user_files_index')
      .select('user_id, relative_path, filename, exif_data')
      .eq('organization_id', orgId)
      .or('mime_type.eq."inode/directory+shortcut",exif_data->>isShortcut.eq.true')
      .limit(60);

    for (const sc of shortcutRows || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exif = ((sc as any).exif_data || {}) as Record<string, unknown>;
      const targetRel = splitVaultSegments(String(exif.shortcutTarget || '')).join('/');
      const ownerUserId = String(exif.ownerUserId || exif.targetUserId || sc.user_id || '');
      const targetOrgSlug = normalizeVaultSlug(
        typeof exif.targetOrgSlug === 'string' ? exif.targetOrgSlug : undefined
      );
      const targetOrgId = typeof exif.targetOrgId === 'string' && exif.targetOrgId ? exif.targetOrgId : undefined;
      const scName = String(sc.filename || splitVaultSegments(String(sc.relative_path || '')).pop() || 'Atalho');
      const scRel = splitVaultSegments(String(sc.relative_path || scName)).join('/');

      if (scRel && ((targetOrgSlug || targetOrgId) || (ownerUserId && targetRel))) {
        list.push({
          scRel,
          name: scName,
          ownerUserId,
          targetRelPath: targetRel,
          targetOrgSlug,
          targetOrgId,
          shortcutOwner: String(exif.shortcutOwner || 'Membro'),
          shortcutType: String(exif.shortcutType || (targetOrgSlug || targetOrgId ? 'org_folder' : 'personal_folder')),
        });
      }
    }
  } catch {}
  return list;
}

async function resolveOwnerStorageRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerUserId: string,
  cache?: Map<string, 'admin' | 'member'>
): Promise<'admin' | 'member'> {
  if (!ownerUserId) return 'member';
  const cached = cache?.get(ownerUserId);
  if (cached) return cached;
  try {
    const { data } = await supabase
      .from('user_storage_profiles')
      .select('storage_role')
      .eq('user_id', ownerUserId)
      .maybeSingle();
    const role: 'admin' | 'member' = data?.storage_role === 'admin' ? 'admin' : 'member';
    cache?.set(ownerUserId, role);
    return role;
  } catch {
    return 'member';
  }
}

export async function listVaultFolderAction(input: {
  folder: string;
  scopeType: 'org' | 'user';
  orgSlug?: string;
  organizationId?: string;
}): Promise<ListVaultFolderResult> {
  'use server';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rootLabel = input.scopeType === 'org' ? 'Cofre da Organização' : 'Cofre Pessoal';
  const cleanFolder = splitVaultSegments(String(input.folder || '')).join('/');
  const fallbackBreadcrumbs = buildVaultBreadcrumbs(rootLabel, cleanFolder);

  if (!user) {
    return { ok: false, folders: [], files: [], breadcrumbs: fallbackBreadcrumbs, error: 'Não autenticado.' };
  }

  try {
    const edgeBase = resolveClientEdgeServerUrl();
    let resolvedOrgSlug = input.scopeType === 'org' ? normalizeVaultSlug(input.orgSlug) : undefined;
    let resolvedOrgId = input.scopeType === 'org' ? input.organizationId : undefined;

    // 1. Validação Anti-IDOR + Resolução de organizationId / orgSlug
    if (input.scopeType === 'org') {
      if (!resolvedOrgId && resolvedOrgSlug) {
        const { data: orgRow } = await supabase
          .from('organizations')
          .select('id, slug')
          .eq('slug', resolvedOrgSlug)
          .maybeSingle();
        if (orgRow?.id) {
          resolvedOrgId = orgRow.id;
          resolvedOrgSlug = normalizeVaultSlug(orgRow.slug) || resolvedOrgSlug;
        }
      }
      if (resolvedOrgId) {
        const { data: memberRow } = await supabase
          .from('organization_members')
          .select('id')
          .eq('organization_id', resolvedOrgId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (!memberRow) {
          return {
            ok: false,
            folders: [],
            files: [],
            breadcrumbs: fallbackBreadcrumbs,
            error: 'Acesso negado ao cofre desta organização.',
          };
        }
      }
    }

    // 2. Busca atalhos da organização no Supabase (híbrido: disco + Supabase)
    const supabaseShortcuts =
      input.scopeType === 'org' && resolvedOrgId
        ? await loadOrgShortcutsForStudio(supabase, resolvedOrgId)
        : [];

    // 3. Verifica se estamos navegando dentro de um atalho (org -> pessoal ou org -> org)
    const shortcutMatch =
      input.scopeType === 'org' && cleanFolder
        ? matchShortcutBySegments(cleanFolder, supabaseShortcuts)
        : null;

    if (shortcutMatch) {
      const { shortcut: activeShortcut, subRel } = shortcutMatch;
      const isOrgTarget = Boolean(activeShortcut.targetOrgSlug || activeShortcut.targetOrgId);

      if (isOrgTarget) {
        let targetOrgId = activeShortcut.targetOrgId;
        let targetOrgSlug = activeShortcut.targetOrgSlug;
        if (!targetOrgId && targetOrgSlug) {
          const { data: tOrg } = await supabase
            .from('organizations')
            .select('id, slug')
            .eq('slug', targetOrgSlug)
            .maybeSingle();
          targetOrgId = tOrg?.id;
          targetOrgSlug = normalizeVaultSlug(tOrg?.slug) || targetOrgSlug;
        }
        if (!targetOrgId) {
          return {
            ok: false,
            folders: [],
            files: [],
            breadcrumbs: fallbackBreadcrumbs,
            error: 'Organização de destino do atalho não encontrada.',
          };
        }
        const { data: tMember } = await supabase
          .from('organization_members')
          .select('id')
          .eq('organization_id', targetOrgId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (!tMember) {
          return {
            ok: false,
            folders: [],
            files: [],
            breadcrumbs: fallbackBreadcrumbs,
            error: 'Sem permissão para acessar a organização de destino deste atalho.',
          };
        }

        const rootPrefix = activeShortcut.targetRelPath;
        const targetPhysicalFolder = [rootPrefix, subRel].filter(Boolean).join('/');
        const signed = signEdgeTenantTicket({
          userId: user.id,
          scopeType: 'org',
          orgSlug: targetOrgSlug,
          organizationId: targetOrgId,
          role: 'member',
          purpose: 'share',
          ...(rootPrefix ? { allowedPrefix: rootPrefix, allowedPathPrefix: rootPrefix } : {}),
          readOnly: true,
          allowDownload: false,
          ttlMs: 10 * 60 * 1000,
        });

        const params = new URLSearchParams({ folder: targetPhysicalFolder, ticket: signed.ticket });
        const res = await fetch(`${edgeBase}/api/tenant/list?${params.toString()}`, {
          cache: 'no-store',
        });

        if (res.ok) {
          const json = (await res.json()) as {
            folders?: (VaultFolderEntry & { relativePath?: string })[];
            files?: { name: string; path?: string; relativePath?: string; kind?: string; mimeType?: string; sizeBytes?: number }[];
          };
          const folders: VaultFolderEntry[] = (json.folders || []).map((f) => ({
            ...f,
            path: [activeShortcut.scRel, subRel, f.name].filter(Boolean).join('/'),
          }));
          const files: VaultFileEntry[] = (json.files || []).map((f) => {
            const physicalFilePath = f.path || f.relativePath || [targetPhysicalFolder, f.name].filter(Boolean).join('/');
            const virtualFilePath = [activeShortcut.scRel, subRel, f.name].filter(Boolean).join('/');
            const isImg = f.kind === 'image' || /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(f.name);
            const fileSigned = signEdgeTenantTicket({
              userId: user.id,
              scopeType: 'org',
              orgSlug: targetOrgSlug,
              organizationId: targetOrgId,
              role: 'member',
              purpose: 'share',
              ...(rootPrefix ? { allowedPrefix: rootPrefix, allowedPathPrefix: rootPrefix } : {}),
              allowedPaths: [physicalFilePath],
              readOnly: true,
              allowDownload: false,
              ttlMs: 2 * 60 * 60 * 1000,
            });
            return {
              name: f.name,
              path: virtualFilePath,
              kind: isImg ? 'image' : (f.kind || 'file'),
              mimeType: f.mimeType,
              sizeBytes: f.sizeBytes,
              thumbUrl: isImg ? buildTenantThumbUrl(physicalFilePath, fileSigned.ticket) : null,
              streamUrl: buildTenantStreamUrl(physicalFilePath, fileSigned.ticket, { download: false }),
            };
          });
          return { ok: true, folders, files, breadcrumbs: fallbackBreadcrumbs };
        }
        return {
          ok: false,
          folders: [],
          files: [],
          breadcrumbs: fallbackBreadcrumbs,
          error: `Servidor retornou ${res.status}`,
        };
      }

      // Atalho Org -> Pasta Pessoal do Membro (suporta ponte Portfolio/ e fallback seguro)
      const ownerRole = await resolveOwnerStorageRole(supabase, activeShortcut.ownerUserId);
      const baseCandidate = activeShortcut.targetRelPath;
      const rootPrefixCandidates = [baseCandidate];
      if (!/^porti?folio(\/|$)/i.test(baseCandidate)) {
        rootPrefixCandidates.push(`Portfolio/${baseCandidate}`);
      }

      interface EdgeListResponse {
        folders?: (VaultFolderEntry & { relativePath?: string })[];
        files?: { name: string; path?: string; relativePath?: string; kind?: string; mimeType?: string; sizeBytes?: number }[];
      }
      let resolvedRootPrefix = baseCandidate;
      let resolvedPhysicalFolder = [baseCandidate, subRel].filter(Boolean).join('/');
      let edgeJson: EdgeListResponse | null = null;
      let lastStatus = 404;

      for (const rootCandidate of rootPrefixCandidates) {
        const physicalCandidate = [rootCandidate, subRel].filter(Boolean).join('/');
        const signed = signEdgeTenantTicket({
          userId: activeShortcut.ownerUserId,
          scopeType: 'user',
          role: ownerRole,
          purpose: 'share',
          allowedPrefix: rootCandidate,
          allowedPathPrefix: rootCandidate,
          readOnly: true,
          allowDownload: false,
          ttlMs: 10 * 60 * 1000,
        });
        const params = new URLSearchParams({ folder: physicalCandidate, ticket: signed.ticket });
        const res = await fetch(`${edgeBase}/api/tenant/list?${params.toString()}`, {
          cache: 'no-store',
        });
        lastStatus = res.status;
        if (res.ok) {
          edgeJson = (await res.json()) as EdgeListResponse;
          resolvedRootPrefix = rootCandidate;
          resolvedPhysicalFolder = physicalCandidate;
          break;
        }
        if (res.status !== 404) {
          return {
            ok: false,
            folders: [],
            files: [],
            breadcrumbs: fallbackBreadcrumbs,
            error: `Servidor retornou ${res.status}`,
          };
        }
      }

      if (edgeJson) {
        const folders: VaultFolderEntry[] = (edgeJson.folders || []).map((f) => ({
          ...f,
          path: [activeShortcut.scRel, subRel, f.name].filter(Boolean).join('/'),
        }));

        const files: VaultFileEntry[] = (edgeJson.files || []).map((f) => {
          const physicalFilePath = f.path || f.relativePath || [resolvedPhysicalFolder, f.name].filter(Boolean).join('/');
          const virtualFilePath = [activeShortcut.scRel, subRel, f.name].filter(Boolean).join('/');
          const isImg = f.kind === 'image' || /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(f.name);
          const fileSigned = signEdgeTenantTicket({
            userId: activeShortcut.ownerUserId,
            scopeType: 'user',
            role: ownerRole,
            purpose: 'share',
            allowedPrefix: resolvedRootPrefix,
            allowedPathPrefix: resolvedRootPrefix,
            allowedPaths: [physicalFilePath],
            readOnly: true,
            allowDownload: false,
            ttlMs: 2 * 60 * 60 * 1000,
          });
          return {
            name: f.name,
            path: virtualFilePath,
            kind: isImg ? 'image' : (f.kind || 'file'),
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            thumbUrl: isImg ? buildTenantThumbUrl(physicalFilePath, fileSigned.ticket) : null,
            streamUrl: buildTenantStreamUrl(physicalFilePath, fileSigned.ticket, { download: false }),
          };
        });

        return { ok: true, folders, files, breadcrumbs: fallbackBreadcrumbs };
      }

      // Rede de segurança (404 no Edge): consulta estritamente dentro do prefixo alvo em user_files_index
      if (lastStatus === 404) {
        const prefixFilters = rootPrefixCandidates.map(
          (p) => `relative_path.ilike.${escapeVaultLikePattern(p)}/%`
        );
        const { data: idxRows } = await supabase
          .from('user_files_index')
          .select('relative_path, filename, mime_type, size_bytes, is_directory')
          .eq('user_id', activeShortcut.ownerUserId)
          .is('organization_id', null)
          .or(prefixFilters.join(','))
          .limit(400);

        if (idxRows && idxRows.length > 0) {
          const subSegs = splitVaultSegments(subRel).map(stripVaultAccents);
          const rootNormVariants = rootPrefixCandidates.map((p) => splitVaultSegments(p).map(stripVaultAccents));
          const folderSet = new Map<string, VaultFolderEntry>();
          const fileList: VaultFileEntry[] = [];

          for (const row of idxRows) {
            const rawRel = splitVaultSegments(String(row.relative_path || '')).join('/');
            const relSegs = splitVaultSegments(rawRel);
            const normSegs = relSegs.map(stripVaultAccents);

            // Validação estrita em memória: o caminho precisa começar exatamente com um dos prefixos permitidos
            const matchedRootIdx = rootNormVariants.findIndex(
              (rSegs) =>
                normSegs.length > rSegs.length &&
                rSegs.every((s, idx) => normSegs[idx] === s)
            );
            if (matchedRootIdx < 0) continue;

            const matchedRootPrefix = rootPrefixCandidates[matchedRootIdx];
            const matchedRootSegLen = rootNormVariants[matchedRootIdx].length;
            const afterRootSegs = relSegs.slice(matchedRootSegLen);
            const afterRootNorm = normSegs.slice(matchedRootSegLen);

            if (
              afterRootNorm.length <= subSegs.length ||
              !subSegs.every((s, idx) => afterRootNorm[idx] === s)
            ) {
              continue;
            }

            const remainderSegs = afterRootSegs.slice(subSegs.length);
            if (remainderSegs.length === 0) continue;

            if (remainderSegs.length > 1 || row.is_directory) {
              const childFolderName = remainderSegs[0];
              const folderKey = stripVaultAccents(childFolderName);
              if (!folderSet.has(folderKey)) {
                folderSet.set(folderKey, {
                  name: childFolderName,
                  path: [activeShortcut.scRel, subRel, childFolderName].filter(Boolean).join('/'),
                });
              }
              continue;
            }

            const fname = row.filename || remainderSegs[0];
            const isImg =
              String(row.mime_type || '').startsWith('image/') ||
              /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(fname);
            const virtualFilePath = [activeShortcut.scRel, subRel, fname].filter(Boolean).join('/');
            const dedupKey = stripVaultAccents(virtualFilePath);
            if (fileList.some((existing) => stripVaultAccents(existing.path) === dedupKey)) {
              continue;
            }
            const fileSigned = signEdgeTenantTicket({
              userId: activeShortcut.ownerUserId,
              scopeType: 'user',
              role: ownerRole,
              purpose: 'share',
              allowedPrefix: matchedRootPrefix,
              allowedPathPrefix: matchedRootPrefix,
              allowedPaths: [rawRel],
              readOnly: true,
              allowDownload: false,
              ttlMs: 2 * 60 * 60 * 1000,
            });
            fileList.push({
              name: fname,
              path: virtualFilePath,
              kind: isImg ? 'image' : 'file',
              mimeType: row.mime_type || undefined,
              sizeBytes: row.size_bytes || undefined,
              thumbUrl: isImg ? buildTenantThumbUrl(rawRel, fileSigned.ticket) : null,
              streamUrl: buildTenantStreamUrl(rawRel, fileSigned.ticket, { download: false }),
            });
          }

          if (folderSet.size > 0 || fileList.length > 0) {
            return {
              ok: true,
              folders: Array.from(folderSet.values()),
              files: fileList,
              breadcrumbs: fallbackBreadcrumbs,
            };
          }
        }
      }

      return {
        ok: false,
        folders: [],
        files: [],
        breadcrumbs: fallbackBreadcrumbs,
        error: `Servidor retornou ${lastStatus}`,
      };
    }

    // 4. Listagem padrão (Org raiz/subpasta ou Cofre Pessoal)
    const signed = signEdgeTenantTicket({
      userId: user.id,
      scopeType: input.scopeType,
      orgSlug: input.scopeType === 'org' ? resolvedOrgSlug : undefined,
      organizationId: input.scopeType === 'org' ? resolvedOrgId : undefined,
      role: 'member',
      purpose: 'share',
      readOnly: true,
      allowDownload: false,
      ttlMs: 10 * 60 * 1000,
    });

    const params = new URLSearchParams({ folder: cleanFolder, ticket: signed.ticket });
    const res = await fetch(`${edgeBase}/api/tenant/list?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      return {
        ok: false,
        folders: [],
        files: [],
        breadcrumbs: fallbackBreadcrumbs,
        error: `Servidor retornou ${res.status}`,
      };
    }

    const json = (await res.json()) as {
      folders?: (VaultFolderEntry & { relativePath?: string })[];
      files?: { name: string; path?: string; relativePath?: string; kind?: string; mimeType?: string; sizeBytes?: number }[];
      breadcrumbs?: { name: string; path: string }[];
    };

    const folders: VaultFolderEntry[] = (json.folders || []).map((f) => ({
      ...f,
      path: f.path || f.relativePath || f.name,
    }));

    // Mescla atalhos do Supabase na pasta atual sem duplicar
    if (input.scopeType === 'org' && supabaseShortcuts.length > 0) {
      const existingNames = new Set(folders.map((f) => stripVaultAccents(f.name)));
      for (const sc of supabaseShortcuts) {
        const scSegs = splitVaultSegments(sc.scRel);
        const scParent = scSegs.slice(0, -1).join('/');
        if (stripVaultAccents(scParent) === stripVaultAccents(cleanFolder) && !existingNames.has(stripVaultAccents(sc.name))) {
          folders.push({
            name: sc.name,
            path: sc.scRel,
            isShortcut: true,
            shortcutOwner: sc.shortcutOwner,
            shortcutType: sc.shortcutType,
            shortcutTarget: sc.targetRelPath,
          });
          existingNames.add(stripVaultAccents(sc.name));
        }
      }
    }

    const files: VaultFileEntry[] = (json.files || []).map((f) => {
      const filePath = f.path || f.relativePath || f.name;
      const isImg = f.kind === 'image' || /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(f.name);
      const thumbSigned = signEdgeTenantTicket({
        userId: user.id,
        scopeType: input.scopeType,
        orgSlug: input.scopeType === 'org' ? resolvedOrgSlug : undefined,
        organizationId: input.scopeType === 'org' ? resolvedOrgId : undefined,
        role: 'member',
        purpose: 'share',
        allowedPaths: [filePath],
        readOnly: true,
        allowDownload: false,
        ttlMs: 2 * 60 * 60 * 1000,
      });
      return {
        name: f.name,
        path: filePath,
        kind: isImg ? 'image' : (f.kind || 'file'),
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        thumbUrl: isImg ? buildTenantThumbUrl(filePath, thumbSigned.ticket) : null,
        streamUrl: buildTenantStreamUrl(filePath, thumbSigned.ticket, { download: false }),
      };
    });

    const rawBreadcrumbs = json.breadcrumbs && json.breadcrumbs.length > 0
      ? json.breadcrumbs.map((b, idx) => (idx === 0 ? { ...b, name: rootLabel } : b))
      : fallbackBreadcrumbs;

    return {
      ok: true,
      folders,
      files,
      breadcrumbs: rawBreadcrumbs,
    };
  } catch (err) {
    return {
      ok: false,
      folders: [],
      files: [],
      breadcrumbs: fallbackBreadcrumbs,
      error: err instanceof Error ? err.message : 'Erro ao listar pasta.',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function rehydrateStudioDraftAction(
  draft: import('@/components/organizacoes/studio/types').StudioDraft,
  orgSlug: string,
  organizationId?: string
): Promise<{ ok: boolean; draft: import('@/components/organizacoes/studio/types').StudioDraft }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (!user) {
      return { ok: false, draft };
    }

    const userId = user.id;
    const normalizedOrgSlug = normalizeVaultSlug(orgSlug);
    let resolvedOrgId = organizationId;
    if (!resolvedOrgId && normalizedOrgSlug) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', normalizedOrgSlug)
        .maybeSingle();
      resolvedOrgId = orgRow?.id;
    }

    const verifiedOrgIds = new Set<string>();
    const orgIdBySlugCache = new Map<string, string>();
    const ownerRoleCache = new Map<string, 'admin' | 'member'>();
    const shortcutsByOrgCache = new Map<string, ResolvedStudioShortcutMeta[]>();

    const resolveOrgIdBySlug = async (slug?: string): Promise<string | undefined> => {
      const norm = normalizeVaultSlug(slug);
      if (!norm) return undefined;
      if (orgIdBySlugCache.has(norm)) return orgIdBySlugCache.get(norm);
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', norm)
        .maybeSingle();
      if (orgRow?.id) orgIdBySlugCache.set(norm, orgRow.id);
      return orgRow?.id;
    };

    const checkOrgMembership = async (orgIdToCheck?: string): Promise<boolean> => {
      if (!orgIdToCheck) return false;
      if (verifiedOrgIds.has(orgIdToCheck)) return true;
      const { data: m } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgIdToCheck)
        .eq('user_id', userId)
        .maybeSingle();
      if (m) {
        verifiedOrgIds.add(orgIdToCheck);
        return true;
      }
      return false;
    };

    const getShortcutsForOrg = async (orgIdToLoad?: string): Promise<ResolvedStudioShortcutMeta[]> => {
      if (!orgIdToLoad) return [];
      const cached = shortcutsByOrgCache.get(orgIdToLoad);
      if (cached) return cached;
      const loaded = await loadOrgShortcutsForStudio(supabase, orgIdToLoad);
      shortcutsByOrgCache.set(orgIdToLoad, loaded);
      return loaded;
    };

    const rehydratedSlides = await Promise.all(draft.slides.map(async (slide) => ({
      ...slide,
      layers: await Promise.all(slide.layers.map(async (layer) => {
        if (layer.type !== 'image') return layer;
        const img = layer as import('@/components/organizacoes/studio/types').StudioImageLayer;
        const ref = img.vaultRef;
        const relPath = ref?.relativePath || img.vaultRelativePath;
        if (!relPath) return img;

        if (relPath.startsWith('http') || relPath.startsWith('/galeria') || relPath.startsWith('/show') || relPath.startsWith('/Logo')) {
          return { ...img, resolvedUrl: relPath, src: relPath };
        }

        try {
          const scopeType = ref?.scopeType || 'org';
          const targetOrgSlug = normalizeVaultSlug(ref?.orgSlug || normalizedOrgSlug);
          let targetOrgId = ref?.organizationId || resolvedOrgId;
          if (scopeType === 'org') {
            if (!targetOrgId && targetOrgSlug) {
              targetOrgId = await resolveOrgIdBySlug(targetOrgSlug);
            }
            if (!(await checkOrgMembership(targetOrgId))) {
              return img;
            }
          }

          const orgShortcuts = scopeType === 'org' ? await getShortcutsForOrg(targetOrgId) : [];
          const scMatch = scopeType === 'org' ? matchShortcutBySegments(relPath, orgShortcuts) : null;

          if (scMatch) {
            const { shortcut: matchedSc, subRel } = scMatch;
            const isOrgTarget = Boolean(matchedSc.targetOrgSlug || matchedSc.targetOrgId);

            if (isOrgTarget) {
              const destOrgSlug = matchedSc.targetOrgSlug;
              const destOrgId = matchedSc.targetOrgId || (await resolveOrgIdBySlug(destOrgSlug));
              if (!(await checkOrgMembership(destOrgId))) {
                return img;
              }
              const rootPrefix = matchedSc.targetRelPath;
              const physicalPath = [rootPrefix, subRel].filter(Boolean).join('/');
              const signed = signEdgeTenantTicket({
                userId,
                scopeType: 'org',
                orgSlug: destOrgSlug,
                organizationId: destOrgId,
                role: 'member',
                purpose: 'share',
                ...(rootPrefix ? { allowedPrefix: rootPrefix, allowedPathPrefix: rootPrefix } : {}),
                allowedPaths: [physicalPath],
                readOnly: true,
                allowDownload: true,
                ttlMs: 24 * 60 * 60 * 1000,
              });
              const streamUrl = buildTenantStreamUrl(physicalPath, signed.ticket);
              return { ...img, resolvedUrl: streamUrl, src: streamUrl };
            }

            const ownerRole = await resolveOwnerStorageRole(supabase, matchedSc.ownerUserId, ownerRoleCache);
            const baseCandidate = matchedSc.targetRelPath;
            let resolvedPrefix = baseCandidate;
            let physicalPath = [baseCandidate, subRel].filter(Boolean).join('/');

            // Verifica se o arquivo no índice do dono está sob Portfolio/<targetRelPath>
            if (!/^porti?folio(\/|$)/i.test(baseCandidate) && subRel) {
              const portCandidate = `Portfolio/${physicalPath}`;
              const { data: portRow } = await supabase
                .from('user_files_index')
                .select('relative_path')
                .eq('user_id', matchedSc.ownerUserId)
                .is('organization_id', null)
                .eq('relative_path', portCandidate)
                .maybeSingle();
              if (portRow?.relative_path) {
                resolvedPrefix = `Portfolio/${baseCandidate}`;
                physicalPath = portCandidate;
              }
            }

            const signed = signEdgeTenantTicket({
              userId: matchedSc.ownerUserId,
              scopeType: 'user',
              role: ownerRole,
              purpose: 'share',
              allowedPrefix: resolvedPrefix,
              allowedPathPrefix: resolvedPrefix,
              allowedPaths: [physicalPath],
              readOnly: true,
              allowDownload: true,
              ttlMs: 24 * 60 * 60 * 1000,
            });
            const streamUrl = buildTenantStreamUrl(physicalPath, signed.ticket);
            return { ...img, resolvedUrl: streamUrl, src: streamUrl };
          }

          const signed = signEdgeTenantTicket({
            userId,
            scopeType,
            orgSlug: scopeType === 'org' ? targetOrgSlug : undefined,
            organizationId: scopeType === 'org' ? targetOrgId : undefined,
            role: 'member',
            purpose: 'share',
            allowedPaths: [relPath],
            readOnly: true,
            allowDownload: true,
            ttlMs: 24 * 60 * 60 * 1000,
          });
          const streamUrl = buildTenantStreamUrl(relPath, signed.ticket);
          return { ...img, resolvedUrl: streamUrl, src: streamUrl };
        } catch {
          return img;
        }
      })),
    })));

    return { ok: true, draft: { ...draft, slides: rehydratedSlides } };
  } catch {
    return { ok: true, draft };
  }
}
