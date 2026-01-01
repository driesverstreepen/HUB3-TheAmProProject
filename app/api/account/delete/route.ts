import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userId } = body
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    // Delete public.users row (requires RLS or proper policies)
    const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!anonUrl || !anonKey) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const anonClient = createClient(anonUrl, anonKey)
    const { error: deleteErr } = await anonClient.from('users').delete().eq('id', userId)

    // If a service role key is available, also remove the auth user completely
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (serviceRole) {
      const adminClient = createClient(anonUrl, serviceRole)
      // Delete from auth.users
      const { error: authErr } = await adminClient.auth.admin.deleteUser(userId)
      if (authErr) {
        return NextResponse.json({ error: 'Could not delete auth user: ' + authErr.message }, { status: 500 })
      }
      if (deleteErr) {
        // If public users delete failed but auth delete succeeded, return partial warning
        return NextResponse.json({ warning: 'Auth user removed, but public.users delete returned error: ' + deleteErr.message })
      }

      return NextResponse.json({ ok: true })
    }

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

    // If no service role key, return info indicating partial deletion
    return NextResponse.json({ ok: true, info: 'Deleted public.users row. To fully remove auth user, set SUPABASE_SERVICE_ROLE_KEY.' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
