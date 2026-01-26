'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { getPostLoginRedirectPath } from '@/lib/redirects'

type PendingOAuthSignup = {
  mode: 'user'
  firstName: string
  lastName: string
  birthDate: string
  agreedToTerms: boolean
  email: string | null
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Bezig met inloggen...')
  const [details, setDetails] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        const errorParam = params.get('error')
        const errorDescription = params.get('error_description')

        // If the OAuth provider/Supabase returned an explicit error, surface it.
        if (errorParam) {
          const pretty = errorDescription ? `${errorParam}: ${errorDescription}` : errorParam
          setMessage('Inloggen mislukt.')
          setDetails(pretty)
          return
        }

        let exchangeError: any = null

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            // Common cases:
            // - code already exchanged (e.g. refresh/back)
            // - missing PKCE verifier (origin mismatch / storage cleared)
            // We'll still try to continue if a session exists.
            exchangeError = error
          } else {
            // Remove query params so we don't retry exchange on refresh.
            try {
              window.history.replaceState({}, document.title, window.location.pathname)
            } catch {
              // ignore
            }
          }
        }

        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData?.session
        const user = session?.user

        if (!user) {
          if (exchangeError) {
            const pretty = exchangeError?.message || exchangeError?.error_description || JSON.stringify(exchangeError)
            setMessage('Inloggen mislukt.')
            setDetails(pretty)
            return
          }
          router.replace('/auth/login')
          return
        }

        // If the user started a studio signup (saved in localStorage), complete the studio onboarding first.
        try {
          const pendingStudioRaw = localStorage.getItem('pendingStudio')
          if (pendingStudioRaw) {
            // Guard against stale pendingStudio: if the studio already exists, do not force completion.
            try {
              const { data: sessionData } = await supabase.auth.getSession()
              const token = sessionData?.session?.access_token

              // First try via RLS (fast path)
              const ownedResp = await supabase
                .from('studios')
                .select('id')
                .eq('eigenaar_id', user.id)
                .maybeSingle()

              const ownedId = (ownedResp as any)?.data?.id as string | undefined
              if (ownedId) {
                localStorage.removeItem('pendingStudio')
              } else if (token) {
                // Fallback via service-role endpoint in case RLS blocks the select
                const resp = await fetch('/api/studios/owned', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ access_token: token }),
                })
                if (resp.ok) {
                  const json = await resp.json().catch(() => ({} as any))
                  if (json?.studio?.id) {
                    localStorage.removeItem('pendingStudio')
                  }
                }
              }
            } catch {
              // ignore; we'll default to the safer completion flow below
            }

            // Re-check after potential cleanup
            if (localStorage.getItem('pendingStudio')) {
              router.replace('/auth/complete-studio-profile')
              return
            }
          }
        } catch {
          // ignore
        }

        // Complete pending signup (if the user started OAuth from the signup modal)
        try {
          const raw = localStorage.getItem('pendingOAuthSignup')
          if (raw) {
            const pending = JSON.parse(raw) as PendingOAuthSignup

            if (pending?.mode === 'user' && pending.agreedToTerms) {
              setMessage('Profiel aan het vervolledigen...')

              const email = pending.email || user.email || null

              // Ensure public.users row exists
              try {
                await supabase.from('users').upsert(
                  {
                    id: user.id,
                    email,
                    naam: `${pending.firstName} ${pending.lastName}`,
                    role: 'user',
                  },
                  { onConflict: 'id' }
                )
              } catch {
                // ignore; next inserts may still succeed and give clearer errors
              }

              // Upsert profile (avoid duplicate insert errors on retries)
              try {
                await supabase.from('user_profiles').upsert(
                  {
                    user_id: user.id,
                    first_name: pending.firstName,
                    last_name: pending.lastName,
                    date_of_birth: pending.birthDate || null,
                    email,
                    profile_completed: true,
                  },
                  { onConflict: 'user_id' }
                )
              } catch {
                // ignore
              }

              // Ensure user_roles row exists
              try {
                await supabase.from('user_roles').upsert({ user_id: user.id, role: 'user' }, { onConflict: 'user_id' })
              } catch {
                // ignore
              }

              // Record consents for active legal documents
              try {
                const { data: legalDocs, error: legalError } = await supabase
                  .from('legal_documents')
                  .select('document_type, version')
                  .eq('is_active', true)
                  .in('document_type', ['privacy_policy', 'terms_of_service'])

                if (legalError) throw legalError

                if (legalDocs && legalDocs.length > 0) {
                  const consents = (legalDocs as any[]).map((doc) => ({
                    user_id: user.id,
                    document_type: doc.document_type,
                    document_version: doc.version,
                    consent_given: true,
                    ip_address: null,
                    user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
                  }))

                  await supabase.from('user_consents').insert(consents)
                }
              } catch {
                // ignore consent failures; don't block login
              }
            }

            localStorage.removeItem('pendingOAuthSignup')
          }
        } catch {
          // ignore
        }

        // If this is a new Google user without our app-specific profile rows,
        // send them to the completion form before entering the app.
        try {
          const { data: prof } = await supabase
            .from('user_profiles')
            .select('profile_completed')
            .eq('user_id', user.id)
            .maybeSingle()

          if (!prof || prof.profile_completed !== true) {
            let hasPendingStudio = false
            try {
              hasPendingStudio = !!localStorage.getItem('pendingStudio')
            } catch {
              // ignore
            }
            router.replace(hasPendingStudio ? '/auth/complete-studio-profile' : '/auth/complete-profile')
            return
          }
        } catch {
          let hasPendingStudio = false
          try {
            hasPendingStudio = !!localStorage.getItem('pendingStudio')
          } catch {
            // ignore
          }
          router.replace(hasPendingStudio ? '/auth/complete-studio-profile' : '/auth/complete-profile')
          return
        }

        // Determine best landing page (same idea as email login):
        // super_admin → /super-admin
        // studio owner (only) → /studio/[id]
        // else → /dashboard
        setMessage('Doorsturen...')

        try {
          const path = await getPostLoginRedirectPath(supabase as any, user.id)
          router.replace(path)
          return
        } catch (e) {
          console.warn('[auth/callback] Post-login redirect policy failed, falling back to /dashboard', e)
          router.replace('/dashboard')
          return
        }
      } catch (e: any) {
        console.error('[auth/callback] Failed to finalize OAuth:', e)
        if (!cancelled) {
          setMessage('Inloggen mislukt. Doorsturen naar login...')
          setDetails(e?.message || e?.error_description || null)
          setTimeout(() => {
            router.replace('/auth/login')
          }, 750)
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size={48} label="Laden" />
        <div className="text-sm text-slate-700 text-center">{message}</div>
        {details && (
          <div className="max-w-md text-xs text-slate-500 text-center wrap-break-word">
            {details}
          </div>
        )}
      </div>
    </div>
  )
}
