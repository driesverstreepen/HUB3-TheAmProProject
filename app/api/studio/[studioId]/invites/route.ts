import { NextRequest, NextResponse } from 'next/server'
import { checkStudioAccess } from '@/lib/supabaseHelpers'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUserIds } from '@/lib/pushDispatch'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabaseAdmin = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST /api/studio/[studioId]/invites - Send invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studioId: string }> }
) {
  try {
    const { studioId } = await params
    const body = await request.json()
    const { email, role = 'admin' } = body

    const allowedRoles = new Set(['admin', 'bookkeeper', 'comms', 'viewer'])
    const requestedRole = String(role || 'admin')
    if (!allowedRoles.has(requestedRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.substring('Bearer '.length)

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has access to this studio (owner or admin) using service role to avoid RLS recursion issues
    const access = await checkStudioAccess(supabaseAdmin, studioId, user.id)
    if (!access.hasAccess || !['owner', 'admin'].includes(String(access.role))) {
      return NextResponse.json(
        { error: 'You do not have permission to invite members to this studio' },
        { status: 403 }
      )
    }

    // Check if email is already a member
    const { data: existingMember } = await supabaseAdmin
      .from('studio_members')
      .select('id')
      .eq('studio_id', studioId)
      .eq('user_id', user.id)
      .maybeSingle()

    // Get user by email to check if they already exist
    const { data: existingUserData } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existingUserData) {
      // Check if this user is already a member
      const { data: memberCheck } = await supabaseAdmin
        .from('studio_members')
        .select('id')
        .eq('studio_id', studioId)
        .eq('user_id', existingUserData.user_id)
        .maybeSingle()

      if (memberCheck) {
        return NextResponse.json(
          { error: 'This user is already a member of your studio' },
          { status: 400 }
        )
      }
    }

    // Check if there's already a pending invite for this email
    const { data: existingInvite } = await supabaseAdmin
      .from('studio_invites')
      .select('id, status')
      .eq('studio_id', studioId)
      .eq('email', email.trim().toLowerCase())
      .eq('status', 'pending')
      .maybeSingle()

    if (existingInvite) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email' },
        { status: 400 }
      )
    }

    // Get studio name for notification
    const { data: studioData } = await supabaseAdmin
      .from('studios')
      .select('naam')
      .eq('id', studioId)
      .single()

    const studioName = studioData?.naam || 'Studio'

    // Get inviter name
    const { data: inviterProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .maybeSingle()

    const inviterName = inviterProfile
      ? `${inviterProfile.first_name || ''} ${inviterProfile.last_name || ''}`.trim()
      : 'Studio admin'

    // Create invite first
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('studio_invites')
      .insert({
        studio_id: studioId,
        email: email.trim().toLowerCase(),
        role: requestedRole,
        invited_by: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (inviteError) {
      console.error('Error creating invite:', inviteError)
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      )
    }

    // If user exists, create notification
    if (existingUserData) {
      const roleLabel = requestedRole === 'admin'
        ? 'admin'
        : requestedRole === 'bookkeeper'
          ? 'boekhouder'
          : requestedRole === 'comms'
            ? 'communicatie'
            : 'alleen-lezen'

      const { data: notification, error: notifError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: existingUserData.user_id,
          type: 'studio_admin_invitation',
          title: `Studio Admin Uitnodiging - ${studioName}`,
          message: `${inviterName} heeft je uitgenodigd om ${roleLabel} te worden van ${studioName}.`,
          action_type: 'studio_admin_invitation_accept_decline',
          action_data: {
            invitation_id: invite.id,
            studio_id: studioId,
            studio_name: studioName,
            role: requestedRole
          },
          read: false
        })
        .select()
        .single()

      if (!notifError && notification) {
        // Link notification to invite
        await supabaseAdmin
          .from('studio_invites')
          .update({ notification_id: notification.id })
          .eq('id', invite.id)

        // Best-effort: mirror the in-app notification to Web Push
        try {
          await sendPushToUserIds([existingUserData.user_id], {
            title: notification.title,
            body: notification.message,
          })
        } catch (e) {
          console.warn('Failed to send push for studio admin invite', e)
        }
      }
    }

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        has_account: !!existingUserData
      }
    })
  } catch (error) {
    console.error('Error in invite POST:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/studio/[studioId]/invites - List pending invites
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studioId: string }> }
) {
  try {
    const { studioId } = await params

    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.substring('Bearer '.length)

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has access to this studio using service role to avoid RLS recursion issues
    const access = await checkStudioAccess(supabaseAdmin, studioId, user.id)
    if (!access.hasAccess || !['owner', 'admin'].includes(String(access.role))) {
      return NextResponse.json(
        { error: 'You do not have permission to view invites for this studio' },
        { status: 403 }
      )
    }

    // Get pending invites
    const { data: invites, error } = await supabaseAdmin
      .from('studio_invites')
      .select('*')
      .eq('studio_id', studioId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching invites:', error)
      return NextResponse.json(
        { error: 'Failed to fetch invites' },
        { status: 500 }
      )
    }

    return NextResponse.json({ invites })
  } catch (error) {
    console.error('Error in invite GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
