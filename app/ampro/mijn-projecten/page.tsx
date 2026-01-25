'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type AppRow = {
  id: string
  status: string
  submitted_at: string
  performance?: { id: string; title: string } | null
}

type RosterRow = {
  performance_id: string
  role_name: string | null
  added_at: string
  performance?: { id: string; title: string } | null
}

function getUserStatusLabel(status: string): string {
  const s = String(status || '').toLowerCase()
  if (s === 'accepted') return 'Geaccepteerd'
  if (s === 'rejected') return 'Afgewezen'
  return 'In behandeling'
}

export default function AmproMijnProjectenPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applications, setApplications] = useState<AppRow[]>([])
  const [roster, setRoster] = useState<RosterRow[]>([])
  // Stripe products removed — we rely on admin_payment_url set on the program
  const [checkoutLoading, setCheckoutLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setChecking(true)
        setError(null)

        const { data } = await supabase.auth.getSession()
        const user = data?.session?.user
        if (!user) {
          router.replace('/ampro/login?next=/ampro/mijn-projecten')
          return
        }

        const appsResp = await supabase
          .from('ampro_applications')
          .select('id,status,submitted_at,performance:ampro_programmas(id,title)')
          .order('submitted_at', { ascending: false })

        if (appsResp.error) throw appsResp.error

        const rosterResp = await supabase
          .from('ampro_roster')
          .select('performance_id,role_name,added_at,performance:ampro_programmas(id,title)')
          .order('added_at', { ascending: false })

        if (rosterResp.error) throw rosterResp.error

        if (!cancelled) {
          setApplications((appsResp.data as any) || [])
          setRoster((rosterResp.data as any) || [])
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Kon je projecten niet laden')
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  const applied = useMemo(() => applications.filter((a) => a.status !== 'accepted'), [applications])
  const acceptedPrograms = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ performance_id: string; title: string; role_name: string | null }> = []
    for (const r of roster) {
      const pid = String(r.performance_id || '')
      if (!pid) continue
      if (seen.has(pid)) continue
      seen.add(pid)
      out.push({
        performance_id: pid,
        title: String(r.performance?.title || pid),
        role_name: r.role_name ?? null,
      })
    }
    return out
  }, [roster])

  const payablePrograms = useMemo(() => [], [acceptedPrograms])

  // Removed stripe_products fetch — admin_payment_url on programs/ampro_programmas is used instead.

  async function handleCheckout(programId: string) {
    try {
      setCheckoutLoading((s) => ({ ...s, [programId]: true }))

      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program_id: programId }),
        credentials: 'same-origin',
      })

      const text = await res.text()
      let data: any = null
      try {
        data = text ? JSON.parse(text) : null
      } catch (e) {
        // not JSON
      }

      if (!res.ok) {
        const msg = (data && data.error) || text || `Request failed (${res.status})`
        throw new Error(msg)
      }

      if (data?.error) throw new Error(data.error)

      if (data?.url) {
        window.location.href = data.url
      } else {
        throw new Error('Geen checkout URL ontvangen')
      }
    } catch (err: any) {
      setError(err?.message || 'Betalen mislukt')
    } finally {
      setCheckoutLoading((s) => ({ ...s, [programId]: false }))
    }
  }

  if (checking) {
    return <div className="min-h-screen bg-white" />
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mijn Projecten</h1>
          <p className="mt-1 text-sm text-gray-600">Projecten waarvoor je hebt ingeschreven.</p>
        </div>

        {error ? <div className="mt-6 text-sm text-red-600">{error}</div> : null}

        <div className="mt-8 grid gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white elev-1 p-6">
            <div className="text-md font-bold text-gray-700">Geaccepteerd</div>
            <div className="mt-4 grid gap-2">
              {acceptedPrograms.map((p) => (
                <Link
                  key={p.performance_id}
                  href={`/ampro/mijn-projecten/${encodeURIComponent(p.performance_id)}`}
                  className="group block rounded-3xl border border-gray-200 px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-700 truncate">{p.title}</div>
                      {p.role_name ? <div className="mt-1 text-xs text-gray-600">Rol: {p.role_name}</div> : null}
                    </div>
                    <span className="inline-flex items-center text-gray-600 transition-colors group-hover:text-blue-600">
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              ))}
              {acceptedPrograms.length === 0 ? <div className="text-sm text-gray-600">Nog niets geaccepteerd.</div> : null}
            </div>
          </div>
          {payablePrograms.length > 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white elev-1 p-6">
              <div className="text-md font-bold text-gray-700">Betaling</div>
              <p className="mt-1 text-sm text-gray-600">Betaal je inschrijving voor de volgende programma's.</p>

              <div className="mt-4 grid gap-2">
                {payablePrograms.map((p) => (
                  <div key={p.performance_id} className="flex items-center justify-between gap-4 rounded-3xl border border-gray-200 px-3 py-2">
                    <div className="text-sm font-semibold text-gray-700 truncate">{p.title}</div>
                    <button
                      type="button"
                      onClick={() => handleCheckout(p.performance_id)}
                      disabled={Boolean(checkoutLoading[p.performance_id])}
                      className={`h-9 rounded-3xl px-3 text-sm font-semibold transition-colors ${
                        checkoutLoading[p.performance_id]
                          ? 'bg-blue-100 text-blue-400'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {checkoutLoading[p.performance_id] ? 'Doorsturen…' : 'Betaal inschrijving'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-gray-200 bg-white elev-1 p-6">
            <div className="text-md font-bold text-gray-700">Mijn inschrijvingen</div>
            <p className="mt-1 text-sm text-gray-600">Status van je applications.</p>

            <div className="mt-4 grid gap-2">
              {applied.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 rounded-3xl border border-gray-200 px-3 py-2">
                  <div className="text-sm font-semibold text-gray-700">{a.performance?.title || ''}</div>
                  <div className="text-xs font-semibold text-gray-900">{getUserStatusLabel(a.status)}</div>
                </div>
              ))}
              {applications.length === 0 ? <div className="text-sm text-gray-600">Nog geen inschrijvingen.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
