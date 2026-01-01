import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const { userId, studioId } = await request.json()

    if (!userId || !studioId) {
      return NextResponse.json({ error: 'Missing userId or studioId' }, { status: 400 })
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Check current role
    const { data: currentRole, error: checkError } = await adminClient
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    console.log('Current role:', currentRole)

    // Upsert the role
    const { data: updatedRole, error: upsertError } = await adminClient
      .from('user_roles')
      .upsert({
        user_id: userId,
        role: 'studio_admin',
        studio_id: studioId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single()

    if (upsertError) {
      console.error('Error upserting role:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Role updated successfully',
      before: currentRole,
      after: updatedRole
    })
  } catch (err: any) {
    console.error('Error in fix-role route:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
