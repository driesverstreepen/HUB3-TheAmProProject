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
    const confirm = String(body?.confirm || '').trim()

    if (!performance_id) {
      return NextResponse.json({ error: 'performance_id is required' }, { status: 400 })
    }

    if (confirm !== 'DELETE') {
      return NextResponse.json({ error: 'Confirm is required (type DELETE)' }, { status: 400 })
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

    const { data: existing, error: fetchError } = await admin
      .from('ampro_program_invites')
      .select('id')
      .eq('performance_id', performance_id)

    if (fetchError) throw fetchError

    const { error: deleteError } = await admin
      .from('ampro_program_invites')
      .delete()
      .eq('performance_id', performance_id)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true, deleted_count: (existing || []).length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
