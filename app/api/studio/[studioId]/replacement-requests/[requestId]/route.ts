import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { createNotificationsAndPush } from '@/lib/notify'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function PATCH(request: NextRequest, { params }: { params: any }) {
  try {
    const resolvedParams = await params
    const { studioId, requestId } = resolvedParams
    if (!studioId || !requestId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Determine acting user id: try cookies/session first, then Authorization Bearer token
    let actingUserId: string | null = null
    try {
      const { data: sessionData } = await supabase.auth.getUser()
      const user = (sessionData as any).user
      if (user && user.id) actingUserId = user.id
    } catch (e) {
      // ignore
    }

    if (!actingUserId) {
      const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || ''
      let token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
      if (!token) {
        try {
          const sbToken = request.cookies.get('sb:token')?.value || request.cookies.get('sb:session')?.value || request.cookies.get('supabase-auth-token')?.value
          if (sbToken) {
            try { token = JSON.parse(sbToken)?.access_token || JSON.parse(sbToken)?.accessToken || sbToken } catch (e) { token = sbToken }
          }
        } catch (e) {}
      }

      if (token) {
        try {
          const parts = token.split('.')
          if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
            actingUserId = payload.sub || payload.user_id || null
          }
        } catch (e) {
          // fallback: try to get user via a user-scoped client
          try {
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Missing anon key')
            const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
            const { data: userData } = await userClient.auth.getUser()
            const u = (userData as any).user
            if (u && u.id) actingUserId = u.id
          } catch (ee) {
            console.warn('Failed to resolve acting user from token', ee)
          }
        }
      }
    }

    if (!actingUserId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    console.log('Debug: actingUserId:', actingUserId, 'studioId:', studioId, 'types:', typeof actingUserId, typeof studioId)

    // check admin role using service-role admin client (bypass RLS)
    const { data: adminRole, error: roleError } = await adminClient.from('user_roles').select('*').eq('user_id', actingUserId).eq('studio_id', studioId).eq('role', 'studio_admin').maybeSingle()
    console.log('Debug: adminRole query:', { adminRole, roleError })

    // Also try without the role filter to see what's in the table
    const { data: anyRole } = await adminClient.from('user_roles').select('*').eq('user_id', actingUserId).maybeSingle()
    console.log('Debug: anyRole for user:', anyRole)

    if (!adminRole) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { action, chosen_internal_teacher_id } = body || {}

    const { data: reqRow, error: reqErr } = await adminClient.from('replacement_requests').select('*').eq('id', requestId).maybeSingle()
    if (reqErr) { console.error('Failed loading request', reqErr); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
    if (!reqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (String(reqRow.studio_id) !== String(studioId)) return NextResponse.json({ error: 'Studio mismatch' }, { status: 400 })

    if (reqRow.status !== 'pending') return NextResponse.json({ error: 'Request not pending' }, { status: 400 })

    if (action === 'approve') {
      if (chosen_internal_teacher_id) {
        const { error: uErr } = await adminClient.from('lessons').update({ teacher_id: chosen_internal_teacher_id }).eq('id', reqRow.lesson_id)
        if (uErr) { console.error('Failed updating lesson', uErr); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
      }

      const { data: updated, error: updErr } = await adminClient.from('replacement_requests').update({ status: 'approved', admin_id: actingUserId, admin_decision_at: new Date().toISOString(), chosen_internal_teacher_id: chosen_internal_teacher_id || null }).eq('id', requestId).select().maybeSingle()
      if (updErr) { console.error('Failed updating request', updErr); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
      // Create notification for requester
      try {
        const requesterId = updated?.requested_by || reqRow.requested_by
        let teacherName = null
        if (chosen_internal_teacher_id) {
          const { data: prof } = await adminClient.from('user_profiles').select('first_name, last_name, email').eq('user_id', chosen_internal_teacher_id).maybeSingle()
          if (prof) teacherName = `${prof.first_name || ''} ${prof.last_name || ''}`.trim() || prof.email
        }
        const message = teacherName ? `Je vervangingsaanvraag is goedgekeurd — toegewezen docent: ${teacherName}` : 'Je vervangingsaanvraag is goedgekeurd'
        await createNotificationsAndPush({
          userIds: [requesterId],
          type: 'info',
          title: 'Vervangingsaanvraag bijgewerkt',
          message,
          action_type: 'view_replacement_request',
          action_data: { request_id: updated.id, studio_id: updated.studio_id },
        })
      } catch (e) {
        console.warn('Failed creating notification for requester on approve', e)
      }

      // ALSO: notify the chosen internal teacher that they were assigned (if any)
      if (chosen_internal_teacher_id) {
        try {
          // Try to get some lesson info for a nicer message
          let lessonInfo: any = null
          try {
            const { data: l } = await adminClient.from('lessons').select('id, datum, tijd, naam, program_id').eq('id', reqRow.lesson_id).maybeSingle()
            lessonInfo = l
          } catch (e) { /* ignore */ }

          const teacherMsg = lessonInfo && (lessonInfo.datum || lessonInfo.tijd || lessonInfo.naam)
            ? `Je bent toegewezen voor een vervanging (${lessonInfo.naam || ''} ${lessonInfo.datum || ''} ${lessonInfo.tijd || ''})`
            : 'Je bent toegewezen voor een vervanging'

          await createNotificationsAndPush({
            userIds: [chosen_internal_teacher_id],
            type: 'info',
            title: 'Vervanging toegewezen',
            message: teacherMsg,
            action_type: 'view_lesson',
            action_data: { lesson_id: reqRow.lesson_id, studio_id: reqRow.studio_id, request_id: updated.id },
          })
        } catch (e) {
          console.warn('Failed creating notification for assigned teacher on approve', e)
        }
      }

      return NextResponse.json({ data: updated })
    }

    if (action === 'decline') {
      // clear replacement_request_id on lesson if it points to this
      const { data: lessonData } = await adminClient.from('lessons').select('id, replacement_request_id').eq('id', reqRow.lesson_id).maybeSingle()
      if (lessonData && lessonData.replacement_request_id === requestId) {
        const { error: clearErr } = await adminClient.from('lessons').update({ replacement_request_id: null }).eq('id', lessonData.id)
        if (clearErr) console.warn('Failed to clear replacement_request_id', clearErr)
      }

      const { data: updated, error: updErr } = await adminClient.from('replacement_requests').update({ status: 'declined', admin_id: actingUserId, admin_decision_at: new Date().toISOString() }).eq('id', requestId).select().maybeSingle()
      if (updErr) { console.error('Failed updating request', updErr); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
      // Notify requester
      try {
        const requesterId = updated?.requested_by || reqRow.requested_by
        await createNotificationsAndPush({
          userIds: [requesterId],
          type: 'info',
          title: 'Vervangingsaanvraag afgewezen',
          message: 'Je vervangingsaanvraag is afgewezen',
          action_type: 'view_replacement_request',
          action_data: { request_id: updated.id, studio_id: updated.studio_id },
        })
      } catch (e) {
        console.warn('Failed creating notification for requester on decline', e)
      }

      return NextResponse.json({ data: updated })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    console.error('Error in PATCH replacement request:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: any }) {
  try {
    // Unwrap params in case it's a Promise
    const resolvedParams = await params
    const { studioId, requestId } = resolvedParams
    if (!studioId || !requestId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

    // Extract token and create user-scoped client (mirror POST handler)
    const authHeader = request.headers.get('authorization') || ''
    let token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
    if (!token) {
      try {
        const sbToken = request.cookies.get('sb:token')?.value || request.cookies.get('sb:session')?.value || request.cookies.get('supabase-auth-token')?.value
        if (sbToken) {
          try { token = JSON.parse(sbToken)?.access_token || JSON.parse(sbToken)?.accessToken || null } catch (e) { token = sbToken }
        }
      } catch (e) {}
    }
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Use admin client for privileged writes
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: reqRow, error: reqErr } = await adminClient.from('replacement_requests').select('*').eq('id', requestId).maybeSingle()
    if (reqErr) { console.error('Failed loading request', reqErr); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
    if (!reqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (String(reqRow.studio_id) !== String(studioId)) return NextResponse.json({ error: 'Studio mismatch' }, { status: 400 })

    // requester may delete their own pending request
    if (reqRow.requested_by === user.id && reqRow.status === 'pending') {
      const { error: delErr } = await adminClient.from('replacement_requests').delete().eq('id', requestId)
      if (delErr) { console.error('Failed deleting request', delErr); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
      try { if (reqRow.lesson_id) await adminClient.from('lessons').update({ replacement_request_id: null }).eq('id', reqRow.lesson_id) } catch (e) {}
      return NextResponse.json({ success: true })
    }

    // otherwise only admins can delete
    const { data: role } = await supabase.from('user_roles').select('id').eq('user_id', user.id).eq('studio_id', reqRow.studio_id).eq('role', 'studio_admin').maybeSingle()
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error: delErr } = await adminClient.from('replacement_requests').delete().eq('id', requestId)
    if (delErr) { console.error('Failed deleting request', delErr); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
    try { if (reqRow.lesson_id) await adminClient.from('lessons').update({ replacement_request_id: null }).eq('id', reqRow.lesson_id) } catch (e) {}
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error in DELETE replacement request:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
