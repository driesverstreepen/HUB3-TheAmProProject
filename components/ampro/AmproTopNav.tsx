'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Moon, Sun, User, Check } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/contexts/ThemeContext'
import { isAmproAdmin } from '@/lib/ampro'

export default function AmproTopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggle } = useTheme()
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
      if (!target.closest('[data-logout-button]')) setShowLogoutConfirm(false)
    }

    let resetTimeout: NodeJS.Timeout
    if (showLogoutConfirm) {
      resetTimeout = setTimeout(() => setShowLogoutConfirm(false), 5000)
    }

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

  const handleLogoutClick = () => {
    if (showLogoutConfirm) handleLogout()
    else setShowLogoutConfirm(true)
  }

  const tabs = [
    {
      name: 'The AmProProject',
      path: '/ampro',
      activeWhen: (p: string) =>
        p === '/ampro' || p.startsWith('/ampro/programmas') || p.startsWith('/ampro/login') || p.startsWith('/ampro/signup'),
    },
    {
      name: 'Mijn Projecten',
      path: '/ampro/mijn-projecten',
      activeWhen: (p: string) => p.startsWith('/ampro/mijn-projecten') || p.startsWith('/ampro/user') || p.startsWith('/ampro/profile'),
    },
  ]

  return (
    <nav className="bg-white border-b border-gray-200 nav-surface sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex space-x-8">
            {tabs.map((tab) => {
              const isActive = tab.activeWhen(pathname)
              return (
                <button
                  key={tab.path}
                  onClick={() => router.push(tab.path)}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-700'
                  }`}
                >
                  {tab.name}
                </button>
              )
            })}
          </div>

          <div className="flex items-center">
            <div className="flex items-center space-x-3">
              {!isLoggedIn ? (
                <>
                  <button
                    onClick={() => router.push('/ampro/login')}
                    className="inline-flex h-9 items-center justify-center rounded-3xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => router.push('/ampro/signup')}
                    className="inline-flex h-9 items-center justify-center rounded-3xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 hover:bg-gray-100"
                  >
                    Account maken
                  </button>
                </>
              ) : (
                <>
                  {isAdmin ? (
                    <button
                      onClick={() => router.push('/ampro/admin')}
                      className="inline-flex h-9 items-center justify-center rounded-3xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
                      title="Admin"
                      aria-label="Admin"
                    >
                      Admin
                    </button>
                  ) : null}

                  <NotificationBell scope="ampro" />

                  <button
                    onClick={() => router.push('/ampro/profile')}
                    className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                    title="Mijn profiel"
                    aria-label="Mijn profiel"
                  >
                    <User className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                onClick={toggle}
                className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                title={theme === 'dark' ? 'Schakel lichtmodus in' : 'Schakel donker modus in'}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {isLoggedIn ? (
                showLogoutConfirm ? (
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
                )
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
