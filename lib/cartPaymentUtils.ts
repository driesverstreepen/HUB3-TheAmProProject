/**
 * Cart Payment Detection Utility
 * 
 * Helper functions to determine checkout flow based on cart contents.
 * 
 * Flow Logic:
 * - If ALL programs in cart have accepts_payment = false → FREE checkout flow
 * - If ANY program has accepts_payment = true → PAID checkout flow (Stripe)
 */

import { supabase } from '@/lib/supabase';

export interface CartPaymentInfo {
  requiresPayment: boolean;
  hasFreeItems: boolean;
  hasPaidItems: boolean;
  totalItems: number;
}

/**
 * Check if a cart requires payment (Stripe checkout) or can use free flow
 * @param cartId - UUID of the cart to check
 * @returns CartPaymentInfo object with payment requirement details
 */
export async function checkCartRequiresPayment(cartId: string): Promise<CartPaymentInfo> {
  // Query cart items with joined program data to check accepts_payment flag
  const { data: cartItems, error } = await supabase
    .from('cart_items')
    .select(`
      id,
      program:programs(
        id,
        title,
        accepts_payment
      )
    `)
    .eq('cart_id', cartId);

  if (error) {
    console.error('Error fetching cart items for payment check:', error);
    throw new Error('Failed to check cart payment requirements');
  }

  if (!cartItems || cartItems.length === 0) {
    return {
      requiresPayment: false,
      hasFreeItems: false,
      hasPaidItems: false,
      totalItems: 0,
    };
  }

  // Count free vs paid items
  let freeCount = 0;
  let paidCount = 0;

  for (const item of cartItems) {
    const program = (item as any).program;
    
    if (program?.accepts_payment === true) {
      paidCount++;
    } else {
      freeCount++;
    }
  }

  const result = {
    requiresPayment: paidCount > 0, // If ANY item requires payment, use paid flow
    hasFreeItems: freeCount > 0,
    hasPaidItems: paidCount > 0,
    totalItems: cartItems.length,
  };

  console.log('[Payment Detection] Cart:', cartId, 'Result:', result, 'Items:', cartItems.map((i: any) => ({
    title: i.program?.title,
    accepts_payment: i.program?.accepts_payment
  })));

  return result;
}

/**
 * Get human-readable description of cart payment status
 */
export function getPaymentStatusDescription(info: CartPaymentInfo): string {
  if (info.totalItems === 0) {
    return 'Je winkelmandje is leeg';
  }

  if (info.requiresPayment) {
    if (info.hasFreeItems) {
      return `Je winkelmandje bevat ${info.hasPaidItems} betaald(e) en ${info.hasFreeItems} gratis programma('s). Betaling via Stripe is vereist.`;
    }
    return `Je winkelmandje bevat ${info.hasPaidItems} betaald(e) programma('s). Betaling via Stripe is vereist.`;
  }

  return `Je winkelmandje bevat alleen gratis programma's. Je kunt direct inschrijven.`;
}
