import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { userId, photoUrl } = await request.json()

    console.log('API called with:', { userId, photoUrl })

    if (!userId || !photoUrl) {
      return NextResponse.json({ error: 'Missing userId or photoUrl' }, { status: 400 })
    }

    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceRoleKey
    })

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Check if profile exists
    const { data: existingProfile, error: selectError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .single()

    console.log('Profile check result:', { existingProfile, selectError })

    let result
    if (existingProfile && !selectError) {
      console.log('Updating existing profile...')
      // Update existing profile
      result = await supabaseAdmin
        .from('user_profiles')
        .update({
          photo_url: photoUrl,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
      console.log('Update result:', result)
    } else {
      console.log('Inserting new profile...')
      // Insert new profile
      result = await supabaseAdmin
        .from('user_profiles')
        .insert({
          user_id: userId,
          photo_url: photoUrl,
          updated_at: new Date().toISOString()
        })
      console.log('Insert result:', result)
    }

    if (result.error) {
      console.error('Database error:', result.error)
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    console.log('Success!')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}