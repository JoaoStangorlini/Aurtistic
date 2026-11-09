// Este programa é um software livre (Licença AGPLv3)
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { UnifiedAuthCard } from '@/components/auth/UnifiedAuthCard';

export default async function LoginPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const next = typeof searchParams?.next === 'string' ? searchParams.next : '/';

  if (user) {
    redirect(next || '/servidor');
  }

  return (
    <div className="h-full overflow-y-auto bg-app flex items-center justify-center p-4">
      <UnifiedAuthCard next={next} />
    </div>
  );
}
