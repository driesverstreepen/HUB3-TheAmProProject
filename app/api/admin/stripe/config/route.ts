import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('cookie')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create Supabase client with user's session
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { cookie: authHeader } }
    })

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is super admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .single()

    if (!roleData) {
      return NextResponse.json({ error: 'Forbidden: Super admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const {
      stripe_publishable_key,
      stripe_secret_key,
      webhook_secret,
      platform_fee_percent,
      is_live_mode,
      currency
    } = body

    // TODO: Encrypt secret keys before storing (use crypto library)
    // For now, we'll store them as-is (NOT RECOMMENDED FOR PRODUCTION)
    const configData: any = {
      stripe_publishable_key,
      platform_fee_percent,
      is_live_mode,
      currency
    }

    if (stripe_secret_key) {
      // TODO: Encrypt this
      configData.stripe_secret_key_encrypted = stripe_secret_key
    }

    if (webhook_secret) {
      // TODO: Encrypt this
      configData.webhook_secret_encrypted = webhook_secret
    }

    // Check if config exists
    const { data: existing } = await supabaseClient
      .from('platform_stripe_config')
      .select('id')
      .single()

    let result
    if (existing) {
      // Update existing config
      result = await supabaseClient
        .from('platform_stripe_config')
        .update(configData)
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      // Insert new config
      result = await supabaseClient
        .from('platform_stripe_config')
        .insert(configData)
        .select()
        .single()
    }

    if (result.error) {
      throw result.error
    }

    // Also update environment variable for server-side Stripe client
    // Note: In production, use a secrets manager
    if (stripe_secret_key) {
      process.env.STRIPE_SECRET_KEY = stripe_secret_key
    }
    if (stripe_publishable_key) {
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = stripe_publishable_key
    }
    if (webhook_secret) {
      process.env.STRIPE_WEBHOOK_SECRET = webhook_secret
    }

    return NextResponse.json({ 
      success: true,
      message: 'Configuration saved successfully' 
    })
  } catch (error: any) {
    console.error('Error saving Stripe config:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save configuration' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('cookie')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { cookie: authHeader } }
    })

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is super admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .single()

    if (!roleData) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get config (without secret keys)
    const { data, error } = await supabaseClient
      .from('platform_stripe_config')
      .select('id, stripe_publishable_key, platform_fee_percent, is_live_mode, currency')
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({ data: data || null })
  } catch (error: any) {
    console.error('Error loading Stripe config:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load configuration' },
      { status: 500 }
    )
  }
}
