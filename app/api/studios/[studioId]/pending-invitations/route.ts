import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotificationsAndPush } from '@/lib/notify'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(req: NextRequest, context: any) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const params = await context?.params
    const studioId = params?.studioId
    if (!studioId) return NextResponse.json({ error: 'Missing studioId' }, { status: 400 })

    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const admin = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null
    if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 500 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify caller is a studio_admin for this studio
    const { data: adminCheck, error: adminErr } = await admin
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('studio_id', studioId)
      .eq('role', 'studio_admin')
      .maybeSingle()

    if (adminErr) return NextResponse.json({ error: adminErr.message || 'role_check_failed' }, { status: 500 })
    if (!adminCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({} as any))
    const emailRaw = String(body?.email || '').trim().toLowerCase()
    if (!emailRaw) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

    // Ensure the pending invitation exists
    const { data: invitation, error: invErr } = await admin
      .from('pending_teacher_invitations')
      .upsert(
        { email: emailRaw, studio_id: studioId, status: 'pending', invited_by: user.id },
        { onConflict: 'email,studio_id' },
      )
      .select('id, email, studio_id, status, notification_id')
      .single()

    if (invErr) return NextResponse.json({ error: invErr.message || 'invite_upsert_failed' }, { status: 500 })

    // If user exists, create notification + push and link it
    const { data: existingProfile } = await admin
      .from('user_profiles')
      .select('user_id')
      .eq('email', emailRaw)
      .maybeSingle()

    let notificationLinked = false
    if (existingProfile?.user_id) {
      // Get studio name
      const { data: studioData } = await admin
        .from('studios')
        .select('naam')
        .eq('id', studioId)
        .maybeSingle()
      const studioName = (studioData as any)?.naam || 'Studio'

      const notifyResult = await createNotificationsAndPush({
        userIds: [existingProfile.user_id],
        type: 'teacher_invitation',
        title: 'Docent Uitnodiging',
        message: `Je bent uitgenodigd om docent te worden bij ${studioName}.`,
        action_type: 'teacher_invitation_accept_decline',
        action_data: { invitation_id: invitation.id, studio_id: studioId, studio_name: studioName },
        url: '/notifications',
      })

      if (notifyResult.ok) {
        // Link notification_id if we can find the newest notification quickly
        // (best-effort; not critical for UX)
        try {
          const { data: notifRow } = await admin
            .from('notifications')
            .select('id')
            .eq('user_id', existingProfile.user_id)
            .eq('type', 'teacher_invitation')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (notifRow?.id) {
            await admin
              .from('pending_teacher_invitations')
              .update({ notification_id: notifRow.id })
              .eq('id', invitation.id)
            notificationLinked = true
          }
        } catch {
          // ignore
        }
      }
    }

    return NextResponse.json({
      ok: true,
      invitation,
      has_account: !!existingProfile?.user_id,
      notification_linked: notificationLinked,
    })
  } catch (err: any) {
    console.error('Error in pending-invitations POST:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, context: any) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    // Unwrap params (may be a Promise in Next App Router)
    const params = await context?.params
    const studioId = params?.studioId
    if (!studioId) return NextResponse.json({ error: 'Missing studioId' }, { status: 400 })

    // Require user token from client to verify studio_admin role
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const admin = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null
    if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 500 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify caller is a studio_admin for this studio using service role to bypass RLS
    try {
      const { data: adminCheck, error: adminErr } = await admin
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('studio_id', studioId)
        .eq('role', 'studio_admin')
        .maybeSingle()

      if (adminErr) {
        console.error('Error checking admin role (service role):', adminErr)
        return NextResponse.json({ error: (adminErr && (adminErr.message || adminErr.details)) || 'Failed role check' }, { status: 500 })
      }

      if (!adminCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } catch (e: any) {
      console.error('Unexpected error during role check:', e)
      return NextResponse.json({ error: e?.message || 'role_check_error' }, { status: 500 })
    }

    // Fetch pending invitations using admin client to bypass RLS
    const { data: invitations, error: invErr } = await admin
      .from('pending_teacher_invitations')
      .select('id, email, studio_id, status, invited_at, notification_id')
      .eq('studio_id', studioId)
      .order('invited_at', { ascending: false })

    if (invErr) {
      console.error('Error fetching pending invitations:', invErr)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    const invites = invitations || []

    // Enrich each invitation: check for auth user, and include notification created_at as sent_at
    const enriched = await Promise.all((invites as any[]).map(async (inv: any) => {
      let has_account = false
      let account_user_id: string | null = null
      let sent_at: string | null = null

      try {
        // find auth user by email
        const { data: matchedUser } = await admin
          .from('auth.users')
          .select('id, email')
          .ilike('email', inv.email)
          .limit(1)
          .maybeSingle()

        if (matchedUser?.id) {
          has_account = true
          account_user_id = matchedUser.id
        }

        if (inv.notification_id) {
          const { data: notif } = await admin
            .from('notifications')
            .select('id, created_at')
            .eq('id', inv.notification_id)
            .limit(1)
            .maybeSingle()

          if (notif?.created_at) sent_at = notif.created_at
        }
      } catch (e) {
        console.error('Error enriching invitation', inv.id, e)
      }

      return {
        ...inv,
        has_account,
        account_user_id,
        sent_at
      }
    }))

    return NextResponse.json({ invitations: enriched })
  } catch (err: any) {
    console.error('Error in pending-invitations route:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}
