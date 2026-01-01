import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getConnectAccount } from '@/lib/stripe'

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

    if (!studio_id) return NextResponse.json({ error: 'Missing studio_id' }, { status: 400 })

    // Check if user is studio admin
    const { data: studio, error: studioError } = await supabase
      .from('studios')
      .select('id, stripe_account_id, stripe_account_data, stripe_onboarded_at')
      .eq('id', studio_id)
      .maybeSingle()

    if (studioError) {
      console.error('Supabase error fetching studio for update-status:', studioError)
      return NextResponse.json({ error: 'Failed to fetch studio' }, { status: 500 })
    }

    if (!studio?.stripe_account_id) return NextResponse.json({ error: 'Stripe account not found' }, { status: 404 })

    // Fetch latest status from Stripe
    const account = await getConnectAccount(studio.stripe_account_id)

    // Prepare updated fields
    const updatedData = {
      ...((account && typeof account === 'object') ? account : {}),
      // keep any custom onboarding urls/fields if present
      ...(studio.stripe_account_data || {})
    }

    const updatePayload: any = {
      stripe_account_data: updatedData,
      stripe_payouts_enabled: !!account.payouts_enabled
    }

    // If account now appears onboarded, set stripe_onboarded_at if not set
    if (account.details_submitted && account.charges_enabled && !studio.stripe_onboarded_at) {
      updatePayload.stripe_onboarded_at = new Date().toISOString()
    }

    const { data: updated, error: updateError } = await supabase
      .from('studios')
      .update(updatePayload)
      .eq('id', studio.id)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      account: updated
    })
    
  } catch (error: any) {
    console.error('Error updating account status:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update account status' },
      { status: 500 }
    )
  }
}
