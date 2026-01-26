"use client"

import { useState, useEffect } from 'react'
import { Building2, Users, ArrowLeft, Mail, Lock, MapPin, Phone, User, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNotification } from '@/contexts/NotificationContext'
import { useRouter } from 'next/navigation'

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

// Helper function to create notifications for pending teacher invitations after signup
const createNotificationsForPendingInvitations = async (userId: string, email: string) => {
  try {
    // Prefer server-side processing to ensure we can use the service-role key and bypass RLS.
    // POST to our server endpoint which will create notifications using the service role.
    const resp = await fetch('/api/hooks/process-pending-invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email })
    })

    if (!resp.ok) {
      const txt = await resp.text()
      console.error('[Pending Invitations] Server failed to process pending invitations:', resp.status, txt)
      return
    }

    const json = await resp.json()
    console.log(`[Pending Invitations] Server processed pending invitations, created=${json.created || 0}`)
  } catch (error) {
    console.error('[Pending Invitations] Unexpected error:', error)
  }
}

export default function SignUpPage({ initialPath }: { initialPath?: 'user_profile' | 'studio_creation' }) {
  const { showSuccess, showError } = useNotification()
  const [path, setPath] = useState<'user_profile' | 'studio_creation' | null>(initialPath || null)
  const [loading, setLoading] = useState(false)
  // errors will be shown via the centralized notification toasts
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const router = useRouter()

  const [authData, setAuthData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  })

  const [studioData, setStudioData] = useState({
    studioName: '',
    location: '',
    contactEmail: '',
    phoneNumber: '',
  })

  const [personalData, setPersonalData] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
  })

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

  const handleGoogleSignup = async () => {
    try {
      if (path === 'studio_creation') {
        const studioNameOk = studioData.studioName && studioData.studioName.trim().length > 0
        if (!studioNameOk) {
          showError('Studio naam is verplicht')
          return
        }

        const pendingStudio: PendingStudio = {
          studio: {
            name: studioData.studioName || undefined,
            location: studioData.location || undefined,
            email: (studioData.contactEmail || authData.email || null) as any,
            phoneNumber: studioData.phoneNumber || undefined,
          },
        }
        localStorage.setItem('pendingStudio', JSON.stringify(pendingStudio))
      } else if (path === 'user_profile') {
        if (!agreedToTerms) {
          showError('Je moet akkoord gaan met de Algemene voorwaarden en de Privacyverklaring')
          return
        }

        const firstNameOk = personalData.firstName && personalData.firstName.trim().length > 0
        const lastNameOk = personalData.lastName && personalData.lastName.trim().length > 0
        const birthOk = personalData.birthDate && personalData.birthDate.trim().length > 0

        if (!firstNameOk || !lastNameOk || !birthOk) {
          showError('Vul je voornaam, achternaam en geboortedatum in om te registreren via Google')
          return
        }

        const pending: PendingOAuthSignup = {
          mode: 'user',
          firstName: personalData.firstName,
          lastName: personalData.lastName,
          birthDate: personalData.birthDate,
          agreedToTerms: true,
          email: authData.email || null,
        }
        localStorage.setItem('pendingOAuthSignup', JSON.stringify(pending))
      } else {
        // no path picked yet
        return
      }

      setLoading(true)
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/callback` },
      })
      if (error) throw error
    } catch (err: any) {
      console.error('[Register] Google OAuth start failed:', err)
      showError(err?.message || 'Google registratie kon niet worden gestart')
      setLoading(false)
    }
  }

  // computed validation state
  const studioFieldsValid = (
    authData.email.trim() !== '' &&
    authData.password.length >= 6 &&
    authData.password === authData.confirmPassword &&
    personalData.firstName.trim() !== '' &&
    personalData.lastName.trim() !== '' &&
    studioData.studioName.trim() !== ''
  )

  const profileFieldsValid = (
    authData.email.trim() !== '' &&
    authData.password.length >= 6 &&
    authData.password === authData.confirmPassword &&
    personalData.firstName.trim() !== '' &&
    personalData.lastName.trim() !== '' &&
    personalData.birthDate.trim() !== ''
  )

  useEffect(() => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const pathParam = urlParams?.get('path') as 'user_profile' | 'studio_creation' | null
    if (pathParam) setPath(pathParam)
  }, [])

  // helper to avoid TypeScript's narrowed type complaints when comparing path in JSX
  const isPath = (p: 'user_profile' | 'studio_creation') => path === p

  const handleStudioCreation = async (e: React.FormEvent) => {
  e.preventDefault()
    setLoading(true)

    try {
      if (!agreedToTerms) throw new Error('You must agree to the Terms of Service and Privacy Policy')
      if (authData.password !== authData.confirmPassword) throw new Error('Passwords do not match')
      if (authData.password.length < 6) throw new Error('Password must be at least 6 characters')

      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/login` : undefined
      const { data: authUser, error: signUpError } = await supabase.auth.signUp({
        email: authData.email,
        password: authData.password,
        options: { emailRedirectTo: redirectTo },
      })

      if (signUpError) throw signUpError
      if (!authUser || !authUser.user) throw new Error('Failed to create user')

      // small wait for auth propagation
      await new Promise((r) => setTimeout(r, 1000))

      // Prefer calling a secure server-side endpoint to perform RLS-bypassing writes
      // The endpoint uses the Supabase service_role key and validates the user's token.
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData?.session) {
        // If email confirmation is required, signUp will not create a session.
        // Inform the user to confirm their email before continuing with DB writes.
        
        // Create notifications for any pending teacher invitations
        try {
          await createNotificationsForPendingInvitations(authUser.user.id, authData.email)
        } catch (inviteErr) {
          console.error('Could not create notifications yet:', inviteErr)
        }
        
        showSuccess('Account aangemaakt! Controleer je e-mail om je account te bevestigen voordat je de studio aanmaakt.')
        router.push('/auth/login')
        return
      }

      const resp = await fetch('/api/studios/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: sessionData.session.access_token,
          studio: {
            name: studioData.studioName,
            location: studioData.location || null,
            contact_email: studioData.contactEmail || authData.email,
            phone_number: studioData.phoneNumber || null,
          },
          firstName: personalData.firstName,
          lastName: personalData.lastName,
        }),
      })

      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Failed to create studio')

      // Record GDPR consents
      try {
        // Get active legal documents
        const { data: legalDocs, error: legalError } = await supabase
          .from('legal_documents')
          .select('document_type, version')
          .eq('is_active', true)
          .in('document_type', ['privacy_policy', 'terms_of_service'])

        if (legalError) throw legalError

        // Create consent records for each document
        if (legalDocs && legalDocs.length > 0) {
          const consents = legalDocs.map(doc => ({
            user_id: authUser.user!.id,
            document_type: doc.document_type,
            document_version: doc.version,
            consent_given: true,
            ip_address: null, // Could be captured if needed
            user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null
          }))

          const { error: consentError } = await supabase
            .from('user_consents')
            .insert(consents)

          if (consentError) {
            console.error('Error recording consents:', consentError)
          }
        }
      } catch (err) {
        console.error('Error tracking consents:', err)
        // Don't fail registration if consent tracking fails
      }

      // Create notifications for any pending teacher invitations
      try {
        await createNotificationsForPendingInvitations(authUser.user.id, authData.email)
      } catch (inviteErr) {
        console.error('Error processing teacher invitations:', inviteErr)
        // Don't fail the studio creation if this fails
      }

      showSuccess('Studio succesvol aangemaakt! Je kunt nu inloggen.')
      router.push('/auth/login')
    } catch (err: any) {
      // Normalize and show richer error information when possible
      try {
        console.error('Studio creation failed:', err)
        const errMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || 'Failed to create studio'
        showError(errMsg)
      } catch (e) {
        console.error('Error while stringifying error', e)
        showError('Failed to create studio')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleProfileCreation = async (e: React.FormEvent) => {
  e.preventDefault()
    setLoading(true)

    try {
      if (!agreedToTerms) throw new Error('You must agree to the Terms of Service and Privacy Policy')
      if (authData.password !== authData.confirmPassword) throw new Error('Passwords do not match')
      if (authData.password.length < 6) throw new Error('Password must be at least 6 characters')
      if (!personalData.firstName || !personalData.lastName) throw new Error('First name and last name are required')

      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/login` : undefined
      const { data: authUser, error: signUpError } = await supabase.auth.signUp({
        email: authData.email,
        password: authData.password,
        options: { emailRedirectTo: redirectTo },
      })

      if (signUpError) throw signUpError
      if (!authUser || !authUser.user) throw new Error('Failed to create user')

      // Ensure we have an active session before attempting RLS-protected inserts.
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData?.session) {
        // Create notifications for pending teacher invitations even without session (before email confirmation)
        try {
          await createNotificationsForPendingInvitations(authUser.user.id, authData.email)
        } catch (inviteErr) {
          console.error('Could not process teacher invitations yet:', inviteErr)
        }
        
        showSuccess('Account aangemaakt! Controleer je e-mail om je account te bevestigen.')
        router.push('/auth/login')
        return
      }

      // Make sure a corresponding public.users row exists before inserting extended profile.
      // public.user_profiles has a FK -> public.users(id), so we must create/upsert the users row first.
      try {
        await supabase.from('users').upsert({
          id: authUser.user.id,
          email: authData.email,
          naam: `${personalData.firstName} ${personalData.lastName}`,
          role: 'user',
        }, { onConflict: 'id' })
      } catch (uErr) {
        // If this fails for any reason, continue — the following insert will surface a clearer DB error.
        console.error('Warning: failed to ensure public.users row for new signup', uErr)
      }

      const { error: profileError } = await supabase.from('user_profiles').insert({
        user_id: authUser.user.id,
        first_name: personalData.firstName,
        last_name: personalData.lastName,
        date_of_birth: personalData.birthDate || null,
        email: authData.email,
        profile_completed: true,
      })

      if (profileError) throw profileError

      // Ensure a user_roles row exists for this new user (role: 'user')
      try {
        await supabase.from('user_roles').upsert({
          user_id: authUser.user.id,
          role: 'user',
          first_name: personalData.firstName || null,
          last_name: personalData.lastName || null,
        })
      } catch (err) {
        // ignore; if RLS or table not present this will fail silently for now
      }

      // Record GDPR consents
      try {
        // Get active legal documents
        const { data: legalDocs, error: legalError } = await supabase
          .from('legal_documents')
          .select('document_type, version')
          .eq('is_active', true)
          .in('document_type', ['privacy_policy', 'terms_of_service'])

        if (legalError) throw legalError

        // Create consent records for each document
        if (legalDocs && legalDocs.length > 0) {
          const consents = legalDocs.map(doc => ({
            user_id: authUser.user!.id,
            document_type: doc.document_type,
            document_version: doc.version,
            consent_given: true,
            ip_address: null,
            user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null
          }))

          const { error: consentError } = await supabase
            .from('user_consents')
            .insert(consents)

          if (consentError) {
            console.error('Error recording consents:', consentError)
          }
        }
      } catch (err) {
        console.error('Error tracking consents:', err)
        // Don't fail registration if consent tracking fails
      }

      // Create notifications for any pending teacher invitations
      try {
        await createNotificationsForPendingInvitations(authUser.user.id, authData.email)
      } catch (inviteErr) {
        console.error('Error processing teacher invitations:', inviteErr)
        // Don't fail the signup if this fails
      }

  showSuccess('Account succesvol aangemaakt! Vul je profiel aan om verder te gaan.')
  // Redirect new users to profile so they can complete required fields
  router.push('/profile?new_user=1')
    } catch (err: any) {
      try {
        console.error('Profile creation failed:', err)
        const errMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || 'Failed to create account'
        showError(errMsg)
      } catch (e) {
        console.error('Error while stringifying error', e)
        showError('Failed to create account')
      }
    } finally {
      setLoading(false)
    }
  }

  if (path === 'studio_creation') {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors">
            <ArrowLeft size={20} />
            Back to Home
          </button>

          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-blue-600" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Maak je studio</h1>
              <p className="text-slate-600">Maak in één stap een account en je studio aan</p>
            </div>

            {/* Small account-type switch so users can change between Studio and Personal even when a path was preselected */}
            <div className="mb-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPath('user_profile')}
                className={`px-4 py-2 rounded-md ${isPath('user_profile') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >Persoonlijk account</button>
              <button
                onClick={() => setPath('studio_creation')}
                className={`px-4 py-2 rounded-md ${isPath('studio_creation') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >Studio account</button>
              
            </div>

            {/* errors are shown via centralized notifications */}

            <form onSubmit={handleStudioCreation} className="space-y-6">
              <button
                type="button"
                onClick={handleGoogleSignup}
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

              {/* simplified form - keep same fields as provided */}
              <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2"><User size={18} />Jouw gegevens</h3>
                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Voornaam</label>
                      <input required value={personalData.firstName} onChange={(e)=>setPersonalData({...personalData, firstName: e.target.value})} className="w-full px-4 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Achternaam</label>
                      <input required value={personalData.lastName} onChange={(e)=>setPersonalData({...personalData, lastName: e.target.value})} className="w-full px-4 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-mailadres</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="email" required value={authData.email} onChange={(e)=>setAuthData({...authData, email: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Wachtwoord</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input type="password" required value={authData.password} onChange={(e)=>setAuthData({...authData, password: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Bevestig wachtwoord</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input type="password" required value={authData.confirmPassword} onChange={(e)=>setAuthData({...authData, confirmPassword: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Building2 size={18} />Studio gegevens</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Studio naam *</label>
                  <input type="text" required value={studioData.studioName} onChange={(e)=>setStudioData({...studioData, studioName: e.target.value})} className="w-full px-4 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Naam van je studio" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Locatie (optioneel)</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" value={studioData.location} onChange={(e)=>setStudioData({...studioData, location: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Plaats of adres (optioneel)" />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border">
                <input type="checkbox" id="agreeToTerms" checked={agreedToTerms} onChange={(e)=>setAgreedToTerms(e.target.checked)} className="mt-1 h-4 w-4 text-blue-600" required />
                <label htmlFor="agreeToTerms" className="text-sm text-slate-700">I agree to the <a href="/terms-of-service" className="text-blue-600 underline" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy-policy" className="text-blue-600 underline" target="_blank" rel="noreferrer">Privacy Policy</a></label>
              </div>

              <button
                type="submit"
                disabled={loading || !studioFieldsValid || !agreedToTerms}
                aria-disabled={loading || !studioFieldsValid || !agreedToTerms}
                className={`w-full py-3 rounded-lg ${(!studioFieldsValid || !agreedToTerms) ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white'}`}
              >
                {loading ? 'Studio wordt aangemaakt...' : 'Studio aanmaken'}
              </button>

            </form>
        </div>
      </div>
    </div>
    )
  }

  if (path === 'user_profile') {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <button onClick={()=>router.push('/')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors"><ArrowLeft size={20} />Back to Home</button>

          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-700" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Maak een account</h1>
              <p className="text-slate-600">Begin met het ontdekken van lessen</p>
            </div>

            {/* Small account-type switch so users can change between Studio and Personal even when a path was preselected */}
            <div className="mb-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPath('studio_creation')}
                className={`px-4 py-2 rounded-md ${isPath('studio_creation') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >Studio account</button>
              <button
                onClick={() => setPath('user_profile')}
                className={`px-4 py-2 rounded-md ${isPath('user_profile') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >Persoonlijk account</button>
            </div>

            {/* errors are shown via centralized notifications */}

            <form onSubmit={handleProfileCreation} className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignup}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Voornaam *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" required value={personalData.firstName} onChange={(e)=>setPersonalData({...personalData, firstName: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Voornaam" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Achternaam *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" required value={personalData.lastName} onChange={(e)=>setPersonalData({...personalData, lastName: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Achternaam" />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input aria-label="Geboortedatum" title="Geboortedatum" type="date" required value={personalData.birthDate} onChange={(e)=>setPersonalData({...personalData, birthDate: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mailadres *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="email" required value={authData.email} onChange={(e)=>setAuthData({...authData, email: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="your@email.com" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Wachtwoord *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="password" required value={authData.password} onChange={(e)=>setAuthData({...authData, password: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="At least 6 characters" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bevestig wachtwoord *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="password" required value={authData.confirmPassword} onChange={(e)=>setAuthData({...authData, confirmPassword: e.target.value})} className="w-full pl-10 py-2 text-sm border border-slate-300 bg-white text-slate-900 placeholder-gray-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Confirm password" />
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border">
                <input type="checkbox" id="agreeToTermsProfile" checked={agreedToTerms} onChange={(e)=>setAgreedToTerms(e.target.checked)} className="mt-1 h-4 w-4 text-blue-600" required />
                <label htmlFor="agreeToTermsProfile" className="text-sm text-slate-700">Ik ga akkoord met de <a href="/terms-of-service" className="text-blue-600 underline" target="_blank" rel="noreferrer">Algemene voorwaarden</a> en de <a href="/privacy-policy" className="text-blue-600 underline" target="_blank" rel="noreferrer">Privacyverklaring</a></label>
              </div>

              <button
                type="submit"
                disabled={loading || !profileFieldsValid || !agreedToTerms}
                aria-disabled={loading || !profileFieldsValid || !agreedToTerms}
                className={`w-full py-3 rounded-lg ${(!profileFieldsValid || !agreedToTerms) ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white'}`}
              >
                {loading ? 'Account wordt aangemaakt...' : 'Account aanmaken'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // If no explicit path is set, show a clear choice so users don't get stuck on a loading screen
  if (path === null) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-slate-100 p-4 relative">
        <div className="absolute top-4 left-4">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-500 text-sm font-medium"
          >
            ← Terug naar HUB3
          </a>
        </div>
        <div className="flex items-center justify-center min-h-screen">
          <div className="max-w-2xl w-full text-center">
            <h1 className="text-3xl font-bold text-slate-900 mb-4">Maak een account</h1>
            <p className="text-slate-600 mb-8">Kies of je een studio wil aanmaken (studio admin) of een persoonlijk account wil registreren.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <button
              onClick={() => setPath('studio_creation')}
              className="flex flex-col items-start gap-3 p-6 bg-white rounded-2xl shadow hover:shadow-lg text-left"
            >
              <div className="flex items-center gap-3">
                <Building2 className="w-8 h-8 text-blue-600" />
                <div>
                  <div className="font-semibold text-slate-900">Create a studio</div>
                  <div className="text-sm text-slate-500">Set up your studio account and manage programs</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setPath('user_profile')}
              className="flex flex-col items-start gap-3 p-6 bg-white rounded-2xl shadow hover:shadow-lg text-left"
            >
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-slate-700" />
                <div>
                  <div className="font-semibold text-slate-900">Create a personal account</div>
                  <div className="text-sm text-slate-500">Sign up to discover and enroll in programs</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
    )
  }

  return null
}
