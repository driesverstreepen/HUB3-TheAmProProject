"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function StripeOnboardingRefresh() {
  const params = useParams()
  const router = useRouter()
  const studioId = params.id as string
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    refreshOnboardingLink()
  }, [])

  const refreshOnboardingLink = async () => {
    try {
      const response = await fetch('/api/studio/stripe/refresh-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studio_id: studioId })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to refresh link')
      }

      // Redirect to new onboarding link
      if (result.onboarding_url) {
        window.location.href = result.onboarding_url
      } else {
        throw new Error('No onboarding URL returned')
      }
    } catch (error: any) {
      console.error('Error refreshing link:', error)
      setError(error.message)
      setRefreshing(false)
    }
  }

  const handleRetry = () => {
    setError(null)
    setRefreshing(true)
    refreshOnboardingLink()
  }

  const handleGoBack = () => {
    router.push(`/studio/${studioId}/settings`)
  }

  return (
    <FeatureGate flagKey="studio.stripe" mode="page">
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center">
          {refreshing ? (
            <>
              <LoadingSpinner size={64} className="mx-auto mb-4" label="Link vernieuwen" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Link Vernieuwen...</h2>
              <p className="text-slate-600">
                We maken een nieuwe onboarding link voor je aan
              </p>
            </>
          ) : error ? (
            <>
              <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Er ging iets mis</h2>
              <p className="text-slate-600 mb-6">{error}</p>
              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Opnieuw Proberen
                </button>
                <button
                  onClick={handleGoBack}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition-colors"
                >
                  Terug
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </FeatureGate>
  )
}
