'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User, Settings, LogOut, Sun, Moon, Menu } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import NotificationBell from '@/components/NotificationBell'
import { MobileSidebar, type MobileSidebarSection } from '@/components/ui/MobileSidebar'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { safeSelect } from '@/lib/supabaseHelpers'

export default function HubMobileTopNav() {
  const router = useRouter()
  const [isStudioAdmin, setIsStudioAdmin] = useState(false)
  const [isStudioOwner, setIsStudioOwner] = useState(false)
  const [studioId, setStudioId] = useState<string | null>(null)
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
  const { theme, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hideTopNav, setHideTopNav] = useState(false)
  const lastScrollYRef = useRef(0)
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags()

  useEffect(() => {
    checkStudioAdmin()

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      checkStudioAdmin()
    })

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      // Don't reset if interacting inside the mobile sidebar panel
      if (target.closest('[data-mobile-sidebar-panel="true"]')) return

      // Don't reset if clicking on logout button or its children
      if (!target.closest('[data-logout-button]')) setShowLogoutConfirm(false)
    }

    let resetTimeout: NodeJS.Timeout
    if (showLogoutConfirm) {
      resetTimeout = setTimeout(() => setShowLogoutConfirm(false), 5000)
    }

    document.addEventListener('click', handleClickOutside)

    return () => {
      try { authListener?.subscription?.unsubscribe?.() } catch {}
      document.removeEventListener('click', handleClickOutside)
      if (resetTimeout) clearTimeout(resetTimeout)
    }
  }, [showLogoutConfirm])

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
  }, [])

  const checkStudioAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsStudioAdmin(false)
        setIsStudioOwner(false)
        setStudioId(null)
        return
      }

      const { data: memberData } = await supabase
        .from('studio_members')
        .select('role, studio_id')
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin'])
        .maybeSingle()

      if (memberData) {
        setIsStudioAdmin(true)
        setIsStudioOwner(memberData.role === 'owner')
        setStudioId(memberData.studio_id || null)
      } else {
        // Owners are not always present in studio_members.
        const { data: ownerStudio } = await supabase
          .from('studios')
          .select('id')
          .eq('eigenaar_id', user.id)
          .maybeSingle()

        if (ownerStudio?.id) {
          setIsStudioAdmin(true)
          setIsStudioOwner(true)
          setStudioId(ownerStudio.id)
        } else {
          setIsStudioAdmin(false)
          setIsStudioOwner(false)
          setStudioId(null)
        }
      }
    } catch (error) {
      console.error('Error checking studio admin status:', error)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleLogoutClick = () => {
    if (showLogoutConfirm) handleLogout()
    else setShowLogoutConfirm(true)
  }

  const sections: MobileSidebarSection[] = [
    {
      title: 'Navigatie',
      items: [
        { label: 'Home', href: '/hub' },
        ...(!isHidden('hub.workshops', false)
          ? [
              {
                label: 'Workshops',
                href: '/hub/workshops',
                disabled: !isEnabled('hub.workshops', true),
                badge: !isEnabled('hub.workshops', true) ? getComingSoonLabel('hub.workshops', 'Soon') : undefined,
              },
            ]
          : []),
        ...(!isHidden('hub.studios', false)
          ? [
              {
                label: 'Studios',
                href: '/hub/studios',
                disabled: !isEnabled('hub.studios', true),
                badge: !isEnabled('hub.studios', true) ? getComingSoonLabel('hub.studios', 'Soon') : undefined,
              },
            ]
          : []),
        ...(!isHidden('hub.teachers', false)
          ? [
              {
                label: 'Teachers',
                href: '/hub/teachers',
                disabled: !isEnabled('hub.teachers', true),
                badge: !isEnabled('hub.teachers', true) ? getComingSoonLabel('hub.teachers', 'Soon') : undefined,
              },
            ]
          : []),
      ],
    },
    {
      title: 'Interface',
      items: [
        {
          label: 'User interface',
          onClick: () => {
            router.push('/dashboard')
            setMenuOpen(false)
          },
        },
        {
          label: 'Studio interface',
          onClick: () => {
            router.push(studioId ? `/studio/${studioId}` : '/studio')
            setMenuOpen(false)
          },
        },
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
        {
          label: 'Mijn profiel',
          href: isStudioOwner ? (studioId ? `/studio/${studioId}/profile` : '/studio') : '/profile',
          icon: User,
        },
        {
          label: 'Instellingen',
          href: isStudioAdmin ? (studioId ? `/studio/${studioId}/settings` : '/studio') : '/settings',
          icon: Settings,
        },
        { label: theme === 'dark' ? 'Lichtmodus' : 'Donker modus', onClick: toggle, icon: theme === 'dark' ? Sun : Moon },
        {
          label: showLogoutConfirm ? 'Bevestig uitloggen' : 'Uitloggen',
          onClick: () => {
            if (showLogoutConfirm) {
              setMenuOpen(false)
              setShowLogoutConfirm(false)
              handleLogout()
              return
            }

            setShowLogoutConfirm(true)
          },
          icon: LogOut,
          tone: showLogoutConfirm ? 'danger' : 'default',
        },
      ],
    },
  ]

  return (
    <nav
      className="bg-white border-b border-gray-200 sticky top-0 z-40 overflow-hidden transition-all duration-300 ease-out"
      style={{
        maxHeight: hideTopNav ? '0px' : '48px',
        opacity: hideTopNav ? 0 : 1,
        transform: hideTopNav ? 'translateY(-8px)' : 'translateY(0px)',
        pointerEvents: hideTopNav ? 'none' : 'auto',
      }}
    >
      <div className="px-4">
        <div className="flex justify-between items-center h-12">
          {/* Left: Hamburger to open menu */}
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 rounded-md text-slate-700 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Right: notifications */}
          <NotificationBell iconSize={20} />
        </div>
      </div>
      <MobileSidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpen={() => setMenuOpen(true)}
        sections={sections}
        header={<div className="font-semibold text-slate-900">HUB3</div>}
      />
    </nav>
  )
}
