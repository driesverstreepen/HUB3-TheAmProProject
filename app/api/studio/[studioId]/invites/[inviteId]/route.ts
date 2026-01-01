import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkStudioAccess } from '@/lib/supabaseHelpers'
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

// DELETE /api/studio/[studioId]/invites/[inviteId] - Revoke invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ studioId: string; inviteId: string }> }
) {
  try {
    const { studioId, inviteId } = await params

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user has access to this studio
    const access = await checkStudioAccess(supabase, studioId, user.id)
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: 'You do not have permission to revoke invites for this studio' },
        { status: 403 }
      )
    }

    // Delete the invite
    const { error } = await supabaseAdmin
      .from('studio_invites')
      .delete()
      .eq('id', inviteId)
      .eq('studio_id', studioId)

    if (error) {
      console.error('Error revoking invite:', error)
      return NextResponse.json(
        { error: 'Failed to revoke invitation' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in invite DELETE:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
