// Stripe integration disabled. This file provides no-op stubs so imports
// remain valid but any attempt to use Stripe will clearly fail.

export const stripe = {
  checkout: {
    sessions: {
      create: async () => {
        throw new Error('Stripe integration has been disabled in this deployment')
      },
    },
  },
}

export const stripePublishableKey = '';

export async function createConnectAccountLink() {
  throw new Error('Stripe integration has been disabled');
}
export async function createConnectAccount() { throw new Error('Stripe integration has been disabled'); }
export async function getConnectAccount() { throw new Error('Stripe integration has been disabled'); }
export async function createStripeProduct() { throw new Error('Stripe integration has been disabled'); }
export async function createStripePrice() { throw new Error('Stripe integration has been disabled'); }
export async function createCheckoutSession() { throw new Error('Stripe integration has been disabled'); }
export async function createSubscriptionCheckoutSession() { throw new Error('Stripe integration has been disabled'); }
export function constructWebhookEvent() { throw new Error('Stripe integration has been disabled'); }
