import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createStripeProduct, createStripePrice } from '@/lib/stripe'

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
    const { program_id, price_amount, price_type = 'one_time', currency = 'eur' } = body

    // Get program details
    const { data: program, error: programError } = await supabase
      .from('programs')
      .select('*, studios(*)')
      .eq('id', program_id)
      .single()

    if (programError || !program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    // Check if user is studio admin for this program's studio
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('studio_id')
      .eq('user_id', user.id)
      .eq('role', 'studio_admin')
      .eq('studio_id', program.studio_id)
      .single()

    if (!roleData) {
      return NextResponse.json({ error: 'Forbidden: Not a studio admin' }, { status: 403 })
    }

    // Get studio's Stripe Connect account info from studios table
    const { data: studio } = await supabase
      .from('studios')
      .select('id, stripe_account_id, stripe_account_data, stripe_payouts_enabled')
      .eq('id', program.studio_id)
      .single()

    const stripeAccount = studio?.stripe_account_id ? {
      stripe_account_id: studio.stripe_account_id,
      ...(studio.stripe_account_data || {})
    } : null

    if (!stripeAccount || !stripeAccount.charges_enabled) {
      return NextResponse.json({ 
        error: 'Stripe account not configured or not enabled for charges' 
      }, { status: 400 })
    }

    // Check if product already exists
    const { data: existingProduct } = await supabase
      .from('stripe_products')
      .select('*')
      .eq('program_id', program_id)
      .eq('stripe_account_id', stripeAccount.stripe_account_id)
      .single()

    if (existingProduct) {
      return NextResponse.json({ 
        error: 'Product already synced to Stripe',
        product_id: existingProduct.stripe_product_id 
      }, { status: 400 })
    }

    // Create Stripe product
    const stripeProduct = await createStripeProduct(
      program.titel,
      program.beschrijving || `${program.titel} - ${program.studios.naam}`,
      stripeAccount.stripe_account_id
    )

    // Save product to database
    const { data: savedProduct, error: productDbError } = await supabase
      .from('stripe_products')
      .insert({
        program_id: program.id,
        studio_id: program.studio_id,
        stripe_product_id: stripeProduct.id,
        stripe_account_id: stripeAccount.stripe_account_id,
        name: program.titel,
        description: program.beschrijving,
        active: true
      })
      .select()
      .single()

    if (productDbError) {
      console.error('Database error saving product:', productDbError)
      throw productDbError
    }

    // Create Stripe price if amount provided — store price fields on the product row
    let savedPrice = null
    if (price_amount && price_amount > 0) {
      const interval = price_type === 'subscription_monthly' ? 'month' : 
                      price_type === 'subscription_yearly' ? 'year' : undefined

      const stripePrice = await createStripePrice(
        stripeProduct.id,
        Math.round(price_amount * 100), // Convert to cents
        currency,
        interval,
        stripeAccount.stripe_account_id
      )

      // Update product with price fields
      const { error: priceDbError } = await supabase
        .from('stripe_products')
        .update({
          stripe_price_id: stripePrice.id,
          price_amount: Math.round(price_amount * 100),
          price_currency: currency,
          price_interval: interval || null,
          price_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', savedProduct.id)

      if (priceDbError) {
        console.error('Database error saving price on product:', priceDbError)
      } else {
        savedPrice = {
          stripe_price_id: stripePrice.id,
          amount: Math.round(price_amount * 100),
          currency,
          interval: interval || null,
          active: true,
        }
      }
    }

    return NextResponse.json({
      success: true,
      product: savedProduct,
      price: savedPrice,
      stripe_product_id: stripeProduct.id
    })
  } catch (error: any) {
    console.error('Error syncing program to Stripe:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync program' },
      { status: 500 }
    )
  }
}

// Get sync status for a program
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

    const { searchParams } = new URL(request.url)
    const program_id = searchParams.get('program_id')

    if (!program_id) {
      return NextResponse.json({ error: 'program_id required' }, { status: 400 })
    }

    // Get product and prices
    const { data: product, error: productError } = await supabase
      .from('stripe_products')
      .select('*')
      .eq('program_id', program_id)
      .single()

    if (productError && productError.code !== 'PGRST116') {
      throw productError
    }

    return NextResponse.json({ 
      synced: !!product,
      product: product || null 
    })
  } catch (error: any) {
    console.error('Error checking sync status:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check status' },
      { status: 500 }
    )
  }
}
