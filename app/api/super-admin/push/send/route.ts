import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient, supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import { sendPushToUserIds } from '@/lib/pushDispatch'

function getUserClient(request: NextRequest) {
  const cookie = request.headers.get('cookie') || ''
  const authorization = request.headers.get('authorization') || ''
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase not configured')
  }

  const headers: Record<string, string> = {}
  if (cookie) headers.cookie = cookie
  if (authorization) headers.Authorization = authorization

  return createClient(supabaseUrl, supabaseAnonKey, { global: { headers } })
}

async function requireSuperAdmin(request: NextRequest) {
  const userClient = getUserClient(request)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: roleRow } = await userClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .maybeSingle()

  if (!roleRow) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true as const, userId: user.id }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({} as any))
    const title = String(body?.title || '').trim()
    const message = String(body?.message || '').trim()
    const url = typeof body?.url === 'string' && body.url.trim().length > 0 ? body.url.trim() : undefined
    const audience = String(body?.audience || 'all')

    if (!title || !message) {
      return NextResponse.json({ error: 'Missing title/message' }, { status: 400 })
    }

    const admin = createSupabaseServiceClient()

    let userIds: string[] = []

    if (audience === 'studio_owners') {
      const { data: owners, error } = await admin
        .from('studios')
        .select('eigenaar_id')

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      userIds = Array.from(new Set((owners || []).map((r: any) => r?.eigenaar_id).filter(Boolean)))
    } else {
      // base set: all users from user_profiles
      const { data: users, error } = await admin
        .from('user_profiles')
        .select('user_id')
        .limit(100000)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const allIds = Array.from(new Set((users || []).map((r: any) => r?.user_id).filter(Boolean)))

      if (audience === 'all') {
        userIds = allIds
      } else if (audience === 'users') {
        const { data: owners } = await admin
          .from('studios')
          .select('eigenaar_id')
        const ownerSet = new Set((owners || []).map((r: any) => r?.eigenaar_id).filter(Boolean))
        userIds = allIds.filter((id) => !ownerSet.has(id))
      } else {
        return NextResponse.json({ error: 'Invalid audience' }, { status: 400 })
      }
    }

    const payload = { title, body: message, url }
    const result = await sendPushToUserIds(userIds, payload)

    return NextResponse.json({ ok: true, audience, users: userIds.length, attempted: result.attempted, sent: result.sent })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
