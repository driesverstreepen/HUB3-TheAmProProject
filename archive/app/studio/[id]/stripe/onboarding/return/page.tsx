"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function StripeOnboardingReturn() {
  const params = useParams()
  const router = useRouter()
  const studioId = params.id as string
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    updateAccountStatus()
  }, [])

  const updateAccountStatus = async () => {
    try {
      // Wait a bit for Stripe to update
      await new Promise(resolve => setTimeout(resolve, 2000))

      const response = await fetch('/api/studio/stripe/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studio_id: studioId })
      })

      if (response.ok) {
        // Redirect back to settings page after 2 seconds
        setTimeout(() => {
          router.push(`/studio/${studioId}/settings`)
        }, 2000)
      } else {
        // Redirect anyway
        setTimeout(() => {
          router.push(`/studio/${studioId}/settings`)
        }, 3000)
      }
    } catch (error) {
      console.error('Error updating status:', error)
        setTimeout(() => {
        router.push(`/studio/${studioId}/settings`)
      }, 3000)
    } finally {
      setChecking(false)
    }
  }

  return (
    <FeatureGate flagKey="studio.stripe" mode="page">
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center">
          {checking ? (
            <>
              <LoadingSpinner size={64} className="mx-auto mb-4" label="Account controleren" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Account Controleren...</h2>
              <p className="text-slate-600">
                We controleren de status van je Stripe account
              </p>
            </>
          ) : (
            <>
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Onboarding Voltooid!</h2>
              <p className="text-slate-600 mb-4">
                Je wordt doorgestuurd naar je Stripe instellingen...
              </p>
            </>
          )}
        </div>
      </div>
    </FeatureGate>
  )
}
