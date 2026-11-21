// Este programa é um software livre (Licença AGPLv3)
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { OrganizationBrandProvider } from '@/components/organizacoes/OrganizationBrandProvider';
import { OrganizationPostStudio } from '@/components/organizacoes/studio/OrganizationPostStudio';

export const dynamic = 'force-dynamic';

export default async function PersonalStudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/studio');
  }

  return (
    <OrganizationBrandProvider orgSlug="personal">
      <div className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden p-1 sm:p-2 text-fg">
        <OrganizationPostStudio
          scope="personal"
          orgSlug="personal"
          userId={user.id}
        />
      </div>
    </OrganizationBrandProvider>
  );
}
