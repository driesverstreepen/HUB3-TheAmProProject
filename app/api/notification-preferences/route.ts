import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type Channel = 'none' | 'in_app' | 'push'
type NewProgramsScope = 'all' | 'workshops'

type PreferencesRow = {
  user_id: string
  disable_all: boolean
  new_programs_scope: NewProgramsScope
  new_programs_channel: Channel
  program_updates_channel: Channel
  updated_at?: string
}

const DEFAULT_PREFS: Omit<PreferencesRow, 'user_id'> = {
  disable_all: false,
  new_programs_scope: 'all',
  new_programs_channel: 'push',
  program_updates_channel: 'push',
}

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

function isChannel(value: any): value is Channel {
  return value === 'none' || value === 'in_app' || value === 'push'
}

function isScope(value: any): value is NewProgramsScope {
  return value === 'all' || value === 'workshops'
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const authClient = createAuthClient(cookieStore)
    const { data: auth, error: authError } = await authClient.auth.getUser()

    if (authError || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select('disable_all,new_programs_scope,new_programs_channel,program_updates_channel')
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({
      preferences: {
        ...DEFAULT_PREFS,
        ...(data || {}),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies()
    const authClient = createAuthClient(cookieStore)
    const { data: auth, error: authError } = await authClient.auth.getUser()

    if (authError || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Partial<
      Pick<PreferencesRow, 'disable_all' | 'new_programs_scope' | 'new_programs_channel' | 'program_updates_channel'>
    >

    const disable_all = typeof body.disable_all === 'boolean' ? body.disable_all : DEFAULT_PREFS.disable_all
    const new_programs_scope = isScope(body.new_programs_scope) ? body.new_programs_scope : DEFAULT_PREFS.new_programs_scope
    const new_programs_channel = isChannel(body.new_programs_channel) ? body.new_programs_channel : DEFAULT_PREFS.new_programs_channel
    const program_updates_channel = isChannel(body.program_updates_channel) ? body.program_updates_channel : DEFAULT_PREFS.program_updates_channel

    const supabase = createServiceClient()

    const { error } = await supabase
      .from('user_notification_preferences')
      .upsert(
        {
          user_id: auth.user.id,
          disable_all,
          new_programs_scope,
          new_programs_channel,
          program_updates_channel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
