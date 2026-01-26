'use client'

import { AlertTriangle, Lock } from 'lucide-react'
import Link from 'next/link'
import { type FeatureKey } from '@/types/subscription'

interface FeatureGateProps {
  feature: FeatureKey
  hasAccess: boolean
  children: React.ReactNode
  showUpgrade?: boolean
  studioId?: string
  fallback?: React.ReactNode
}

/**
 * Component to gate features based on subscription tier
 * Shows upgrade prompt if user doesn't have access
 */
export function FeatureGate({
  feature,
  hasAccess,
  children,
  showUpgrade = true,
  studioId,
  fallback
}: FeatureGateProps) {
  if (hasAccess) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  if (!showUpgrade) {
    return null
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border-2 border-slate-200 p-8">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
          <Lock className="w-6 h-6 text-slate-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            Upgrade nodig
          </h3>
          <p className="text-slate-600 mb-4">
            Deze functie is beschikbaar vanaf het Plus of Pro plan. Upgrade om toegang te krijgen tot deze en andere krachtige features.
          </p>
          {studioId && (
            <Link
              href={`/studio/${studioId}/subscription`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Bekijk Plannen
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

interface TrialBannerProps {
  trialDaysRemaining: number
  studioId: string
  onClose?: () => void
}

/**
 * Banner to show trial information
 */
export function TrialBanner({ trialDaysRemaining, studioId, onClose }: TrialBannerProps) {
  const isExpiringSoon = trialDaysRemaining <= 3

  return (
    <div className={`relative rounded-lg p-4 ${
      isExpiringSoon 
        ? 'bg-amber-50 border border-amber-200' 
        : 'bg-blue-50 border border-blue-200'
    }`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
          isExpiringSoon ? 'text-amber-600' : 'text-blue-600'
        }`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${
            isExpiringSoon ? 'text-amber-900' : 'text-blue-900'
          }`}>
            {isExpiringSoon ? (
              <>
                Je proefperiode eindigt over {Math.ceil(trialDaysRemaining)} {Math.ceil(trialDaysRemaining) === 1 ? 'dag' : 'dagen'}
              </>
            ) : (
              <>
                Je hebt nog {Math.ceil(trialDaysRemaining)} dagen gratis Pro toegang
              </>
            )}
          </p>
          <p className={`text-sm mt-1 ${
            isExpiringSoon ? 'text-amber-700' : 'text-blue-700'
          }`}>
            Kies een plan om toegang te behouden tot alle features.
          </p>
        </div>
        <Link
          href={`/studio/${studioId}/subscription`}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isExpiringSoon
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          Plan Kiezen
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Sluiten"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

interface SubscriptionBadgeProps {
  tier: 'basic' | 'plus' | 'pro'
  size?: 'sm' | 'md'
}

/**
 * Badge to show subscription tier
 */
export function SubscriptionBadge({ tier, size = 'md' }: SubscriptionBadgeProps) {
  const colors = {
    basic: 'bg-slate-100 text-slate-700 border-slate-200',
    plus: 'bg-blue-100 text-blue-700 border-blue-200',
    pro: 'bg-purple-100 text-purple-700 border-purple-200',
  }

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
  }

  const labels = {
    basic: 'Basic',
    plus: 'Plus',
    pro: 'Pro',
  }

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${colors[tier]} ${sizes[size]}`}>
      {labels[tier]}
    </span>
  )
}
