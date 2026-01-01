import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// POST /api/studio/invites/accept - Accept invitation and join studio
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'You must be logged in to accept an invitation' },
        { status: 401 }
      )
    }

    // Get the invite by token
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('studio_invites')
      .select('*, studios(naam)')
      .eq('token', token)
      .is('accepted_at', null)
      .maybeSingle()

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 404 }
      )
    }

    // Check if invite is expired
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 400 }
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

    // Check if user is already a member
    const { data: existingMember } = await supabaseAdmin
      .from('studio_members')
      .select('id')
      .eq('studio_id', invite.studio_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMember) {
      // Mark invite as accepted anyway
      await supabaseAdmin
        .from('studio_invites')
        .update({ accepted_at: new Date().toISOString() })
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

    // Mark invite as accepted
    await supabaseAdmin
      .from('studio_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    return NextResponse.json({
      success: true,
      studio_id: invite.studio_id,
      studio_name: (invite.studios as any)?.naam || 'Studio',
      role: invite.role
    })
  } catch (error) {
    console.error('Error accepting invite:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
