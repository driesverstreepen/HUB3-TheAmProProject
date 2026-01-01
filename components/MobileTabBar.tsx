'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

type Tab = {
  href: string
  label: string
}

type FlagTab = Tab & { featureKey?: string }

const tabs: FlagTab[] = [
  { href: '/dashboard', label: 'Home', featureKey: 'user.dashboard' },
  { href: '/mijn-lessen', label: 'Lessen', featureKey: 'user.mijn-lessen' },
  { href: '/class-passes', label: 'Class Pass', featureKey: 'user.class-passes' },
  { href: '/hub', label: 'HUB3', featureKey: 'hub.home' },
]

export function MobileTabBar() {
  const pathname = usePathname()
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags()
  const showBottomNav = isEnabled('ui.bottom-nav', true)
  if (!showBottomNav) return null

  const visibleTabs = tabs.filter((t) => !t.featureKey || !isHidden(t.featureKey, false))

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/90 backdrop-blur supports-backdrop-filter:bg-white/70">
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {visibleTabs.map((t) => {
          const active = pathname === t.href || (t.href !== '/dashboard' && pathname?.startsWith(t.href))
          const disabled = t.featureKey ? !isEnabled(t.featureKey, true) : false
          const badge = t.featureKey ? getComingSoonLabel(t.featureKey, 'Soon') : 'Soon'
          return (
            <li key={t.href} className="">
              {disabled ? (
                <div
                  className={
                    'flex h-12 items-center justify-center text-sm transition-colors cursor-not-allowed opacity-60 ' +
                    (active
                      ? 'text-sky-600 font-medium'
                      : 'text-slate-600')
                  }
                >
                  <span>{t.label}</span>
                  <span className="ml-2 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{badge}</span>
                </div>
              ) : (
                <Link
                  href={t.href}
                  className={
                    'flex h-12 items-center justify-center text-sm transition-colors ' +
                    (active
                      ? 'text-sky-600 font-medium'
                      : 'text-slate-600 hover:text-slate-900')
                  }
                >
                  {t.label}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
