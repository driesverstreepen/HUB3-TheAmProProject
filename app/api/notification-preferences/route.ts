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
  ampro_notes_channel?: Channel
  ampro_corrections_channel?: Channel
  ampro_availability_channel?: Channel
  updated_at?: string
}

const DEFAULT_PREFS: Omit<PreferencesRow, 'user_id'> = {
  disable_all: false,
  new_programs_scope: 'all',
  new_programs_channel: 'push',
  program_updates_channel: 'push',
  ampro_notes_channel: 'in_app',
  ampro_corrections_channel: 'in_app',
  ampro_availability_channel: 'in_app',
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

    const fullSelect =
      'disable_all,new_programs_scope,new_programs_channel,program_updates_channel,ampro_notes_channel,ampro_corrections_channel,ampro_availability_channel'
    const baseSelect = 'disable_all,new_programs_scope,new_programs_channel,program_updates_channel'

    const full = await supabase.from('user_notification_preferences').select(fullSelect).eq('user_id', auth.user.id).maybeSingle()

    if (full.error) {
      const msg = String(full.error.message || '')
      const looksLikeMissingColumn = msg.includes('column') && msg.includes('does not exist')

      if (looksLikeMissingColumn) {
        const base = await supabase.from('user_notification_preferences').select(baseSelect).eq('user_id', auth.user.id).maybeSingle()
        if (base.error) throw base.error

        return NextResponse.json({
          preferences: {
            ...DEFAULT_PREFS,
            ...(base.data || {}),
          },
          warning: 'Database mist AMPRO-notificatievelden; voer migratie 228 uit om deze instellingen te bewaren.',
        })
      }

      throw full.error
    }

    return NextResponse.json({
      preferences: {
        ...DEFAULT_PREFS,
        ...(full.data || {}),
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
      Pick<
        PreferencesRow,
        | 'disable_all'
        | 'new_programs_scope'
        | 'new_programs_channel'
        | 'program_updates_channel'
        | 'ampro_notes_channel'
        | 'ampro_corrections_channel'
        | 'ampro_availability_channel'
      >
    >

    const disable_all = typeof body.disable_all === 'boolean' ? body.disable_all : DEFAULT_PREFS.disable_all
    const new_programs_scope = isScope(body.new_programs_scope) ? body.new_programs_scope : DEFAULT_PREFS.new_programs_scope
    const new_programs_channel = isChannel(body.new_programs_channel) ? body.new_programs_channel : DEFAULT_PREFS.new_programs_channel
    const program_updates_channel = isChannel(body.program_updates_channel) ? body.program_updates_channel : DEFAULT_PREFS.program_updates_channel

    const ampro_notes_channel = isChannel((body as any).ampro_notes_channel) ? (body as any).ampro_notes_channel : DEFAULT_PREFS.ampro_notes_channel
    const ampro_corrections_channel = isChannel((body as any).ampro_corrections_channel)
      ? (body as any).ampro_corrections_channel
      : DEFAULT_PREFS.ampro_corrections_channel
    const ampro_availability_channel = isChannel((body as any).ampro_availability_channel)
      ? (body as any).ampro_availability_channel
      : DEFAULT_PREFS.ampro_availability_channel

    const supabase = createServiceClient()

    const fullPayload = {
      user_id: auth.user.id,
      disable_all,
      new_programs_scope,
      new_programs_channel,
      program_updates_channel,
      ampro_notes_channel,
      ampro_corrections_channel,
      ampro_availability_channel,
      updated_at: new Date().toISOString(),
    }

    const full = await supabase.from('user_notification_preferences').upsert(fullPayload, { onConflict: 'user_id' })

    if (full.error) {
      const msg = String(full.error.message || '')
      const looksLikeMissingColumn = msg.includes('column') && msg.includes('does not exist')

      if (looksLikeMissingColumn) {
        const basePayload = {
          user_id: auth.user.id,
          disable_all,
          new_programs_scope,
          new_programs_channel,
          program_updates_channel,
          updated_at: new Date().toISOString(),
        }
        const base = await supabase.from('user_notification_preferences').upsert(basePayload, { onConflict: 'user_id' })
        if (base.error) throw base.error

        return NextResponse.json({ ok: true, warning: 'Database mist AMPRO-notificatievelden; voer migratie 228 uit om AMPRO instellingen te bewaren.' })
      }

      throw full.error
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
