// Este programa é um software livre (Licença AGPLv3)
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const pathname = request.nextUrl.pathname

  // Libera rotas /embed/*, /api/auth/hub-embed, /api/org/* e /servidor ou /labdiv embutido para validação própria via ticket HMAC e iframe
  const isEmbedBypass =
    (pathname.startsWith('/servidor') || pathname.startsWith('/labdiv')) &&
    (request.nextUrl.searchParams.has('embed') ||
      request.nextUrl.searchParams.has('inline') ||
      request.nextUrl.searchParams.has('ticket'));

  if (
    pathname.startsWith('/embed') ||
    pathname.startsWith('/api/auth/hub-embed') ||
    pathname.startsWith('/api/org/') ||
    isEmbedBypass
  ) {
    supabaseResponse.headers.delete('X-Frame-Options')
    supabaseResponse.headers.set(
      'Content-Security-Policy',
      "frame-ancestors 'self' http://localhost:3001 http://*.localhost:3001 http://127.0.0.1:3001 http://showdefisica.localhost:3001 http://labdiv.localhost:3001 http://profis.localhost:3001 http://hs.localhost:3001 https://hub-lab-div.vercel.app https://aurtistic.vercel.app https://*.hublabdiv.com.br http://localhost:3000 http://127.0.0.1:3000;"
    )
    return supabaseResponse
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    !user &&
    !isEmbedBypass &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth') &&
    (pathname.startsWith('/labdiv') || pathname.startsWith('/servidor'))
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
