import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotificationsAndPush } from '@/lib/notify'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: NextRequest, { params }: { params: any }) {
  try {
    // In Next.js route handlers `params` can be a Promise; await it before use
    const { studioId, lessonId } = await params

  const body = await request.json()
    const { chosen_internal_teacher_id, external_teacher_name, external_teacher_email, notes } = body

    // Expect Authorization: Bearer <access_token>
    const authHeader = request.headers.get('authorization') || ''
    let token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null

    // Fallback: try to read Supabase session cookie (used in some SSR flows)
    if (!token) {
      try {
        const sbToken = request.cookies.get('sb:token')?.value || request.cookies.get('sb:session')?.value || request.cookies.get('supabase-auth-token')?.value
        if (sbToken) {
          try {
            const parsed = JSON.parse(sbToken)
            token = parsed?.access_token || parsed?.accessToken || null
          } catch (e) {
            // cookie might directly be the token string
            token = sbToken
          }
        }
      } catch (e) {
        // ignore cookie parsing errors
      }
    }
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    // create a user-scoped client so RLS and role checks run as the caller
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Load lesson & program (use userClient to respect RLS for lesson visibility)
    const { data: lesson, error: lessonErr } = await userClient
      .from('lessons')
      .select('id, program_id, school_year_id')
      .eq('id', lessonId)
      .maybeSingle()
    if (lessonErr) throw lessonErr
    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    // lessons table may not contain studio_id; verify via the program relation
    if (!lesson.program_id) return NextResponse.json({ error: 'Lesson missing program linkage' }, { status: 400 })

    const { data: program, error: programErr } = await userClient
      .from('programs')
      .select('id, studio_id')
      .eq('id', lesson.program_id)
      .maybeSingle()
    if (programErr) throw programErr
    if (!program) return NextResponse.json({ error: 'Program not found for lesson' }, { status: 404 })
    if (program.studio_id !== studioId) return NextResponse.json({ error: 'Studio mismatch' }, { status: 403 })

    // Verify requester is allowed: either studio_admin or teacher assigned to program
    const { data: roleCheck } = await userClient
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('studio_id', studioId)
      .eq('role', 'studio_admin')
      .maybeSingle()

    let allowed = !!roleCheck
    if (!allowed && lesson.program_id) {
      const { data: tp } = await userClient
        .from('teacher_programs')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('program_id', lesson.program_id)
        .maybeSingle()
      allowed = !!tp
    }
    if (!allowed) return NextResponse.json({ error: 'Not allowed to request replacement for this lesson' }, { status: 403 })

    // Use admin client for inserts/updates to avoid RLS issues
    if (!SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Service role not configured' }, { status: 500 })
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Prevent duplicate pending request by same user for same lesson
    const { data: existing } = await adminClient
      .from('replacement_requests')
      .select('id')
      .eq('lesson_id', lessonId)
      .eq('requested_by', user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'You already have a pending request for this lesson' }, { status: 409 })

    const insert: any = {
      studio_id: studioId,
      lesson_id: lessonId,
      program_id: lesson.program_id,
      school_year_id: (lesson as any)?.school_year_id || null,
      requested_by: user.id,
      status: 'pending',
      chosen_internal_teacher_id: chosen_internal_teacher_id || null,
      external_teacher_name: external_teacher_name || null,
      external_teacher_email: external_teacher_email || null,
      notes: notes || null,
      requested_at: new Date().toISOString()
    }

    // Back-compat: if replacement_requests.school_year_id isn't deployed yet, retry without it.
    let res: any = await adminClient.from('replacement_requests').insert(insert).select().maybeSingle()
    if (res?.error) {
      const msg = String(res?.error?.message || '')
      if (msg.toLowerCase().includes('school_year_id')) {
        const { school_year_id: _omit, ...retryPayload } = insert
        res = await adminClient.from('replacement_requests').insert(retryPayload).select().maybeSingle()
      }
    }

    const { data: created, error: insertErr } = res as any
    if (insertErr) throw insertErr

  // Optionally set lessons.replacement_request_id so UI can show it quickly
  await adminClient.from('lessons').update({ replacement_request_id: created.id }).eq('id', lessonId)

  // Create notifications for studio admins so they see the new request in their notification center
  try {
    const { data: adminRoles } = await adminClient
      .from('user_roles')
      .select('user_id')
      .eq('studio_id', studioId)
      .in('role', ['studio_admin', 'admin'])

    const adminUserIds = (adminRoles || []).map((r: any) => r.user_id).filter(Boolean)
    if (adminUserIds.length > 0) {
      const lessonTitle = (created && created.lesson_id) ? String(created.lesson_id) : (created?.lessons?.title || 'les')

      // Load studio notification preferences (best-effort). Missing row => defaults.
      let prefRows: any[] = []
      try {
        const { data } = await adminClient
          .from('studio_notification_preferences')
          .select('user_id, disable_all, replacement_requests_channel')
          .eq('studio_id', studioId)
          .in('user_id', adminUserIds)
        prefRows = (data as any[]) || []
      } catch {
        prefRows = []
      }

      const prefByUser = new Map<string, any>()
      for (const row of prefRows) {
        if (row?.user_id) prefByUser.set(String(row.user_id), row)
      }

      const inAppOnlyIds: string[] = []
      const pushIds: string[] = []

      for (const uid of adminUserIds) {
        const pref = prefByUser.get(String(uid)) || {}
        if (pref?.disable_all) continue
        const channel = String(pref?.replacement_requests_channel || 'push')
        if (channel === 'none') continue
        if (channel === 'in_app') inAppOnlyIds.push(String(uid))
        else pushIds.push(String(uid))
      }

      const action_data = { request_id: created.id, lesson_id: created.lesson_id, studio_id: studioId }
      const title = 'Nieuwe vervangingsaanvraag'
      const message = `Er is een nieuwe vervangingsaanvraag voor ${lessonTitle}`

      if (inAppOnlyIds.length > 0) {
        await createNotificationsAndPush({
          userIds: inAppOnlyIds,
          type: 'info',
          title,
          message,
          action_type: 'view_replacement_request',
          action_data,
          channels: { inApp: true, push: false },
        })
      }

      if (pushIds.length > 0) {
        await createNotificationsAndPush({
          userIds: pushIds,
          type: 'info',
          title,
          message,
          action_type: 'view_replacement_request',
          action_data,
          channels: { inApp: true, push: true },
        })
      }
    }
  } catch (e) {
    console.warn('Error creating admin notifications', e)
  }

    return NextResponse.json({ data: created })
  } catch (err: any) {
    console.error('Create replacement request error:', err)
    return NextResponse.json({ error: err.message || err }, { status: 500 })
  }
}
