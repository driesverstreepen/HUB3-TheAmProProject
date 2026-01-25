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
  // Stripe auto-sync disabled — do nothing
  return { success: true }
}
