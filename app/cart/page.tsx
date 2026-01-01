'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { safeSelect, safeUpdate } from '@/lib/supabaseHelpers';
import ContentContainer from '@/components/ContentContainer';
import { ShoppingCart, Trash2, ArrowLeft, ArrowRight, Tag, Building2 } from 'lucide-react';
import FormSelect from '@/components/FormSelect';
import { useNotification } from '@/contexts/NotificationContext';
import { checkCartRequiresPayment, CartPaymentInfo } from '@/lib/cartPaymentUtils';
import { formatDateOnly, formatTimeStr } from '@/lib/formatting';

interface CartItem {
  id: string;
  sub_profile_id?: string | null;
  program_id: string;
  price_snapshot: number;
  currency: string;
  program: {
    title: string;
    program_type: string;
    studio_id: string;
  };
  lesson_detail_type?: string | null;
  lesson_detail_id?: string | null;
  lesson_metadata?: any | null;
}

interface Cart {
  id: string;
  studio_id: string;
  discount_code: string | null;
  discount_amount: number;
  discount_percentage: number;
  studio: {
    naam: string;
  };
}

export default function CartPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [discountCode, setDiscountCode] = useState('');
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  
  const [paymentInfo, setPaymentInfo] = useState<CartPaymentInfo | null>(null);
  const [isStudioAdmin, setIsStudioAdmin] = useState(false);
  const [subProfiles, setSubProfiles] = useState<any[]>([]);
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);
  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    checkAuth();
  }, []);

  // Listen for cross-tab or in-app notifications that the cart changed
  useEffect(() => {
    const handler = () => {
      // If user is authenticated, reload cart
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await loadCart(user.id);
        } catch (err) {
          console.warn('Failed to reload cart after update event', err);
        }
      })();
    };

    window.addEventListener('cart:updated', handler);
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'cart-updated') handler();
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      window.removeEventListener('cart:updated', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login?redirect=/cart');
      return;
    }
    await checkStudioAdmin(user.id);
    loadCart(user.id);
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

  const loadCart = async (userId: string) => {
    try {
      // Get active cart
      const { data: cartData, error: cartError } = await supabase
        .from('carts')
        .select(`
          *,
          studio:studios(naam)
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (cartError) throw cartError;

      if (!cartData) {
        setLoading(false);
        return;
      }

      setCart(cartData);
      setDiscountCode(cartData.discount_code || '');

      // Get cart items
      const { data: itemsData, error: itemsError } = await supabase
        .from('cart_items')
        .select(`
          *,
          lesson_detail_type,
          lesson_detail_id,
          lesson_metadata,
          program:programs(title, program_type, studio_id)
        `)
        .eq('cart_id', cartData.id);

      if (itemsError) throw itemsError;
      setCartItems(itemsData || []);

      // Load sub-profiles for this user so they can select per-item
      try {
        const subsRes = await safeSelect(supabase, 'sub_profiles', '*', { parent_user_id: userId });
        if (subsRes && (subsRes as any).data) setSubProfiles((subsRes as any).data || []);
      } catch (err) {
        console.warn('Could not load sub-profiles for cart page', err);
      }

      // Check payment requirement
      const paymentCheckResult = await checkCartRequiresPayment(cartData.id);
      setPaymentInfo(paymentCheckResult);

    } catch (err) {
      console.error('Failed to load cart:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setCartItems(cartItems.filter(item => item.id !== itemId));
    } catch (err) {
      console.error('Failed to remove item:', err);
      showError('Er ging iets mis bij het verwijderen.');
    }
  };

  const applyDiscount = async () => {
    if (!cart || !discountCode.trim()) return;

    setApplyingDiscount(true);
    try {
      // In een echte app zou je hier een API call maken om de kortingscode te valideren
      // Voor nu doen we een simpele check
      let discount_amount = 0;
      let discount_percentage = 0;

      if (discountCode.toUpperCase() === 'GROEP10') {
        discount_percentage = 10;
      } else if (discountCode.toUpperCase() === 'WELKOM20') {
        discount_amount = 20;
      } else {
        showError('Ongeldige kortingscode');
        setApplyingDiscount(false);
        return;
      }

      const { error } = await supabase
        .from('carts')
        .update({
          discount_code: discountCode.toUpperCase(),
          discount_amount,
          discount_percentage
        })
        .eq('id', cart.id);

      if (error) throw error;

      setCart({
        ...cart,
        discount_code: discountCode.toUpperCase(),
        discount_amount,
        discount_percentage
      });

      showSuccess('Kortingscode toegepast!');
    } catch (err) {
      console.error('Failed to apply discount:', err);
      showError('Er ging iets mis.');
    } finally {
      setApplyingDiscount(false);
    }
  };

  const calculateTotal = () => {
    // price_snapshot and discount fields are stored in cents
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

    return {
      subtotal: subtotalCents / 100,
      discount: discountCents / 100,
      total: totalCents / 100,
    };
  };

  const handleCheckout = () => {
    if (!cart || cartItems.length === 0) return;
    router.push(`/checkout/${cart.id}`);
  };

  if (isStudioAdmin) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ContentContainer className="py-12">
          <button
            onClick={() => router.push('/hub/studios')}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar HUB3
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
      <div className="min-h-screen bg-slate-50">
        <ContentContainer className="py-12">
          <button
            onClick={() => router.push('/hub/studios')}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar HUB3
          </button>

          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
            <ShoppingCart className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Je winkelmandje is leeg</h1>
            <p className="text-slate-600 mb-6">Voeg programma's toe om te beginnen met inschrijven</p>
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

  const { subtotal, discount, total } = calculateTotal();

  return (
    <div className="min-h-screen bg-slate-50">
      <ContentContainer className="py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug
        </button>

        <div className="flex items-center gap-3 mb-8">
          <ShoppingCart className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Winkelmandje</h1>
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {cart.studio && (
          <div className="flex items-center gap-2 mb-6 text-slate-600 dark:text-slate-300">
            <Building2 className="w-4 h-4" />
            <span>Studio: {cart.studio.naam}</span>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {cartItems.map((item) => (
              <div key={item.id} className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                      {item.program?.title || 'Programma niet beschikbaar'}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                      {item.program?.program_type === 'group'
                        ? 'Cursus'
                        : item.program?.program_type === 'workshop'
                        ? 'Workshop'
                        : 'Programma'}
                    </p>
                    {!item.program && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        Dit programma is niet meer beschikbaar. Verwijder het item om door te gaan.
                      </p>
                    )}
                    {item.lesson_metadata && (
                      (() => {
                        const m: any = item.lesson_metadata;
                        const title = m.title || m.name || null;
                        const date = m.date || m.start_date || null;
                        const time = m.time || m.start_time || null;
                        const duration = m.duration_minutes || m.duration || null;
                        const endTime = m.end_time || m.endTime || null;

                        return (
                          <div className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                            {title ? <div className="font-medium">{title}</div> : null}
                            {(date || time) ? (
                              <div className="text-xs text-slate-500">
                                    {date ? formatDateOnly(String(date)) : ''}
                                    {date && time ? ' — ' : ''}
                                    {time ? formatTimeStr(String(time)) : ''}
                                    {endTime ? ` · ${formatTimeStr(String(endTime))}` : (duration ? ` · ${duration} min` : '')}
                              </div>
                            ) : null}
                            {item.lesson_detail_id && !title && (
                              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">ID: {item.lesson_detail_id}</div>
                            )}
                          </div>
                        );
                      })()
                    )}
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      €{(item.price_snapshot / 100).toFixed(2)}
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Kies profiel voor deze inschrijving</label>
                      <FormSelect
                        value={item.sub_profile_id || ''}
                        onChange={async (e) => {
                          const val = e.target.value || null;
                          try {
                            // send update and log detailed errors to help debug 400 responses
                            const res = await safeUpdate(supabase, 'cart_items', { sub_profile_id: val }, { id: item.id });
                            if (!res) {
                              console.error('safeUpdate returned no result')
                              showError('Kon profiel niet bijwerken')
                              return
                            }

                            if ((res as any).missingTable) {
                              console.warn('cart_items table missing — cannot update sub_profile_id')
                              showError('Kon profiel niet bijwerken (tabel ontbreekt)')
                              return
                            }

                            if ((res as any).success) {
                              setCartItems(cartItems.map(ci => ci.id === item.id ? { ...ci, sub_profile_id: val } : ci));
                              showSuccess('Profiel bijgewerkt');
                            } else {
                              const errObj = (res as any).error || res;
                              try {
                                console.error('Failed updating cart_items sub_profile_id', errObj, JSON.stringify(errObj, Object.getOwnPropertyNames(errObj)));
                              } catch {
                                console.error('Failed updating cart_items sub_profile_id (stringify failed)', errObj);
                              }
                              // If PostgREST reports a missing column/schema issue, give actionable feedback
                              const message = (((errObj as any)?.message) || ((errObj as any)?.details) || 'Onbekende fout')
                              showError('Kon profiel niet bijwerken: ' + message)
                            }
                          } catch (err) {
                            try {
                              console.error('Failed to update cart item profile (exception)', err, JSON.stringify(err, Object.getOwnPropertyNames(err)))
                            } catch {
                              console.error('Failed to update cart item profile (exception)', err)
                            }
                            showError('Kon profiel niet bijwerken')
                          }
                        }}
                        className="mt-1 px-3 py-2 border rounded-lg"
                      >
                        <option value="">Mijn profiel</option>
                        {subProfiles.map(sp => (
                          <option key={sp.id} value={sp.id}>{`${sp.first_name || ''} ${sp.last_name || ''}`.trim()}</option>
                        ))}
                      </FormSelect>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Verwijderen"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 sticky top-6">
              <h2 className="font-semibold text-slate-900 mb-4">Samenvatting</h2>

              {/* Discount Code */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Kortingscode
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    placeholder="CODE"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 uppercase"
                    disabled={!!cart.discount_code}
                  />
                  {!cart.discount_code && (
                    <button
                      onClick={applyDiscount}
                      disabled={applyingDiscount || !discountCode.trim()}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Tag className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {cart.discount_code && (
                  <div className="mt-2 text-sm text-green-600">
                    ✓ Kortingscode "{cart.discount_code}" toegepast
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="space-y-2 py-4 border-t border-slate-200">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotaal</span>
                  <span>€{subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Korting</span>
                    <span>-€{discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Totaal</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-4">
                <label className="inline-flex items-center gap-3">
                  <input
                    id="agree-studio-policies"
                    type="checkbox"
                    checked={agreedToPolicies}
                    onChange={(e) => setAgreedToPolicies(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Ik ga akkoord met de <a href={cart ? `/studio/public/${cart.studio_id}` : '/'} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">studio policies</a>
                  </span>
                </label>

                <button
                  onClick={handleCheckout}
                  disabled={loading || applyingDiscount || !agreedToPolicies}
                  className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {paymentInfo?.requiresPayment ? 'Naar Betaling' : 'Inschrijven'} <ArrowRight className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 text-xs text-slate-500 text-center">
                Na betaling vul je de inschrijfformulieren in
              </div>
            </div>
          </div>
        </div>
      </ContentContainer>
    </div>
  );
}
