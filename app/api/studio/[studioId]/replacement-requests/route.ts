import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(request: NextRequest, context: any) {
  try {
    // Next app router may pass params as a Promise; unwrap safely
    const params = await context?.params
    // params may sometimes be missing under certain dev envs — fall back to parsing the URL
    let studioId = params?.studioId
    if (!studioId) {
      try {
        const parts = new URL(request.url).pathname.split('/').filter(Boolean)
        // expected path: /api/studio/{studioId}/replacement-requests
        const apiIndex = parts.indexOf('api')
        if (apiIndex >= 0 && parts[apiIndex + 1] === 'studio' && parts.length > apiIndex + 2) {
          studioId = parts[apiIndex + 2]
        }
      } catch (e) {
        // ignore
      }
    }

    if (!studioId) {
      console.error('Missing studioId in replacement-requests GET', { params, url: request.url })
      return NextResponse.json({ error: 'Missing studioId' }, { status: 400 })
    }

    // Expect a bearer token from the client. Create a user-scoped Supabase client
    // so RLS and role checks work as the requesting user.
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: sessionData } = await userClient.auth.getUser()
    const user = (sessionData as any).user
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Service role not configured' }, { status: 500 })
    }

    // Use service role for access checks to avoid RLS false-negatives.
    // We still make an authorization decision based on user.id + studioId.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Allow access if user is:
    // - in studio_members as admin/owner, OR
    // - studios.eigenaar_id matches, OR
    // - legacy user_roles contains studio_admin.
    const [memberRes, studioRes, legacyRoleRes] = await Promise.all([
      adminClient
        .from('studio_members')
        .select('role')
        .eq('studio_id', studioId)
        .eq('user_id', user.id)
        .maybeSingle(),
      adminClient
        .from('studios')
        .select('eigenaar_id')
        .eq('id', studioId)
        .maybeSingle(),
      adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('studio_id', studioId)
        .eq('role', 'studio_admin')
        .maybeSingle(),
    ])

    const memberRole = (memberRes as any)?.data?.role
    const isMemberAdmin = memberRole === 'admin' || memberRole === 'owner'
    const isOwner = String((studioRes as any)?.data?.eigenaar_id || '') === String(user.id)
    const hasLegacyRole = Boolean((legacyRoleRes as any)?.data)

    if (!isMemberAdmin && !isOwner && !hasLegacyRole) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status') || undefined
    const schoolYearId = url.searchParams.get('schoolYearId') || undefined

    // disambiguate PostgREST embedding relationship: replacement_requests has two FK paths to lessons
    // we want the lesson referenced by replacement_requests.lesson_id -> lessons.id so use the explicit relationship name
    // select lesson fields that actually exist on the lessons table (date/time-based schema)
    // Select replacement_requests and include the referenced lesson row.
    // The lessons table uses English column names (title, date, time, location_id),
    // we'll map them to the Dutch-friendly keys the frontend expects below.
    const runQuery = async (withYear: boolean) => {
      let q: any = adminClient.from('replacement_requests').select(
        `*,
          lessons!replacement_requests_lesson_id_fkey(id, title, date, time, duration_minutes, location_id, program_id, teacher_id)`
      ).eq('studio_id', studioId).order('requested_at', { ascending: false })

      if (status) q = q.eq('status', status)
      if (withYear && schoolYearId) q = q.eq('school_year_id', schoolYearId)
      return await q
    }

    let res: any = await runQuery(true)
    if (res?.error) {
      const msg = String(res?.error?.message || '')
      if (msg.toLowerCase().includes('school_year_id') && schoolYearId) {
        res = await runQuery(false)
      }
    }

    const { data, error } = res as any
    if (error) {
      // include raw error details in dev to help debugging
      console.error('Failed fetching replacement requests (PostgREST error):', error)
      return NextResponse.json({ error: 'Failed to load requests', details: error }, { status: 500 })
    }

    const rows = (data || []) as any[]

    // PostgREST embedding for requested_by -> user_profiles may not exist (no FK), so fetch profiles separately
    const requesterIds = Array.from(new Set(rows.map(r => r.requested_by).filter(Boolean)))
    let profilesMap: Record<string, any> = {}
    if (requesterIds.length > 0) {
      try {
        const res = await adminClient.from('user_profiles').select('user_id, first_name, last_name, email').in('user_id', requesterIds)
        const profiles = (res as any).data || []
        profiles.forEach((p: any) => { profilesMap[String(p.user_id)] = p })
      } catch (e) {
        console.warn('Failed to load requester profiles', e)
      }
    }

    // attach requested_by_profile as an object (like earlier embed would)
    let enriched = rows.map(r => ({ ...r, requested_by_profile: profilesMap[String(r.requested_by)] || null }))

    // Normalize embedded lesson object (PostgREST returns array embedding). Map English column names to Dutch keys used in the frontend.
    // First map raw lessons into a normalized shape, but keep original location_id so we can resolve names in batch
    enriched = enriched.map(r => {
      const rawLesson = r.lessons && (Array.isArray(r.lessons) ? r.lessons[0] : r.lessons)
      if (!rawLesson) return r
      const lesson = {
        id: rawLesson.id,
        naam: rawLesson.title || null,
        datum: rawLesson.date || null,
        tijd: rawLesson.time || null,
        duur: rawLesson.duration_minutes || null,
        locatie: rawLesson.location_id || null,
        program_id: rawLesson.program_id || null,
        teacher_id: rawLesson.teacher_id || null,
        _raw_location_id: rawLesson.location_id || null // keep raw id for resolution
      }
      return { ...r, lessons: lesson }
    })

    // Resolve human-readable location names for any lessons that reference a location_id
    try {
      const locIds = Array.from(new Set(enriched.map((r:any) => r.lessons && r.lessons._raw_location_id).filter(Boolean)))
      if (locIds.length > 0) {
        const { data: locs } = await adminClient.from('locations').select('id, name').in('id', locIds)
        const locMap: Record<string, string> = {}
        ;(locs || []).forEach((l: any) => { if (l && l.id) locMap[String(l.id)] = l.name })
        enriched = enriched.map((r:any) => {
          if (r.lessons && r.lessons._raw_location_id) {
            const name = locMap[String(r.lessons._raw_location_id)]
            // prefer explicit name if found, otherwise leave as null (do not expose raw UUID)
            return { ...r, lessons: { ...r.lessons, locatie: name || null } }
          }
          return r
        })
      }
    } catch (e) {
      console.warn('Failed to resolve location names for replacement requests', e)
    }

    // Also fetch profiles for any chosen_internal_teacher_id so frontend can show assigned teacher data
    const chosenIds = Array.from(new Set(rows.map(r => r.chosen_internal_teacher_id).filter(Boolean)))
    if (chosenIds.length > 0) {
      try {
        const { data: chosenProfiles } = await adminClient.from('user_profiles').select('user_id, first_name, last_name, email').in('user_id', chosenIds)
        const chosenMap: Record<string, any> = {}
        ;(chosenProfiles || []).forEach((p: any) => { chosenMap[String(p.user_id)] = p })
        enriched = enriched.map(r => ({ ...r, chosen_internal_teacher_profile: chosenMap[String(r.chosen_internal_teacher_id)] || null }))
      } catch (e) {
        console.warn('Failed loading chosen_internal_teacher profiles', e)
      }
    }

    // Also fetch program info (program_type) for any lessons so the UI can display lesson type
    const progIds = Array.from(new Set((rows.map(r => (r.lessons && r.lessons.program_id) || r.program_id).filter(Boolean))))
    if (progIds.length > 0) {
      try {
        const { data: progs } = await adminClient.from('programs').select('id, program_type').in('id', progIds)
        const progMap: Record<string, any> = {}
        ;(progs || []).forEach((p: any) => { progMap[String(p.id)] = p })
        enriched = enriched.map(r => ({ ...r, program_type: progMap[String((r.lessons && r.lessons.program_id) || r.program_id)]?.program_type || null }))
      } catch (e) {
        console.warn('Failed loading program types', e)
      }
    }

    return NextResponse.json({ data: enriched })
  } catch (err: any) {
    console.error('List replacement requests error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }

}
