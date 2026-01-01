"use client"

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Airplay, List, LogIn, User, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { safeSelect } from '@/lib/supabaseHelpers'
import { useDevice } from '@/contexts/DeviceContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

export const PublicNavigation: React.FC<{ onNavigate?: (page: any) => void, onLogin?: () => void, onSignup?: () => void }> = ({ onNavigate, onLogin, onSignup }) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hideTopNav, setHideTopNav] = useState(false)
  const lastScrollYRef = useRef(0)
  const pathname = usePathname()
  const { isMobile } = useDevice()
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags()

  const navItems = [
    {
      key: 'welcome.for-studios',
      label: pathname === '/for-studios' ? 'Voor Dansers' : 'Voor Studios',
      href: pathname === '/for-studios' ? '/' : '/for-studios',
    },
    { key: 'welcome.pricing', label: 'Prijzen', href: '/pricing' },
    { key: 'welcome.faq', label: 'FAQ', href: '/faq' },
  ]

  const visibleNavItems = navItems.filter((item) => !isHidden(item.key, false))

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data, error, missingTable } = await safeSelect(supabase, 'site_settings', 'logo_url')
        if (!missingTable && !error && data && Array.isArray(data) && data.length > 0) {
          const row = data[0] as any
          if (mounted && row.logo_url) setLogoUrl(row.logo_url)
        }
      } catch (e) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!isMobile || mobileOpen) {
      setHideTopNav(false)
      return
    }

    const hideThreshold = 8
    const showThreshold = 2
    const minYToHide = 64

    lastScrollYRef.current = typeof window !== 'undefined' ? window.scrollY : 0

    const onScroll = () => {
      const y = window.scrollY
      const prevY = lastScrollYRef.current
      const delta = y - prevY

      if (y < 8) {
        setHideTopNav(false)
        lastScrollYRef.current = y
        return
      }

      if (delta > hideThreshold && y > minYToHide) {
        setHideTopNav(true)
      } else if (delta < -showThreshold) {
        setHideTopNav(false)
      }

      lastScrollYRef.current = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isMobile, mobileOpen])

  return (
    <header
      className="bg-white/60 text-slate-950 backdrop-blur-sm sticky top-0 z-40 shadow-sm overflow-hidden transition-all duration-300 ease-out"
      style={
        isMobile
          ? {
              maxHeight: hideTopNav ? '0px' : mobileOpen ? '520px' : '80px',
              opacity: hideTopNav ? 0 : 1,
              transform: hideTopNav ? 'translateY(-8px)' : 'translateY(0px)',
              pointerEvents: hideTopNav ? 'none' : 'auto',
            }
          : undefined
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <Link href="/" className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="HUB3 logo" className="h-10 sm:h-12 object-contain" />
            ) : (
              <Airplay className="w-8 h-8 text-blue-600" />
            )}
            <span className="m-cardTitle font-bold  text-slate-700">HUB3</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center">
            <div className="flex items-center gap-4 mr-6">
              {visibleNavItems.map((item) => {
                const disabled = !isEnabled(item.key, true)
                const badge = getComingSoonLabel(item.key, 'Soon')

                if (disabled) {
                  return (
                    <div
                      key={item.href}
                      className="inline-flex items-center gap-2 text-slate-400 cursor-not-allowed"
                    >
                      <span className="m-bodySm font-medium">{item.label}</span>
                      <span className="m-caption bg-slate-100 px-2 py-0.5 rounded">{badge}</span>
                    </div>
                  )
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="m-body font-medium text-slate-600 hover:text-blue-600"
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>

            <div className="flex items-center gap-3">
              {(() => {
                if (isHidden('auth.login', false)) return null
                const disabled = !isEnabled('auth.login', true)
                const badge = getComingSoonLabel('auth.login', 'Soon')
                return (
                  <button
                    onClick={disabled ? undefined : onLogin}
                    disabled={disabled}
                    className={
                      disabled
                        ? 'inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700'
                    }
                  >
                    <LogIn className="w-4 h-4" />
                    <span className="m-body">Login</span>
                    {disabled ? <span className="ml-1 m-caption bg-white/70 px-2 py-0.5 rounded">{badge}</span> : null}
                  </button>
                )
              })()}
              {(() => {
                if (isHidden('auth.signup', false)) return null
                const disabled = !isEnabled('auth.signup', true)
                const badge = getComingSoonLabel('auth.signup', 'Soon')
                return (
                  <button
                    onClick={disabled ? undefined : onSignup}
                    disabled={disabled}
                    className={
                      disabled
                        ? 'inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 text-slate-400 cursor-not-allowed'
                        : 'inline-flex items-center gap-2 px-4 py-2 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50'
                    }
                  >
                    <User className="w-4 h-4" />
                    <span className="m-button">Sign up</span>
                    {disabled ? <span className="ml-1 m-caption bg-slate-100 px-2 py-0.5 rounded">{badge}</span> : null}
                  </button>
                )
              })()}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center p-3 rounded-md text-slate-700 hover:bg-white/80"
            aria-label={mobileOpen ? 'Sluit menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="w-7 h-7" /> : <List className="w-7 h-7" />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen ? (
          <div className="md:hidden pb-4">
            <div className="flex flex-col gap-2">
              {visibleNavItems.map((item) => {
                const disabled = !isEnabled(item.key, true)
                const badge = getComingSoonLabel(item.key, 'Soon')

                if (disabled) {
                  return (
                    <div
                      key={item.href}
                      className="px-3 py-2 rounded-md text-slate-400 cursor-not-allowed flex items-center justify-between"
                    >
                      <span className="m-bodySm">{item.label}</span>
                      <span className="m-caption bg-slate-100 px-2 py-0.5 rounded">{badge}</span>
                    </div>
                  )
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-2 rounded-md text-slate-700 hover:bg-white/80"
                  >
                    <span className="m-bodySm">{item.label}</span>
                  </Link>
                )
              })}

              <div className="pt-2 flex flex-col gap-2">
                {(() => {
                  if (isHidden('auth.login', false)) return null
                  const disabled = !isEnabled('auth.login', true)
                  const badge = getComingSoonLabel('auth.login', 'Soon')
                  return (
                    <button
                      onClick={disabled ? undefined : onLogin}
                      disabled={disabled}
                      className={
                        disabled
                          ? 'w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-slate-200 text-slate-500 cursor-not-allowed'
                          : 'w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700'
                      }
                    >
                      <LogIn className="w-4 h-4" />
                      <span className="m-button">Login</span>
                      {disabled ? <span className="ml-1 m-caption bg-white/70 px-2 py-0.5 rounded">{badge}</span> : null}
                    </button>
                  )
                })()}
                {(() => {
                  if (isHidden('auth.signup', false)) return null
                  const disabled = !isEnabled('auth.signup', true)
                  const badge = getComingSoonLabel('auth.signup', 'Soon')
                  return (
                    <button
                      onClick={disabled ? undefined : onSignup}
                      disabled={disabled}
                      className={
                        disabled
                          ? 'w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-slate-300 text-slate-400 cursor-not-allowed'
                          : 'w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50'
                      }
                    >
                      <User className="w-4 h-4" />
                      <span className="m-button">Sign up</span>
                      {disabled ? <span className="ml-1 m-caption bg-slate-100 px-2 py-0.5 rounded">{badge}</span> : null}
                    </button>
                  )
                })()}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}
