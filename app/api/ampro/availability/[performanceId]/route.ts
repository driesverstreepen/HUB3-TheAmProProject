import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

async function getUserFromBearer(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { user: null as any, error: 'Unauthorized' }
  }

  const token = authHeader.substring('Bearer '.length)
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabaseUser.auth.getUser()
  if (error || !data?.user) return { user: null as any, error: 'Unauthorized' }
  return { user: data.user, error: null }
}

function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() <= Date.now()
}

async function assertRosterAccess(admin: ReturnType<typeof createSupabaseServiceClient>, performanceId: string, userId: string) {
  const rosterCheck = await admin
    .from('ampro_roster')
    .select('performance_id')
    .eq('performance_id', performanceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (rosterCheck.error) throw rosterCheck.error
  return Boolean(rosterCheck.data?.performance_id)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ performanceId: string }> }) {
  try {
    const { performanceId } = await params
    if (!performanceId) {
      return NextResponse.json({ error: 'Missing performanceId' }, { status: 400 })
    }

    const { user, error } = await getUserFromBearer(request)
    if (error) return NextResponse.json({ error }, { status: 401 })

    const admin = createSupabaseServiceClient()

    // Confirm the user is in the roster for this performance
    const hasAccess = await assertRosterAccess(admin, performanceId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch availability request (service role bypasses RLS safely)
    const reqResp = await admin
      .from('ampro_availability_requests')
      .select('id,performance_id,is_visible,responses_locked,responses_lock_at')
      .eq('performance_id', performanceId)
      .maybeSingle()

    if (reqResp.error) throw reqResp.error
    const requestRow = reqResp.data || null

    if (!requestRow) {
      return NextResponse.json({ request: null, dates: [], responses: [], isAssignedToRequest: false })
    }

    // Fetch dates and user's responses + assignment info
    const datesResp = await admin
      .from('ampro_availability_request_dates')
      .select('id,request_id,day')
      .eq('request_id', requestRow.id)
      .order('day', { ascending: true })

    if (datesResp.error) throw datesResp.error
    const dates = datesResp.data || []

    const dateIds = (dates || []).map((d: any) => d.id).filter(Boolean)

    const responsesResp = dateIds.length
      ? await admin
          .from('ampro_availability_responses')
          .select('request_date_id,status,comment')
          .eq('user_id', user.id)
          .in('request_date_id', dateIds)
      : ({ data: [], error: null } as any)

    if (responsesResp.error) throw responsesResp.error
    const responses = responsesResp.data || []

    const assignedResp = dateIds.length
      ? await admin
          .from('ampro_availability_request_date_users')
          .select('request_date_id')
          .eq('user_id', user.id)
          .in('request_date_id', dateIds)
      : ({ data: [], error: null } as any)

    if (assignedResp.error) throw assignedResp.error
    const isAssigned = Array.isArray(assignedResp.data) && assignedResp.data.length > 0

    return NextResponse.json({ request: requestRow, dates, responses, isAssignedToRequest: isAssigned })
  } catch (err: any) {
    console.error('Error in availability API:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ performanceId: string }> }) {
  try {
    const { performanceId } = await params
    if (!performanceId) {
      return NextResponse.json({ error: 'Missing performanceId' }, { status: 400 })
    }

    const { user, error } = await getUserFromBearer(request)
    if (error) return NextResponse.json({ error }, { status: 401 })

    const admin = createSupabaseServiceClient()
    const hasAccess = await assertRosterAccess(admin, performanceId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const responsesIn = Array.isArray((body as any)?.responses) ? (body as any).responses : []
    if (!responsesIn.length) {
      return NextResponse.json({ error: 'No responses provided' }, { status: 400 })
    }

    // Load request
    const reqResp = await admin
      .from('ampro_availability_requests')
      .select('id,performance_id,is_visible,responses_locked,responses_lock_at')
      .eq('performance_id', performanceId)
      .maybeSingle()
    if (reqResp.error) throw reqResp.error
    if (!reqResp.data?.id) {
      return NextResponse.json({ error: 'No availability request for this performance' }, { status: 404 })
    }

    const locked = Boolean((reqResp.data as any)?.responses_locked) || isPast((reqResp.data as any)?.responses_lock_at || null)
    if (locked) {
      return NextResponse.json({ error: 'Responses are locked' }, { status: 409 })
    }

    // Determine which request_date_ids this user is assigned to
    const dateIds = responsesIn
      .map((r: any) => String(r?.request_date_id || ''))
      .filter(Boolean)

    if (!dateIds.length) {
      return NextResponse.json({ error: 'Invalid request_date_id' }, { status: 400 })
    }

    const assignedResp = await admin
      .from('ampro_availability_request_date_users')
      .select('request_date_id')
      .eq('user_id', user.id)
      .in('request_date_id', dateIds)
    if (assignedResp.error) throw assignedResp.error

    const allowed = new Set((assignedResp.data || []).map((r: any) => String(r.request_date_id)))
    const rows = responsesIn
      .filter((r: any) => allowed.has(String(r?.request_date_id || '')))
      .map((r: any) => {
        const status = String(r?.status || 'maybe')
        const normalized = status === 'yes' || status === 'no' || status === 'maybe' ? status : 'maybe'
        const commentRaw = r?.comment == null ? '' : String(r.comment)
        return {
          request_date_id: String(r.request_date_id),
          user_id: user.id,
          status: normalized,
          comment: commentRaw.trim() || null,
        }
      })

    if (!rows.length) {
      return NextResponse.json({ error: 'You are not assigned to these dates' }, { status: 403 })
    }

    const upsertResp = await admin
      .from('ampro_availability_responses')
      .upsert(rows as any, { onConflict: 'request_date_id,user_id' })
      .select('request_date_id,status,comment')

    if (upsertResp.error) throw upsertResp.error

    return NextResponse.json({ ok: true, saved: upsertResp.data || [] })
  } catch (err: any) {
    console.error('Error saving availability:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
