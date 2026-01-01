'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';
import { CreditCard, CheckCircle, ArrowLeft, Building2, ShoppingBag, ArrowRight } from 'lucide-react';
import { checkCartRequiresPayment, type CartPaymentInfo } from '@/lib/cartPaymentUtils';
import { useNotification } from '@/contexts/NotificationContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface CartItem {
  id: string;
  sub_profile_id?: string | null;
  program_id: string;
  price_snapshot: number;
  program: {
    title: string;
    program_type: string;
    accepts_payment?: boolean;
  };
}

interface Cart {
  id: string;
  user_id: string;
  studio_id: string;
  discount_amount: number;
  discount_percentage: number;
  discount_code: string | null;
  studio: {
    naam: string;
  };
}

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const cartId = params.cartId as string;
  const { showError } = useNotification();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [paymentInfo, setPaymentInfo] = useState<CartPaymentInfo | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'ideal' | 'creditcard'>('ideal');
  const [isStudioAdmin, setIsStudioAdmin] = useState(false);

  useEffect(() => {
    loadCheckoutData();
  }, [cartId]);

  const loadCheckoutData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login?redirect=/cart');
        return;
      }

      await checkStudioAdmin(user.id);

      // Get cart
      const { data: cartData, error: cartError } = await supabase
        .from('carts')
        .select(`
          *,
          studio:studios(naam)
        `)
        .eq('id', cartId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (cartError || !cartData) {
        console.error('Cart not found:', cartError);
        router.push('/cart');
        return;
      }

      setCart(cartData);

      // Get cart items with accepts_payment info
      const { data: itemsData, error: itemsError } = await supabase
        .from('cart_items')
        .select(`
          *,
          program:programs(title, program_type, accepts_payment)
        `)
        .eq('cart_id', cartId);

      if (itemsError) throw itemsError;
      setCartItems(itemsData || []);

      // Check payment requirements
      const paymentReq = await checkCartRequiresPayment(cartId);
      setPaymentInfo(paymentReq);
    } catch (err) {
      console.error('Failed to load checkout data:', err);
      router.push('/cart');
    } finally {
      setLoading(false);
    }
  };

  const checkStudioAdmin = async (userId: string) => {
    try {
      const { data: userRole, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'studio_admin')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking studio admin role:', error);
        return;
      }

      setIsStudioAdmin(!!userRole);
    } catch (err) {
      console.error('Failed to check studio admin role:', err);
    }
  };
  const calculateTotal = () => {
    // price_snapshot and cart discount fields are stored in cents
    const subtotalCents = cartItems.reduce((sum, item) => sum + (item.price_snapshot || 0), 0);
    let discountCents = 0;

    if (cart) {
      if (cart.discount_percentage > 0) {
        discountCents = Math.round((subtotalCents * cart.discount_percentage) / 100);
      } else if (cart.discount_amount > 0) {
        discountCents = cart.discount_amount;
      }
    }

    const totalCents = Math.max(0, subtotalCents - discountCents);

    // Return euro values (divide by 100)
    return {
      subtotal: subtotalCents / 100,
      discount: discountCents / 100,
      total: totalCents / 100,
    };
  };

  /**
   * FREE CHECKOUT FLOW
   * - Direct enrollment creation (no payment)
   * - Navigate to enrollment forms or /mijn-lessen
   */
  const processFreeCheckout = async () => {
    if (!cart || !cartItems.length) return;

    setProcessing(true);

    try {
      // Call server-side endpoint to perform atomic checkout (creates enrollments + completes cart)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Authentication token not found. Please log in again.');
      }

      const res = await fetch('/api/checkout/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cartId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Inschrijving mislukt');
      }

      const payload = await res.json();
      const inserted = payload?.inserted || [];
      const anyPending = (inserted || []).some((r: any) => r.status === 'pending_forms');
      
      if (anyPending) {
        // Clear local cart state and notify other components before navigating
        try {
          setCart(null);
          setCartItems([]);
          localStorage.setItem('cart-updated', String(Date.now()));
          window.dispatchEvent(new Event('cart:updated'));
        } catch (e) {
          // ignore storage errors
        }

        router.push(`/enrollment-forms/${cartId}`);
      } else {
        try {
          setCart(null);
          setCartItems([]);
          localStorage.setItem('cart-updated', String(Date.now()));
          window.dispatchEvent(new Event('cart:updated'));
        } catch (e) {}

        router.push('/mijn-lessen');
      }
    } catch (err) {
      console.error('Free checkout failed:', err);
      showError('Er ging iets mis met de inschrijving. Probeer het opnieuw.');
      setProcessing(false);
    }
  };

  /**
   * PAID CHECKOUT FLOW
   * - Start Stripe payment session for cart
   * - Redirect user to Stripe Checkout
   */
  const processPaidCheckout = async () => {
    if (!cart || !cartItems.length) return;

    setProcessing(true);

    try {
      // Resolve user_profile_id if available
      const { data: { user } } = await supabase.auth.getUser();
      let userProfileId: string | null = null;
      if (user?.id) {
        const { data: profile } = await supabase.from('user_profiles').select('id').eq('user_id', user.id).maybeSingle();
        userProfileId = profile?.id || null;
      }

      const res = await fetch('/api/payments/create-checkout-cart', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cart_id: cartId, user_profile_id: userProfileId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to start checkout');
      }

      const payload = await res.json();
      if (payload?.url) {
        // Redirect user to Stripe Checkout
        window.location.href = payload.url;
        return;
      }

      throw new Error('No checkout url received');
    } catch (err) {
      console.error('Payment failed:', err);
      showError('Er ging iets mis met de betaling. Probeer het opnieuw.');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" label="Laden" />
          <p className="text-slate-600">Checkout laden…</p>
        </div>
      </div>
    );
  }

  if (isStudioAdmin) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ContentContainer className="py-12">
          <button
            onClick={() => router.push('/cart')}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar winkelmandje
          </button>

          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
            <Building2 className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Studio Admin Account</h1>
            <p className="text-slate-600 mb-6">
              Als studio admin kun je geen programma's inschrijven via deze interface.
              Gebruik een aparte gebruikersaccount om je in te schrijven voor programma's.
            </p>
            <button
              onClick={() => router.push('/hub/studios')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Studios bekijken
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </ContentContainer>
      </div>
    );
  }

  if (!cart || cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">Geen items gevonden</p>
          <button
            onClick={() => router.push('/cart')}
            className="text-blue-600 hover:text-blue-700"
          >
            Terug naar winkelmandje
          </button>
        </div>
      </div>
    );
  }

  const { subtotal, discount, total } = calculateTotal();

  return (
    <div className="min-h-screen bg-slate-50">
      <ContentContainer className="py-8">
        <button
          onClick={() => router.push('/cart')}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar winkelmandje
        </button>

        <div className="flex items-center gap-3 mb-8">
          <CreditCard className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Afrekenen</h1>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Payment Method / Checkout Flow */}
          <div className="lg:col-span-2 space-y-6">
            {/* Show payment method ONLY if cart requires payment */}
            {paymentInfo?.requiresPayment ? (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Betaalmethode</h2>
                
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:border-blue-300 transition-colors">
                    <input
                      type="radio"
                      name="payment"
                      value="ideal"
                      checked={paymentMethod === 'ideal'}
                      onChange={() => setPaymentMethod('ideal')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">iDEAL</div>
                      <div className="text-sm text-slate-500">Betaal via je eigen bank</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:border-blue-300 transition-colors">
                    <input
                      type="radio"
                      name="payment"
                      value="creditcard"
                      checked={paymentMethod === 'creditcard'}
                      onChange={() => setPaymentMethod('creditcard')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">Credit Card</div>
                      <div className="text-sm text-slate-500">Visa, Mastercard, American Express</div>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              // Free checkout info
              <div className="bg-green-50 rounded-xl p-6 shadow-sm border border-green-200">
                <div className="flex gap-3">
                  <ShoppingBag className="w-6 h-6 text-green-600 shrink-0" />
                  <div>
                    <h2 className="text-xl font-bold text-green-900 mb-2">Gratis programma's</h2>
                    <p className="text-green-800 text-sm">
                      Alle programma's in je winkelmandje zijn gratis. Je kunt direct inschrijven zonder betaling.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Info based on flow type */}
            <div className={`rounded-xl p-6 border ${paymentInfo?.requiresPayment ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex gap-3">
                <CheckCircle className={`w-6 h-6 shrink-0 ${paymentInfo?.requiresPayment ? 'text-blue-600' : 'text-slate-600'}`} />
                <div>
                  <h3 className={`font-semibold mb-2 ${paymentInfo?.requiresPayment ? 'text-blue-900' : 'text-slate-900'}`}>
                    {paymentInfo?.requiresPayment ? 'Na betaling' : 'Na inschrijving'}
                  </h3>
                  <p className={`text-sm ${paymentInfo?.requiresPayment ? 'text-blue-800' : 'text-slate-700'}`}>
                    Je wordt doorgestuurd om de inschrijfformulieren in te vullen voor elk geselecteerd programma. 
                    Je inschrijving wordt actief na het invullen van alle formulieren.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 sticky top-6">
              <h2 className="font-semibold text-slate-900 mb-4">Bestelling</h2>

              {cart.studio && (
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-4 pb-4 border-b border-slate-200">
                  <Building2 className="w-4 h-4" />
                  <span>{cart.studio.naam}</span>
                </div>
              )}

              {/* Items */}
              <div className="space-y-3 mb-4">
                {cartItems.map((item) => (
                  <div key={item.id} className="text-sm">
                    <div className="font-medium text-slate-900">{item.program.title}</div>
                    <div className="flex justify-between text-slate-600">
                      <span>{item.program.program_type}</span>
                      <span>€{(item.price_snapshot / 100).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Price Breakdown */}
              <div className="space-y-2 py-4 border-t border-slate-200">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotaal</span>
                  <span>€{subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <>
                    <div className="flex justify-between text-green-600 text-sm">
                      <span>Korting {cart.discount_code && `(${cart.discount_code})`}</span>
                      <span>-€{discount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Totaal</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={paymentInfo?.requiresPayment ? processPaidCheckout : processFreeCheckout}
                disabled={processing}
                className={`w-full flex items-center justify-center gap-2 px-6 py-3 text-white rounded-lg font-medium transition-colors mt-4 disabled:opacity-50 disabled:cursor-not-allowed ${
                  paymentInfo?.requiresPayment 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {processing ? (
                  <>
                    <LoadingSpinner
                      size={20}
                      className="shrink-0"
                      trackClassName="border-transparent"
                      indicatorClassName="border-b-white"
                      label="Laden"
                    />
                    Verwerken...
                  </>
                ) : paymentInfo?.requiresPayment ? (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Betaal €{total.toFixed(2)}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Inschrijven
                  </>
                )}
              </button>

              <div className="mt-4 text-xs text-slate-500 text-center">
                Veilige betaling via SSL versleuteling
              </div>
            </div>
          </div>
        </div>
      </ContentContainer>
    </div>
  );
}
