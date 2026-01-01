import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUserIds } from '@/lib/pushDispatch'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_SECRET = process.env.ADMIN_SECRET || ''

// Admin endpoint to process existing pending_teacher_invitations and create
// notifications for any matching auth.users. Protect this endpoint with a
// shared secret passed in header `x-admin-secret` (set ADMIN_SECRET env var).
//
// Request body (JSON): { email?: string }
// If `email` is provided, only that email will be processed. Otherwise, all
// pending invitations will be scanned and processed when a matching auth.user exists.
export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const provided = req.headers.get('x-admin-secret') || ''
    if (ADMIN_SECRET && provided !== ADMIN_SECRET) {
      return NextResponse.json({ error: 'Invalid admin secret' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const emailFilter = body?.email ? String(body.email).toLowerCase() : null

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Helper: find auth user by email
    const findUserByEmail = async (email: string) => {
      // Query auth.users table directly (service role allowed)
      const { data: user, error } = await admin
        .from('auth.users')
        .select('id, email')
        .ilike('email', email) // use ilike for case-insensitive match
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Error querying auth.users for', email, error)
        return null
      }
      return user || null
    }

    // Fetch pending invitations (optionally filtered by email)
    // Include notification_id and sent_at so we can update existing notifications
    const pendingQuery = admin
      .from('pending_teacher_invitations')
      .select('id, email, studio_id, invited_at, notification_id, sent_at')
      .eq('status', 'pending')

    const { data: pendingInvites, error: pendingErr } = await (emailFilter
      ? pendingQuery.ilike('email', emailFilter).limit(1000)
      : pendingQuery.limit(5000)) // reasonable safety limit

    if (pendingErr) {
      console.error('Error fetching pending invitations:', pendingErr)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    if (!pendingInvites || pendingInvites.length === 0) {
      return NextResponse.json({ success: true, created: 0 })
    }

    const results: Array<{ invitation_id: string; notification_id?: string | null; user_id?: string | null; processed: boolean; reason?: string }> = []

    for (const inv of pendingInvites) {
      try {
        const invEmail = (inv.email || '').toLowerCase()

        // If caller supplied an email param, ensure we match it
        if (emailFilter && invEmail !== emailFilter) {
          results.push({ invitation_id: inv.id, processed: false, reason: 'email_mismatch' })
          continue
        }

        // Try find a matching auth user
        const user = await findUserByEmail(invEmail)
        if (!user || !user.id) {
          results.push({ invitation_id: inv.id, processed: false, reason: 'no_user' })
          continue
        }

        // Load studio name for message
        const { data: studio } = await admin
          .from('studios')
          .select('id, naam')
          .eq('id', inv.studio_id)
          .maybeSingle()

        const studioName = studio?.naam || 'Studio'

        // If there's already a linked notification, update it to include studio info
        if (inv.notification_id) {
          try {
            const { error: updNotifErr } = await admin
              .from('notifications')
              .update({
                user_id: user.id,
                message: `Je bent uitgenodigd om docent te worden bij ${studioName}. Accepteer de uitnodiging om toegang te krijgen tot de docent interface.`,
                action_data: {
                  invitation_id: inv.id,
                  studio_id: inv.studio_id,
                  studio_name: studioName,
                },
              })
              .eq('id', inv.notification_id)

            if (updNotifErr) {
              console.error('Failed updating existing notification for invite:', updNotifErr)
              results.push({ invitation_id: inv.id, processed: false, reason: 'notif_update_failed' })
              continue
            }

            // Set sent_at on the invitation to now (or the notification created_at if desired)
            const { error: sentErr } = await admin
              .from('pending_teacher_invitations')
              .update({ sent_at: new Date().toISOString() })
              .eq('id', inv.id)

            if (sentErr) {
              console.error('Failed setting sent_at on invitation:', sentErr)
            }

            results.push({ invitation_id: inv.id, notification_id: inv.notification_id, user_id: user.id, processed: true })
            continue
          } catch (e: any) {
            console.error('Unexpected error updating existing notification for invite', inv.id, e)
            results.push({ invitation_id: inv.id, processed: false, reason: e?.message || 'unexpected' })
            continue
          }
        }

        // Create notification for the existing user
        const { data: notification, error: notifErr } = await admin
          .from('notifications')
          .insert({
            user_id: user.id,
            type: 'teacher_invitation',
            title: 'Docent Uitnodiging',
            message: `Je bent uitgenodigd om docent te worden bij ${studioName}. Accepteer de uitnodiging om toegang te krijgen tot de docent interface.`,
            action_type: 'teacher_invitation_accept_decline',
            action_data: {
              invitation_id: inv.id,
              studio_id: inv.studio_id,
              studio_name: studioName,
            },
            read: false,
          })
          .select()
          .single()

        if (notifErr || !notification?.id) {
          console.error('Failed creating notification for pending invite:', notifErr)
          results.push({ invitation_id: inv.id, processed: false, reason: 'notif_create_failed' })
          continue
        }

        // Best-effort: mirror in-app notification to Web Push
        try {
          await sendPushToUserIds([user.id], {
            title: notification.title,
            body: notification.message,
            url: '/notifications',
          })
        } catch {
          // ignore
        }

        // Link notification id back to invitation and set sent_at
        const { error: updErr } = await admin
          .from('pending_teacher_invitations')
          .update({ notification_id: notification.id, sent_at: notification.created_at || new Date().toISOString() })
          .eq('id', inv.id)

        if (updErr) {
          console.error('Failed updating pending invitation with notification_id:', updErr)
          results.push({ invitation_id: inv.id, notification_id: notification.id, user_id: user.id, processed: true, reason: 'updated_failed' })
          continue
        }

        results.push({ invitation_id: inv.id, notification_id: notification.id, user_id: user.id, processed: true })
      } catch (e: any) {
        console.error('Unexpected error processing invitation', inv.id, e)
        results.push({ invitation_id: inv.id, processed: false, reason: e?.message || 'unexpected' })
      }
    }

    const createdCount = results.filter(r => r.processed).length
    return NextResponse.json({ success: true, created: createdCount, results })
  } catch (err: any) {
    console.error('Error in admin/process-pending-invitations:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}
