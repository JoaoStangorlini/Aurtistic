// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/convite/[token]/page.tsx
import { createClient } from '@/utils/supabase/server';
import { InviteAcceptClient } from '@/components/organizacoes/InviteAcceptClient';

export const dynamic = 'force-dynamic';

export default async function InvitePage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: previewData } = await supabase.rpc('get_organization_invite_preview', {
    p_token: token,
  });

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <InviteAcceptClient
        token={token}
        previewData={previewData}
        isAuthenticated={Boolean(user)}
      />
    </div>
  );
}

