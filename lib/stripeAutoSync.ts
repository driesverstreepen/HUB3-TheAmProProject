import { createClient } from '@supabase/supabase-js'
import { createStripeProduct, createStripePrice } from './stripe'

/**
 * Automatically sync a program to Stripe after creation
 * This is called from the program creation API
 */
export async function autoSyncProgramToStripe(
  programId: string,
  studioId: string,
  programTitle: string,
  programDescription: string | null,
  price: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get studio and its stripe metadata
    const { data: studio } = await supabase
      .from('studios')
      .select('id, naam, stripe_account_id, stripe_account_data, stripe_payouts_enabled')
      .eq('id', studioId)
      .single()

    const stripeAccount = studio?.stripe_account_id ? {
      stripe_account_id: studio.stripe_account_id,
      ...(studio.stripe_account_data || {})
    } : null

    // If no Stripe account or not ready, skip sync (not an error)
    if (!stripeAccount || !stripeAccount.charges_enabled) {
      console.log(`[Auto-sync] Skipping program ${programId} - Stripe not configured for studio ${studioId}`)
      return { success: true } // Not an error, just skip
    }

    // Check if product already exists
    const { data: existingProduct } = await supabase
      .from('stripe_products')
      .select('*')
      .eq('program_id', programId)
      .eq('stripe_account_id', stripeAccount.stripe_account_id)
      .single()

    if (existingProduct) {
      console.log(`[Auto-sync] Product already exists for program ${programId}`)
      return { success: true }
    }

    // studio was already fetched above; reuse its name

    // Create Stripe product
    const stripeProduct = await createStripeProduct(
      programTitle,
      programDescription || `${programTitle} - ${studio?.naam || 'Studio'}`,
      stripeAccount.stripe_account_id
    )

    console.log(`[Auto-sync] Created Stripe product ${stripeProduct.id} for program ${programId}`)

    // Save product to database
    const { data: savedProduct, error: productError } = await supabase
      .from('stripe_products')
      .insert({
        program_id: programId,
        studio_id: studioId,
        stripe_product_id: stripeProduct.id,
        stripe_account_id: stripeAccount.stripe_account_id,
        name: programTitle,
        description: programDescription,
        active: true
      })
      .select()
      .single()

    if (productError) {
      console.error('[Auto-sync] Error saving product:', productError)
      return { success: false, error: productError.message }
    }

    // Create price if provided and > 0 — store price fields on stripe_products (single-price model)
    if (price && price > 0) {
      const stripePrice = await createStripePrice(
        stripeProduct.id,
        Math.round(price * 100), // Convert to cents
        'eur',
        undefined, // One-time payment by default
        stripeAccount.stripe_account_id
      )

      console.log(`[Auto-sync] Created Stripe price ${stripePrice.id} for product ${stripeProduct.id}`)

      await supabase
        .from('stripe_products')
        .update({
          stripe_price_id: stripePrice.id,
          price_amount: Math.round(price * 100),
          price_currency: 'eur',
          price_interval: null,
          price_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', savedProduct.id)
    }

    return { success: true }
  } catch (error: any) {
    console.error('[Auto-sync] Error syncing program to Stripe:', error)
    // Don't fail program creation if Stripe sync fails
    return { success: false, error: error.message }
  }
}
