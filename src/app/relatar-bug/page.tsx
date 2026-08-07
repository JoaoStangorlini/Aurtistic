import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import BugReportClient from './BugReportClient';

export const dynamic = 'force-dynamic';

export default async function BugReportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/aurtistic/login');
  }

  return (
    <main className="min-h-full bg-[#121212] p-4 md:p-8 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        <BugReportClient userEmail={user.email || ''} />
      </div>
    </main>
  );
}
