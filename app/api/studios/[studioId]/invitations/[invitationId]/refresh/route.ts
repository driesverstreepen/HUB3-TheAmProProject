import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUserIds } from '@/lib/pushDispatch'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(req: NextRequest, context: any) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    // Require user token from client
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const admin = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = context?.params || {}
  const studioId = params.studioId
  const invitationId = params.invitationId

    // Verify caller is a studio_admin for this studio
    const { data: adminCheck, error: adminErr } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('studio_id', studioId)
      .eq('role', 'studio_admin')
      .maybeSingle()

    if (adminErr) {
      console.error('Error checking admin role:', adminErr)
      return NextResponse.json({ error: 'Failed role check' }, { status: 500 })
    }

    if (!adminCheck) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch the pending invitation (using admin client to avoid RLS surprises)
    if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 500 })

    const { data: invitation, error: inviteErr } = await admin
      .from('pending_teacher_invitations')
      .select('id, email, studio_id, notification_id')
      .eq('id', invitationId)
      .eq('studio_id', studioId)
      .maybeSingle()

    if (inviteErr || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    const invitedEmail = (invitation.email || '').toLowerCase()

    // Try to find an auth user for this email
    const { data: matchedUser, error: matchErr } = await admin
      .from('auth.users')
      .select('id, email')
      .ilike('email', invitedEmail)
      .limit(1)
      .maybeSingle()

    if (matchErr) {
      console.error('Error finding auth user for invitation refresh:', matchErr)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    if (!matchedUser || !matchedUser.id) {
      return NextResponse.json({ success: false, message: 'No corresponding user account found for this email yet' })
    }

    // If invitation already links to a notification, update it. Otherwise create one.
    // Load studio name for message
    const { data: studioData } = await admin
      .from('studios')
      .select('naam')
      .eq('id', studioId)
      .maybeSingle()

    const studioName = studioData?.naam || 'Studio'

    if (invitation.notification_id) {
      const { error: updErr } = await admin
        .from('notifications')
        .update({
          user_id: matchedUser.id,
          message: `Je bent uitgenodigd om docent te worden bij ${studioName}. Accepteer de uitnodiging om toegang te krijgen tot de docent interface.`,
          action_data: { invitation_id: invitation.id, studio_id: studioId, studio_name: studioName }
        })
        .eq('id', invitation.notification_id)

      if (updErr) {
        console.error('Failed to update existing notification:', updErr)
          return NextResponse.json({ error: 'failed_update', details: updErr }, { status: 500 })
      }

        // Ensure invitation.sent_at is set
        try {
          await admin
            .from('pending_teacher_invitations')
            .update({ sent_at: new Date().toISOString() })
            .eq('id', invitation.id)
        } catch (e) {
          console.error('Failed to set sent_at on invitation after updating notification:', e)
        }

      return NextResponse.json({ success: true, message: 'Notification linked to existing user', notification_id: invitation.notification_id })
    }

    // Create notification for the matched user
    const { data: notification, error: notifErr } = await admin
      .from('notifications')
      .insert({
        user_id: matchedUser.id,
        type: 'teacher_invitation',
        title: 'Docent Uitnodiging',
        message: `Je bent uitgenodigd om docent te worden bij ${studioName}. Accepteer de uitnodiging om toegang te krijgen tot de docent interface.`,
        action_type: 'teacher_invitation_accept_decline',
        action_data: { invitation_id: invitation.id, studio_id: studioId, studio_name: studioName },
        read: false
      })
      .select()
      .single()

    if (notifErr || !notification?.id) {
      console.error('Failed creating notification during refresh:', notifErr)
      return NextResponse.json({ error: 'failed_create_notification' }, { status: 500 })
    }

    // Best-effort: mirror in-app notification to Web Push
    try {
      await sendPushToUserIds([matchedUser.id], {
        title: notification.title,
        body: notification.message,
        url: '/notifications',
      })
    } catch (e) {
      console.warn('Failed sending push for teacher invitation refresh', e)
    }

    // Link notification back to invitation
    const { error: linkErr } = await admin
      .from('pending_teacher_invitations')
      .update({ notification_id: notification.id })
      .eq('id', invitation.id)

    if (linkErr) {
      console.error('Failed linking notification to invitation during refresh:', linkErr)
      // still return success with created notification id
    }

    return NextResponse.json({ success: true, message: 'Notification created and linked', notification_id: notification.id })
  } catch (err: any) {
    console.error('Error in invitation refresh route:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}
