import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      )
    }

    // Get the authorization token from the request
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json(
        { error: 'Missing authorization token' },
        { status: 401 }
      )
    }

    // Create Supabase client with the user's token for verification
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    })

    // Create admin client with service role for privileged operations
    const adminClient = SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null

    const body = await request.json()
    const { action, invitation_id, studio_id, notification_id, user_id } = body

    if (!action || !invitation_id || !studio_id || !notification_id || !user_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "accept" or "decline"' },
        { status: 400 }
      )
    }

    // Verify the user is authenticated and matches the notification recipient
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== user_id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify the notification exists and belongs to this user
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notification_id)
      .eq('user_id', user_id)
      .single()

    if (notifError || !notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      )
    }

    // Verify the invitation exists
    const { data: invitation, error: inviteError } = await supabase
      .from('pending_teacher_invitations')
      .select('*')
      .eq('id', invitation_id)
      .eq('studio_id', studio_id)
      .single()

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      )
    }

    if (action === 'accept') {
      // Add teacher-studio link using admin client to bypass RLS
      if (!adminClient) {
        return NextResponse.json(
          { error: 'Service role not configured' },
          { status: 500 }
        )
      }

      // Insert into studio_teachers junction table.
      // Use upsert (on conflict do nothing) to avoid duplicate-link errors
      // If the link already exists, continue — we still want to mark the invitation accepted.
      const { error: linkError } = await adminClient
        .from('studio_teachers')
        .upsert(
          {
            user_id: user_id,
            studio_id: studio_id,
            added_by: user_id // user is adding themselves by accepting invitation
          },
          { onConflict: 'user_id,studio_id' }
        )

      if (linkError) {
        // If the database reports a duplicate key on user_roles (race condition),
        // log a warning and proceed. Otherwise return an error.
        const isDuplicate = linkError.code === '23505' || (linkError.message && linkError.message.includes('duplicate'))
        if (isDuplicate) {
          console.warn('studio_teachers link already exists or duplicate key encountered — proceeding:', linkError)
        } else {
          console.error('Error adding teacher-studio link:', linkError)
          console.error('Error details:', JSON.stringify(linkError, null, 2))
          console.error('Attempted insert:', { user_id, studio_id })
          return NextResponse.json(
            {
              error: 'Failed to add teacher role',
              details: linkError.message || linkError.toString()
            },
            { status: 500 }
          )
        }
      }

      // Update invitation status to accepted (using admin client)
      const { error: updateError } = await adminClient
        .from('pending_teacher_invitations')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString()
        })
        .eq('id', invitation_id)

      if (updateError) {
        console.error('Error updating invitation status:', updateError)
      }

      // Mark notification as read (using admin client)
      await adminClient
        .from('notifications')
        .update({ read: true })
        .eq('id', notification_id)

      return NextResponse.json({
        success: true,
        message: 'Teacher invitation accepted'
      })
    } else {
      // Decline - just update status (using admin client for consistency)
      if (!adminClient) {
        return NextResponse.json(
          { error: 'Service role not configured' },
          { status: 500 }
        )
      }

      const { error: updateError } = await adminClient
        .from('pending_teacher_invitations')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString()
        })
        .eq('id', invitation_id)

      if (updateError) {
        console.error('Error updating invitation status:', updateError)
        return NextResponse.json(
          { error: 'Failed to update invitation status' },
          { status: 500 }
        )
      }

      // Mark notification as read
      await adminClient
        .from('notifications')
        .update({ read: true })
        .eq('id', notification_id)

      return NextResponse.json({
        success: true,
        message: 'Teacher invitation declined'
      })
    }
  } catch (error: any) {
    console.error('Error handling teacher invitation response:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
