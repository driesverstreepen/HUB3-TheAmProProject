import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

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
    if (!studio_id) return NextResponse.json({ error: 'Missing studio_id' }, { status: 400 })

    // Check role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('studio_id')
      .eq('user_id', user.id)
      .eq('role', 'studio_admin')
      .eq('studio_id', studio_id)
      .single()

    if (!roleData) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: studio, error: studioError } = await supabase
      .from('studios')
      .select('id, stripe_account_id, stripe_account_data')
      .eq('id', studio_id)
      .maybeSingle()

    if (studioError) {
      console.error('Supabase error fetching studio for login link:', studioError)
      return NextResponse.json({ error: 'Failed to fetch studio' }, { status: 500 })
    }

    if (!studio?.stripe_account_id) return NextResponse.json({ error: 'Stripe account not found' }, { status: 404 })

    // Create a Stripe Express login link for the connected account
    const loginLink = await stripe.accounts.createLoginLink(studio.stripe_account_id)

    return NextResponse.json({ success: true, url: loginLink.url })
  } catch (error: any) {
    console.error('Error creating login link:', error)
    return NextResponse.json({ error: error.message || 'Failed to create login link' }, { status: 500 })
  }
}
