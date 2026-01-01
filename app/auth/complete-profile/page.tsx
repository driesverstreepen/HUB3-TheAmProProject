'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function CompleteProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [agreed, setAgreed] = useState(false)

  const isValid = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      birthDate.trim().length > 0 &&
      agreed === true
    )
  }, [firstName, lastName, birthDate, agreed])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data: sessionData } = await supabase.auth.getSession()
        const user = sessionData?.session?.user

        if (!user) {
          router.replace('/auth/login')
          return
        }

        // If already completed, skip.
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('profile_completed, first_name, last_name, date_of_birth')
          .eq('user_id', user.id)
          .maybeSingle()

        if (prof?.profile_completed === true) {
          router.replace('/dashboard')
          return
        }

        // Prefill from existing profile if present
        if (!cancelled && prof) {
          if (typeof prof.first_name === 'string') setFirstName(prof.first_name)
          if (typeof prof.last_name === 'string') setLastName(prof.last_name)
          if (typeof prof.date_of_birth === 'string') setBirthDate(prof.date_of_birth)
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
        console.error('[complete-profile] load failed:', e)
        setError('Kon profiel niet laden. Probeer opnieuw.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isValid) {
      setError('Vul alle velden in en ga akkoord met de voorwaarden.')
      return
    }

    setSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData?.session?.user
      if (!user) {
        router.replace('/auth/login')
        return
      }

      const email = user.email || null

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
            { onConflict: 'id' }
          )
      } catch (e) {
        console.info('[complete-profile] users upsert failed:', (e as any)?.message || e)
      }

      // Upsert profile
      await supabase
        .from('user_profiles')
        .upsert(
          {
            user_id: user.id,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: birthDate || null,
            email,
            profile_completed: true,
          },
          { onConflict: 'user_id' }
        )

      // Ensure user_roles exists; don't overwrite existing roles.
      try {
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!existingRole) {
          await supabase.from('user_roles').upsert({ user_id: user.id, role: 'user' }, { onConflict: 'user_id' })
        }
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

          const { error: consentError } = await supabase.from('user_consents').insert(consents)
          if (consentError) {
            // likely duplicate or RLS; don't block onboarding
            console.info('[complete-profile] consent insert failed:', consentError.message)
          }
        }
      } catch (e) {
        console.info('[complete-profile] consent recording failed:', (e as any)?.message || e)
      }

      router.replace('/dashboard')
    } catch (e: any) {
      console.error('[complete-profile] submit failed:', e)
      setError(e?.message || 'Opslaan mislukt. Probeer opnieuw.')
    } finally {
      setSaving(false)
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
        <h1 className="text-2xl font-bold text-slate-900">Maak je profiel af</h1>
        <p className="text-sm text-slate-600 mt-1">We hebben deze gegevens nodig om je account te activeren.</p>

        {error ? (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
            disabled={!isValid || saving}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Opslaan...' : 'Verder naar dashboard'}
          </button>
        </form>
      </div>
    </div>
  )
}
