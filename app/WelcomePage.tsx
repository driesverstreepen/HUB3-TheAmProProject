"use client"

import React, { useState, useEffect } from 'react'
import { Users, ArrowRight, Sparkles, CheckCircle, HelpCircle, X, Mail, Phone, Lock, User, Calendar } from 'lucide-react'
import { FeatureCard } from '@/components/FeatureCard'
import { AnimatedListItem } from '@/components/AnimatedListItem'
import { PublicNavigation } from '@/components/PublicNavigation'
import { supabase } from '@/lib/supabase'
import { getPostLoginRedirectPath } from '@/lib/redirects'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function WelcomePage() {

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
  const [agreedToTermsModal, setAgreedToTermsModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupMode, setSignupMode] = useState<'user' | 'studio'>('user')
  const [studioData, setStudioData] = useState({ studioName: '', location: '', contactEmail: '', phoneNumber: '' })
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [checkingSession, setCheckingSession] = useState(true)
  

  // Handle URL parameters for login/signup flow
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const login = params.get('login')
      const signup = params.get('signup')

      if (login === 'true') {
        setShowLoginModal(true)
      }
      
      if (signup === 'studio') {
        setSignupMode('studio')
        setShowSignupModal(true)
      } else if (signup === 'user') {
        setSignupMode('user')
        setShowSignupModal(true)
      }
    }
  }, [])

  // On mount, if user already has a session, redirect to their landing page
  // This effect runs before the render check below so hooks order remains stable
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData?.session
        if (session?.user && mounted) {
          const userId = session.user.id

          const clearStalePendingStudioIfNeeded = async () => {
            let hasPendingStudio = false
            try {
              hasPendingStudio = !!localStorage.getItem('pendingStudio')
            } catch {
              return false
            }
            if (!hasPendingStudio) return false

            try {
              const { data: ownedStudio, error: ownedStudioError } = await supabase
                .from('studios')
                .select('id')
                .eq('eigenaar_id', userId)
                .maybeSingle()

              if (!ownedStudioError && ownedStudio?.id) {
                try { localStorage.removeItem('pendingStudio') } catch {}
                return true
              }
            } catch {
              // ignore
            }

            // RLS fallback
            try {
              const token = session.access_token
              if (!token) return false
              const resp = await fetch('/api/studios/owned', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: token }),
              })
              if (!resp.ok) return false
              const json = await resp.json()
              if (json?.studio?.id) {
                try { localStorage.removeItem('pendingStudio') } catch {}
                return true
              }
            } catch {
              // ignore
            }

            return false
          }

          // If there's a pending studio signup waiting, complete studio onboarding first.
          try {
            const pendingStudioStr = localStorage.getItem('pendingStudio')
            if (pendingStudioStr) {
              const cleared = await clearStalePendingStudioIfNeeded()
              if (!cleared) {
                window.location.href = '/auth/complete-studio-profile'
                return
              }
            }
          } catch {
            // ignore
          }

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

              if (hasPendingStudio) {
                const cleared = await clearStalePendingStudioIfNeeded()
                if (cleared) hasPendingStudio = false
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

            if (hasPendingStudio) {
              const cleared = await clearStalePendingStudioIfNeeded()
              if (cleared) hasPendingStudio = false
            }

            window.location.href = hasPendingStudio ? '/auth/complete-studio-profile' : '/auth/complete-profile'
            return
          }

          const path = await getPostLoginRedirectPath(supabase as any, userId)
          window.location.href = path
          return
        }
      } catch {
        // ignore - user not logged in or fetch failed
      }
      if (mounted) setCheckingSession(false)
    })()
    return () => { mounted = false }
  }, [])

  // While we check if a session exists, show a small client-side loading state
  // This prevents the full welcome content from flashing before a redirect occurs
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size={48} label="Laden" />
      </div>
    )
  }



  const memberBenefits = [
    'Vind studios, programma’s en workshops overal in België',
    'Snel online inschrijven en betalen',
    'Persoonlijk dashboard met lessen en rooster',
    'Afwezigheden doorgeven',
    'Overzicht van Class Pass Credits',
    'Beheer familieprofielen en inschrijvingen',
    'Veilige en private gegevensopslag',
  ]

  const memberFeatures = [
    { id: '5', title: 'Zoeken', description: 'Vind studios, lessen en workshops in jouw buurt', icon_name: 'Users' },
    { id: '6', title: 'Inschrijven', description: 'Eenvoudig inschrijven en betalen', icon_name: 'CreditCard' },
    { id: '7', title: 'Dashboard', description: 'Overzicht van jouw inschrijvingen', icon_name: 'FileText' },
    { id: '8', title: 'Meldingen', description: 'E-mailupdates en herinneringen', icon_name: 'Sparkles' },
  ]

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
  console.info('[WelcomePage Login] Starting login...')
    setError('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      })

  console.info('[WelcomePage Login] Auth response - Has user:', !!data?.user, 'Has error:', !!error)

      if (error) throw error

      if (data.user) {
        const userId = data.user.id
  console.info('[WelcomePage Login] Checking role for user:', userId)

        // Check if there's a pending studio creation from a previous signup without session
        const pendingStudioStr = localStorage.getItem('pendingStudio')
        if (pendingStudioStr) {
          window.location.href = '/auth/complete-studio-profile'
          return
        }
        
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
    } catch (error: any) {
      setError(error.message || 'Er is een fout opgetreden bij het inloggen')
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

          // Studio Google signup should not require filling personal info here.
          const pendingStudio = {
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

          // Regular user signup via Google
          const pending = {
            mode: 'user' as const,
            firstName: signupData.firstName,
            lastName: signupData.lastName,
            birthDate: signupData.birthDate,
            agreedToTerms: true,
            // email is optional here; we can use Google email from the session in /auth/callback
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
      // Browser redirect happens automatically.
    } catch (err: any) {
      console.error('[WelcomePage] Google OAuth start failed:', err)
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
        // Studio signup: do not collect personal data or consents here.
        // Redirect into /auth/complete-studio-profile for the full onboarding.
        if (signupMode === 'studio') {
          try {
            const pendingStudio = {
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

          // No session available (email confirmation required). Keep existing UX.
          setShowSuccessModal(true)
          setError('')
          setTimeout(() => {
            setShowSuccessModal(false)
            setLoginData({ email: signupData.email, password: '' })
            setShowLoginModal(true)
          }, 2000)
          return
        }

        // Ensure public.users row exists first (user_profiles has FK -> public.users(id))
        try {
          await supabase.from('users').upsert({
            id: data.user.id,
            email: signupData.email,
            naam: `${signupData.firstName} ${signupData.lastName}`,
            role: 'user',
          }, { onConflict: 'id' })
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

        // Ensure a user_roles row exists for this new user.
        await supabase.from('user_roles').upsert({
          user_id: data.user.id,
          role: 'user',
        })

        // Record GDPR consents for active legal documents (user signup)
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
              } else {
                console.info('[WelcomePage] Consents recorded for user:', userId, 'Documents:', legalDocs.length)
              }
            } else if (legalError) {
              console.error('[WelcomePage] Failed to fetch legal documents:', legalError)
            } else {
              console.warn('[WelcomePage] No active legal documents found - consents not recorded')
              // Optional: record consent anyway with generic version
              const userId = data.user!.id
              const genericConsents = [
                {
                  user_id: userId,
                  document_type: 'terms_of_service',
                  document_version: '1.0',
                  consent_given: true,
                  ip_address: null,
                  user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
                },
                {
                  user_id: userId,
                  document_type: 'privacy_policy',
                  document_version: '1.0',
                  consent_given: true,
                  ip_address: null,
                  user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
                }
              ]
              const { error: genericConsentError } = await supabase.from('user_consents').insert(genericConsents)
              if (genericConsentError) {
                console.error('[WelcomePage] Error recording generic consents:', genericConsentError)
              } else {
                console.info('[WelcomePage] Generic consents recorded (no active legal docs found)')
              }
            }
          } catch (consErr) {
            console.error('Failed to record consents:', consErr)
          }
        } else {
          console.warn('[WelcomePage] User did not agree to terms - skipping consent recording')
        }

        // Only show success modal for user signups
        setShowSignupModal(false)
        setShowSuccessModal(true)
        setError('')
        
        // After 2 seconds, close success modal and open login modal
        setTimeout(() => {
          setShowSuccessModal(false)
          setLoginData({ email: signupData.email, password: '' })
          setShowLoginModal(true)
        }, 2000)
      }
    } catch (error: any) {
      setError(error.message || 'Er is een fout opgetreden bij het registreren')
      setShowSuccessModal(false)
    } finally {
      setLoading(false)
    }
  }

  // Validation helper: returns a string error message or undefined
  const fieldError = (name: string) => {
    const show = !!attemptedSubmit || !!touched[name]
    if (!show) return undefined

    switch (name) {
      case 'firstName':
        if (signupMode === 'studio') return undefined
        if (!signupData.firstName || signupData.firstName.trim().length === 0) return 'Voornaam is verplicht'
        return undefined
      case 'lastName':
        if (signupMode === 'studio') return undefined
        if (!signupData.lastName || signupData.lastName.trim().length === 0) return 'Achternaam is verplicht'
        return undefined
      case 'birthDate':
        if (signupMode === 'studio') return undefined
        if (!signupData.birthDate || signupData.birthDate.trim().length === 0) return 'Geboortedatum is verplicht'
        return undefined
      case 'email':
        if (!signupData.email || signupData.email.trim().length === 0) return 'E-mail is verplicht'
        return undefined
      case 'password':
        if (!signupData.password || signupData.password.length < 6) return 'Wachtwoord moet minimaal 6 tekens bevatten'
        return undefined
      case 'confirmPassword':
        if (!signupData.confirmPassword || signupData.confirmPassword.length === 0) return 'Bevestig je wachtwoord'
        if (signupData.password !== signupData.confirmPassword) return 'Wachtwoorden komen niet overeen'
        return undefined
      case 'studioName':
        return undefined
      default:
        return undefined
    }
  }

  // Client-side validation: make signup button inactive unless required fields + checkbox are set.
  const isSignupValid = (() => {
    // common checks for both modes
    const emailOk = signupData.email && signupData.email.trim().length > 0
    const passwordOk = signupData.password && signupData.password.length >= 6
    const confirmOk = signupData.confirmPassword && signupData.confirmPassword.length > 0
    const passwordsMatch = signupData.password === signupData.confirmPassword

    if (signupMode === 'user') {
      const firstNameOk = signupData.firstName && signupData.firstName.trim().length > 0
      const lastNameOk = signupData.lastName && signupData.lastName.trim().length > 0
      const birthOk = signupData.birthDate && signupData.birthDate.trim().length > 0
      const agreed = agreedToTermsModal === true
      return !!(firstNameOk && lastNameOk && birthOk && emailOk && passwordOk && confirmOk && passwordsMatch && agreed)
    }

    // signupMode === 'studio'
    return !!(emailOk && passwordOk && confirmOk && passwordsMatch)
  })()

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <PublicNavigation onLogin={() => setShowLoginModal(true)} onSignup={() => setShowSignupModal(true)} />

      <div id="hero" className="relative bg-linear-to-br from-blue-600 via-purple-600 to-blue-800 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-white to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 backdrop-blur-sm bg-white/10 px-4 py-2 rounded-full border border-white/20 mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="m-caption font-medium text-white!">Ontdek. Boek. Dans.</span>
            </div>

            <h1 className="m-heroTitle font-bold mb-6 leading-tight text-white!">
              HUB3 — Het next level dansnetwerk
            </h1>

            <p className="m-heroSubtitle text-slate-100! mb-8 max-w-3xl mx-auto leading-relaxed">
              Van beginners tot professionals. <br className="hidden md:block" />
              Ontdek studios, boek lessen en beheer alles op één plek.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:gap-4 justify-center items-stretch max-w-xl mx-auto">
              <button 
                onClick={() => { setSignupMode('user'); setShowSignupModal(true); }} 
                className="m-button group w-full justify-center px-4 sm:px-8 py-3 sm:py-4 bg-white text-blue-600! rounded-xl hover:bg-blue-50 font-semibold transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2"
              >
                Start gratis
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <a 
                href="/explore" 
                className="m-button group w-full justify-center px-4 sm:px-8 py-3 sm:py-4 bg-transparent text-white! border-2 border-white/40 rounded-xl hover:bg-white/10 font-semibold transition-all shadow-xl hover:shadow-2xl flex items-center gap-2"
              >
                Verken studios
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>

            <p className="m-bodySm mt-6 text-slate-200!">
              Ben je een studio eigenaar? <a href="/for-studios" className="underline hover:text-blue-200 font-medium">Ontdek HUB3 voor Studios</a>
            </p>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-slate-50 to-transparent"></div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {/* How It Works Section */}
        <section className="mb-24">
          <div className="text-center mb-16">
            <h2 className="m-sectionTitle font-bold text-slate-900! mb-4">Hoe werkt het?</h2>
            <p className="m-bodyLg text-slate-600! max-w-2xl mx-auto">In drie simpele stappen naar jouw ideale dansles</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200 text-center">
              <div className="w-16 h-16 bg-linear-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <span className="m-kpi font-bold text-white!">1</span>
              </div>
              <h3 className="m-cardTitle font-bold text-slate-900 mb-3">Ontdek het aanbod</h3>
              <p className="m-body text-slate-600!">
                Verken dansstudios, lessen en workshops bij jou in de buurt. Filter op stijl, niveau en locatie om precies te vinden wat je zoekt.
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200 text-center">
              <div className="w-16 h-16 bg-linear-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <span className="m-kpi font-bold text-white!">2</span>
              </div>
              <h3 className="m-cardTitle font-bold text-slate-900 mb-3">Schrijf je in</h3>
              <p className="m-body text-slate-600!">
                Kies je programma en schrijf je snel en veilig online in. Betaal direct via onze beveiligde payment gateway.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200 text-center">
              <div className="w-16 h-16 bg-linear-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <span className="m-kpi font-bold text-white!">3</span>
              </div>
              <h3 className="m-cardTitle font-bold text-slate-900 mb-3">Begin met dansen</h3>
              <p className="m-body text-slate-600!">
                Bekijk je rooster, ontvang updates en beheer al je lessen vanaf je persoonlijke dashboard. Simpel en overzichtelijk.
              </p>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="mb-24">
          <div className="text-center mb-16">
            <h2 className="m-sectionTitle font-bold text-slate-900! mb-4">Alles wat je nodig hebt</h2>
            <p className="m-bodyLg text-slate-600! max-w-2xl mx-auto">HUB3 maakt jouw dansles boeken en beheren supereenvoudig</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {memberFeatures.map((f, i) => (
              <FeatureCard key={f.id} index={i} title={f.title} description={f.description} iconName={f.icon_name} />
            ))}
          </div>
        </section>

        {/* Benefits Section */}
        <section className="mb-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="m-sectionTitle font-bold text-slate-900! mb-6">Waarom HUB3?</h2>
              <p className="m-bodyLg text-slate-600! mb-8">
                HUB3 verbindt dansers met de beste studios en docenten. Of je nu beginner bent of gevorderd, 
                wij helpen je om de perfecte les te vinden en je danservaring naar het volgende niveau te tillen.
              </p>

              <div className="space-y-4">
                {memberBenefits.map((b, i) => (
                  <React.Fragment key={i}>
                    <AnimatedListItem index={i} className="flex items-start gap-3">
                      <CheckCircle className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                      <span className="m-body text-slate-700!">{b}</span>
                    </AnimatedListItem>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="bg-linear-to-br from-blue-100 to-purple-100 rounded-2xl p-12 text-center">
              <div className="bg-white rounded-xl shadow-xl p-8 mb-6">
                <Users className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                <h3 className="m-cardTitle font-bold text-slate-900 mb-2">100% Gratis voor leden</h3>
                <p className="m-body text-slate-600!">
                  Geen verborgen kosten, geen abonnementen.
                  Gewoon altijd toegankelijk.
                </p>
              </div>
              
              <button 
                onClick={() => { setSignupMode('user'); setShowSignupModal(true); }}
                className="m-button w-full px-8 py-4 bg-blue-600 text-white! rounded-lg hover:bg-blue-700 font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                Maak een gratis account aan
              </button>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <div className="bg-linear-to-r from-slate-900 via-blue-900 to-slate-900 rounded-2xl p-12 text-center text-white shadow-2xl mb-12">
          <h2 className="m-sectionTitle font-bold mb-4 text-white!">Klaar om te beginnen?</h2>
          <p className="m-bodyLg text-slate-100! mb-8 max-w-2xl mx-auto">
            Word lid van de HUB3 community en ontdek eindeloze dansmogelijkheden op één plek.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button 
              onClick={() => { setSignupMode('user'); setShowSignupModal(true); }}
              className="m-button px-8 py-4 bg-white text-blue-600! rounded-lg hover:bg-blue-50 font-semibold transition-colors shadow-lg"
            >
              Start gratis en verken
            </button>
          </div>
        </div>

        {/* FAQ Link */}
        <div className="text-center">
          <a href="/faq" className="m-bodyLg inline-flex items-center gap-2 text-slate-600! hover:text-blue-600 font-medium transition-colors">
            <HelpCircle className="w-5 h-5" />
            Heb je vragen? Bekijk onze FAQ
          </a>
        </div>
      </main>

      {/* Sticky CTA buttons removed to avoid hiding the footer */}

      {/* Login Modal */}
      {showLoginModal && (
        <div onClick={() => setShowLoginModal(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="t-h3 font-bold text-gray-900">Log in op je account</h2>
                <button onClick={() => setShowLoginModal(false)} aria-label="Close" className="text-slate-500! p-2 rounded-md hover:bg-slate-100 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {error && (
                <div className="t-bodySm mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800!">
                  {error}
                </div>
              )}

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
                      onChange={(e) => setLoginData({...loginData, email: e.target.value})}
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
                      onChange={(e) => setLoginData({...loginData, password: e.target.value})}
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
                    onClick={() => { setShowLoginModal(false); setShowSignupModal(true); }}
                    className="text-blue-600 hover:text-blue-500 font-medium"
                  >
                    Registreer hier
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signup Modal */}
      {showSignupModal && (
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
                  onClick={() => { setSignupMode('studio') }}
                  className={`px-4 py-2 rounded-md ${signupMode === 'studio' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                >Studio account</button>
                <button
                  onClick={() => { setSignupMode('user') }}
                  className={`px-4 py-2 rounded-md ${signupMode === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                >Lid account</button>
              </div>

              {error && (
                <div className="t-bodySm mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                  {error}
                </div>
              )}

              {/* Account Details Step (or regular user signup) */}
              <>
                  {signupMode === 'studio' && (
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
                  )}

                  {signupMode === 'studio' && (
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
                            placeholder="0412345678"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {signupMode === 'user' && (
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
                )}


                <form onSubmit={handleSignup} className={`space-y-4 ${signupMode === 'studio' ? 'mt-4' : ''}`}>
                  {signupMode === 'user' && (
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
                              onChange={(e) => setSignupData({...signupData, firstName: e.target.value})}
                              onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
                              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Jan"
                            />
                          </div>
                          {fieldError('firstName') && (
                            <p className="t-caption text-red-600 mt-1">{fieldError('firstName')}</p>
                          )}
                        </div>

                        <div>
                          <label className="t-label block font-medium text-gray-700 mb-1">Achternaam *</label>
                          <input
                            type="text"
                            required
                            value={signupData.lastName}
                            onChange={(e) => setSignupData({...signupData, lastName: e.target.value})}
                            onBlur={() => setTouched((t) => ({ ...t, lastName: true }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Jansen"
                          />
                          {fieldError('lastName') && (
                            <p className="t-caption text-red-600 mt-1">{fieldError('lastName')}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="t-label block font-medium text-gray-700 mb-1">Geboortedatum *</label>
                        <div className="relative min-w-0">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                          <input
                            type="date"
                            required
                            value={signupData.birthDate}
                            onChange={(e) => setSignupData({...signupData, birthDate: e.target.value})}
                            onBlur={() => setTouched((t) => ({ ...t, birthDate: true }))}
                            className="w-full min-w-0 max-w-full appearance-none pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        {fieldError('birthDate') && (
                          <p className="t-caption text-red-600 mt-1">{fieldError('birthDate')}</p>
                        )}
                      </div>
                    </>
                  )}

                <div>
                  <label className="t-label block font-medium text-gray-700 mb-1">Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      required
                      value={signupData.email}
                      onChange={(e) => setSignupData({...signupData, email: e.target.value})}
                      onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                      className="w-full pl-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="your@email.com"
                    />
                  </div>
                  {fieldError('email') && (
                    <p className="t-caption text-red-600 mt-1">{fieldError('email')}</p>
                  )}
                </div>

                <div>
                  <label className="t-label block font-medium text-gray-700 mb-1">Wachtwoord *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="password"
                      required
                      value={signupData.password}
                      onChange={(e) => setSignupData({...signupData, password: e.target.value})}
                      onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Minimaal 6 karakters"
                    />
                  </div>
                  {fieldError('password') && (
                    <p className="t-caption text-red-600 mt-1">{fieldError('password')}</p>
                  )}
                </div>

                <div>
                  <label className="t-label block font-medium text-gray-700 mb-1">Bevestig wachtwoord *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="password"
                      required
                      value={signupData.confirmPassword}
                      onChange={(e) => setSignupData({...signupData, confirmPassword: e.target.value})}
                      onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Herhaal je wachtwoord"
                    />
                  </div>
                  {fieldError('confirmPassword') && (
                    <p className="t-caption text-red-600 mt-1">{fieldError('confirmPassword')}</p>
                  )}
                </div>

                {signupMode === 'user' && (
                  <>
                    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border">
                      <input type="checkbox" id="agreeToTermsModal" checked={agreedToTermsModal} onChange={(e) => setAgreedToTermsModal(e.target.checked)} className="mt-1 h-4 w-4 text-blue-600" />
                      <label htmlFor="agreeToTermsModal" className="t-bodySm text-slate-700">Ik ga akkoord met de <a href="/terms-of-service" className="text-blue-600 underline" target="_blank" rel="noreferrer">Terms of Service</a> en de <a href="/privacy-policy" className="text-blue-600 underline" target="_blank" rel="noreferrer">Privacy Policy</a> *</label>
                    </div>
                    {(!agreedToTermsModal && (attemptedSubmit || !!touched['agree'])) && (
                      <p className="t-caption text-red-600 mt-1">Je moet akkoord gaan met de Terms of Service en de Privacy Policy</p>
                    )}
                  </>
                )}

                <button
                  type="submit"
                  disabled={!isSignupValid || loading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Account aanmaken...' : 'Account aanmaken'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <p className="t-bodySm text-gray-600">
                  Al een account?{' '}
                  <button
                    onClick={() => { setShowSignupModal(false); setShowLoginModal(true); }}
                    className="text-blue-600 hover:text-blue-500 font-medium"
                  >
                    Log in hier
                  </button>
                </p>
              </div>
              </>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center">
              {/* Animated Check Icon */}
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-bounce">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              
              <h2 className="t-h3 font-bold text-gray-900 mb-2">Account aangemaakt!</h2>
              <p className="t-body text-slate-600 mb-4">
                {signupMode === 'studio' ? (
                  <>
                    Je studio account is succesvol aangemaakt.
                    <span className="block mt-2 text-slate-600">
                      Je rondt je studio profiel af en kiest daarna een plan.
                    </span>
                  </>
                ) : (
                  'Je account is succesvol aangemaakt.'
                )}
              </p>
              
              {/* Loading Spinner */}
              <div className="t-bodySm flex items-center justify-center gap-2 text-slate-500">
                <LoadingSpinner size={16} label="Laden" />
                <span>Je wordt doorgestuurd naar het inlogscherm...</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer is rendered by the layout wrapper (UserLayoutWrapper) to avoid duplicates */}
    </div>
  )
}
