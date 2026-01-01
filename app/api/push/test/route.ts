import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/pushServer'

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

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const authClient = createAuthClient(cookieStore)
    const { data: auth, error: authError } = await authClient.auth.getUser()
    if (authError || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      title?: string
      body?: string
      url?: string
    }

    const title = String(body?.title || 'HUB3')
    const msg = String(body?.body || 'Test push notification')
    const url = String(body?.url || '/dashboard')

    const supabase = createServiceClient()
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .eq('user_id', auth.user.id)
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results: Array<{ endpoint: string; ok: boolean; error?: string }> = []

    for (const s of subs || []) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }

      try {
        await sendPush(subscription, { title, body: msg, url })
        results.push({ endpoint: s.endpoint, ok: true })
      } catch (e: any) {
        results.push({ endpoint: s.endpoint, ok: false, error: e?.message || String(e) })
      }
    }

    return NextResponse.json({ ok: true, sent: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
