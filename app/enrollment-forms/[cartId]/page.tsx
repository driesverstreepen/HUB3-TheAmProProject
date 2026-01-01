'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext'
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CheckCircle, FileText, ArrowRight, Building2 } from 'lucide-react';
import { useNotification } from '@/contexts/NotificationContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Enrollment {
  id: string;
  program_id: string;
  status: string;
  program: {
    title: string;
    program_type: string;
    studio_id: string;
  };
}

export default function EnrollmentFormsPage() {
  const params = useParams();
  const router = useRouter();
  const cartId = params.cartId as string;

  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [isStudioAdmin, setIsStudioAdmin] = useState(false);
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);
  const { showModal } = useNotification()
  const { theme } = useTheme()

  useEffect(() => {
    loadEnrollments();
  }, [cartId]);

  const loadEnrollments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      await checkStudioAdmin(user.id);

      // Get cart to verify ownership
      const { data: cartData, error: cartError } = await supabase
        .from('carts')
        .select('id, user_id')
        .eq('id', cartId)
        .eq('user_id', user.id)
        .single();

      if (cartError || !cartData) {
        console.error('Cart not found:', cartError);
        router.push('/cart');
        return;
      }

      // Get cart items to find program_ids
      const { data: cartItems } = await supabase
        .from('cart_items')
        .select('program_id')
        .eq('cart_id', cartId);

      if (!cartItems || cartItems.length === 0) {
        router.push('/cart');
        return;
      }

      const programIds = cartItems.map(item => item.program_id);

      // Get enrollments for these programs with pending_forms status
      const { data: enrollData, error: enrollError } = await supabase
        .from('inschrijvingen')
        .select(`
          *,
          program:programs(title, program_type, studio_id)
        `)
        .eq('user_id', user.id)
        .in('program_id', programIds)
        .eq('status', 'pending_forms');

      if (enrollError) throw enrollError;

      if (!enrollData || enrollData.length === 0) {
        // Already completed, redirect to success
        router.push('/enrollments');
        return;
      }

      setEnrollments(enrollData);
    } catch (err) {
      console.error('Failed to load enrollments:', err);
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!enrollments[currentIndex]) return;

    setSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const enrollment = enrollments[currentIndex];

      // Collect form data
      const form_data: Record<string, any> = {};
      formData.forEach((value, key) => {
        form_data[key] = value.toString();
      });

      // Normalize the terms checkbox into a boolean and store explicitly
      const agreed = !!formData.get('terms');
      form_data.agreed_to_studio_policies = agreed;

      // Update enrollment to actief status
      const { error } = await supabase
        .from('inschrijvingen')
        .update({
          status: 'actief',
          form_data,
          opmerking: form_data.opmerking || null,
          // persist explicit flag for easier querying
          agreed_to_studio_policies: agreed
        })
        .eq('id', enrollment.id);

      if (error) throw error;

      // Move to next form or complete
      if (currentIndex < enrollments.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // All forms completed
        // Finalize cart if a cartId is present: mark as completed and remove cart items
        try {
          if (cartId) {
            try {
              const { error: updateError } = await supabase
                .from('carts')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('id', cartId)
              if (updateError) console.error('Failed to mark cart completed:', updateError)
            } catch (e) {
              console.error('Error updating cart status after forms:', e)
            }

            try {
              const { error: delError } = await supabase
                .from('cart_items')
                .delete()
                .eq('cart_id', cartId)
              if (delError) console.error('Failed to delete cart items after forms:', delError)
            } catch (e) {
              console.error('Error deleting cart items after forms:', e)
            }
          }
        } catch (err) {
          console.error('Error finalizing cart after forms:', err)
        }

        router.push('/enrollments?success=true');
      }
    } catch (err) {
      console.error('Failed to submit form:', err);
      showModal('Fout', 'Er ging iets mis. Probeer het opnieuw.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" label="Laden" />
          <p className="text-slate-600">Formulieren laden…</p>
        </div>
      </div>
    );
  }

  if (isStudioAdmin) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200 max-w-md">
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
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Alle formulieren ingevuld!</h1>
          <p className="text-slate-600 mb-6">Je inschrijvingen zijn voltooid</p>
          <button
            onClick={() => router.push('/enrollments')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Bekijk mijn inschrijvingen
          </button>
        </div>
      </div>
    );
  }

  const currentEnrollment = enrollments[currentIndex];
  const progress = ((currentIndex + 1) / enrollments.length) * 100;

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">
              Formulier {currentIndex + 1} van {enrollments.length}
            </span>
            <span className="text-sm font-medium text-blue-600">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {currentEnrollment.program.title}
              </h1>
              <p className="text-slate-600">{currentEnrollment.program.program_type}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Form Fields - In een echte app zou dit dynamisch zijn gebaseerd op het form template */}
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-slate-700 mb-2">
                Volledige naam <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="full_name"
                name="full_name"
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="Voor- en achternaam"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                E-mailadres <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="je@email.com"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-2">
                Telefoonnummer <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="+31 6 12345678"
              />
            </div>

            <div>
              <label htmlFor="birthdate" className="block text-sm font-medium text-slate-700 mb-2">
                Geboortedatum <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="birthdate"
                name="birthdate"
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-slate-700 mb-2">
                Adres
              </label>
              <input
                type="text"
                id="address"
                name="address"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="Straat en huisnummer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="postal_code" className="block text-sm font-medium text-slate-700 mb-2">
                  Postcode
                </label>
                <input
                  type="text"
                  id="postal_code"
                  name="postal_code"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  placeholder="1234 AB"
                />
              </div>
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-slate-700 mb-2">
                  Plaats
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  placeholder="Amsterdam"
                />
              </div>
            </div>

            <div>
              <label htmlFor="emergency_contact" className="block text-sm font-medium text-slate-700 mb-2">
                Noodcontact (naam en telefoonnummer)
              </label>
              <input
                type="text"
                id="emergency_contact"
                name="emergency_contact"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="Naam - 06 12345678"
              />
            </div>

            <div>
              <label htmlFor="medical_info" className="block text-sm font-medium text-slate-700 mb-2">
                Medische informatie of beperkingen
              </label>
              <textarea
                id="medical_info"
                name="medical_info"
                rows={3}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="Optioneel - informatie die de studio moet weten"
              />
            </div>

            <div>
              <label htmlFor="opmerking" className="block text-sm font-medium text-slate-700 mb-2">
                Opmerkingen
              </label>
              <textarea
                id="opmerking"
                name="opmerking"
                rows={3}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="Eventuele vragen of opmerkingen"
              />
            </div>

            <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <input
                type="checkbox"
                id="terms"
                name="terms"
                checked={agreedToPolicies}
                onChange={(e) => setAgreedToPolicies(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="terms" className="text-sm text-slate-600 dark:text-slate-300">
                Ik ga akkoord met de <a target="_blank" rel="noreferrer" className="text-blue-600 underline" href={`/studio/${currentEnrollment.program.studio_id}/policy`}>studio policies</a> van deze studio <span className="text-red-500">*</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting || !agreedToPolicies}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <LoadingSpinner
                    size={20}
                    className="shrink-0"
                    trackClassName="border-transparent"
                    indicatorClassName="border-b-white"
                    label="Laden"
                  />
                  Opslaan...
                </>
              ) : currentIndex < enrollments.length - 1 ? (
                <>
                  Volgende formulier
                  <ArrowRight className="w-5 h-5" />
                </>
              ) : (
                <>
                  Afronden
                  <CheckCircle className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Remaining forms indicator */}
        {enrollments.length > 1 && (
          <div className="mt-6 text-center text-sm text-slate-600">
            {enrollments.length - currentIndex - 1 > 0 && (
              <p>
                Nog {enrollments.length - currentIndex - 1} formulier
                {enrollments.length - currentIndex - 1 !== 1 ? 'en' : ''} te gaan
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
