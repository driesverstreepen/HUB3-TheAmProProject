import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient, supabaseAnonKey, supabaseUrl } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function createAuthedClient() {
  const cookieStore = await cookies()

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not set')
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      },
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const token = String(body?.token || '').trim()
    const accessToken = body?.access_token ? String(body.access_token).trim() : ''

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Primary: cookie-based auth (works when @supabase/ssr cookies are wired).
    let userId: string | null = null
    try {
      const supabase = await createAuthedClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.id) userId = user.id
    } catch {
      // ignore
    }

    // Fallback: accept browser session access token (localStorage-based auth).
    if (!userId && accessToken) {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase environment variables are not set')
      }
      const bearer = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
      const {
        data: { user },
        error,
      } = await bearer.auth.getUser(accessToken)
      if (error || !user) {
        return NextResponse.json({ error: 'You must be logged in' }, { status: 401 })
      }
      userId = user.id
    }

    if (!userId) {
      return NextResponse.json({ error: 'You must be logged in (no session found)' }, { status: 401 })
    }

    const admin = createSupabaseServiceClient()

    const { data: performanceId, error } = await admin.rpc('claim_ampro_program_invite', {
      p_token: token,
      p_user_id: userId,
    })

    if (error) {
      const msg = error.message || 'Failed to claim invite'
      const lower = msg.toLowerCase()
      const status =
        lower.includes('not found') ? 404 :
        lower.includes('expired') ? 410 :
        lower.includes('revoked') ? 410 :
        lower.includes('max uses') ? 409 :
        400
      return NextResponse.json({ error: msg }, { status })
    }

    return NextResponse.json({
      success: true,
      performance_id: performanceId,
      redirect: '/ampro/mijn-projecten',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
