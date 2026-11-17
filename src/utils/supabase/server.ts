// Este programa é um software livre (Licença AGPLv3)
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  const headerStore = await headers()

  const explicitToken =
    headerStore.get('x-supabase-auth-token')?.trim() ||
    headerStore.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    ''

  const hasAuthCookie = cookieStore
    .getAll()
    .some((c) => c.name.includes('auth-token') && Boolean(c.value))

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(!hasAuthCookie && explicitToken
        ? {
            global: {
              headers: {
                Authorization: `Bearer ${explicitToken}`,
              },
            },
          }
        : {}),
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Ignorado em Server Component
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Ignorado em Server Component
          }
        },
      },
    }
  )
}
