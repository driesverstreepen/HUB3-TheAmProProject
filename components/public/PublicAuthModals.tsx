"use client"

import React, { useEffect, useState } from 'react'
import { X, Mail, Lock, User, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPostLoginRedirectPath } from '@/lib/redirects'

type SignupMode = 'user' | 'studio'

type PendingStudio = {
  studio: {
    name?: string
    location?: string
    email?: string | null
    phoneNumber?: string
  }
}

type PendingOAuthSignup = {
  mode: 'user'
  firstName: string
  lastName: string
  birthDate: string
  agreedToTerms: boolean
  email: string | null
}

type PublicAuthModalsRenderApi = {
  openLogin: () => void
  openSignup: () => void
  openSignupStudio: () => void
  openSignupUser: () => void
}

export function PublicAuthModals({
  defaultSignupMode = 'user',
  children,
}: {
  defaultSignupMode?: SignupMode
  children: (api: PublicAuthModalsRenderApi) => React.ReactNode
}) {
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

  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showSignupModal, setShowSignupModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  const [loginData, setLoginData] = useState({ email: '', password: '' })
  const [signupData, setSignupData] = useState({ email: '', password: '', confirmPassword: '', firstName: '', lastName: '', birthDate: '' })
  const [signupMode, setSignupMode] = useState<SignupMode>(defaultSignupMode)
  const [studioData, setStudioData] = useState({ studioName: '', location: '', contactEmail: '', phoneNumber: '' })
  const [agreedToTermsModal, setAgreedToTermsModal] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Keep signupMode aligned when default changes
  useEffect(() => {
    setSignupMode(defaultSignupMode)
  }, [defaultSignupMode])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      })

      if (error) throw error

      if (data.user) {
        const userId = data.user.id

        const clearStalePendingStudioIfNeeded = async () => {
          let hasPendingStudio = false
          try {
            hasPendingStudio = !!localStorage.getItem('pendingStudio')
          } catch {
            return
          }
          if (!hasPendingStudio) return

          try {
            const { data: ownedStudio, error: ownedStudioError } = await supabase
              .from('studios')
              .select('id')
              .eq('eigenaar_id', userId)
              .maybeSingle()
            if (!ownedStudioError && ownedStudio?.id) {
              localStorage.removeItem('pendingStudio')
              return
            }
          } catch {
            // ignore
          }

          // RLS fallback: server endpoint validates token and checks ownership.
          try {
            const sessResp = await supabase.auth.getSession()
            const token = sessResp?.data?.session?.access_token
            if (!token) return
            const resp = await fetch('/api/studios/owned', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: token }),
            })
            if (!resp.ok) return
            const json = await resp.json()
            if (json?.studio?.id) {
              localStorage.removeItem('pendingStudio')
            }
          } catch {
            // ignore
          }
        }

        await clearStalePendingStudioIfNeeded()

        // Enforce profile completion before entering the app.
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
            window.location.href = hasPendingStudio ? '/auth/complete-studio-profile' : '/auth/complete-profile'
            return
          }
        } catch {
          let hasPendingStudio = false
          try {
            hasPendingStudio = !!localStorage.getItem('pendingStudio')
          } catch {
            // ignore
          }
          window.location.href = hasPendingStudio ? '/auth/complete-studio-profile' : '/auth/complete-profile'
          return
        }

        const path = await getPostLoginRedirectPath(supabase as any, userId)
        window.location.href = path
        return
      }

      setError('Er is een fout opgetreden bij het inloggen')
    } catch (error: any) {
      setError(error?.message || 'Er is een fout opgetreden bij het inloggen')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleOAuth = async (mode: 'login' | 'signup') => {
    setError('')

    try {
      if (mode === 'signup') {
        setAttemptedSubmit(true)

        if (signupMode === 'studio') {
          const studioNameOk = studioData.studioName && studioData.studioName.trim().length > 0
          if (!studioNameOk) {
            setError('Studio naam is verplicht')
            return
          }

          const pendingStudio: PendingStudio = {
            studio: {
              name: studioData.studioName || undefined,
              location: studioData.location || undefined,
              email: (studioData.contactEmail || signupData.email || null) as any,
              phoneNumber: studioData.phoneNumber || undefined,
            },
          }
          localStorage.setItem('pendingStudio', JSON.stringify(pendingStudio))
        } else {
          if (!agreedToTermsModal) {
            setError('Je moet akkoord gaan met de Terms of Service en de Privacy Policy')
            return
          }

          const firstNameOk = signupData.firstName && signupData.firstName.trim().length > 0
          const lastNameOk = signupData.lastName && signupData.lastName.trim().length > 0
          const birthOk = signupData.birthDate && signupData.birthDate.trim().length > 0

          if (!firstNameOk || !lastNameOk || !birthOk) {
            setError('Vul je voornaam, achternaam en geboortedatum in om te registreren via Google')
            return
          }

          const pending: PendingOAuthSignup = {
            mode: 'user',
            firstName: signupData.firstName,
            lastName: signupData.lastName,
            birthDate: signupData.birthDate,
            agreedToTerms: true,
            email: signupData.email || null,
          }
          localStorage.setItem('pendingOAuthSignup', JSON.stringify(pending))
        }
      }

      setLoading(true)
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (err: any) {
      console.error('[PublicAuthModals] Google OAuth start failed:', err)
      setError(err?.message || 'Google login kon niet worden gestart')
      setLoading(false)
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setAttemptedSubmit(true)
    setError('')

    if (signupMode === 'studio') {
      const studioNameOk = studioData.studioName && studioData.studioName.trim().length > 0
      if (!studioNameOk) {
        setError('Studio naam is verplicht')
        return
      }
    }

    if (signupData.password !== signupData.confirmPassword) {
      setError('Wachtwoorden komen niet overeen')
      return
    }

    if (signupData.password.length < 6) {
      setError('Wachtwoord moet minimaal 6 karakters bevatten')
      return
    }

    if (signupMode === 'user' && !agreedToTermsModal) {
      setError('Je moet akkoord gaan met de Terms of Service en de Privacy Policy')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupData.email,
        password: signupData.password,
      })

      if (error) throw error

      if (data.user) {
        if (signupMode === 'studio') {
          try {
            const pendingStudio: PendingStudio = {
              studio: {
                name: studioData.studioName || undefined,
                location: studioData.location || undefined,
                email: (studioData.contactEmail || signupData.email || null) as any,
                phoneNumber: studioData.phoneNumber || undefined,
              },
            }
            localStorage.setItem('pendingStudio', JSON.stringify(pendingStudio))
          } catch {
            // ignore
          }

          setShowSignupModal(false)

          const sessResp = await supabase.auth.getSession()
          const session = sessResp?.data?.session
          if (session?.user) {
            window.location.href = '/auth/complete-studio-profile'
            return
          }

          setShowSuccessModal(true)
          setError('')
          setTimeout(() => {
            setShowSuccessModal(false)
            setLoginData({ email: signupData.email, password: '' })
            setShowLoginModal(true)
          }, 2000)
          return
        }

        try {
          await supabase.from('users').upsert(
            {
              id: data.user.id,
              email: signupData.email,
              naam: `${signupData.firstName} ${signupData.lastName}`,
              role: 'user',
            },
            { onConflict: 'id' }
          )
        } catch (uErr) {
          console.error('Warning: failed to ensure public.users row for new signup', uErr)
        }

        const { error: profileError } = await supabase.from('user_profiles').insert({
          user_id: data.user.id,
          first_name: signupData.firstName,
          last_name: signupData.lastName,
          date_of_birth: signupData.birthDate || null,
          email: signupData.email,
          profile_completed: true,
        })

        if (profileError) throw profileError

        await supabase.from('user_roles').upsert({
          user_id: data.user.id,
          role: 'user',
        })

        if (agreedToTermsModal) {
          try {
            const { data: legalDocs, error: legalError } = await supabase
              .from('legal_documents')
              .select('document_type, version')
              .eq('is_active', true)
              .in('document_type', ['privacy_policy', 'terms_of_service'])

            if (!legalError && legalDocs && legalDocs.length > 0) {
              const userId = data.user!.id
              const consents = legalDocs.map((doc: any) => ({
                user_id: userId,
                document_type: doc.document_type,
                document_version: doc.version,
                consent_given: true,
                ip_address: null,
                user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
              }))

              const { error: consentError } = await supabase.from('user_consents').insert(consents)
              if (consentError) {
                console.error('Error recording consents:', consentError)
              }
            }
          } catch (consErr) {
            console.error('Failed to record consents:', consErr)
          }
        }

        setShowSignupModal(false)
        setShowSuccessModal(true)
        setError('')

        setTimeout(() => {
          setShowSuccessModal(false)
          setLoginData({ email: signupData.email, password: '' })
          setShowLoginModal(true)
        }, 2000)
      }
    } catch (error: any) {
      setError(error?.message || 'Er is een fout opgetreden bij het registreren')
      setShowSuccessModal(false)
    } finally {
      setLoading(false)
    }
  }

  const openLogin = () => {
    setError('')
    setShowSignupModal(false)
    setShowLoginModal(true)
  }

  const openSignup = () => {
    setError('')
    setShowLoginModal(false)
    setShowSignupModal(true)
  }

  const openSignupStudio = () => {
    setSignupMode('studio')
    openSignup()
  }

  const openSignupUser = () => {
    setSignupMode('user')
    openSignup()
  }

  return (
    <>
      {children({ openLogin, openSignup, openSignupStudio, openSignupUser })}

      {/* Login Modal */}
      {showLoginModal ? (
        <div onClick={() => setShowLoginModal(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="t-h3 font-bold text-gray-900">Log in op je account</h2>
                <button onClick={() => setShowLoginModal(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {error ? (
                <div className="t-bodySm mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleLogin} className="space-y-4">
                <button
                  type="button"
                  onClick={() => handleGoogleOAuth('login')}
                  disabled={loading}
                  className="t-button w-full inline-flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <GoogleG className="h-5 w-5" />
                  Verder met Google
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center t-caption">
                    <span className="px-2 bg-white/90 text-slate-500">of</span>
                  </div>
                </div>

                <div>
                  <label className="t-label block font-medium text-gray-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      required
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="t-label block font-medium text-gray-700 mb-1">Wachtwoord</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="password"
                      required
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Je wachtwoord"
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

              <div className="mt-4 text-center">
                <p className="t-bodySm text-gray-600">
                  Nog geen account?{' '}
                  <button
                    onClick={() => {
                      setShowLoginModal(false)
                      setShowSignupModal(true)
                    }}
                    className="text-blue-600 hover:text-blue-500 font-medium"
                  >
                    Registreer hier
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Signup Modal */}
      {showSignupModal ? (
        <div onClick={() => setShowSignupModal(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-x-hidden overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="t-h3 font-bold text-gray-900">Maak een account</h2>
                <button onClick={() => setShowSignupModal(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="mb-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSignupMode('studio')
                  }}
                  className={`px-4 py-2 rounded-md ${signupMode === 'studio' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Studio account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSignupMode('user')
                  }}
                  className={`px-4 py-2 rounded-md ${signupMode === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Lid account
                </button>
              </div>

              {error ? (
                <div className="t-bodySm mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                  {error}
                </div>
              ) : null}

              {signupMode === 'studio' ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => handleGoogleOAuth('signup')}
                    disabled={loading}
                    className="t-button w-full inline-flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <GoogleG className="h-5 w-5" />
                    Registreer met Google
                  </button>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center t-caption">
                      <span className="px-2 bg-white/90 text-slate-500">of</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {signupMode === 'studio' ? (
                <div className="border-t pt-4 space-y-4">
                  <h3 className="t-h4 font-semibold text-slate-900">Studio gegevens</h3>
                  <div>
                    <label className="t-label block font-medium text-gray-700 mb-1">Studio naam *</label>
                    <input
                      type="text"
                      required
                      value={studioData.studioName}
                      onChange={(e) => setStudioData({ ...studioData, studioName: e.target.value })}
                      onBlur={() => setTouched((t) => ({ ...t, studioName: true }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Jouw Studio Naam"
                    />
                    {(attemptedSubmit || touched.studioName) && (!studioData.studioName || studioData.studioName.trim().length === 0) ? (
                      <p className="t-bodySm mt-1 text-red-600">Studio naam is verplicht</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="t-label block font-medium text-gray-700 mb-1">Locatie</label>
                    <input
                      type="text"
                      value={studioData.location}
                      onChange={(e) => setStudioData({ ...studioData, location: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Stad, Adres"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="t-label block font-medium text-gray-700 mb-1">Contact email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="email"
                          value={studioData.contactEmail}
                          onChange={(e) => setStudioData({ ...studioData, contactEmail: e.target.value })}
                          className="w-full pl-10 py-2 border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="contact@studio.nl"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="t-label block font-medium text-gray-700 mb-1">Telefoon</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="tel"
                          value={studioData.phoneNumber}
                          onChange={(e) => setStudioData({ ...studioData, phoneNumber: e.target.value })}
                          className="w-full pl-10 py-2 border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="06-12345678"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {signupMode === 'user' ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => handleGoogleOAuth('signup')}
                    disabled={loading}
                    className="t-button w-full inline-flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <GoogleG className="h-5 w-5" />
                    Registreer met Google
                  </button>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center t-caption">
                      <span className="px-2 bg-white/90 text-slate-500">of</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleSignup} className={`space-y-4 ${signupMode === 'studio' ? 'mt-4' : ''}`}>
                {signupMode === 'user' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="t-label block font-medium text-gray-700 mb-1">Voornaam *</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                          <input
                            type="text"
                            required
                            value={signupData.firstName}
                            onChange={(e) => setSignupData({ ...signupData, firstName: e.target.value })}
                            onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Voornaam"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="t-label block font-medium text-gray-700 mb-1">Achternaam *</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                          <input
                            type="text"
                            required
                            value={signupData.lastName}
                            onChange={(e) => setSignupData({ ...signupData, lastName: e.target.value })}
                            onBlur={() => setTouched((t) => ({ ...t, lastName: true }))}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Achternaam"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="t-label block font-medium text-gray-700 mb-1">Geboortedatum *</label>
                      <input
                        type="date"
                        required
                        value={signupData.birthDate}
                        onChange={(e) => setSignupData({ ...signupData, birthDate: e.target.value })}
                        onBlur={() => setTouched((t) => ({ ...t, birthDate: true }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                ) : null}

                <div>
                  <label className="t-label block font-medium text-gray-700 mb-1">Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      required
                      value={signupData.email}
                      onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                      onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="t-label block font-medium text-gray-700 mb-1">Wachtwoord *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="password"
                      required
                      value={signupData.password}
                      onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                      onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Minimaal 6 tekens"
                    />
                  </div>
                </div>

                <div>
                  <label className="t-label block font-medium text-gray-700 mb-1">Herhaal wachtwoord *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="password"
                      required
                      value={signupData.confirmPassword}
                      onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })}
                      onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Herhaal je wachtwoord"
                    />
                  </div>
                </div>

                {signupMode === 'user' ? (
                  <div className="flex items-start gap-2 pt-1">
                    <input
                      type="checkbox"
                      checked={agreedToTermsModal}
                      onChange={(e) => setAgreedToTermsModal(e.target.checked)}
                      className="mt-1"
                    />
                    <div className="t-bodySm text-slate-600">
                      Ik ga akkoord met de Terms of Service en de Privacy Policy
                    </div>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Bezig met registreren...' : 'Registreren'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <p className="t-bodySm text-gray-600">
                  Heb je al een account?{' '}
                  <button
                    onClick={() => {
                      setShowSignupModal(false)
                      setShowLoginModal(true)
                    }}
                    className="text-blue-600 hover:text-blue-500 font-medium"
                  >
                    Log in
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Success Modal */}
      {showSuccessModal ? (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 text-center">
              <h2 className="t-h3 font-bold text-gray-900 mb-2">Gelukt!</h2>
              <p className="t-body text-gray-600">Je account is aangemaakt.</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
