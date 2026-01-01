import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createConnectAccount, createConnectAccountLink } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    // Authenticate: accept either cookie-based session or Authorization: Bearer <token>
    const cookieHeader = request.headers.get('cookie')
    const authBearer = request.headers.get('authorization')
    if (!cookieHeader && !authBearer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseKey, cookieHeader ? {
      global: { headers: { cookie: cookieHeader } }
    } : undefined)

    const token = authBearer ? authBearer.split(' ')[1] : undefined
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

  const body = await request.json()
  const { studio_id, email, business_name, country = 'BE' } = body

  if (!studio_id) {
    return NextResponse.json({ error: 'studio_id required' }, { status: 400 })
  }

  // Check if user is studio admin for this studio
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('studio_id, role')
      .eq('user_id', user.id)
      .eq('role', 'studio_admin')
      .eq('studio_id', studio_id)
      .maybeSingle()

    if (roleError) {
      console.error('Supabase error checking role:', roleError)
      return NextResponse.json({ error: 'Failed to verify role' }, { status: 500 })
    }

    if (!roleData) {
      return NextResponse.json({ error: 'Forbidden: Not a studio admin' }, { status: 403 })
    }

    // Check if studio already has a Stripe account (stored on studios)
    const { data: existingStudio, error: existingError } = await supabase
      .from('studios')
      .select('id, stripe_account_id')
      .eq('id', studio_id)
      .maybeSingle()

    if (existingError) {
      console.error('Supabase error checking existing studio:', existingError)
      return NextResponse.json({ error: 'Failed to check studio' }, { status: 500 })
    }

    if (existingStudio?.stripe_account_id) {
      return NextResponse.json({ 
        error: 'Studio already has a Stripe Connect account',
        account_id: existingStudio.stripe_account_id 
      }, { status: 400 })
    }

  // Create Stripe Connect account. Email and business_name are optional; Stripe will handle onboarding/login.
  const account = await createConnectAccount(email || undefined, business_name || undefined, country)

    // Save account id and metadata to studios table
    const { data: stripeAccount, error: dbError } = await supabase
      .from('studios')
      .update({
        stripe_account_id: account.id,
        stripe_account_type: 'express',
        stripe_account_data: account,
        stripe_payouts_enabled: account.payouts_enabled || false
      })
      .eq('id', studio_id)
      .select()
      .maybeSingle()

    if (dbError) {
      console.error('Database error saving studio stripe account:', dbError)
      return NextResponse.json({ error: 'Failed to save stripe account' }, { status: 500 })
    }

    // Create onboarding link
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const accountLink = await createConnectAccountLink(
      account.id,
      `${origin}/studio/${studio_id}/stripe/onboarding/refresh`,
      `${origin}/studio/${studio_id}/stripe/onboarding/return`
    )

    // Update onboarding URL in studios.stripe_account_data
    const updatedAccountData = {
      ...((stripeAccount && stripeAccount.stripe_account_data) || {}),
      onboarding_url: accountLink.url,
      onboarding_expires_at: new Date(accountLink.expires_at * 1000).toISOString()
    }

    const { error: updateOnboardingError } = await supabase
      .from('studios')
      .update({ stripe_account_data: updatedAccountData })
      .eq('id', studio_id)

    if (updateOnboardingError) {
      console.error('Failed updating onboarding URL on studio:', updateOnboardingError)
      // not fatal for the user flow; continue and return the onboarding_url
    }

    return NextResponse.json({
      success: true,
      account_id: account.id,
      onboarding_url: accountLink.url,
      refresh_url: `${origin}/studio/${studio_id}/stripe/onboarding/refresh`,
      return_url: `${origin}/studio/${studio_id}/stripe/onboarding/return`
    })
  } catch (error: any) {
    console.error('Error creating Connect account:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create Stripe Connect account' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie')
    const authBearer = request.headers.get('authorization')
    if (!cookieHeader && !authBearer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseKey, cookieHeader ? {
      global: { headers: { cookie: cookieHeader } }
    } : undefined)

    const token = authBearer ? authBearer.split(' ')[1] : undefined
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get studio_id from query params
    const { searchParams } = new URL(request.url)
    const studio_id = searchParams.get('studio_id')

    if (!studio_id) {
      return NextResponse.json({ error: 'studio_id required' }, { status: 400 })
    }

    // Check if user is studio admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('studio_id')
      .eq('user_id', user.id)
      .eq('role', 'studio_admin')
      .eq('studio_id', studio_id)
      .single()

    if (!roleData) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get Stripe account info from studios
    const { data, error } = await supabase
      .from('studios')
      .select('id, stripe_account_id, stripe_account_data, stripe_onboarded_at, stripe_payouts_enabled')
      .eq('id', studio_id)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({ data: data || null })
  } catch (error: any) {
    console.error('Error fetching Connect account:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch account' },
      { status: 500 }
    )
  }
}
