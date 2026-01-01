'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { UserBottomNav } from '@/components/UserBottomNav'
import UserTopNav from '@/components/user/UserTopNav'
import FloatingFeedbackButton from '@/components/feedback/FloatingFeedbackButton'

export function MobileShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const { isEnabled, loading } = useFeatureFlags()
  const showBottomNav = !loading && isEnabled('ui.bottom-nav', true)

  return (
    <div className={theme === 'dark' ? 'dark bg-black min-h-screen' : 'bg-slate-50 min-h-screen'}>
      <UserTopNav />
      <FloatingFeedbackButton interface="user" />
      <main style={{ paddingBottom: showBottomNav ? 'calc(3rem + env(safe-area-inset-bottom) + 12px)' : undefined }}>{children}</main>
      {showBottomNav ? <UserBottomNav /> : null}
    </div>
  )
}
