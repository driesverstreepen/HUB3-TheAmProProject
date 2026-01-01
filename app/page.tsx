"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import WelcomePage from './WelcomePage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { safeSelect } from '@/lib/supabaseHelpers'

export default function Page() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const { theme } = useTheme()

  const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> => {
    let timeoutId: any
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), ms)
    })
    try {
      return await Promise.race([Promise.resolve(promise), timeout])
    } finally {
      clearTimeout(timeoutId)
    }
  }

  useEffect(() => {
    const checkSession = async () => {
      try {
        // If Supabase redirected back to '/' with an OAuth code (e.g. Allowed Redirect URLs
        // doesn't include /auth/callback), exchange it here so a session is established.
        try {
          if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search)
            const code = params.get('code')
            if (code) {
              const { error } = await withTimeout(
                supabase.auth.exchangeCodeForSession(code),
                7000,
                'OAuth code exchange timed out',
              )
              if (error) {
                console.error('OAuth code exchange error on /:', error)
              } else {
                // Remove query params so we don't retry exchange on refresh.
                window.history.replaceState({}, document.title, window.location.pathname)
              }
            }
          }
        } catch (e) {
          console.error('OAuth code exchange threw on /:', e)
        }

        const { data: sessionData } = await withTimeout(
          supabase.auth.getSession(),
          5000,
          'Session check timed out',
        )
        const session = sessionData?.session
        setIsLoggedIn(!!session?.user)
      } catch {
        setIsLoggedIn(false)
      } finally {
        setCheckingSession(false)
      }
    }

    checkSession()
  }, [])

  // Register redirect effect before any early return to keep hooks order stable
  useEffect(() => {
    if (!isLoggedIn) return

    let cancelled = false
    // Hard fail-safe: never keep users on the spinner forever.
    const failSafe = setTimeout(() => {
      if (cancelled) return
      router.replace('/dashboard')
    }, 8000)

    ;(async () => {
      try {
        // Safety net: new OAuth users may exist in auth.users but not in our app tables yet.
        // If profile is not completed, force the completion flow.
        try {
          const { data: userData } = await withTimeout(
            supabase.auth.getUser(),
            5000,
            'User fetch timed out',
          )
          const user = (userData as any)?.user
          if (user?.id) {
            const profResp: any = await withTimeout(
              supabase
                .from('user_profiles')
                .select('profile_completed')
                .eq('user_id', user.id)
                .maybeSingle(),
              5000,
              'Profile lookup timed out',
            )
            const prof = profResp?.data

            if (!prof || prof.profile_completed !== true) {
              // If there's a pending studio signup waiting, use the studio completion flow.
              let hasPendingStudio = false
              try {
                hasPendingStudio = !!localStorage.getItem('pendingStudio')
              } catch {
                // ignore
              }

              // Guard against stale pendingStudio for users who already own a studio.
              if (hasPendingStudio) {
                try {
                  const ownedStudioResp: any = await withTimeout(
                    supabase
                      .from('studios')
                      .select('id')
                      .eq('eigenaar_id', user.id)
                      .maybeSingle(),
                    5000,
                    'Owned studio lookup timed out',
                  )
                  if (ownedStudioResp?.data?.id) {
                    try { localStorage.removeItem('pendingStudio') } catch {}
                    hasPendingStudio = false
                  }
                } catch {
                  // ignore
                }
              }

              router.replace(hasPendingStudio ? '/auth/complete-studio-profile' : '/auth/complete-profile')
              return
            }

            // super_admin always goes to /super-admin
            const { data: roleData, missingTable } = await safeSelect(
              supabase,
              'user_roles',
              'role',
              { user_id: user.id }
            )
            if (!missingTable) {
              const role = Array.isArray(roleData) && roleData.length > 0 ? roleData[0] : roleData
              if ((role as any)?.role === 'super_admin') {
                router.replace('/super-admin')
                return
              }
            }

            // Only studio owners go to studio UI.
            const ownerResp: any = await withTimeout(
              supabase
                .from('studios')
                .select('id')
                .eq('eigenaar_id', user.id)
                .maybeSingle(),
              5000,
              'Owner studio lookup timed out',
            )
            const ownerStudioId = ownerResp?.data?.id
            if (ownerStudioId) {
              // If school years are enabled and none is active, force the setup modal.
              try {
                const { data: syData, missingTable } = await safeSelect(
                  supabase,
                  'studio_school_years',
                  'id,is_active',
                  { studio_id: ownerStudioId },
                )
                if (!missingTable) {
                  const rows = (Array.isArray(syData) ? syData : syData ? [syData] : []) as any[]
                  const active = rows.find((r) => !!(r as any)?.is_active)
                  if (!active?.id) {
                    router.replace(`/auth/complete-studio-schoolyear?studioId=${ownerStudioId}`)
                    return
                  }
                }
              } catch {
                // ignore
              }

              router.replace(`/studio/${ownerStudioId}`)
              return
            }
          }
        } catch (e) {
          console.error('Profile completion check failed on /:', e)
          let hasPendingStudio = false
          try {
            hasPendingStudio = !!localStorage.getItem('pendingStudio')
          } catch {
            // ignore
          }

          // Guard against stale pendingStudio for users who already own a studio.
          if (hasPendingStudio) {
            try {
              const { data: userData2 } = await withTimeout(
                supabase.auth.getUser(),
                5000,
                'User fetch timed out',
              )
              const user2 = (userData2 as any)?.user
              if (!user2?.id) throw new Error('No user')

              const ownedStudioResp: any = await withTimeout(
                supabase
                  .from('studios')
                  .select('id')
                  .eq('eigenaar_id', user2.id)
                  .maybeSingle(),
                5000,
                'Owned studio lookup timed out',
              )
              if (ownedStudioResp?.data?.id) {
                try { localStorage.removeItem('pendingStudio') } catch {}
                hasPendingStudio = false
              }
            } catch {
              // ignore
            }
          }

          router.replace(hasPendingStudio ? '/auth/complete-studio-profile' : '/auth/complete-profile')
          return
        }

        router.replace('/dashboard')
      } catch (err) {
        console.error('Landing redirect failed:', err)
        router.replace('/dashboard')
      } finally {
        clearTimeout(failSafe)
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(failSafe)
    }
  }, [isLoggedIn, router])

  if (checkingSession) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" label="Laden" />
          <p className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Laden…</p>
        </div>
      </div>
    )
  }

  if (isLoggedIn) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" label="Omleiden" />
          <p className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Omleiden…</p>
        </div>
      </div>
    )
  }

  return <WelcomePage />
}
