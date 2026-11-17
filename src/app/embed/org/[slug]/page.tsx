// Este programa é um software livre (Licença AGPLv3)
import React from 'react';
import { createClient } from '@/utils/supabase/server';
import { getTaskColumns } from '@/app/(dashboard)/actions';
import { normalizeOrgBrandSlug, ORG_BRAND_PRESETS } from '@/lib/org-brand-tokens';
import { OrganizationBrandProvider } from '@/components/organizacoes/OrganizationBrandProvider';
import { EmbedAuthBridge } from '@/components/embed/EmbedAuthBridge';
import { LabDivWorkspaceClient } from '@/components/organizacoes/LabDivWorkspaceClient';
import { OrgRestrictedAccessView } from '@/components/organizacoes/OrgRestrictedAccessView';
import type { Organization, OrganizationMember, OrganizationSubteam, OrganizationMeeting } from '@/types/organizations';

export const dynamic = 'force-dynamic';

const SLUG_TO_DEFAULT_ID: Record<string, string> = {
  labdiv: '1ab41410-0000-4000-8000-000000000001',
  'show-da-fisica': '1ab41410-0000-4000-8000-000000000002',
  hs: '1ab41410-0000-4000-8000-000000000003',
  profis: '1ab41410-0000-4000-8000-000000000004',
};

export default async function EmbedOrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ticket?: string; view?: string }>;
}) {
  const { slug } = await params;
  const { ticket, view } = await searchParams;
  const normalizedSlug = normalizeOrgBrandSlug(slug);
  const preset = ORG_BRAND_PRESETS[normalizedSlug];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orgData } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', normalizedSlug)
    .maybeSingle();

  const organization: Organization = orgData || {
    id: SLUG_TO_DEFAULT_ID[normalizedSlug],
    slug: normalizedSlug,
    name: preset.displayName,
    description: preset.badgeTag,
    primary_color: preset.primaryColor,
    secondary_color: preset.secondaryColor,
    storage_quota_bytes: 53687091200,
    storage_used_bytes: 0,
    storage_policy: 'admin_or_permitted',
    brand_config: preset as unknown as Record<string, unknown>,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let subteams: OrganizationSubteam[] = [];
  let members: OrganizationMember[] = [];
  let initialTasks: any[] = [];
  let initialMeetings: OrganizationMeeting[] = [];
  let columns: any[] = [];

  const secret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET;
  let ssoPayload: import('@/lib/hub-sso').HubSsoPayload | null = null;
  if (ticket && secret) {
    const { verifyHubSsoTicket } = await import('@/lib/hub-sso');
    const verification = verifyHubSsoTicket(ticket, secret);
    if (verification.valid && verification.payload) {
      ssoPayload = verification.payload;
    }
  }

  if (user) {
    const [subRes, memRes, taskRes, meetRes, cols] = await Promise.all([
      supabase.from('organization_subteams').select('*').eq('organization_id', organization.id).order('name'),
      supabase.from('organization_members').select('*').eq('organization_id', organization.id).order('full_name'),
      supabase.from('tasks').select('*').eq('organization_id', organization.id).order('ordem_manual', { ascending: true }),
      supabase.from('organization_meetings').select('*').eq('organization_id', organization.id).order('scheduled_at', { ascending: false }),
      getTaskColumns(),
    ]);
    subteams = subRes.data || [];
    members = memRes.data || [];
    initialTasks = taskRes.data || [];
    initialMeetings = meetRes.data || [];
    columns = cols || [];
  }

  const isDbMember = user ? members.some((m) => m.user_id === user.id) : false;
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

  if (user && isMember && !members.some((m) => m.user_id === user.id)) {
    const isUserAdmin =
      isEcosystemAdmin ||
      ssoPayload?.role === 'admin' ||
      ssoPayload?.role === 'moderator';

    members.unshift({
      id: `sso-${user.id}`,
      organization_id: organization.id,
      user_id: user.id,
      full_name: ssoPayload?.fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Membro Credenciado',
      email: user.email || ssoPayload?.email || '',
      org_role: isUserAdmin ? 'admin' : 'member',
      can_upload_org_vault: true,
      is_placeholder: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as OrganizationMember);
  }

  return (
    <EmbedAuthBridge ticket={ticket} orgSlug={normalizedSlug} hasServerUser={Boolean(user)}>
      <OrganizationBrandProvider orgSlug={normalizedSlug} brandConfig={organization.brand_config}>
        {user && !isMember ? (
          <OrgRestrictedAccessView organization={organization} orgSlug={normalizedSlug} />
        ) : (
          <LabDivWorkspaceClient
            organization={organization}
            subteams={subteams}
            members={members}
            initialTasks={initialTasks}
            initialMeetings={initialMeetings}
            columns={columns}
            currentUserId={user?.id || ''}
            userOrganizations={[organization]}
            isEmbed={true}
            ticket={ticket}
            initialView={view === 'studio' ? 'studio' : 'organizacoes'}
          />
        )}
      </OrganizationBrandProvider>
    </EmbedAuthBridge>
  );
}

