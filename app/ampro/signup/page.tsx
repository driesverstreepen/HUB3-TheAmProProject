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
        <h1 className="text-2xl font-bold text-slate-900">Account maken</h1>
        <p className="mt-1 text-sm text-slate-600">Maak een account om toegang te krijgen tot inschrijven.</p>

        <form onSubmit={onSubmit} className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              autoComplete="email"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Wachtwoord
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm"
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label={showPassword ? 'Verberg wachtwoord' : 'Toon wachtwoord'}
                title={showPassword ? 'Verberg wachtwoord' : 'Toon wachtwoord'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
              loading ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {loading ? 'Bezig…' : 'Account maken'}
          </button>
        </form>

        <div className="mt-6 text-sm text-slate-700">
          Heb je al een account?{' '}
          <Link href="/ampro/login" className="font-semibold text-slate-900">
            Login
          </Link>
        </div>

        <div className="mt-4">
          <Link href="/ampro" className="text-sm font-semibold text-slate-900">
            ← Terug
          </Link>
        </div>
      </div>
    </main>
  )
}
