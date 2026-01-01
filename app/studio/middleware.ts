import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // This middleware only runs for /studio/[id] routes
  // Auth check happens client-side in each page
  // This just ensures the route is accessible
  return NextResponse.next()
}

export const config = {
  matcher: '/studio/:path*',
}
