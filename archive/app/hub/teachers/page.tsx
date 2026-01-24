"use client"

import TeachersClient from './TeachersClient'
import React, { Suspense } from 'react'
import { useDevice } from '@/contexts/DeviceContext'
import { HubBottomNav } from '@/components/hub/HubBottomNav'
import HubTopNav from '@/components/hub/HubTopNav'
import HubMobileTopNav from '@/components/hub/HubMobileTopNav'
import { FeatureGate } from '@/components/FeatureGate'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

function Wrapper({ children }: { children: React.ReactNode }) {
  const { isMobile } = useDevice()
  const { isEnabled } = useFeatureFlags()
  const showBottomNav = isEnabled('ui.bottom-nav', true)
  return (
    <div style={{ paddingBottom: showBottomNav ? 'calc(3rem + env(safe-area-inset-bottom) + 12px)' : undefined }}>
      {isMobile ? <HubMobileTopNav /> : <HubTopNav />}
      {children}
      {isMobile && showBottomNav ? <HubBottomNav /> : null}
    </div>
  )
}

export default function Page() {
  return (
    <FeatureGate flagKey="hub.teachers" mode="page" title="Teachers HUB komt binnenkort">
      <Suspense fallback={<div className="min-h-screen bg-white" />}> 
        <Wrapper>
          <TeachersClient />
        </Wrapper>
      </Suspense>
    </FeatureGate>
  )
}
