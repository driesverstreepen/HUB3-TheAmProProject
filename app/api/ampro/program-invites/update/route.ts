import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
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
    const performance_id = String(body?.performance_id || '').trim()
    const token = String(body?.token || '').trim()
    const expires_at = body?.expires_at != null && String(body.expires_at).trim() ? String(body.expires_at) : null
    const max_uses = body?.max_uses != null && String(body.max_uses).trim() !== '' ? Number(body.max_uses) : null

    if (!performance_id) {
      return NextResponse.json({ error: 'performance_id is required' }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }
    if (max_uses != null && (!Number.isFinite(max_uses) || max_uses < 1)) {
      return NextResponse.json({ error: 'max_uses must be >= 1 or null' }, { status: 400 })
    }
    if (expires_at) {
      const d = new Date(expires_at)
      if (!Number.isFinite(d.getTime())) {
        return NextResponse.json({ error: 'expires_at must be a valid date or null' }, { status: 400 })
      }
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

    // Ensure invite exists and isn't revoked (avoid confusion about saving to inactive links)
    const { data: existing, error: existingError } = await admin
      .from('ampro_program_invites')
      .select('id, revoked_at')
      .eq('performance_id', performance_id)
      .eq('token', token)
      .maybeSingle()

    if (existingError) throw existingError
    if (!existing) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }
    if ((existing as any).revoked_at) {
      return NextResponse.json({ error: 'Invite is revoked' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await admin
      .from('ampro_program_invites')
      .update({
        max_uses,
        expires_at,
      })
      .eq('id', (existing as any).id)
      .select('id, token, performance_id, expires_at, max_uses, uses_count, revoked_at')
      .maybeSingle()

    if (updateError) throw updateError

    return NextResponse.json({ success: true, invite: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
