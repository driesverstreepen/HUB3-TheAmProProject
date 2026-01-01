import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUserIds } from '@/lib/pushDispatch'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// This endpoint is intended to be called from our own frontend immediately after signup
// to create notifications for any pending_teacher_invitations matching the new user's email.
// It uses the Supabase service role key to bypass RLS. Do NOT expose this publicly in other apps.
export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const body = await req.json()
    const userId = body?.userId || body?.id
    const email = (body?.email || '').toLowerCase()

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing user id or email' }, { status: 400 })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Find pending invitations for this email
    const { data: pendingInvites, error: pendingErr } = await admin
      .from('pending_teacher_invitations')
      .select('id, studio_id, invited_at, notification_id')
      .eq('email', email)
      .eq('status', 'pending')

    if (pendingErr) {
      console.error('Error fetching pending invitations:', pendingErr)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    if (!pendingInvites || pendingInvites.length === 0) {
      return NextResponse.json({ success: true, created: 0 })
    }

    let created = 0

    for (const inv of pendingInvites) {
      const studioId = inv.studio_id

      // If the invitation already has a linked notification, update that notification's user_id
      if (inv.notification_id) {
        const { error: updNotifErr } = await admin
          .from('notifications')
          .update({ user_id: userId })
          .eq('id', inv.notification_id)

        if (updNotifErr) {
          console.error('Failed updating existing notification user_id for invite:', inv.id, updNotifErr)
        } else {
          created++
        }
        continue
      }

      // Load studio name
      const { data: studio } = await admin
        .from('studios')
        .select('id, naam')
        .eq('id', studioId)
        .maybeSingle()

      const studioName = studio?.naam || 'Studio'

      // Create notification for the new user
      const { data: notification, error: notifErr } = await admin
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'teacher_invitation',
          title: 'Docent Uitnodiging',
          message: `Je bent uitgenodigd om docent te worden bij ${studioName}. Accepteer de uitnodiging om toegang te krijgen tot de docent interface.`,
          action_type: 'teacher_invitation_accept_decline',
          action_data: {
            invitation_id: inv.id,
            studio_id: studioId,
            studio_name: studioName,
          },
          read: false,
        })
        .select()
        .single()

      if (notifErr) {
        console.error('Failed creating notification for pending invite:', notifErr)
        continue
      }

      // Best-effort: mirror in-app notification to Web Push
      try {
        await sendPushToUserIds([userId], {
          title: notification?.title || 'Docent Uitnodiging',
          body: notification?.message || `Je bent uitgenodigd om docent te worden bij ${studioName}.`,
          url: '/notifications',
        })
      } catch {
        // ignore
      }

      // Link notification id back to invitation
      if (notification?.id) {
        const { error: updErr } = await admin
          .from('pending_teacher_invitations')
          .update({ notification_id: notification.id })
          .eq('id', inv.id)

        if (updErr) {
          console.error('Failed updating pending invitation with notification_id:', updErr)
        }
      }

      created++
    }

    return NextResponse.json({ success: true, created })
  } catch (err: any) {
    console.error('Error in process-pending-invitations:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}
