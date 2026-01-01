import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function createAuthClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    },
  )
}

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

type SubscriptionBody = {
  endpoint?: string
  expirationTime?: number | null
  keys?: { p256dh?: string; auth?: string }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const authClient = createAuthClient(cookieStore)
    const { data: auth, error: authError } = await authClient.auth.getUser()
    if (authError || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as SubscriptionBody
    const endpoint = String(body?.endpoint || '')
    const p256dh = String(body?.keys?.p256dh || '')
    const authKey = String(body?.keys?.auth || '')

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const userAgent = request.headers.get('user-agent') || null

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: auth.user.id,
          endpoint,
          p256dh,
          auth: authKey,
          user_agent: userAgent,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies()
    const authClient = createAuthClient(cookieStore)
    const { data: auth, error: authError } = await authClient.auth.getUser()
    if (authError || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as { endpoint?: string }
    const endpoint = String(body?.endpoint || '')
    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('endpoint', endpoint)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
