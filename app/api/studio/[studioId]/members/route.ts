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

// GET /api/studio/[studioId]/members - list all members for a studio (owner or member)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studioId: string }> }
) {
  try {
    const { studioId } = await params

    // Extract bearer token
    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.substring('Bearer '.length)

    // User-scoped client
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Access check using service role to avoid RLS recursion
    const access = await checkStudioAccess(supabaseAdmin, studioId, user.id)
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch all members via service role
    const { data: members, error } = await supabaseAdmin
      .from('studio_members')
      .select('*')
      .eq('studio_id', studioId)
      .order('joined_at', { ascending: true })

    if (error) {
      console.error('Error fetching members:', error)
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
    }

    // Enrich with profiles
    const enriched = await Promise.all((members || []).map(async (m) => {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('first_name, last_name, email')
        .eq('user_id', m.user_id)
        .maybeSingle()
      return { ...m, user_profile: profile }
    }))

    return NextResponse.json({ members: enriched })
  } catch (err) {
    console.error('Error in members GET:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
