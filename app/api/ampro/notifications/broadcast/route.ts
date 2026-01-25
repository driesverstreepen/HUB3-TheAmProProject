import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUserIds } from '@/lib/pushDispatch'

export const runtime = 'nodejs'

type Kind = 'note' | 'correction' | 'availability'

type Channel = 'none' | 'in_app' | 'push'

type Body = {
  kind?: Kind
  performance_id?: string
  title?: string
  message?: string
}

function createAuthClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
    },
  })
}

function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

function normalizeChannel(value: any): Channel {
  if (value === 'none' || value === 'in_app' || value === 'push') return value
  return 'in_app'
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const authClient = createAuthClient(cookieStore)
    const { data: auth, error: authError } = await authClient.auth.getUser()

    if (authError || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Body
    const kind = body?.kind
    const performanceId = String(body?.performance_id || '')

    if (kind !== 'note' && kind !== 'correction' && kind !== 'availability') {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    }

    if (!performanceId) {
      return NextResponse.json({ error: 'Missing performance_id' }, { status: 400 })
    }

    const title = String(body?.title || (kind === 'note' ? 'Nieuwe note' : kind === 'correction' ? 'Nieuwe correctie' : 'Nieuwe beschikbaarheden'))
    const message = String(body?.message || 'Er is een update beschikbaar in je AmPro project.')

    const supabase = createServiceClient()

    // Verify AMPRO admin
    const { data: roleRow, error: roleError } = await supabase
      .from('ampro_user_roles')
      .select('role')
      .eq('user_id', auth.user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (roleError || !roleRow) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Recipients: accepted + paid applications for this performance
    const { data: apps, error: appsError } = await supabase
      .from('ampro_applications')
      .select('user_id')
      .eq('performance_id', performanceId)
      .eq('status', 'accepted')
      .eq('paid', true)

    if (appsError) {
      return NextResponse.json({ error: appsError.message }, { status: 500 })
    }

    const userIds = Array.from(new Set((apps || []).map((r: any) => String(r?.user_id || '')).filter(Boolean)))
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, recipients: 0, in_app: 0, push: 0 })
    }

    // Load preferences (best-effort; missing row => defaults)
    const { data: prefsRows } = await supabase
      .from('user_notification_preferences')
      .select('user_id,disable_all,ampro_notes_channel,ampro_corrections_channel,ampro_availability_channel')
      .in('user_id', userIds)

    const prefsByUserId = new Map<string, any>()
    for (const row of prefsRows || []) {
      const id = String((row as any)?.user_id || '')
      if (id) prefsByUserId.set(id, row)
    }

    const channelField = kind === 'note' ? 'ampro_notes_channel' : kind === 'correction' ? 'ampro_corrections_channel' : 'ampro_availability_channel'

    const inAppUserIds: string[] = []
    const pushUserIds: string[] = []

    for (const uid of userIds) {
      const prefs = prefsByUserId.get(uid)
      const disabled = Boolean(prefs?.disable_all)
      if (disabled) continue

      const channel = normalizeChannel((prefs as any)?.[channelField])
      if (channel === 'in_app') inAppUserIds.push(uid)
      if (channel === 'push') pushUserIds.push(uid)
    }

    const url = `/ampro/mijn-projecten/${performanceId}`

    let created = 0
    if (inAppUserIds.length) {
      const type = kind === 'note' ? 'ampro_note' : kind === 'correction' ? 'ampro_correction' : 'ampro_availability'

      const rows = inAppUserIds.map((uid) => ({
        user_id: uid,
        scope: 'ampro',
        type,
        title,
        message,
        action_type: 'open_url',
        action_data: { url, performance_id: performanceId },
        read: false,
      }))

      const { error: insertError } = await supabase.from('notifications').insert(rows)
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
      created = rows.length
    }

    let pushed = 0
    if (pushUserIds.length) {
      const pushResult = await sendPushToUserIds(pushUserIds, { title, body: message, url })
      pushed = pushResult.ok ? pushResult.sent : 0
    }

    return NextResponse.json({ ok: true, recipients: userIds.length, in_app: created, push: pushed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
