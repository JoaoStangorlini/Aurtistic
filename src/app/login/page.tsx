import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import LoginForm from './LoginForm'

export default async function LoginPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const next = typeof searchParams?.next === 'string' ? searchParams.next : '';

  if (user) {
    redirect('/servidor')
  }

  return (
    <div className="h-full overflow-y-auto bg-[#121212] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1E1E1E] border border-[#2D2D2D] rounded-xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#e5e2e1] tracking-tight">LOGIN</h1>
          <p className="text-[#a0a0a0] mt-2 text-sm">Acesso Restrito</p>
        </div>

        <LoginForm next={next} />
      </div>
    </div>
  )
}
