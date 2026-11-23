// Este programa é um software livre (Licença AGPLv3)
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { resolveEdgeHmacSecret } from '@/lib/edge-ticket';
import { isUuid, sanitizeRelativeTenantPath } from '@/lib/validators';

export const dynamic = 'force-dynamic';

interface SyncItemPayload {
  name?: string;
  relativePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  isDirectory?: boolean;
  hasPin?: boolean;
  exifData?: Record<string, unknown>;
}

interface VaultIndexSyncBody {
  userId?: string;
  scopeType?: 'user' | 'org';
  organizationId?: string | null;
  orgSlug?: string | null;
  action?: 'upsert' | 'delete';
  relPath?: string;
  item?: SyncItemPayload | null;
  sha256?: string | null;
  totalUsedBytes?: number;
}

function inferMimeType(relPath: string, provided?: string): string {
  const clean = String(provided || '').trim();
  if (clean && clean !== 'application/octet-stream') return clean;
  const ext = relPath.split('.').pop()?.toLowerCase() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'md') return 'text/markdown';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

export async function POST(req: Request) {
  try {
    let secret: string;
    try {
      secret = resolveEdgeHmacSecret();
    } catch {
      return NextResponse.json(
        { error: 'Secret HMAC não configurado no servidor (fail-closed).' },
        { status: 503 }
      );
    }

    const ts = String(req.headers.get('x-edge-timestamp') || '').trim();
    const sig = String(req.headers.get('x-edge-signature') || '').trim();
    const tsNum = Number(ts);
    if (!ts || !sig || Number.isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Timestamp inválido.' }, { status: 401 });
    }

    const rawBody = await req.text();
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${ts}.${rawBody}`)
      .digest('hex');

    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Assinatura HMAC inválida.' }, { status: 401 });
    }

    const body = JSON.parse(rawBody || '{}') as VaultIndexSyncBody;
    const userId = String(body.userId || '').trim();
    if (!isUuid(userId)) {
      return NextResponse.json({ error: 'userId inválido.' }, { status: 400 });
    }

    const rawRel = body.relPath || body.item?.relativePath || '';
    const relRes = sanitizeRelativeTenantPath(rawRel, { allowEmpty: false });
    if (!relRes.ok) {
      return NextResponse.json({ error: relRes.error }, { status: 400 });
    }
    const cleanRel = relRes.data;

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Supabase admin client indisponível.' }, { status: 503 });
    }

    let resolvedOrgId: string | null = null;
    if (body.scopeType === 'org') {
      if (body.organizationId && isUuid(body.organizationId)) {
        resolvedOrgId = body.organizationId;
      } else if (body.orgSlug && typeof body.orgSlug === 'string') {
        const { data: orgRow } = await admin
          .from('organizations')
          .select('id')
          .eq('slug', body.orgSlug.trim().toLowerCase())
          .maybeSingle();
        resolvedOrgId = orgRow?.id ? String(orgRow.id) : null;
      }
      if (!resolvedOrgId) {
        return NextResponse.json({ error: 'Organização não encontrada para sincronização.' }, { status: 404 });
      }
    }

    // Atualiza uso de disco reportado pelo servidor Fire TV (best-effort)
    if (typeof body.totalUsedBytes === 'number' && Number.isFinite(body.totalUsedBytes) && body.totalUsedBytes >= 0) {
      const clampedBytes = Math.floor(body.totalUsedBytes);
      if (resolvedOrgId) {
        await admin
          .from('organizations')
          .update({ storage_used_bytes: clampedBytes })
          .eq('id', resolvedOrgId);
      } else {
        await admin
          .from('user_storage_profiles')
          .update({ used_bytes: clampedBytes })
          .eq('user_id', userId);
      }
    }

    if (body.action === 'delete') {
      const scopeDelete = (isPrefix: boolean) => {
        const base = admin.from('user_files_index').delete();
        const filtered = isPrefix
          ? base.like('relative_path', `${cleanRel}/%`)
          : base.eq('relative_path', cleanRel);
        return resolvedOrgId
          ? filtered.eq('organization_id', resolvedOrgId)
          : filtered.eq('user_id', userId).is('organization_id', null);
      };
      await Promise.all([scopeDelete(false), scopeDelete(true)]);
      return NextResponse.json({ ok: true, action: 'delete', relativePath: cleanRel });
    }

    let existingQuery = admin
      .from('user_files_index')
      .select('id, exif_data')
      .eq('relative_path', cleanRel);

    if (resolvedOrgId) {
      existingQuery = existingQuery.eq('organization_id', resolvedOrgId);
    } else {
      existingQuery = existingQuery.eq('user_id', userId).is('organization_id', null);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    const filename = body.item?.name || cleanRel.split('/').filter(Boolean).pop() || 'arquivo';
    const mimeType = inferMimeType(cleanRel, body.item?.mimeType);
    const sizeBytes = Math.max(0, Math.floor(Number(body.item?.sizeBytes) || 0));
    const isDirectory = Boolean(body.item?.isDirectory);
    const hasPin = Boolean(body.item?.hasPin);
    const cleanSha =
      typeof body.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(body.sha256.trim())
        ? body.sha256.trim().toLowerCase()
        : null;

    // Registro já existente: UPDATE apenas das colunas de arquivo para não sobrescrever edições simultâneas de metadados no site
    if (existing?.id) {
      const updatePayload: Record<string, unknown> = {
        filename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        is_directory: isDirectory,
        has_pin: hasPin,
      };
      if (cleanSha) {
        const existingExif =
          existing.exif_data && typeof existing.exif_data === 'object'
            ? (existing.exif_data as Record<string, unknown>)
            : {};
        updatePayload.exif_data = {
          ...existingExif,
          sha256: cleanSha,
        };
      }

      const { error: updateErr } = await admin
        .from('user_files_index')
        .update(updatePayload)
        .eq('id', existing.id);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: 'update', relativePath: cleanRel });
    }

    // Novo registro: inserção com defaults do ecossistema
    const isPortfolioItem = !resolvedOrgId && cleanRel.startsWith('Portfolio/');
    const segments = cleanRel.split('/').filter(Boolean);
    const derivedAlbum =
      isPortfolioItem && segments.length > 2
        ? segments[1]
        : isPortfolioItem && segments.length === 2
          ? 'Geral'
          : 'Geral';

    const incomingExif =
      body.item?.exifData && typeof body.item.exifData === 'object' ? body.item.exifData : {};

    const rowToUpsert: Record<string, unknown> = {
      user_id: userId,
      organization_id: resolvedOrgId,
      relative_path: cleanRel,
      filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      is_directory: isDirectory,
      has_pin: hasPin,
      linked_task_ids: [],
      linked_task_id: null,
      show_in_portfolio: isPortfolioItem,
      show_in_curriculum: false,
      visibility: isPortfolioItem ? 'public' : 'private',
      album: derivedAlbum,
      category: isPortfolioItem ? 'Fotografia' : 'Projeto',
      tags: [],
      is_favorite: false,
      exif_data: {
        ...incomingExif,
        ...(cleanSha ? { sha256: cleanSha } : {}),
      },
    };

    const { error: upsertErr } = await admin
      .from('user_files_index')
      .upsert(rowToUpsert, { onConflict: 'vault_scope_key,relative_path' });

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: 'upsert', relativePath: cleanRel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno em vault-index-sync.' },
      { status: 500 }
    );
  }
}
