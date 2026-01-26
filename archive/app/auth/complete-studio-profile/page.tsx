'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { getPostLoginRedirectPath } from '@/lib/redirects'
import { safeSelect } from '@/lib/supabaseHelpers'

type PendingStudio = {
  studio?: {
    name?: string
    location?: string
    email?: string
    phoneNumber?: string
  }
  firstName?: string
  lastName?: string
  birthDate?: string
}

type PendingStudioPlan = {
  studioId: string
}

export default function CompleteStudioProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [step, setStep] = useState<'profile' | 'plan'>('profile')
  const [createdStudioId, setCreatedStudioId] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [agreed, setAgreed] = useState(false)

  const [studioName, setStudioName] = useState('')
  const [location, setLocation] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')

  const [startWithTrial, setStartWithTrial] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<{ tier: 'basic' | 'plus' | 'pro', period: 'monthly' | 'yearly' } | null>(null)

  const isProfileValid = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      birthDate.trim().length > 0 &&
      studioName.trim().length > 0 &&
      contactEmail.trim().length > 0 &&
      agreed === true
    )
  }, [firstName, lastName, birthDate, studioName, contactEmail, agreed])

  const isPlanValid = useMemo(() => {
    if (!createdStudioId) return false
    if (startWithTrial) return true
    return !!selectedPlan?.tier
  }, [createdStudioId, startWithTrial, selectedPlan])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData?.session
        const user = session?.user

        if (!user) {
          router.replace('/auth/login')
          return
        }

        const accessToken = session?.access_token

        // If the user already created a studio but still needs to choose a plan,
        // restore that state (e.g. after refresh).
        let pendingPlan: PendingStudioPlan | null = null
        try {
          const raw = localStorage.getItem('pendingStudioPlan')
          if (raw) pendingPlan = JSON.parse(raw) as PendingStudioPlan
        } catch {
          // ignore
        }

        if (!cancelled && pendingPlan?.studioId) {
          setCreatedStudioId(pendingPlan.studioId)
          setStep('plan')
        }

        // If the user already owns a studio, treat pendingStudio as stale and prefill from DB.
        // This fixes cases where localStorage still contains pendingStudio even though onboarding
        // was completed earlier.
        let ownedStudio: any = null
        try {
          const ownedResp = await supabase
            .from('studios')
            .select('id, naam, location, contact_email, phone_number')
            .eq('eigenaar_id', user.id)
            .maybeSingle()
          if (!ownedResp.error && ownedResp.data?.id) ownedStudio = ownedResp.data
        } catch {
          // ignore
        }

        if (!ownedStudio && accessToken) {
          try {
            const resp = await fetch('/api/studios/owned', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: accessToken }),
            })
            if (resp.ok) {
              const json = await resp.json().catch(() => ({} as any))
              if (json?.studio?.id) ownedStudio = json.studio
            }
          } catch {
            // ignore
          }
        }

        // Load pending studio data (if available)
        let pending: PendingStudio | null = null
        try {
          const raw = localStorage.getItem('pendingStudio')
          if (raw) pending = JSON.parse(raw) as PendingStudio
        } catch {
          // ignore
        }

        if (!cancelled && pending) {
          if (pending.firstName && !firstName) setFirstName(pending.firstName)
          if (pending.lastName && !lastName) setLastName(pending.lastName)
          if (pending.birthDate && !birthDate) setBirthDate(pending.birthDate)

          const s = pending.studio || {}
          if (s.name && !studioName) setStudioName(s.name)
          if (s.location && !location) setLocation(s.location)

          const emailPrefill = s.email || user.email || ''
          if (emailPrefill && !contactEmail) setContactEmail(emailPrefill)

          if (s.phoneNumber && !phoneNumber) setPhoneNumber(s.phoneNumber)

        } else if (!cancelled) {
          // No pending studio in localStorage; we still allow completing the form.
          if (user.email && !contactEmail) setContactEmail(user.email)
        }

        if (!cancelled && ownedStudio) {
          // Pre-fill studio fields from DB if they aren't already set.
          if (typeof ownedStudio.naam === 'string' && !studioName) setStudioName(ownedStudio.naam)
          if (typeof ownedStudio.location === 'string' && !location) setLocation(ownedStudio.location)
          if (typeof ownedStudio.contact_email === 'string' && !contactEmail) setContactEmail(ownedStudio.contact_email)
          if (typeof ownedStudio.phone_number === 'string' && !phoneNumber) setPhoneNumber(ownedStudio.phone_number)

          // pendingStudio is no longer relevant once a studio exists.
          try {
            localStorage.removeItem('pendingStudio')
          } catch {
            // ignore
          }
        }

        // Prefill from existing profile if present
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('profile_completed, first_name, last_name, date_of_birth, email, phone')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!cancelled && prof) {
          if (typeof prof.first_name === 'string' && !firstName) setFirstName(prof.first_name)
          if (typeof prof.last_name === 'string' && !lastName) setLastName(prof.last_name)
          if (typeof prof.date_of_birth === 'string' && !birthDate) setBirthDate(prof.date_of_birth)
          if (typeof prof.email === 'string' && !contactEmail) setContactEmail(prof.email)
          if (typeof prof.phone === 'string' && !phoneNumber) setPhoneNumber(prof.phone)

          // If the user already completed profile but still has pendingStudio,
          // we keep them here to finish studio creation.
          // If no pending studio and profile completed, let the normal redirect logic handle it,
          // UNLESS the user is in the middle of plan selection.
          if (prof.profile_completed === true) {
            let hasPendingStudio = false
            let hasPendingPlan = false
            try {
              hasPendingStudio = !!localStorage.getItem('pendingStudio')
              hasPendingPlan = !!localStorage.getItem('pendingStudioPlan')
            } catch {}
            if (!hasPendingStudio && !hasPendingPlan) {
              // If everything is completed, go to the normal post-login destination.
              try {
                const path = await getPostLoginRedirectPath(supabase as any, user.id)
                router.replace(path)
              } catch {
                router.replace('/dashboard')
              }
              return
            }
          }
        }

        // Prefill from Google metadata if available
        if (!cancelled) {
          const meta: any = user.user_metadata || {}
          const fullName = String(meta.full_name || meta.name || '').trim()
          if (fullName && (!firstName || !lastName)) {
            const parts = fullName.split(' ').filter(Boolean)
            if (parts.length >= 2) {
              if (!firstName) setFirstName(parts[0])
              if (!lastName) setLastName(parts.slice(1).join(' '))
            }
          }
        }
      } catch (e: any) {
        console.error('[complete-studio-profile] load failed:', e)
        setError('Kon studio profiel niet laden. Probeer opnieuw.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router, firstName, lastName, birthDate, studioName, location, contactEmail, phoneNumber])

  const onSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isProfileValid) {
      setError('Vul alle velden in en ga akkoord met de voorwaarden.')
      return
    }

    setSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData?.session
      const user = session?.user
      if (!user) {
        router.replace('/auth/login')
        return
      }

      const email = contactEmail.trim() || user.email || null

      // Ensure public.users row exists
      try {
        await supabase
          .from('users')
          .upsert(
            {
              id: user.id,
              email,
              naam: `${firstName} ${lastName}`.trim(),
              role: 'user',
            },
            { onConflict: 'id' },
          )
      } catch (e) {
        console.info('[complete-studio-profile] users upsert failed:', (e as any)?.message || e)
      }

      // Upsert user profile (personal)
      await supabase
        .from('user_profiles')
        .upsert(
          {
            user_id: user.id,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: birthDate || null,
            email,
            phone: phoneNumber || null,
            profile_completed: true,
          },
          { onConflict: 'user_id' },
        )

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

          const { error: consentError } = await supabase.from('user_consents').insert(consents)
          if (consentError) {
            // likely duplicate or RLS; don't block onboarding
            console.info('[complete-studio-profile] consent insert failed:', consentError.message)
          }
        }
      } catch (e) {
        console.info('[complete-studio-profile] consent recording failed:', (e as any)?.message || e)
      }

      // Create studio and assign role (server endpoint uses service role)
      const accessToken = session?.access_token
      const payload = {
        access_token: accessToken,
        user_id: user.id,
        studio: {
          name: studioName,
          location: location || null,
          email,
          phoneNumber: phoneNumber || null,
        },
        firstName,
        lastName,
      }

      const createResp = await fetch('/api/studios/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!createResp.ok) {
        const txt = await createResp.text().catch(() => '')
        throw new Error(txt || 'Studio aanmaken mislukt')
      }

      const createData = await createResp.json().catch(() => ({} as any))
      const createdStudioId = createData?.studio?.id

      if (!createdStudioId) {
        throw new Error('Studio aanmaken mislukt')
      }

      try {
        localStorage.removeItem('pendingStudio')
      } catch {
        // ignore
      }

      // Persist plan step across refresh; user must choose plan before going to studio.
      try {
        localStorage.setItem('pendingStudioPlan', JSON.stringify({ studioId: createdStudioId } satisfies PendingStudioPlan))
      } catch {
        // ignore
      }

      setCreatedStudioId(createdStudioId)
      setStep('plan')
    } catch (e: any) {
      console.error('[complete-studio-profile] submit failed:', e)
      setError(e?.message || 'Opslaan mislukt. Probeer opnieuw.')
    } finally {
      setSaving(false)
    }
  }

  const onConfirmPlan = async () => {
    setError(null)

    if (!createdStudioId) {
      setError('Studio ontbreekt. Herlaad de pagina en probeer opnieuw.')
      return
    }

    if (!startWithTrial && !selectedPlan) {
      setError('Kies een plan of start met de trial.')
      return
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData?.session
      const user = session?.user
      if (!user) {
        router.replace('/auth/login')
        return
      }

      if (startWithTrial) {
        try {
          localStorage.removeItem('pendingStudioPlan')
        } catch {}
        // Force school-year setup before letting the user enter the studio UI.
        try {
          const { data, missingTable } = await safeSelect(
            supabase as any,
            'studio_school_years',
            'id,is_active',
            { studio_id: createdStudioId },
          )

          if (!missingTable) {
            const rows = (Array.isArray(data) ? data : data ? [data] : []) as any[]
            const active = rows.find((r) => !!(r as any)?.is_active)
            if (!active?.id) {
              router.replace(`/auth/complete-studio-schoolyear?studioId=${createdStudioId}`)
              return
            }
          }
        } catch {
          // ignore
        }

        router.replace(`/studio/${createdStudioId}`)
        return
      }

      const checkoutResp = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: selectedPlan!.tier,
          period: selectedPlan!.period,
          studioId: createdStudioId,
          userId: user.id,
        }),
      })

      if (!checkoutResp.ok) {
        const txt = await checkoutResp.text().catch(() => '')
        throw new Error(txt || 'Betaling kon niet worden gestart')
      }

      const { url } = await checkoutResp.json().catch(() => ({} as any))
      if (!url) {
        throw new Error('Betaling kon niet worden gestart')
      }

      try {
        localStorage.removeItem('pendingStudioPlan')
      } catch {}

      window.location.href = url
    } catch (e: any) {
      console.error('[complete-studio-profile] plan confirm failed:', e)
      setError(e?.message || 'Betaling kon niet worden gestart. Probeer opnieuw.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size={48} label="Laden" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
        <h1 className="text-2xl font-bold text-slate-900">Maak je studio profiel af</h1>
        <p className="text-sm text-slate-600 mt-1">We hebben deze gegevens nodig om je studio te activeren.</p>

        {error ? (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
        ) : null}
        {step === 'profile' ? (
        <form onSubmit={onSubmitProfile} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Voornaam *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Jan"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Achternaam *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Jansen"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Geboortedatum *</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="pt-2">
            <h2 className="text-sm font-semibold text-slate-900">Studio</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Studio naam *</label>
            <input
              type="text"
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Dance Studio"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Locatie</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Antwerpen"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contact e-mail *</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="info@studio.be"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Telefoon</label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+32 ..."
            />
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 text-blue-600"
              id="agree"
            />
            <label htmlFor="agree" className="text-sm text-slate-700">
              Ik ga akkoord met de{' '}
              <a href="/terms-of-service" className="text-blue-600 underline" target="_blank" rel="noreferrer">Terms of Service</a>
              {' '}en de{' '}
              <a href="/privacy-policy" className="text-blue-600 underline" target="_blank" rel="noreferrer">Privacy Policy</a>
              {' '}*
            </label>
          </div>

          <button
            type="submit"
            disabled={!isProfileValid || saving}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Opslaan...' : 'Verder: kies een plan'}
          </button>
        </form>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-slate-900">Kies je startoptie</h2>
              <p className="text-sm text-slate-600 mt-1">Je kiest eerst een plan, daarna ga je naar je studio dashboard.</p>
            </div>

            <div
              onClick={() => setStartWithTrial(true)}
              className={`border-2 rounded-xl p-6 cursor-pointer transition-all ${
                startWithTrial ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-lg text-slate-900">14 dagen gratis proberen</h3>
                  <p className="text-sm text-slate-600 mt-1">Volledige toegang tot alle Pro features</p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  startWithTrial ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                }`}>
                  {startWithTrial ? <div className="w-2 h-2 rounded-full bg-white" /> : null}
                </div>
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center">✓</span>
                  Geen betaling nodig
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center">✓</span>
                  Alle Pro features beschikbaar 
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center">✓</span>
                  Na 14 dagen kies je een plan
                </li>
              </ul>
            </div>

            <div
              onClick={() => setStartWithTrial(false)}
              className={`border-2 rounded-xl p-6 cursor-pointer transition-all ${
                !startWithTrial ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Direct een plan kiezen</h3>
                  <p className="text-sm text-slate-600 mt-1">Kies je tier en start meteen</p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  !startWithTrial ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                }`}>
                  {!startWithTrial ? <div className="w-2 h-2 rounded-full bg-white" /> : null}
                </div>
              </div>

              {!startWithTrial ? (
                <div className="mt-4 space-y-4">
                  <div className="flex justify-center">
                    <div className="inline-flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedPlan((p) => ({ tier: p?.tier || 'basic', period: 'monthly' }))
                        }}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all border ${
                          (selectedPlan?.period === 'monthly' || !selectedPlan)
                            ? 'bg-white text-slate-900 shadow-sm border-slate-300'
                            : 'bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300'
                        }`}
                      >
                        Maandelijks
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedPlan((p) => ({ tier: p?.tier || 'basic', period: 'yearly' }))
                        }}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all border ${
                          selectedPlan?.period === 'yearly'
                            ? 'bg-white text-slate-900 shadow-sm border-slate-300'
                            : 'bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300'
                        }`}
                      >
                        Jaarlijks
                        <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Bespaar</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedPlan((p) => ({ tier: 'basic', period: p?.period || 'monthly' }))
                      }}
                      className={`flex-1 px-3 py-3 text-sm rounded-lg border-2 transition-all ${
                        selectedPlan?.tier === 'basic'
                          ? 'border-blue-600 bg-blue-100 text-blue-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-900'
                      }`}
                    >
                      <div className="font-medium">Basic</div>
                      <div className="text-xs mt-1 text-slate-700">{selectedPlan?.period === 'yearly' ? '€50/jaar' : '€5/maand'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedPlan((p) => ({ tier: 'plus', period: p?.period || 'monthly' }))
                      }}
                      className={`flex-1 px-3 py-3 text-sm rounded-lg border-2 transition-all ${
                        selectedPlan?.tier === 'plus'
                          ? 'border-blue-600 bg-blue-100 text-blue-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-900'
                      }`}
                    >
                      <div className="font-medium">Plus</div>
                      <div className="text-xs mt-1 text-slate-700">{selectedPlan?.period === 'yearly' ? '€100/jaar' : '€10/maand'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedPlan((p) => ({ tier: 'pro', period: p?.period || 'monthly' }))
                      }}
                      className={`flex-1 px-3 py-3 text-sm rounded-lg border-2 transition-all ${
                        selectedPlan?.tier === 'pro'
                          ? 'border-blue-600 bg-blue-100 text-blue-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-900'
                      }`}
                    >
                      <div className="font-medium">Pro</div>
                      <div className="text-xs mt-1 text-slate-700">{selectedPlan?.period === 'yearly' ? '€120/jaar' : '€15/maand'}</div>
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 text-center">Betaling na plan kiezen</p>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onConfirmPlan}
              disabled={!isPlanValid}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {startWithTrial ? 'Verder naar studio' : 'Verder naar betaling'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
