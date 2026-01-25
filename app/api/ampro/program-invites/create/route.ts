import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createSupabaseServiceClient, supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import crypto from 'crypto'

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

function generateToken() {
  // 32 bytes => 256-bit token; base64url is safe in URLs.
  return crypto.randomBytes(32).toString('base64url')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const performance_id = String(body?.performance_id || '').trim()
    const expires_at = body?.expires_at ? String(body.expires_at) : null
    const max_uses = body?.max_uses != null ? Number(body.max_uses) : null
    const note = body?.note != null ? String(body.note) : null
    const force_new = Boolean(body?.force_new)

    if (!performance_id) {
      return NextResponse.json({ error: 'performance_id is required' }, { status: 400 })
    }
    if (max_uses != null && (!Number.isFinite(max_uses) || max_uses < 1)) {
      return NextResponse.json({ error: 'max_uses must be >= 1' }, { status: 400 })
    }

    const supabase = await createAuthedClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseServiceClient()

    // Verify AmPro admin role
    const { data: roleRow, error: roleError } = await admin
      .from('ampro_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (roleError) throw roleError
    if (!roleRow) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const origin = request.nextUrl.origin

    if (!force_new) {
      // Reuse an existing active invite if possible (prevents multiple groupchat links).
      const { data: existing, error: existingError } = await admin
        .from('ampro_program_invites')
        .select('token, expires_at, max_uses, uses_count, revoked_at')
        .eq('performance_id', performance_id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

      if (existingError) throw existingError

      const now = new Date()
      const active = (existing || []).find((inv: any) => {
        const expired = inv.expires_at ? new Date(String(inv.expires_at)) < now : false
        const maxed = inv.max_uses != null ? Number(inv.uses_count || 0) >= Number(inv.max_uses) : false
        return !expired && !maxed
      })

      if (active?.token) {
        return NextResponse.json({
          token: active.token,
          url: `${origin}/ampro/invite/${encodeURIComponent(active.token)}`,
          reused: true,
        })
      }
    } else {
      // Rotate link: revoke any currently active links for this program.
      const { error: revokeError } = await admin
        .from('ampro_program_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('performance_id', performance_id)
        .is('revoked_at', null)
      if (revokeError) throw revokeError
    }

    const token = generateToken()

    const { error: insertError } = await admin.from('ampro_program_invites').insert({
      token,
      performance_id,
      created_by: user.id,
      expires_at,
      max_uses,
      note,
    })

    if (insertError) throw insertError

    return NextResponse.json({
      token,
      url: `${origin}/ampro/invite/${encodeURIComponent(token)}`,
      reused: false,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
