// Este programa é um software livre (Licença AGPLv3)
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  computeEffectiveQuotaBytes,
  PRIMARY_ADMIN_UUID,
  resolveEdgeHmacSecret,
} from '@/lib/edge-ticket';
import { isUuid } from '@/lib/validators';
import type { UserStorageProfile } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const ts = String(req.headers.get('x-edge-timestamp') || '').trim();
    const sig = String(req.headers.get('x-edge-signature') || '').trim();
    const tsNum = Number(ts);
    if (!ts || !sig || Number.isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Timestamp inválido.' }, { status: 401 });
    }

    const rawBody = await req.text();
    const expected = crypto
      .createHmac('sha256', resolveEdgeHmacSecret())
      .update(`${ts}.${rawBody}`)
      .digest('hex');

    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Assinatura HMAC inválida.' }, { status: 401 });
    }

    const body = JSON.parse(rawBody || '{}') as {
      userId?: string;
      scopeType?: 'user' | 'org';
      organizationId?: string | null;
      orgSlug?: string | null;
    };
    const userId = String(body.userId || '').trim();
    if (!isUuid(userId)) {
      return NextResponse.json({ error: 'userId inválido.' }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Supabase admin client indisponível.' }, { status: 503 });
    }

    if (body.scopeType !== 'org') {
      const { data: profileRow } = await admin
        .from('user_storage_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!profileRow) {
        if (userId === PRIMARY_ADMIN_UUID) {
          return NextResponse.json({
            ok: true,
            active: true,
            role: 'admin',
            canWrite: true,
            quotaLimitBytes: 500 * 1024 * 1024 * 1024,
          });
        }
        return NextResponse.json({ ok: true, active: false });
      }

      const profile = profileRow as UserStorageProfile;
      if (profile.approval_status === 'suspended') {
        return NextResponse.json({ ok: true, active: false });
      }

      const { isApprovedForStorage, effectiveQuotaBytes } = computeEffectiveQuotaBytes(profile);
      return NextResponse.json({
        ok: true,
        active: true,
        role: profile.storage_role === 'admin' ? 'admin' : 'member',
        canWrite: Boolean(isApprovedForStorage || profile.storage_role === 'admin'),
        quotaLimitBytes: effectiveQuotaBytes,
      });
    }

    // Escopo de Organização
    let orgQuery = admin.from('organizations').select('id, slug, storage_quota_bytes');
    if (body.organizationId && isUuid(body.organizationId)) {
      orgQuery = orgQuery.eq('id', body.organizationId);
    } else if (body.orgSlug) {
      orgQuery = orgQuery.eq('slug', String(body.orgSlug).toLowerCase());
    } else {
      return NextResponse.json({ ok: true, active: false });
    }
    const { data: orgRow } = await orgQuery.maybeSingle();
    if (!orgRow) {
      return NextResponse.json({ ok: true, active: false });
    }

    const [{ data: memberRow }, { data: userProfile }] = await Promise.all([
      admin
        .from('organization_members')
        .select('org_role, can_upload_org_vault')
        .eq('organization_id', orgRow.id)
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('user_profiles').select('role').eq('id', userId).maybeSingle(),
    ]);

    const isConfirmedAdmin = userId === PRIMARY_ADMIN_UUID || userProfile?.role === 'admin';
    if (!memberRow && !isConfirmedAdmin) {
      return NextResponse.json({ ok: true, active: false });
    }

    const isOrgAdmin = isConfirmedAdmin || memberRow?.org_role === 'admin';
    return NextResponse.json({
      ok: true,
      active: true,
      role: isOrgAdmin ? 'admin' : 'member',
      canWrite: Boolean(isOrgAdmin || memberRow?.can_upload_org_vault),
      quotaLimitBytes: Math.max(0, Number(orgRow.storage_quota_bytes) || 0),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      { status: 500 }
    );
  }
}
