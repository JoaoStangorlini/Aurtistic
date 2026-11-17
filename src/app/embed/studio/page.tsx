// Este programa é um software livre (Licença AGPLv3)
import React from 'react';
import { createClient } from '@/utils/supabase/server';
import { normalizeOrgBrandSlug, ORG_BRAND_PRESETS } from '@/lib/org-brand-tokens';
import { OrganizationBrandProvider } from '@/components/organizacoes/OrganizationBrandProvider';
import { EmbedAuthBridge } from '@/components/embed/EmbedAuthBridge';
import { OrganizationPostStudio } from '@/components/organizacoes/studio/OrganizationPostStudio';
import { OrgRestrictedAccessView } from '@/components/organizacoes/OrgRestrictedAccessView';
import type { Organization } from '@/types/organizations';

export const dynamic = 'force-dynamic';

const SLUG_TO_DEFAULT_ID: Record<string, string> = {
  labdiv: '1ab41410-0000-4000-8000-000000000001',
  'show-da-fisica': '1ab41410-0000-4000-8000-000000000002',
  hs: '1ab41410-0000-4000-8000-000000000003',
  profis: '1ab41410-0000-4000-8000-000000000004',
};

export default async function EmbedStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; ticket?: string }>;
}) {
  const { org, ticket } = await searchParams;
  const normalizedSlug = normalizeOrgBrandSlug(org);
  const preset = ORG_BRAND_PRESETS[normalizedSlug];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const secret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET;
  let ssoPayload: import('@/lib/hub-sso').HubSsoPayload | null = null;
  if (ticket && secret) {
    const { verifyHubSsoTicket } = await import('@/lib/hub-sso');
    const verification = verifyHubSsoTicket(ticket, secret);
    if (verification.valid && verification.payload) {
      ssoPayload = verification.payload;
    }
  }

  const { data: orgData } = await supabase
    .from('organizations')
    .select('id, slug, brand_config')
    .eq('slug', normalizedSlug)
    .maybeSingle();

  const orgId = orgData?.id || SLUG_TO_DEFAULT_ID[normalizedSlug];

  let isDbMember = false;
  if (user && orgId) {
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();
    isDbMember = Boolean(memberData);
  }

  const isTicketAuthorized = Boolean(
    ssoPayload &&
      (ssoPayload.role === 'admin' ||
        ssoPayload.role === 'moderator' ||
        (Array.isArray(ssoPayload.organizations) &&
          ssoPayload.organizations.some(
            (o) => normalizeOrgBrandSlug(o) === normalizedSlug
          )))
  );

  const normalizedEmail = (user?.email || '').toLowerCase().trim();
  const normalizedUsername = (user?.user_metadata?.username || '').toLowerCase().trim();
  const isEcosystemAdmin = Boolean(
    (user &&
      (user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ||
        user.id === '48b2fb73-c5d3-4eff-b727-54e4b91bf21b' ||
        user.id === '8a3e4272-010d-4479-94cb-26178d544ea2' ||
        user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386' ||
        user.id === 'fb12ee7b-da8f-4b80-ac5c-3b8d478047d2' ||
        normalizedEmail === 'joaopaulostangorlini@usp.br' ||
        normalizedEmail === 'joaostangorlini@usp.br' ||
        normalizedEmail === 'joao@aurtistic.com' ||
        normalizedEmail === 'hublabdiv@gmail.com' ||
        normalizedUsername === 'joaostangorlini' ||
        normalizedUsername === 'joao' ||
        normalizedUsername === 'hublabdiv' ||
        normalizedUsername === 'hublabdiv_institucional' ||
        user.app_metadata?.role === 'admin' ||
        user.user_metadata?.role === 'admin')) ||
      ssoPayload?.role === 'admin'
  );

  let isHubSyncMember = false;
  if (user && !isDbMember && !isTicketAuthorized && !isEcosystemAdmin) {
    try {
      const hubBaseUrl = (process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || 'http://localhost:3001').replace(/\/+$/, '');
      const expectedSecret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET || 'hub-default-sso-secret';
      const searchUrl = `${hubBaseUrl}/api/iniciativas/org-member-sync?email=${encodeURIComponent(user.email || '')}`;
      const res = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${expectedSecret}` },
        signal: AbortSignal.timeout(1800),
      }).catch(() => null);
      if (res && res.ok) {
        const d = await res.json().catch(() => null);
        if (d && Array.isArray(d.organizations)) {
          isHubSyncMember = d.organizations.some((o: string) => normalizeOrgBrandSlug(o) === normalizedSlug);
        }
      }
    } catch {}
  }

  const isMember = isDbMember || isTicketAuthorized || isEcosystemAdmin || isHubSyncMember;

  const organization: Organization = {
    id: orgId,
    slug: normalizedSlug,
    name: preset.displayName,
    description: preset.badgeTag,
    primary_color: preset.primaryColor,
    secondary_color: preset.secondaryColor,
    storage_quota_bytes: 53687091200,
    storage_used_bytes: 0,
    storage_policy: 'admin_or_permitted',
    brand_config: (orgData?.brand_config as Record<string, unknown> | null) || (preset as unknown as Record<string, unknown>),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <EmbedAuthBridge ticket={ticket} orgSlug={normalizedSlug} hasServerUser={Boolean(user)}>
      <OrganizationBrandProvider
        orgSlug={normalizedSlug}
        brandConfig={organization.brand_config}
        className="p-3 md:p-5"
      >
        {user && !isMember ? (
          <OrgRestrictedAccessView organization={organization} orgSlug={normalizedSlug} />
        ) : (
          <OrganizationPostStudio organizationId={orgId} orgSlug={normalizedSlug} />
        )}
      </OrganizationBrandProvider>
    </EmbedAuthBridge>
  );
}

