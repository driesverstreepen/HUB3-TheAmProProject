'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Menu, Moon, Sun, User } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'
import { MobileSidebar, type MobileSidebarSection } from '@/components/ui/MobileSidebar'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/contexts/ThemeContext'
import { isAmproAdmin } from '@/lib/ampro'

export default function AmproMobileTopNav() {
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      const loggedIn = !!data?.session?.user
      setIsLoggedIn(loggedIn)
      if (!loggedIn) {
        setIsAdmin(false)
        return
      }
      try {
        const ok = await isAmproAdmin()
        if (!cancelled) setIsAdmin(ok)
      } catch {
        if (!cancelled) setIsAdmin(false)
      }
    }

    load()

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('[data-mobile-sidebar-panel="true"]')) return
      if (!target.closest('[data-logout-button]')) setShowLogoutConfirm(false)
    }

    let resetTimeout: NodeJS.Timeout
    if (showLogoutConfirm) resetTimeout = setTimeout(() => setShowLogoutConfirm(false), 5000)

    document.addEventListener('click', handleClickOutside)
    return () => {
      cancelled = true
      try {
        authListener?.subscription?.unsubscribe?.()
      } catch {
        // ignore
      }
      document.removeEventListener('click', handleClickOutside)
      if (resetTimeout) clearTimeout(resetTimeout)
    }
  }, [showLogoutConfirm])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/ampro')
  }

  const sections: MobileSidebarSection[] = [
    {
      title: 'Navigatie',
      items: [
        {
          label: 'The AmProProject',
          onClick: () => {
            router.push('/ampro')
            setMenuOpen(false)
          },
        },
        {
          label: 'Mijn projecten',
          onClick: () => {
            router.push('/ampro/mijn-projecten')
            setMenuOpen(false)
          },
        },
      ],
    },
    {
      title: 'Acties',
      items: [
        ...(isLoggedIn
          ? [
              ...(isAdmin
                ? [
                    {
                      label: 'Admin',
                      onClick: () => {
                        router.push('/ampro/admin')
                        setMenuOpen(false)
                      },
                    },
                  ]
                : []),
              {
                label: 'Mijn profiel',
                onClick: () => {
                  router.push('/ampro/profile')
                  setMenuOpen(false)
                },
                icon: User,
              },
            ]
          : [
              {
                label: 'Login',
                onClick: () => {
                  router.push('/ampro/login')
                  setMenuOpen(false)
                },
              },
              {
                label: 'Account maken',
                onClick: () => {
                  router.push('/ampro/signup')
                  setMenuOpen(false)
                },
              },
            ]),
        {
          label: theme === 'dark' ? 'Lichtmodus' : 'Donker modus',
          onClick: () => {
            toggle()
            setMenuOpen(false)
          },
          icon: theme === 'dark' ? Sun : Moon,
        },
        ...(isLoggedIn
          ? [
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
                tone: (showLogoutConfirm ? 'danger' : 'default') as 'danger' | 'default',
              },
            ]
          : []),
      ],
    },
  ]

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40 overflow-hidden">
      <div className="px-4">
        <div className="flex justify-between items-center h-12">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 rounded-md text-slate-700 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          {isLoggedIn ? <NotificationBell scope="ampro" iconSize={20} /> : <div className="w-10" />}
        </div>
      </div>

      <MobileSidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpen={() => setMenuOpen(true)}
        sections={sections}
        header={<div className="font-semibold text-slate-900">The AmProProject</div>}
      />
    </nav>
  )
}
