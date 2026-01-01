"use client"

import { useEffect, useMemo, useState } from 'react'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import SuperAdminGuard from '@/components/admin/SuperAdminGuard'
import { supabase } from '@/lib/supabase'
import { safeSelect } from '@/lib/supabaseHelpers'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

type FeedbackRow = {
  id: string
  interface: 'user' | 'studio'
  studio_id: string | null
  title: string
  description: string
  location: string | null
  created_at: string
  is_resolved: boolean
  resolved_at: string | null
}

export default function SuperAdminFeedbackPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)

    const { data, error: selErr, missingTable } = await safeSelect(
      supabase,
      'app_feedback',
      'id,interface,studio_id,title,description,location,created_at,is_resolved,resolved_at'
    )

    if (missingTable) {
      setError('Tabel app_feedback bestaat niet. Draai de migratie 101_app_feedback.sql in Supabase.')
      setLoading(false)
      return
    }

    if (selErr) {
      setError((selErr as any)?.message || 'Kon feedback niet laden.')
      setLoading(false)
      return
    }

    const list: FeedbackRow[] = ((data ?? []) as any[])
      .map((r) => {
        const iface: FeedbackRow['interface'] = r.interface === 'studio' ? 'studio' : 'user'

        return {
          id: String(r.id),
          interface: iface,
          studio_id: r.studio_id ? String(r.studio_id) : null,
          title: String(r.title || ''),
          description: String(r.description || ''),
          location: r.location ? String(r.location) : null,
          created_at: String(r.created_at),
          is_resolved: !!r.is_resolved,
          resolved_at: r.resolved_at ? String(r.resolved_at) : null,
        }
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

    setRows(list)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const byId = useMemo(() => {
    const map = new Map<string, FeedbackRow>()
    for (const r of rows) map.set(r.id, r)
    return map
  }, [rows])

  const toggleResolved = async (id: string) => {
    const row = byId.get(id)
    if (!row) return

    setSavingId(id)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const nextResolved = !row.is_resolved

    const payload: any = {
      is_resolved: nextResolved,
      resolved_at: nextResolved ? new Date().toISOString() : null,
      resolved_by: nextResolved ? user?.id ?? null : null,
    }

    const { error: updErr } = await supabase.from('app_feedback').update(payload).eq('id', id)

    if (updErr) {
      setSavingId(null)
      setError((updErr as any)?.message || 'Kon status niet aanpassen.')
      return
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...payload } : r)))
    setSavingId(null)
  }

  return (
    <SuperAdminGuard>
      <div className="min-h-screen bg-slate-50 overflow-x-auto">
        <SuperAdminSidebar />

        <div className="w-full min-w-0 sm:ml-64">
          <header className="bg-white border-b border-slate-200">
            <div className="px-4 sm:px-8 py-4 sm:py-6">
              <h1 className="text-2xl font-bold text-slate-900">Feedback</h1>
              <p className="text-sm text-slate-600">Alle ingezonden feedback (user + studio)</p>
            </div>
          </header>

          <main className="px-4 sm:px-8 py-6 sm:py-8">
            {error ? (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            {loading ? (
              <div className="text-slate-600 flex items-center gap-2">
                <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
                <span>Laden…</span>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {rows.length === 0 ? (
                  <div className="p-6 text-slate-600">Nog geen feedback.</div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {rows.map((r) => {
                      const disabled = savingId === r.id
                      return (
                        <div key={r.id} className="p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                  {r.interface}
                                </span>
                                {r.location ? (
                                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                    {r.location}
                                  </span>
                                ) : null}
                                <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</span>
                              </div>

                              <div className="mt-2 font-semibold text-slate-900">{r.title}</div>
                              <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{r.description}</p>

                              {r.interface === 'studio' && r.studio_id ? (
                                <div className="mt-2 text-xs text-slate-500">studio_id: {r.studio_id}</div>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleResolved(r.id)}
                              disabled={disabled}
                              className={
                                r.is_resolved
                                  ? 'shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60'
                                  : 'shrink-0 rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60'
                              }
                            >
                              {disabled ? 'Opslaan…' : r.is_resolved ? 'Markeer als open' : 'Markeer als opgelost'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
