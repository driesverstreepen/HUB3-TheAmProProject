import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUserIds } from '@/lib/pushDispatch'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Authenticated endpoint: studio admins can request re-processing of a single pending invitation.
// Body: { invitation_id: string }
export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Missing authorization' }, { status: 401 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const admin = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null

    if (!admin) {
      console.error('Service role key not configured (SUPABASE_SERVICE_ROLE_KEY)')
      return NextResponse.json({ error: 'Service role not configured' }, { status: 500 })
    }

    const body = await req.json().catch(() => ({}))
    const invitationId = body?.invitation_id
    if (!invitationId) return NextResponse.json({ error: 'Missing invitation_id' }, { status: 400 })

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Load the pending invitation
    const { data: invitation, error: inviteErr } = await supabase
      .from('pending_teacher_invitations')
      .select('id, email, studio_id, status, notification_id')
      .eq('id', invitationId)
      .maybeSingle()

    if (inviteErr || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    // Verify caller is a studio_admin for this studio
    const { data: adminCheck, error: adminCheckErr } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('studio_id', invitation.studio_id)
      .eq('role', 'studio_admin')
      .maybeSingle()

    if (adminCheckErr || !adminCheck) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Look for an auth user with this email
    const { data: profile, error: profileErr } = await admin!
      .from('user_profiles')
      .select('user_id, email')
      .ilike('email', invitation.email)
      .limit(1)
      .maybeSingle()

    if (profileErr) {
      console.error('Error querying user_profiles:', profileErr)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    if (!profile || !profile.user_id) {
      // No account yet
      return NextResponse.json({ success: false, reason: 'no_user' })
    }

    const userId = profile.user_id

    // If invitation already has a linked notification, update it
    if (invitation.notification_id) {
      // Also include studio name in the notification when updating
      const { data: studioData } = await admin!
        .from('studios')
        .select('naam')
        .eq('id', invitation.studio_id)
        .maybeSingle()

      const studioName = studioData?.naam || 'Studio'

      const { error: updErr } = await admin!
        .from('notifications')
        .update({
          user_id: userId,
          message: `Je bent uitgenodigd om docent te worden bij ${studioName}. Accepteer de uitnodiging om toegang te krijgen tot de docent interface.`,
          action_data: { invitation_id: invitation.id, studio_id: invitation.studio_id, studio_name: studioName }
        })
        .eq('id', invitation.notification_id)

      if (updErr) {
        console.error('Failed updating notification user_id:', updErr)
        return NextResponse.json({ error: 'notif_update_failed', details: updErr }, { status: 500 })
      }

      // Ensure invitation.sent_at is set so UI shows the sent date
      const { error: sentErr } = await admin!
        .from('pending_teacher_invitations')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', invitation.id)

      if (sentErr) {
        console.error('Failed setting sent_at on invitation after updating notification:', sentErr)
      }

      return NextResponse.json({ success: true, updated: true })
    }

    // Otherwise create a notification and link it
    // Load studio name so we can include it in the notification message/action_data
    const { data: studioData } = await admin!
      .from('studios')
      .select('naam')
      .eq('id', invitation.studio_id)
      .maybeSingle()

    const studioName = studioData?.naam || 'Studio'

    const { data: notification, error: notifErr } = await admin!
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'teacher_invitation',
        title: 'Docent Uitnodiging',
        message: `Je bent uitgenodigd om docent te worden bij ${studioName}. Accepteer de uitnodiging om toegang te krijgen tot de docent interface.`,
        action_type: 'teacher_invitation_accept_decline',
        action_data: { invitation_id: invitation.id, studio_id: invitation.studio_id, studio_name: studioName },
        read: false
      })
      .select()
      .single()

    if (notifErr || !notification?.id) {
      console.error('Failed creating notification for invitation refresh:', notifErr)
      return NextResponse.json({ error: 'notif_create_failed', details: notifErr }, { status: 500 })
    }

    // Push mirrors in-app notification (best-effort)
    try {
      await sendPushToUserIds([userId], {
        title: 'Docent Uitnodiging',
        body: `Je bent uitgenodigd om docent te worden bij ${studioName}.`,
        url: '/notifications',
      })
    } catch {
      // ignore
    }

    // Link notification back to invitation and store sent_at
    const { error: linkErr } = await admin!
      .from('pending_teacher_invitations')
      .update({ notification_id: notification.id, sent_at: notification.created_at || new Date().toISOString() })
      .eq('id', invitation.id)

    if (linkErr) {
      console.error('Failed linking notification to invitation:', linkErr)
      return NextResponse.json({ error: 'link_failed', details: linkErr }, { status: 500 })
    }

    return NextResponse.json({ success: true, notification_id: notification.id })
  } catch (err: any) {
    console.error('Error in process-invitation:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}
