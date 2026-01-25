'use client'

import React from 'react'

import UserTopNav from '@/components/user/UserTopNav'
import HubTopNav from '@/components/hub/HubTopNav'
import HubMobileTopNav from '@/components/hub/HubMobileTopNav'
import AmproTopNav from '@/components/ampro/AmproTopNav'
import AmproMobileTopNav from '@/components/ampro/AmproMobileTopNav'
import { usePathname } from 'next/navigation'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { FeatureFlagsProvider } from '@/contexts/FeatureFlagsContext'
import { PublicFooter } from '@/components/PublicFooter'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { DeviceProvider, useDevice } from '@/contexts/DeviceContext'
import { MobileShell } from '@/components/MobileShell'
import FloatingFeedbackButton from '@/components/feedback/FloatingFeedbackButton'

export default function UserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  
  // Check if we're on a user-facing page that should show the top navigation
  // Include explore, program detail pages and visitor-facing studio public pages
  // Show the top navigation for user-facing pages. If the /hub route
  // is opened with a studioId query param we consider it part of the
  // studio management interface and therefore do NOT show the top nav
  // (the studio sidebar will be rendered by the hub page itself).
  const showSidebar = pathname.startsWith('/mijn-lessen') || 
            pathname.startsWith('/profile') || 
            pathname.startsWith('/settings') ||
            pathname.startsWith('/dashboard') ||
            pathname.startsWith('/class-passes') ||
            pathname.startsWith('/favorieten')

    // Pages that should NOT show the public footer (admin or management sections)
    const excludeFooter = pathname.startsWith('/admin') || pathname.startsWith('/super-admin') || pathname.startsWith('/studio') || pathname.startsWith('/teacher')

    return (
        <ThemeProvider>
          <DeviceProvider>
            <NotificationProvider>
              <FeatureFlagsProvider>
                <InnerLayout showSidebar={showSidebar} excludeFooter={excludeFooter} pathname={pathname}>
                  {children}
                </InnerLayout>
              </FeatureFlagsProvider>
            </NotificationProvider>
          </DeviceProvider>
        </ThemeProvider>
    )
}

function InnerLayout({ children, showSidebar, excludeFooter, pathname }:{ children: React.ReactNode, showSidebar: boolean, excludeFooter: boolean, pathname: string | null }) {
  // use theme from context and apply top-level .dark class when needed
  const { theme, setTheme } = useTheme()
  const { isMobile } = useDevice()
  const isAmproMode = true

  // Always scroll to top on navigation so the top nav is visible.
  React.useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      // Some browsers/layouts still rely on these.
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    } catch {
      // ignore
    }
  }, [pathname])

  // Force light theme on the public welcome page so the landing cannot be dark.
  // This affects only the root public welcome page (/) — interface and HUB pages keep user theme.
  React.useEffect(() => {
    try {
      if (pathname === '/') {
        setTheme('light')
      }
    } catch {
      // ignore
    }
  }, [pathname, setTheme])

  // Studio public pages should use the HUB top navigation
  if (pathname?.startsWith('/studio/public')) {
    return (
      <div className={`min-h-screen overflow-x-hidden ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
        {isMobile ? <HubMobileTopNav /> : <HubTopNav />}
        <main className="p-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    )
  }

  // AmPro public pages should match the studio public shell (HUB top nav).
  if (pathname?.startsWith('/ampro')) {
    const hideAmproTopNav = pathname?.startsWith('/ampro/admin') || pathname?.startsWith('/ampro/invite')
    return (
      <div className={`min-h-screen flex flex-col overflow-x-hidden ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
        {hideAmproTopNav
          ? null
          : isMobile
            ? <AmproMobileTopNav />
            : <AmproTopNav />}
        <main className="p-0 overflow-x-hidden flex-1">
          {children}
        </main>
        {(!(pathname === '/' || pathname === '/start') ) && <PublicFooter />}
      </div>
    )
  }

  // Mobile app-like layout for user-facing routes
  const isUserAppRoute = !!pathname && (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/explore') ||
    pathname.startsWith('/program') ||
    pathname.startsWith('/programmas') ||
    pathname.startsWith('/teachers') ||
    pathname.startsWith('/class-passes') ||
    pathname.startsWith('/favorieten') ||
    showSidebar
  )
  if (isMobile && isUserAppRoute && !excludeFooter) {
    return <MobileShell>{children}</MobileShell>
  }

  if (showSidebar) {
    return (
      <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
        <UserTopNav />
        <FloatingFeedbackButton interface="user" />
        <main className="p-0 flex-1">
          {children}
        </main>
      </div>
    )
  }

  if (excludeFooter) {
    return (
      <div className={theme === 'dark' ? 'dark bg-black min-h-screen' : 'bg-slate-50 min-h-screen'}>
        <FloatingFeedbackButton interface="user" />
        {children}
      </div>
    )
  }

  const forcePublicFooter = pathname === '/' ||
    pathname === '/for-studios' ||
    pathname === '/pricing' ||
    pathname === '/faq' ||
    pathname === '/legal/privacy-policy' ||
    pathname === '/legal/terms'

  return (
    <div className={theme === 'dark' ? 'dark bg-black min-h-screen flex flex-col' : 'bg-slate-50 min-h-screen flex flex-col'}>
      <FloatingFeedbackButton interface="user" />
      <div className="flex-1">
        {children}
      </div>
      {(forcePublicFooter || !isMobile) && <PublicFooter />}
    </div>
  )
}
