'use client'

import { useState } from 'react'
import { Crown, Check, AlertCircle } from 'lucide-react'
import { useStudioFeatures } from '@/hooks/useStudioFeatures'
import { PRICING, type SubscriptionTier, type SubscriptionPeriod } from '@/types/subscription'
import { supabase } from '@/lib/supabase'
import { useNotification } from '@/contexts/NotificationContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface SubscriptionClientProps {
  studioId: string
}

export default function SubscriptionClient({ studioId }: SubscriptionClientProps) {
  const { subscription, loading } = useStudioFeatures(studioId)
  const { showError } = useNotification()
  const [processingCheckout, setProcessingCheckout] = useState(false)

  const handleUpgrade = async (tier: SubscriptionTier, period: SubscriptionPeriod) => {
    setProcessingCheckout(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          period,
          studioId,
          userId: user.id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create checkout session')
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (error: any) {
      showError(error.message || 'Failed to start checkout')
      setProcessingCheckout(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <LoadingSpinner size={32} label="Laden" />
      </div>
    )
  }

  const currentTier = subscription?.subscription_tier || 'basic'
  const currentPeriod = subscription?.subscription_period || 'monthly'
  const isTrial = subscription?.is_trial_active || false
  const trialDaysRemaining = subscription?.trial_days_remaining || 0

  const tierRank: Record<SubscriptionTier, number> = { basic: 0, plus: 1, pro: 2 }

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900">Huidig Plan</h2>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-slate-900">
                {PRICING[currentTier as SubscriptionTier].name}
              </p>
              <p className="text-sm text-slate-600">
                €{PRICING[currentTier as SubscriptionTier][currentPeriod as SubscriptionPeriod]}/
                {currentPeriod === 'monthly' ? 'maand' : 'jaar'}
              </p>
            </div>
          </div>
          {isTrial && (
            <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
              {Math.ceil(trialDaysRemaining)} dagen trial
            </div>
          )}
        </div>

        {isTrial && (
          <div className="mt-4 p-3 bg-blue-100 rounded-lg">
            <p className="text-sm text-blue-900">
              Je hebt nog {Math.ceil(trialDaysRemaining)} dagen toegang tot alle Pro features. 
              Upgrade naar een betaald plan om je toegang te behouden.
            </p>
          </div>
        )}

        {subscription?.subscription_status === 'past_due' && (
          <div className="mt-4 p-3 bg-red-100 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Betaling mislukt</p>
              <p className="text-sm text-red-800">
                Je laatste betaling is mislukt. Update je betalingsmethode om je abonnement actief te houden.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Plan Comparison */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Alle Plannen</h3>
        
        <div className="grid md:grid-cols-3 gap-6">
          {(['basic', 'plus', 'pro'] as const).map((tier) => {
            const config = PRICING[tier]
            const isCurrentTier = currentTier === tier
            // Pro is highlighted as "Meest gekozen", except when it's already the current plan.
            const isPopular = tier === 'pro' && !isCurrentTier

            return (
              <div
                key={tier}
                className={`relative rounded-xl border-2 p-6 flex flex-col ${
                  isCurrentTier
                    ? 'border-green-500'
                    : isPopular
                    ? 'border-blue-600 shadow-lg'
                    : 'border-slate-200'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    Meest gekozen
                  </div>
                )}

                {isCurrentTier && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    Huidig Plan
                  </div>
                )}

                <div className="text-center mb-6">
                  <h4 className="text-xl font-bold text-slate-900 mb-2">{config.name}</h4>
                  <div className="flex items-baseline justify-center gap-1 mb-4">
                    <span className="text-3xl font-bold text-slate-900">
                      €{config[currentPeriod as SubscriptionPeriod]}
                    </span>
                    <span className="text-slate-600">
                      /{currentPeriod === 'monthly' ? 'maand' : 'jaar'}
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  {config.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-slate-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                {!isCurrentTier && (
                  <button
                    onClick={() => handleUpgrade(tier, currentPeriod as SubscriptionPeriod)}
                    disabled={processingCheckout}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
                      isPopular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {processingCheckout ? (
                      <span className="flex items-center justify-center gap-2">
                        <LoadingSpinner size={16} label="Bezig" indicatorClassName="border-b-white" />
                        Bezig...
                      </span>
                    ) : (
                      tierRank[tier] > tierRank[currentTier as SubscriptionTier] ? 'Upgrade' : 'Downgrade'
                    )}
                  </button>
                )}

                {isCurrentTier && (
                  <div className="text-center py-3 text-sm text-green-600 font-medium">
                    ✓ Actief plan
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Veelgestelde vragen</h3>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-slate-900 mb-1">Kan ik later van plan wisselen?</h4>
            <p className="text-sm text-slate-600">
              Ja, je kunt altijd upgraden of downgraden. Bij een upgrade betaal je direct het verschil. 
              Bij een downgrade gaat de wijziging in bij de volgende factuurperiode.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-slate-900 mb-1">Wat gebeurt er na mijn trial?</h4>
            <p className="text-sm text-slate-600">
              Na je trial periode kun je een betaald plan kiezen om toegang te behouden. 
              Zonder upgrade word je automatisch downgraded naar het Basic plan.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-slate-900 mb-1">Kan ik mijn abonnement opzeggen?</h4>
            <p className="text-sm text-slate-600">
              Ja, je kunt op elk moment opzeggen. Je behoud toegang tot je huidige plan tot het einde van de betaalperiode.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
