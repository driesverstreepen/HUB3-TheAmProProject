'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

  if (checking) {
    return <div className="min-h-screen bg-white" />
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mijn projecten</h1>
          <p className="mt-1 text-sm text-slate-600">Projecten waarvoor je hebt geapplied en waarvoor je bent geaccepteerd.</p>
        </div>

        {error ? <div className="mt-6 text-sm text-red-600">{error}</div> : null}

        <div className="mt-8 grid gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="text-sm font-semibold text-slate-900">Geaccepteerd</div>
            <div className="mt-4 grid gap-2">
              {roster.map((r) => (
                <div key={`${r.performance_id}-${r.added_at}`} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="text-sm text-slate-700">{r.performance?.title || r.performance_id}</div>
                  <div className="text-xs text-slate-600">{r.role_name || ''}</div>
                </div>
              ))}
              {roster.length === 0 ? <div className="text-sm text-slate-600">Nog niets geaccepteerd.</div> : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="text-sm font-semibold text-slate-900">Mijn inschrijvingen</div>
            <p className="mt-1 text-sm text-slate-600">Status van je applications.</p>

            <div className="mt-4 grid gap-2">
              {applied.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="text-sm text-slate-700">{a.performance?.title || ''}</div>
                  <div className="text-xs font-semibold text-slate-900">{getUserStatusLabel(a.status)}</div>
                </div>
              ))}
              {applications.length === 0 ? <div className="text-sm text-slate-600">Nog geen inschrijvingen.</div> : null}
            </div>

            <div className="mt-4">
              <Link href="/ampro/programmas" className="text-sm font-semibold text-slate-900">
                Bekijk programma’s
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
