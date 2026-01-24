import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Allowlist of path prefixes that should remain accessible.
const ALLOWED_PREFIXES = [
  '/ampro',
  '/auth',
  '/login',
  '/signup',
  '/profile',
  '/teacher',
  '/studio',
  '/start',
  '/api',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/public',
]

function isAllowedPath(pathname: string) {
  if (!pathname) return false
  // Allow root to go to start page
  if (pathname === '/' || pathname === '/index') return true

  // Allow static assets and Next internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/static') || pathname.startsWith('/assets')) return true

  for (const p of ALLOWED_PREFIXES) {
    if (pathname === p) return true
    if (pathname.startsWith(p + '/')) return true
  }

  // Allow public files by extension (images, css, js, map)
  if (pathname.match(/\.(png|jpg|jpeg|svg|webp|css|js|map|ico|json)$/i)) return true

  return false
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isAllowedPath(pathname)) {
    return NextResponse.next()
  }

  // redirect any disallowed route to the AmPro landing
  const url = req.nextUrl.clone()
  url.pathname = '/ampro'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: '/((?!_next/.*).*)',
}
