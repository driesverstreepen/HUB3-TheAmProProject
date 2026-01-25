'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useNotification } from '@/contexts/NotificationContext'

export default function AmproLoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/ampro/mijn-projecten'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { showError } = useNotification()

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

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) throw signInError

      router.replace(next)
    } catch (e: any) {
      showError(e?.message || 'Inloggen mislukt')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900">Login</h1>
        <p className="mt-1 text-sm text-gray-600">Log in om toegang te krijgen tot inschrijven.</p>

        <form onSubmit={onSubmit} className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm"
              required
              autoComplete="email"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Wachtwoord
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm"
              required
              autoComplete="current-password"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                loading ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {loading ? 'Inloggen…' : 'Inloggen'}
          </button>
        </form>

        <div className="mt-6 text-sm text-gray-700">
          Nog geen account?{' '}
          <Link href="/ampro/signup" className="font-semibold text-gray-900 hover:text-blue-600">
            Account maken
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
