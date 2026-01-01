"use client"

import { usePathname, useRouter } from 'next/navigation'
import { Calendar, User, Settings, LogOut, Sun, Moon, Home, CreditCard, Building2, ChevronDown, Menu, Check, Heart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import NotificationBell from '@/components/NotificationBell'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useDevice } from '@/contexts/DeviceContext'
import { getUserStudios, safeSelect } from '@/lib/supabaseHelpers'
import { MobileSidebar } from '@/components/ui/MobileSidebar'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

export default function UserTopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [promoCard, setPromoCard] = useState<
    | {
        is_visible: boolean
        title: string
        description: string
        button_label: string | null
        button_href: string | null
      }
    | null
  >(null)
  const [showStudioSwitcher, setShowStudioSwitcher] = useState(false)
  const [extraAdminStudios, setExtraAdminStudios] = useState<any[]>([])
  const [loadingStudios, setLoadingStudios] = useState(true)
  const { theme, toggle } = useTheme()
  const { isMobile } = useDevice()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hideTopNav, setHideTopNav] = useState(false)
  const lastScrollYRef = useRef(0)
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags()

  // Fetch user's studios to check if they are an "extra admin" (not via eigenaar_id)
  useEffect(() => {
    const fetchUserStudios = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoadingStudios(false)
          return
        }

        const { data: studioRows, error } = await getUserStudios(supabase, user.id)
        if (error || !studioRows) {
          setLoadingStudios(false)
          return
        }

        // Normalize rows returned by getUserStudios. Each row is expected to have
        // { studio_id, role, studios: { id, naam, eigenaar_id, ... } }
        // Debug: inspect studios payload
        try {
          console.info('UserTopNav:getUserStudios rows:', studioRows)
        } catch {}

        const normalized = (studioRows || []).map((r: any) => {
          const studioObj = r.studios || {}
          return {
            id: studioObj.id || r.studio_id,
            naam: studioObj.naam || studioObj.name || studioObj.title || studioObj.id,
            eigenaar_id: studioObj.eigenaar_id,
            role: r.role
          }
        })

        try {
          console.info('UserTopNav:normalized studios:', normalized)
        } catch {}

        // Ensure names are present: fetch from studios table if missing
        try {
          const missingIds = (normalized || [])
            .filter((s: any) => !s.naam || String(s.naam).trim().length === 0)
            .map((s: any) => s.id)
            .filter(Boolean)

          if (missingIds.length > 0) {
            const { data: nameRows, error: nameErr } = await supabase
              .from('studios')
              .select('id, naam')
              .in('id', missingIds)

            if (!nameErr && nameRows) {
              const nameMap: Record<string, string> = {}
              for (const row of nameRows as any[]) {
                if (row && row.id) nameMap[String(row.id)] = String(row.naam || '')
              }
              for (const s of normalized as any[]) {
                if (!s.naam || String(s.naam).trim().length === 0) {
                  const nm = nameMap[String(s.id)]
                  if (nm && nm.trim().length > 0) s.naam = nm
                }
              }
            }
          }
        } catch (e) {
          console.info('UserTopNav: fallback studio name fetch failed:', (e as any)?.message || e)
        }

        // Extra admin studios: user has a role but is not the eigenaar
        const extraStudios = normalized.filter((s: any) => s.eigenaar_id !== user.id)

        setExtraAdminStudios(extraStudios)
        setLoadingStudios(false)
      } catch (err) {
        console.error('Error fetching user studios:', err)
        setLoadingStudios(false)
      }
    }

    fetchUserStudios()
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadPromo = async () => {
      const { data, error, missingTable } = await safeSelect(
        supabase,
        'promo_cards',
        'interface,is_visible,title,description,button_label,button_href',
        { interface: 'user' }
      )

      if (cancelled) return
      if (missingTable || error) {
        setPromoCard(null)
        return
      }

      const row = Array.isArray(data) ? (data[0] as any) : null
      if (!row) {
        setPromoCard(null)
        return
      }

      setPromoCard({
        is_visible: !!row.is_visible,
        title: String(row.title || ''),
        description: String(row.description || ''),
        button_label: row.button_label ? String(row.button_label) : null,
        button_href: row.button_href ? String(row.button_href) : null,
      })
    }

    loadPromo()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Reset logout confirmation when clicking outside (but not on logout button)
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      // Don't reset if interacting inside the mobile sidebar panel
      if (target.closest('[data-mobile-sidebar-panel="true"]')) return

      // Don't reset if clicking on logout button or its children
      if (!target.closest('[data-logout-button]')) {
        setShowLogoutConfirm(false)
      }
    };

    // Auto-reset logout confirmation after 5 seconds
    let resetTimeout: NodeJS.Timeout;
    if (showLogoutConfirm) {
      resetTimeout = setTimeout(() => {
        setShowLogoutConfirm(false);
      }, 5000);
    }

    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      if (resetTimeout) {
        clearTimeout(resetTimeout);
      }
    };
  }, [showLogoutConfirm]);

  useEffect(() => {
    if (!isMobile) {
      setHideTopNav(false)
      return
    }

    const threshold = 10
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

      if (delta > threshold && y > minYToHide) {
        setHideTopNav(true)
      } else if (delta < -threshold) {
        setHideTopNav(false)
      }

      lastScrollYRef.current = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isMobile])

  const handleLogout = async () => {
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timed out')), 4000)),
      ])
    } catch {
      // ignore
    } finally {
      window.location.href = '/'
    }
  }

  const handleLogoutClick = () => {
    if (showLogoutConfirm) {
      handleLogout();
    } else {
      setShowLogoutConfirm(true);
    }
  }

  const tabs = [
    { name: 'Home', path: '/dashboard', icon: Home, featureKey: 'user.dashboard' },
    { name: 'Mijn Lessen', path: '/mijn-lessen', icon: Calendar, featureKey: 'user.mijn-lessen' },
    { name: 'Beurtenkaarten', path: '/class-passes', icon: CreditCard, featureKey: 'user.class-passes' },
    { name: 'Favorieten', path: '/favorieten', icon: Heart },
  ]

  const visibleTabs = tabs.filter((t: any) => !t.featureKey || !isHidden(t.featureKey, false))

  return (
    <nav
      className="bg-white border-b border-gray-200 nav-surface sticky top-0 z-40 overflow-hidden transition-all duration-300 ease-out"
      style={
        isMobile
          ? {
              maxHeight: hideTopNav ? '0px' : '48px',
              opacity: hideTopNav ? 0 : 1,
              transform: hideTopNav ? 'translateY(-8px)' : 'translateY(0px)',
              pointerEvents: hideTopNav ? 'none' : 'auto',
            }
          : undefined
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex ${isMobile ? 'justify-between h-12' : 'justify-between h-16'}`}>
          {/* Left: Hamburger (mobile) or tabs (desktop) */}
          {isMobile ? (
            <button
              onClick={() => setMenuOpen(true)}
              className="p-2 rounded-md text-slate-700 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
          ) : (
            <div className="flex space-x-8">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon
                const isActive = pathname === tab.path
                const disabled = tab.featureKey ? !isEnabled(tab.featureKey, true) : false
                const soonLabel = tab.featureKey ? getComingSoonLabel(tab.featureKey, 'Soon') : 'Soon'

                if (disabled) {
                  return (
                    <div
                      key={tab.path}
                      className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-400 cursor-not-allowed"
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      <span>{tab.name}</span>
                      <span className="ml-2 text-xs bg-slate-100 px-2 py-0.5 rounded">{soonLabel}</span>
                    </div>
                  )
                }
                return (
                  <button
                    key={tab.path}
                    onClick={() => router.push(tab.path)}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {tab.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Right side - Actions */}
          <div className="flex items-center">
            {/* HUB3 Interface - prominent action */}
            <div className="flex items-center gap-3">
              {!isMobile && (
                (() => {
                  if (isHidden('hub.home', false)) return null
                  const disabled = !isEnabled('hub.home', true)
                  const badge = getComingSoonLabel('hub.home', 'Soon')

                  return (
                    <button
                      onClick={disabled ? undefined : () => router.push('/hub')}
                      disabled={disabled}
                      className={
                        disabled
                          ? 'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold w-32 bg-slate-200 text-slate-500 cursor-not-allowed'
                          : 'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold w-32 text-white bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300'
                      }
                      title="Naar HUB3 Interface"
                      aria-label="Explore HUB3"
                    >
                      <span className="whitespace-nowrap">HUB3</span>
                      {disabled ? <span className="ml-2 text-xs bg-white/70 px-2 py-0.5 rounded">{badge}</span> : null}
                    </button>
                  )
                })()
              )}

              {/* Studio Interface Switcher - only for extra admins */}
              {!isMobile && !loadingStudios && extraAdminStudios.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => {
                      if (extraAdminStudios.length === 1) {
                        // Navigate to the studio interface root
                        router.push(`/studio/${extraAdminStudios[0].id}`)
                      } else {
                        setShowStudioSwitcher(!showStudioSwitcher)
                      }
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all w-32 justify-center"
                    title="Naar Studio Interface"
                  >
                    <span>Studio</span>
                    {extraAdminStudios.length > 1 && <ChevronDown className="w-3 h-3" />}
                  </button>

                  {/* Dropdown for multiple studios */}
                  {showStudioSwitcher && extraAdminStudios.length > 1 && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowStudioSwitcher(false)}
                      />
                      <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                        <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Selecteer Studio
                        </div>
                        {extraAdminStudios.map((studio) => (
                          <button
                            key={studio.id}
                            onClick={() => {
                              // Navigate to the studio interface root
                              router.push(`/studio/${studio.id}`)
                              setShowStudioSwitcher(false)
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors flex items-center gap-2"
                          >
                            <Building2 className="w-4 h-4 text-blue-600" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{studio.naam}</div>
                              <div className="text-xs text-gray-500">{studio.role === 'owner' ? 'Eigenaar' : 'Admin'}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Spacer between HUB3/Studio and compact icons (desktop only) */}
            <div className={isMobile ? 'hidden' : 'ml-8'} />

            <div className="flex items-center space-x-3">
              {/* Notification Bell */}
              <NotificationBell iconSize={isMobile ? 20 : 16} />

              {/* Desktop-only quick actions; on mobile moved into sidebar */}
              {!isMobile && (
                <>
                  <button
                    onClick={() => router.push('/profile')}
                    className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                    title="Profiel"
                  >
                    <User className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => router.push('/settings')}
                    className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                    title="Instellingen"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={toggle}
                    className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                    title={theme === 'dark' ? 'Schakel lichtmodus in' : 'Schakel donker modus in'}
                    aria-label="Toggle theme"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                  {showLogoutConfirm ? (
                    <button
                      onClick={handleLogout}
                      data-logout-button
                      className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                      title="Bevestig uitloggen"
                      aria-label="Bevestig uitloggen"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleLogoutClick}
                      data-logout-button
                      className="p-1 text-gray-500 hover:text-red-500 focus:text-red-500 hover:bg-gray-100 rounded-full transition-colors"
                      title="Uitloggen"
                      aria-label="Uitloggen"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Mobile Sidebar */}
      {isMobile && (
        <MobileSidebar
          open={menuOpen}
          onClose={() => {
            setMenuOpen(false)
            setShowLogoutConfirm(false)
          }}
          onOpen={() => setMenuOpen(true)}
          header={<div className="font-semibold text-slate-900">Mijn HUB3</div>}
          sections={[
            {
              title: 'Navigatie',
              items: [
                ...(!isHidden('user.dashboard', false)
                  ? [
                      {
                        label: 'Home',
                        href: '/dashboard',
                        icon: Home,
                        disabled: !isEnabled('user.dashboard', true),
                        badge: !isEnabled('user.dashboard', true) ? getComingSoonLabel('user.dashboard', 'Soon') : undefined,
                      },
                    ]
                  : []),
                ...(!isHidden('user.mijn-lessen', false)
                  ? [
                      {
                        label: 'Mijn Lessen',
                        href: '/mijn-lessen',
                        icon: Calendar,
                        disabled: !isEnabled('user.mijn-lessen', true),
                        badge: !isEnabled('user.mijn-lessen', true) ? getComingSoonLabel('user.mijn-lessen', 'Soon') : undefined,
                      },
                    ]
                  : []),
                ...(!isHidden('user.class-passes', false)
                  ? [
                      {
                        label: 'Beurtenkaarten',
                        href: '/class-passes',
                        icon: CreditCard,
                        disabled: !isEnabled('user.class-passes', true),
                        badge: !isEnabled('user.class-passes', true) ? getComingSoonLabel('user.class-passes', 'Soon') : undefined,
                      },
                    ]
                  : []),
                {
                  label: 'Favorieten',
                  href: '/favorieten',
                  icon: Heart,
                },
              ],
            },
            {
              title: 'Interface',
              items: [
                ...(!isHidden('hub.home', false)
                  ? [
                      {
                        label: 'HUB3 interface',
                        onClick: () => {
                          if (!isEnabled('hub.home', true)) return
                          router.push('/hub')
                          setMenuOpen(false)
                        },
                        disabled: !isEnabled('hub.home', true),
                        badge: !isEnabled('hub.home', true) ? getComingSoonLabel('hub.home', 'Soon') : undefined,
                      },
                    ]
                  : []),
                ...(loadingStudios
                  ? []
                  : extraAdminStudios.length > 1
                    ? [
                        {
                          label: 'Studio interface',
                          children: extraAdminStudios.map((s: any) => ({
                            label: s.naam || 'Studio',
                            href: `/studio/${s.id}`,
                          })),
                        },
                      ]
                    : [
                        {
                          label: 'Studio interface',
                          onClick: () => {
                            const id = extraAdminStudios?.[0]?.id
                            router.push(id ? `/studio/${id}` : '/studio')
                            setMenuOpen(false)
                          },
                        },
                      ]),
              ],
            },
            {
              items: [],
              content: promoCard?.is_visible ? (
                <div className="rounded-xl border border-white/10 bg-linear-to-br from-blue-600 via-purple-600 to-blue-800 text-white px-4 py-4 overflow-hidden">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex items-center rounded-md bg-white/15 text-white px-2 py-0.5 text-xs font-semibold">
                      New
                    </span>
                  </div>

                  <div className="mt-2 font-semibold">{promoCard.title}</div>
                  <div className="mt-1 text-sm text-white/85">{promoCard.description}</div>

                  {promoCard.button_href && promoCard.button_href.trim().length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        router.push(promoCard.button_href as string)
                        setMenuOpen(false)
                        setShowLogoutConfirm(false)
                      }}
                      className="mt-3 inline-flex items-center rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
                    >
                      {promoCard.button_label && promoCard.button_label.trim().length > 0 ? promoCard.button_label : 'Bekijk'}
                    </button>
                  ) : null}
                </div>
              ) : null,
            },
            {
              title: 'Acties',
              items: [
                { label: 'Profiel', href: '/profile', icon: User },
                { label: 'Instellingen', href: '/settings', icon: Settings },
                { label: theme === 'dark' ? 'Lichtmodus' : 'Donker modus', onClick: toggle, icon: theme === 'dark' ? Sun : Moon },
                {
                  label: showLogoutConfirm ? 'Bevestig uitloggen' : 'Uitloggen',
                  onClick: async () => {
                    if (!showLogoutConfirm) {
                      setShowLogoutConfirm(true)
                      return
                    }

                    setMenuOpen(false)
                    setShowLogoutConfirm(false)
                    await handleLogout()
                  },
                  icon: LogOut,
                  tone: showLogoutConfirm ? 'danger' : 'default',
                },
              ],
            },
          ]}
        />
      )}
    </nav>
  )
}
