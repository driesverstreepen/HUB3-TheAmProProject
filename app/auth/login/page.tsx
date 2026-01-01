'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getPostLoginRedirectPath } from '@/lib/redirects'
import { useSearchParams } from 'next/navigation'
import { useNotification } from '@/contexts/NotificationContext'
import { Lock, Mail } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()

  const { showError } = useNotification()

  useEffect(() => {
    const qEmail = searchParams?.get('email')
    if (qEmail && qEmail.trim().length > 0) setEmail(qEmail)
  }, [searchParams])

  const GoogleG = ({ className }: { className?: string }) => (
    <svg
      className={className}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.2 3.6l6.86-6.86C35.9 2.42 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.5 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.64-.14-2.86-.45-4.12H24v7.81h12.7c-.26 2.05-1.66 5.14-4.77 7.2l7.32 5.65C43.78 33.73 46.5 29.6 46.5 24.5z"/>
      <path fill="#FBBC05" d="M10.54 28.41c-.5-1.5-.79-3.09-.79-4.73s.29-3.23.77-4.73l-7.98-6.19A23.91 23.91 0 0 0 0 23.68c0 3.94.94 7.67 2.56 10.97l7.98-6.24z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.91-2.14 15.88-5.81l-7.32-5.65c-1.95 1.36-4.57 2.3-8.56 2.3-6.26 0-11.57-4-13.46-9.52l-7.98 6.24C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  )

  const handleGoogleLogin = async () => {
    try {
      setLoading(true)
      setError('')
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      })
      if (error) throw error
      // Browser redirect happens automatically.
    } catch (error: any) {
      console.error('[Login] Google OAuth start failed:', error)
      const message = error?.message || 'Google login kon niet worden gestart'
      setError(message)
      showError(message)
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('[Login] signInWithPassword error object:', error)
        throw error
      }

      if (data.user) {
        const userId = data.user.id
        console.info('[Login] Checking profile completion for user:', userId)

        try {
          const { data: prof } = await supabase
            .from('user_profiles')
            .select('profile_completed')
            .eq('user_id', userId)
            .maybeSingle()

          if (!prof || prof.profile_completed !== true) {
            let hasPendingStudio = false
            try {
              hasPendingStudio = !!localStorage.getItem('pendingStudio')
            } catch {
              // ignore
            }

            // Guard against stale pendingStudio: if the studio already exists, do not force studio completion.
            if (hasPendingStudio) {
              try {
                const ownedResp = await supabase
                  .from('studios')
                  .select('id')
                  .eq('eigenaar_id', userId)
                  .maybeSingle()

                const ownedId = (ownedResp as any)?.data?.id as string | undefined
                if (ownedId) {
                  localStorage.removeItem('pendingStudio')
                  hasPendingStudio = false
                } else {
                  const { data: sessionData } = await supabase.auth.getSession()
                  const token = sessionData?.session?.access_token
                  if (token) {
                    const resp = await fetch('/api/studios/owned', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ access_token: token }),
                    })
                    if (resp.ok) {
                      const json = await resp.json().catch(() => ({} as any))
                      if (json?.studio?.id) {
                        localStorage.removeItem('pendingStudio')
                        hasPendingStudio = false
                      }
                    }
                  }
                }
              } catch {
                // ignore; keep safest behavior
              }
            }

            window.location.href = hasPendingStudio ? '/auth/complete-studio-profile' : '/auth/complete-profile'
            return
          }
        } catch (e) {
          console.warn('[Login] Profile completion check failed; forcing completion flow:', e)
          let hasPendingStudio = false
          try {
            hasPendingStudio = !!localStorage.getItem('pendingStudio')
          } catch {
            // ignore
          }

          // Same stale-pending guard as above.
          if (hasPendingStudio) {
            try {
              const ownedResp = await supabase
                .from('studios')
                .select('id')
                .eq('eigenaar_id', userId)
                .maybeSingle()
              const ownedId = (ownedResp as any)?.data?.id as string | undefined
              if (ownedId) {
                localStorage.removeItem('pendingStudio')
                hasPendingStudio = false
              }
            } catch {
              // ignore
            }
          }

          window.location.href = hasPendingStudio ? '/auth/complete-studio-profile' : '/auth/complete-profile'
          return
        }

        try {
          const path = await getPostLoginRedirectPath(supabase as any, userId)
          window.location.href = path
          return
        } catch (e) {
          console.warn('[Login] Post-login redirect policy failed; falling back to /dashboard:', e)
          window.location.href = '/dashboard'
          return
        }
      }
    } catch (error: any) {
      // Log full error so network/HTTP details are visible in the dev console
      console.error('[Login] Sign-in failed:', error)
      // Show a helpful message in UI while exposing more info for debugging
      const message = error?.message || (typeof error === 'string' ? error : JSON.stringify(error)) || 'Er is een fout opgetreden bij het inloggen'
      setError(message)
      showError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute top-4 left-4">
        <a href="/" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-500 text-sm font-medium">
          ← Ga terug
        </a>
      </div>

      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Log in op je account</h2>
            <p className="text-sm text-gray-600 text-center">
              Nog geen account?{' '}
              <a href="/auth/registreer" className="text-blue-600 hover:text-blue-500 font-medium">
                Registreer hier
              </a>
            </p>

            {error ? (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{error}</div>
            ) : null}

            <form onSubmit={handleLogin} className="space-y-4 mt-6">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg bg-white border border-slate-300 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GoogleG className="h-5 w-5" />
                Verder met Google
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white/90 text-slate-500">of</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="your@email.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Je wachtwoord"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Bezig met inloggen...' : 'Inloggen'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
