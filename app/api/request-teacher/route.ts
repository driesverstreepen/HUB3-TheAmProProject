import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const admin = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null
    if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 500 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const studioId = body?.studio_id
    if (!studioId) return NextResponse.json({ error: 'Missing studio_id' }, { status: 400 })

    // Ensure the requester is linked to the studio (membership) or is studio_admin
    try {
      const { data: membership } = await supabase
        .from('studio_memberships')
        .select('id')
        .eq('studio_id', studioId)
        .eq('user_id', user.id)
        .maybeSingle()

      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('studio_id', studioId)
        .eq('user_id', user.id)
        .maybeSingle()

      const isAdmin = roleRow && (roleRow as any).role === 'studio_admin'
      if (!membership && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden: not a member of this studio' }, { status: 403 })
      }
    } catch (err) {
      // ignore and proceed to attempt insert via admin client
    }

    // Use admin client to upsert a pending_teacher_invitations row
    const email = user.email || (user.user_metadata && (user.user_metadata.email || user.user_metadata.full_name)) || null
    if (!email) return NextResponse.json({ error: 'No email available for user' }, { status: 400 })

    const { error: upsertErr } = await admin!
      .from('pending_teacher_invitations')
      .upsert(
        { email: email, studio_id: studioId, invited_by: user.id },
        { onConflict: 'email,studio_id' }
      )

    if (upsertErr) {
      console.error('Failed creating pending_teacher_invitations:', upsertErr)
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Verzoek succesvol verstuurd naar studio' })
  } catch (err: any) {
    console.error('Error in request-teacher route:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
