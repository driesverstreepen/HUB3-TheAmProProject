'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

export default function SuperAdminMobileUiToggle() {
  const { isEnabled, refresh, getOverride, setOverride } = useFeatureFlags()

  const flagKey = 'ui.mobile-v2'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [selected, setSelected] = useState<'v1' | 'v2'>('v1')

  const effective = useMemo(() => isEnabled(flagKey, false), [isEnabled])
  const dirty = useMemo(() => (selected === 'v2') !== effective, [selected, effective])

  useEffect(() => {
    // Ensure the global selector is authoritative.
    // If a local override exists from earlier testing, clear it to avoid confusion.
    if (typeof getOverride(flagKey) === 'boolean') {
      setOverride(flagKey, undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch('/api/super-admin/feature-flags')
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to load feature flags')

        const flags = Array.isArray(json?.flags) ? (json.flags as any[]) : []
        const row = flags.find((f) => f?.key === flagKey)
        const enabled = row ? Boolean(row.enabled) : false

        if (cancelled) return
        setSelected(enabled ? 'v2' : 'v1')
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message || 'Kon feature flags niet laden')
        // Fallback to whatever the app currently thinks is enabled.
        setSelected(effective ? 'v2' : 'v1')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [effective])

  async function save() {
    try {
      setSaving(true)
      setError(null)
      setSavedAt(null)

      const enabled = selected === 'v2'

      const res = await fetch('/api/super-admin/feature-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: flagKey,
          enabled,
          hidden: false,
          coming_soon_label: null,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Opslaan mislukt')

      await refresh()
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e?.message || 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Mobile UI</h2>
          <p className="text-sm text-slate-600">
            Kies welke mobile versie actief is voor de hele app.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <label htmlFor="superadmin-mobile-ui" className="text-sm font-medium text-slate-700">
            Mobile versie
          </label>
          <select
            id="superadmin-mobile-ui"
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value as any)}
            disabled={loading || saving}
          >
            <option value="v1">Mobile V1 (legacy)</option>
            <option value="v2">Mobile V2</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={loading || saving || !dirty}
            className={`h-10 rounded-lg px-4 text-sm font-semibold transition-colors ${
              loading || saving || !dirty
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>

          <div className="text-sm text-slate-700">
            Actief: <span className="font-semibold">{effective ? 'Mobile V2' : 'Mobile V1'}</span>
          </div>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      {savedAt ? <div className="mt-3 text-xs text-slate-500">Opgeslagen om {savedAt}</div> : null}
    </div>
  )
}
