import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkStudioAccess } from '@/lib/supabaseHelpers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabaseAdmin = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type Role = 'owner' | 'admin' | 'bookkeeper' | 'comms' | 'viewer'

// PATCH /api/studio/[studioId]/members/[memberId]/role
// Body: { role: 'admin'|'bookkeeper'|'comms'|'viewer' }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studioId: string; memberId: string }> }
) {
  try {
    const { studioId, memberId } = await params

    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.substring('Bearer '.length)

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await checkStudioAccess(supabaseAdmin, studioId, user.id)
    if (!access.hasAccess || access.role !== 'owner') {
      return NextResponse.json({ error: 'Only owners can change roles' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({} as any))
    const role = body?.role as Role

    if (!role || !['admin', 'bookkeeper', 'comms', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Prevent changing the owner member row (if any)
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('studio_members')
      .select('id, role, user_id')
      .eq('id', memberId)
      .eq('studio_id', studioId)
      .maybeSingle()

    if (fetchErr) {
      console.error('Error fetching member:', fetchErr)
      return NextResponse.json({ error: 'Failed to fetch member' }, { status: 500 })
    }

    if (!existing) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    if (existing.role === 'owner') {
      return NextResponse.json({ error: 'Owner role cannot be changed' }, { status: 400 })
    }

    const { error: updateErr } = await supabaseAdmin
      .from('studio_members')
      .update({ role })
      .eq('id', memberId)
      .eq('studio_id', studioId)

    if (updateErr) {
      console.error('Error updating member role:', updateErr)
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in member role PATCH:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
