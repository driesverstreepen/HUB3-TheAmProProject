'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff } from 'lucide-react'
import { useNotification } from '@/contexts/NotificationContext'

export default function AmproSignupPage() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/ampro/mijn-projecten'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const { showError, showInfo } = useNotification()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!cancelled && data?.session?.user) router.replace(next)
    })()
    return () => {
      cancelled = true
    }
  }, [router, next])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (!agreedToTerms) {
        showError('Je moet akkoord gaan met de Algemene voorwaarden en de Privacyverklaring')
        return
      }
      setLoading(true)

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })
      if (signUpError) throw signUpError

      // If email confirmations are enabled, user might need to confirm first.
      if (!data?.session) {
        showInfo('Check je mailbox om je account te bevestigen. Daarna kan je inloggen.')
        return
      }

      // Record GDPR consents for active legal documents (best-effort)
      try {
        const { data: legalDocs, error: legalError } = await supabase
          .from('legal_documents')
          .select('document_type, version')
          .eq('is_active', true)
          .in('document_type', ['privacy_policy', 'terms_of_service'])

        if (!legalError && legalDocs && legalDocs.length > 0) {
          const consents = legalDocs.map((doc: any) => ({
            user_id: data.user?.id,
            document_type: doc.document_type,
            document_version: doc.version,
            consent_given: true,
            ip_address: null,
            user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
          }))

          const { error: consentError } = await supabase.from('user_consents').insert(consents)
          if (consentError) console.error('Error recording consents:', (consentError as any)?.message || consentError)

          // Upsert a summary on ampro_dancer_profiles for quick audit
          try {
            const versionSummary = legalDocs.map((d: any) => `${d.document_type}:${d.version}`).join(',')
            await supabase.from('ampro_dancer_profiles').upsert({
              user_id: data.user?.id,
              consent_given: true,
              consent_given_at: new Date().toISOString(),
              consent_text_version: versionSummary,
            }, { onConflict: 'user_id' })
          } catch (upErr) {
            console.error('Failed to upsert ampro_dancer_profiles consent summary', upErr)
          }
        }
      } catch (err) {
        console.error('Error tracking consents:', err)
      }

      router.replace(next)
    } catch (e: any) {
      showError(e?.message || 'Account aanmaken mislukt')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900">Account maken</h1>
        <p className="mt-1 text-sm text-gray-600">Maak een account om toegang te krijgen tot inschrijven.</p>

        <form onSubmit={onSubmit} className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
              autoComplete="email"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Wachtwoord
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 pr-10 text-sm"
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label={showPassword ? 'Verberg wachtwoord' : 'Toon wachtwoord'}
                title={showPassword ? 'Verberg wachtwoord' : 'Toon wachtwoord'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <div className="flex items-start gap-3 p-4 my-4 bg-gray-50 rounded-2xl border border-gray-200">
            <input type="checkbox" id="agreeToTermsAmpro" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-1 h-4 w-4 text-blue-600" />
            <label htmlFor="agreeToTermsAmpro" className="text-sm text-gray-700">Ik ga akkoord met de <Link href="/legal/terms" className="text-blue-600 underline">Algemene voorwaarden</Link> en de <Link href="/legal/privacy-policy" className="text-blue-600 underline">Privacyverklaring</Link></label>
          </div>

          <button
            type="submit"
            disabled={loading || !agreedToTerms}
            className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
              loading || !agreedToTerms
                ? 'bg-blue-100 text-blue-400'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {loading ? 'Bezig…' : 'Account maken'}
          </button>
        </form>

        <div className="mt-6 text-sm text-gray-700">
          Heb je al een account?{' '}
          <Link href="/ampro/login" className="font-semibold text-gray-900 hover:text-blue-600">
            Login
          </Link>
        </div>

        <div className="mt-4">
          <Link href="/ampro" className="text-sm font-semibold text-gray-900">
            ← Terug
          </Link>
        </div>
      </div>
    </main>
  )
}
