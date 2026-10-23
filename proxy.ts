import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE, authToken } from '@/lib/site-auth'

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isAuthed = request.cookies.get(AUTH_COOKIE)?.value === (await authToken())

  if (pathname === '/login') {
    return isAuthed ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next()
  }

  if (isAuthed) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  if (pathname !== '/') loginUrl.searchParams.set('from', pathname + search)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
