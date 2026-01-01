'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PricingPage from '@/components/PricingPage'
import { PublicNavigation } from '@/components/PublicNavigation'
import { FeatureGate } from '@/components/FeatureGate'

export default function PricingRoute() {
  const router = useRouter()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showSignupModal, setShowSignupModal] = useState(false)

  return (
    <FeatureGate flagKey="welcome.pricing" mode="page" title="Prijzen komen binnenkort">
      <div className="min-h-screen bg-slate-50">
        <PublicNavigation 
          onLogin={() => router.push('/?login=true')}
          onSignup={() => router.push('/?signup=studio')}
        />
        <PricingPage isPublic />
      </div>
    </FeatureGate>
  )
}
