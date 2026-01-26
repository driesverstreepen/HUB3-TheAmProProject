"use client"

import React from 'react'
import { AlertCircle, CheckCircle, CreditCard } from 'lucide-react'

interface StudioStripeProps {
  stripe_account_id?: string | null
  stripe_charges_enabled?: boolean | null
  business_name?: string | null
  email?: string | null
}

import { useRouter } from 'next/navigation'

export function StripeConnectionBanner({ stripe_account_id, stripe_charges_enabled, business_name, studioId, hideLink = false }: StudioStripeProps & { studioId?: string, hideLink?: boolean }) {
  const stripeConnected = !!stripe_account_id
  const stripeReady = stripeConnected && !!stripe_charges_enabled

  const router = useRouter()

  // If fully ready, don't show banner
  if (stripeReady) return null

  return (
    <div className="h-full bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900/40 rounded-xl p-4 flex">
      <AlertCircle className="text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" size={20} />
      <div className="flex-1 ml-3 flex flex-col">
        <h4 className="t-h4 font-semibold text-yellow-900 dark:!text-white mb-1">
          {stripeConnected ? 'Complete Stripe Setup' : 'Stripe Not Connected'}
        </h4>
        <p className="t-bodySm text-yellow-800 dark:text-yellow-200/90 mb-3 flex-1">
          {stripeConnected
            ? 'Your Stripe account needs additional information before you can accept payments. Complete the setup to enable payment collection for programs.'
            : 'Koppel een bestaand Stripe-account of maak een nieuw Stripe-account aan om betalingen voor programma\'s en lidmaatschappen te ontvangen.'}
        </p>
        {!hideLink && (
          <div className="mt-2">
            <button
              onClick={(e) => {
                e.preventDefault()
                // Navigate to settings payments tab
                if (studioId) {
                  router.push(`/studio/${studioId}/settings?tab=payments`)
                } else {
                  router.push(`/studio/settings?tab=payments`)
                }
              }}
              className="inline-flex items-center gap-2 t-bodySm font-medium text-yellow-900 dark:text-yellow-100 hover:text-yellow-700 dark:hover:text-yellow-200 underline"
            >
              <CreditCard size={16} />
              {stripeConnected ? 'Complete Stripe Setup' : 'Connect Stripe Account'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface StripeStatusIndicatorProps {
  compact?: boolean
  stripe_account_id?: string | null
  stripe_charges_enabled?: boolean | null
}

export function StripeStatusIndicator({ compact = false, stripe_account_id, stripe_charges_enabled }: StripeStatusIndicatorProps) {
  const stripeConnected = !!stripe_account_id
  const stripeReady = stripeConnected && !!stripe_charges_enabled

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2">
        {stripeReady ? (
          <>
            <CheckCircle className="text-green-600 dark:text-green-400" size={16} />
            <span className="t-bodySm text-green-700 dark:text-green-200 font-medium">Stripe Connected</span>
          </>
        ) : stripeConnected ? (
          <>
            <AlertCircle className="text-yellow-600 dark:text-yellow-400" size={16} />
            <span className="t-bodySm text-yellow-700 dark:text-yellow-200 font-medium">Setup Incomplete</span>
          </>
        ) : (
          <>
            <AlertCircle className="text-slate-400 dark:text-slate-300" size={16} />
            <span className="t-bodySm text-slate-600 dark:text-white font-medium">Not Connected</span>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${
      stripeReady
        ? 'bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900/40'
        : stripeConnected
        ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900/40'
        : 'bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-700'
    }`}>
      {stripeReady ? (
        <>
          <CheckCircle className="text-green-600 dark:text-green-400" size={18} />
          <div>
            <div className="t-bodySm font-medium text-green-900 dark:text-green-100">Stripe Connected</div>
            <div className="t-caption text-green-700 dark:text-green-200/90">Ready to accept payments</div>
          </div>
        </>
      ) : stripeConnected ? (
        <>
          <AlertCircle className="text-yellow-600 dark:text-yellow-400" size={18} />
          <div>
            <div className="t-bodySm font-medium text-yellow-900 dark:text-yellow-100">Setup Incomplete</div>
            <div className="t-caption text-yellow-700 dark:text-yellow-200/90">Complete onboarding to enable payments</div>
          </div>
        </>
      ) : (
        <>
          <CreditCard className="text-slate-400 dark:text-slate-500" size={18} />
          <div>
            <div className="t-bodySm font-medium text-slate-900 dark:text-white">Stripe Not Connected</div>
            <div className="t-caption text-slate-600 dark:text-slate-300">Connect to accept payments</div>
          </div>
        </>
      )}
    </div>
  )
}

export default StripeStatusIndicator
