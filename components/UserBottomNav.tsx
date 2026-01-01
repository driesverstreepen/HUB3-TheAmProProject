'use client'

// UserBottomNav: bottom tabs for user-facing routes (not HUB interface)
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
  { href: '/dashboard', label: 'Home' },
  { href: '/hub', label: 'HUB3', featureKey: 'hub.home' },
]

function getStudioHomeHref(pathname: string | null | undefined) {
  if (!pathname) return null
  if (!pathname.startsWith('/studio')) return null
  const parts = pathname.split('/').filter(Boolean)
  // /studio/[id]/... -> /studio/[id]
  if (parts.length >= 2 && parts[0] === 'studio') return `/studio/${parts[1]}`
  return '/studio'
}

export function UserBottomNav() {
  const pathname = usePathname()
  const { isEnabled, isHidden, getComingSoonLabel, loading } = useFeatureFlags()
  const showBottomNav = !loading && isEnabled('ui.bottom-nav', true)
  if (!showBottomNav) return null
  const studioHome = getStudioHomeHref(pathname)
  const resolvedTabs = tabs.map((t) => (t.href === '/dashboard' && studioHome ? { ...t, href: studioHome } : t))

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white"
    >
      <div className="relative mx-auto max-w-xl" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {/* Paint the bar background per tab column, including the safe-area padding */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-white" />
          <div className="absolute inset-y-0 right-0 w-1/2 bg-blue-600" />
        </div>

        <ul className="relative grid grid-cols-2">
        {resolvedTabs.map((t) => {
          if (t.featureKey && isHidden(t.featureKey, false)) return null
          const active = pathname === t.href || (t.href !== '/dashboard' && pathname?.startsWith(t.href))
          const isHub = t.href === '/hub'
          const disabled = t.featureKey ? !isEnabled(t.featureKey, true) : false
          const badge = t.featureKey ? getComingSoonLabel(t.featureKey, 'Soon') : 'Soon'
          const baseClass = 'flex h-12 items-center justify-center text-sm transition-colors w-full'
          const normalStyles = active
            ? 'text-sky-600 font-medium'
            : 'text-slate-900 hover:text-slate-900'
          const hubStyles = 'flex h-12 w-full items-center justify-center text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700'
          return (
            <li key={t.href}>
              {disabled ? (
                <div className={(isHub ? hubStyles : `${baseClass} ${normalStyles}`) + ' cursor-not-allowed opacity-60'}>
                  <span>{t.label}</span>
                  <span className="ml-2 text-[10px] bg-white/70 px-1.5 py-0.5 rounded">{badge}</span>
                </div>
              ) : (
                <Link
                  href={t.href}
                  className={isHub ? hubStyles : `${baseClass} ${normalStyles}`}
                >
                  {t.label}
                </Link>
              )}
            </li>
          )
        })}
        </ul>
      </div>
    </nav>
  )
}
