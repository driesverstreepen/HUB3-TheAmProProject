import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function DELETE(
  request: NextRequest,
  { params }: { params: any }
) {
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

    if (!adminClient) {
      return NextResponse.json(
        { error: 'Service role not configured' },
        { status: 500 }
      )
    }

    const { studioId, teacherId } = params

    if (!studioId || !teacherId) {
      return NextResponse.json(
        { error: 'Missing studioId or teacherId' },
        { status: 400 }
      )
    }

    // Verify the user is authenticated and is a studio admin for this studio
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is admin of this studio
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, studio_id')
      .eq('user_id', user.id)
      .single()

    if (roleError || !userRole || userRole.role !== 'studio_admin' || userRole.studio_id !== studioId) {
      return NextResponse.json(
        { error: 'You must be a studio admin to remove teachers' },
        { status: 403 }
      )
    }

    // Delete the studio_teachers link
    // The database trigger will automatically downgrade the user to 'user' role
    // if this was their last studio link
    const { error: deleteError } = await adminClient
      .from('studio_teachers')
      .delete()
      .eq('user_id', teacherId)
      .eq('studio_id', studioId)

    if (deleteError) {
      console.error('Error removing teacher-studio link:', deleteError)
      return NextResponse.json(
        { error: 'Failed to remove teacher' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Teacher removed from studio'
    })
  } catch (error: any) {
    console.error('Error removing teacher:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
