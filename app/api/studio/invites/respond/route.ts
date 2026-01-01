import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// POST /api/studio/invites/respond - Accept or decline studio admin invitation
export async function POST(request: NextRequest) {
  try {
    // Extract bearer token
    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'You must be logged in to respond to an invitation' }, { status: 401 })
    }
    const token = authHeader.substring('Bearer '.length)

    // User-scoped client with provided token
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const body = await request.json()
    const { invitation_id, action, notification_id, studio_id } = body

    if (!invitation_id || !action) {
      return NextResponse.json(
        { error: 'invitation_id and action are required' },
        { status: 400 }
      )
    }

    if (!['accept', 'decline'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be either "accept" or "decline"' },
        { status: 400 }
      )
    }

    // Get current user from token
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'You must be logged in to respond to an invitation' }, { status: 401 })
    }

    // Get the invite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('studio_invites')
      .select('*, studios(naam)')
      .eq('id', invitation_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: 'Invalid or already responded invitation' },
        { status: 404 }
      )
    }

    // Check if user's email matches the invite email
    const { data: userProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!userProfile || userProfile.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invitation is for a different email address' },
        { status: 403 }
      )
    }

    if (action === 'accept') {
      // Check if user is already a member
      const { data: existingMember } = await supabaseAdmin
        .from('studio_members')
        .select('id')
        .eq('studio_id', invite.studio_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existingMember) {
        // Update invite status anyway
        await supabaseAdmin
          .from('studio_invites')
          .update({ 
            status: 'accepted',
            responded_at: new Date().toISOString()
          })
          .eq('id', invite.id)

        return NextResponse.json(
          { error: 'You are already a member of this studio' },
          { status: 400 }
        )
      }

      // Add user to studio_members
      const { error: memberError } = await supabaseAdmin
        .from('studio_members')
        .insert({
          studio_id: invite.studio_id,
          user_id: user.id,
          role: invite.role,
          invited_by: invite.invited_by
        })

      if (memberError) {
        console.error('Error adding member:', memberError)
        return NextResponse.json(
          { error: 'Failed to join studio' },
          { status: 500 }
        )
      }

      // Update invite status
      await supabaseAdmin
        .from('studio_invites')
        .update({ 
          status: 'accepted',
          responded_at: new Date().toISOString()
        })
        .eq('id', invite.id)

      // Mark notification as read if it exists
      if (invite.notification_id) {
        await supabaseAdmin
          .from('notifications')
          .update({ read: true })
          .eq('id', invite.notification_id)
      }

      return NextResponse.json({
        success: true,
        action: 'accepted',
        studio_id: invite.studio_id,
        studio_name: (invite.studios as any)?.naam || 'Studio',
        role: invite.role,
        notification_id: notification_id || invite.notification_id
      })
    } else {
      // Decline invitation
      await supabaseAdmin
        .from('studio_invites')
        .update({ 
          status: 'declined',
          responded_at: new Date().toISOString()
        })
        .eq('id', invite.id)

      // Mark notification as read if it exists
      if (invite.notification_id) {
        await supabaseAdmin
          .from('notifications')
          .update({ read: true })
          .eq('id', invite.notification_id)
      }

      return NextResponse.json({
        success: true,
        action: 'declined'
      })
    }
  } catch (error) {
    console.error('Error responding to invite:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
