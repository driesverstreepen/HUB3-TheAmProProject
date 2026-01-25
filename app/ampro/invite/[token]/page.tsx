'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { CheckCircle, XCircle, Link2 } from 'lucide-react'

type LookupResponse = {
  invite: {
    id: string
    performance_id: string
    expires_at: string | null
    max_uses: number | null
    uses_count: number
    revoked_at: string | null
  }
  performance: {
    id: string
    title: string
    is_public: boolean
    applications_open: boolean
  }
  status: {
    revoked: boolean
    expired: boolean
    maxed: boolean
    ok: boolean
  }
}

interface Props {
  params: Promise<{ token: string }>
}

export default function AmproInvitePage({ params }: Props) {
  const router = useRouter()
  const [token, setToken] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [lookup, setLookup] = useState<LookupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    params.then((p) => setToken(p.token))
  }, [params])

  const nextUrl = useMemo(() => `/ampro/invite/${encodeURIComponent(token)}`, [token])

  useEffect(() => {
    if (!token) return

    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError(null)

      try {
        const [{ data: sessionData }, lookupRes] = await Promise.all([
          supabase.auth.getSession(),
          fetch(`/api/ampro/program-invites/lookup?token=${encodeURIComponent(token)}`),
        ])

        if (cancelled) return
        setUser(sessionData?.session?.user || null)

        const json = await lookupRes.json()
        if (!lookupRes.ok) throw new Error(json?.error || 'Uitnodiging niet gevonden')
        setLookup(json)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Er ging iets mis')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token])

  async function claim() {
    if (!token) return
    setClaiming(true)
    setError(null)

    try {
      const resp = await fetch('/api/ampro/program-invites/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Claimen mislukt')

      setSuccess(true)
      setTimeout(() => {
        router.replace(json.redirect || '/ampro/mijn-projecten')
      }, 800)
    } catch (e: any) {
      setError(e?.message || 'Claimen mislukt')
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <LoadingSpinner size={48} className="mx-auto mb-4" label="Uitnodiging laden" />
          <p className="text-gray-600">Uitnodiging laden…</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Gelinkt!</h1>
          <p className="text-gray-600 mb-2">Je bent toegevoegd aan {lookup?.performance?.title || 'het programma'}.</p>
          <p className="text-sm text-gray-500">Je wordt doorgestuurd…</p>
        </div>
      </div>
    )
  }

  if (error || !lookup) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Ongeldige link</h1>
          <p className="text-gray-600 mb-6">{error || 'Deze uitnodiging kon niet worden gevonden'}</p>
          <Link href="/ampro" className="inline-flex h-11 items-center justify-center rounded-3xl bg-gray-600 px-5 text-sm font-semibold text-white hover:bg-gray-700">
            Terug
          </Link>
        </div>
      </div>
    )
  }

  const disabled = !lookup.status.ok

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Link2 className="w-10 h-10 text-blue-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Programma link</h1>
        <p className="text-center text-gray-600 mb-8">
          Je wordt gekoppeld aan: <span className="font-semibold">{lookup.performance.title}</span>
        </p>

        {!lookup.status.ok ? (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
            Deze link is {lookup.status.revoked ? 'ingetrokken' : lookup.status.expired ? 'verlopen' : 'vol'}.
          </div>
        ) : null}

        {!user ? (
          <div className="grid gap-3">
            <Link
              href={`/ampro/login?next=${encodeURIComponent(nextUrl)}`}
              className={`h-11 rounded-3xl px-4 text-sm font-semibold flex items-center justify-center transition-colors ${
                disabled ? 'bg-blue-100 text-blue-400 pointer-events-none' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Inloggen
            </Link>
            <Link
              href={`/ampro/signup?next=${encodeURIComponent(nextUrl)}`}
              className={`h-11 rounded-3xl px-4 text-sm font-semibold flex items-center justify-center border transition-colors ${
                disabled ? 'border-gray-200 text-gray-400 pointer-events-none' : 'border-gray-200 text-gray-900 hover:bg-gray-50'
              }`}
            >
              Account maken
            </Link>
            <p className="text-xs text-gray-500 text-center">Na inloggen word je automatisch gekoppeld.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <button
              type="button"
              onClick={claim}
              disabled={claiming || disabled}
              className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                claiming || disabled ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {claiming ? 'Koppelen…' : 'Koppel mij aan dit programma'}
            </button>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}
