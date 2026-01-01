import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createConnectAccountLink } from '@/lib/stripe'

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { studio_id } = body

    if (!studio_id) {
      return NextResponse.json({ error: 'Missing studio_id' }, { status: 400 })
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

    // Get existing Stripe account id from studios
    const { data: studio, error: studioError } = await supabase
      .from('studios')
      .select('id, stripe_account_id, stripe_account_data')
      .eq('id', studio_id)
      .maybeSingle()

    if (studioError) {
      console.error('Supabase error fetching studio:', studioError)
      return NextResponse.json({ error: 'Failed to fetch studio' }, { status: 500 })
    }

    if (!studio?.stripe_account_id && !(studio?.stripe_account_data && studio.stripe_account_data.onboarding_url)) {
      return NextResponse.json({ error: 'Stripe account not found' }, { status: 404 })
    }

    // If we already have an onboarding_url in the stored account data, return it
    if (studio?.stripe_account_data && studio.stripe_account_data.onboarding_url) {
      return NextResponse.json({ success: true, onboarding_url: studio.stripe_account_data.onboarding_url })
    }

    // Otherwise create a fresh onboarding link for the connected account
    if (!studio?.stripe_account_id) {
      return NextResponse.json({ error: 'Stripe account id missing' }, { status: 404 })
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const accountLink = await createConnectAccountLink(
      studio.stripe_account_id,
      `${origin}/studio/${studio_id}/stripe/onboarding/refresh`,
      `${origin}/studio/${studio_id}/stripe/onboarding/return`
    )

    // Update onboarding URL in studios.stripe_account_data
    const updatedAccountData = {
      ...(studio.stripe_account_data || {}),
      onboarding_url: accountLink.url,
      onboarding_expires_at: new Date(accountLink.expires_at * 1000).toISOString()
    }

    await supabase
      .from('studios')
      .update({ stripe_account_data: updatedAccountData })
      .eq('id', studio.id)

    return NextResponse.json({
      success: true,
      onboarding_url: accountLink.url,
      refresh_url: `${origin}/studio/${studio_id}/stripe/onboarding/refresh`,
      return_url: `${origin}/studio/${studio_id}/stripe/onboarding/return`
    })
  } catch (error: any) {
    console.error('Error refreshing onboarding link:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to refresh onboarding link' },
      { status: 500 }
    )
  }
}
