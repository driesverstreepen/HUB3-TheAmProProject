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

// GET /api/studio/[studioId]/role-permissions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studioId: string }> }
) {
  try {
    const { studioId } = await params

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
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: rows, error } = await supabaseAdmin
      .from('studio_role_permissions')
      .select('role, permissions')
      .eq('studio_id', studioId)

    if (error) {
      console.error('Error fetching studio_role_permissions:', error)
      return NextResponse.json({ error: 'Failed to fetch role permissions' }, { status: 500 })
    }

    return NextResponse.json({ permissionsByRole: rows || [] })
  } catch (err) {
    console.error('Error in role-permissions GET:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/studio/[studioId]/role-permissions
// Body: { role: 'admin'|'bookkeeper'|'comms'|'viewer', permissions: Record<string, boolean> }
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ studioId: string }> }
) {
  try {
    const { studioId } = await params

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
      return NextResponse.json({ error: 'Only owners can edit role permissions' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({} as any))
    const role = body?.role as Role
    const permissions = body?.permissions as Record<string, boolean>

    if (!role || !['admin', 'bookkeeper', 'comms', 'viewer', 'owner'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (!permissions || typeof permissions !== 'object') {
      return NextResponse.json({ error: 'Invalid permissions' }, { status: 400 })
    }

    if (role === 'owner') {
      return NextResponse.json({ error: 'Owner permissions are implicit and cannot be edited' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('studio_role_permissions')
      .upsert({
        studio_id: studioId,
        role,
        permissions,
      }, { onConflict: 'studio_id,role' })

    if (error) {
      console.error('Error upserting studio_role_permissions:', error)
      return NextResponse.json({ error: 'Failed to save role permissions' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in role-permissions PUT:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
