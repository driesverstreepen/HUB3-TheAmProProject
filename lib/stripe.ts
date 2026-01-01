import Stripe from 'stripe'

// Initialize Stripe with secret key from environment
// This should only be used on the server-side (API routes)
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-10-29.clover',
  typescript: true,
})

// Publishable key for client-side usage
export const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''

// Helper to create a Stripe Connect account link for onboarding
export async function createConnectAccountLink(accountId: string, refreshUrl: string, returnUrl: string) {
  return await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  })
}

// Helper to create a Stripe Connect Express account
export async function createConnectAccount(email?: string | null, businessName?: string | null, country: string = 'BE') {
  const params: any = {
    type: 'express',
    country,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  }

  if (email) params.email = email
  if (businessName) {
    params.business_type = 'company'
    params.company = { name: businessName }
  }

  return await stripe.accounts.create(params)
}

// Helper to retrieve Connect account details
export async function getConnectAccount(accountId: string) {
  return await stripe.accounts.retrieve(accountId)
}

// Helper to create a product
export async function createStripeProduct(name: string, description: string, connectAccountId?: string) {
  return await stripe.products.create(
    {
      name,
      description,
    },
    connectAccountId ? { stripeAccount: connectAccountId } : undefined
  )
}

// Helper to create a price for a product
export async function createStripePrice(
  productId: string,
  amount: number,
  currency: string = 'eur',
  interval?: 'month' | 'year',
  connectAccountId?: string
) {
  const priceData: Stripe.PriceCreateParams = {
    product: productId,
    unit_amount: amount,
    currency,
  }

  if (interval) {
    priceData.recurring = { interval }
  }

  return await stripe.prices.create(
    priceData,
    connectAccountId ? { stripeAccount: connectAccountId } : undefined
  )
}

// Helper to create a checkout session with platform fee
export async function createCheckoutSession(
  priceId: string,
  successUrl: string,
  cancelUrl: string,
  customerId?: string,
  metadata?: Record<string, string>,
  applicationFeePercent?: number,
  connectAccountId?: string
) {
  const sessionData: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  }

  if (customerId) {
    sessionData.customer = customerId
  }

  if (applicationFeePercent && connectAccountId) {
    sessionData.payment_intent_data = {
      application_fee_amount: Math.round((applicationFeePercent / 100) * 100), // Calculate based on price
      transfer_data: {
        destination: connectAccountId,
      },
    }
  }

  // If we're collecting an application fee, the Checkout session must be
  // created on the platform account (so Stripe can take the application_fee
  // and transfer the rest to the connected account). Therefore do NOT set
  // the `stripeAccount` request header in that case. If no application fee is
  // used but a connectAccountId is provided, create the session in the
  // connected account context instead (direct charge by connected account).
  if (applicationFeePercent && connectAccountId) {
    return await stripe.checkout.sessions.create(sessionData)
  }

  return await stripe.checkout.sessions.create(
    sessionData,
    connectAccountId ? { stripeAccount: connectAccountId } : undefined
  )
}

// Helper to create a subscription checkout session
export async function createSubscriptionCheckoutSession(
  priceId: string,
  successUrl: string,
  cancelUrl: string,
  customerId?: string,
  metadata?: Record<string, string>,
  applicationFeePercent?: number,
  connectAccountId?: string
) {
  const sessionData: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  }

  if (customerId) {
    sessionData.customer = customerId
  }

  if (applicationFeePercent && connectAccountId) {
    sessionData.subscription_data = {
      application_fee_percent: applicationFeePercent,
      transfer_data: {
        destination: connectAccountId,
      },
    }
  }

  // Same logic as above for subscriptions: if platform should collect a fee
  // we must create the session on the platform (no stripeAccount). If not,
  // and a connectAccountId is present, create in the connected account.
  if (applicationFeePercent && connectAccountId) {
    return await stripe.checkout.sessions.create(sessionData)
  }

  return await stripe.checkout.sessions.create(
    sessionData,
    connectAccountId ? { stripeAccount: connectAccountId } : undefined
  )
}

// Helper to verify webhook signature
export function constructWebhookEvent(payload: string | Buffer, signature: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
}
