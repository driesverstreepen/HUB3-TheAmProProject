'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { safeInsert, safeSelect, safeUpdate } from '@/lib/supabaseHelpers'

function inferDefaultSchoolYearLabel(now = new Date()) {
  // Typical BE/NL: school year starts around September.
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const startYear = month >= 8 ? year : year - 1
  return {
    startYear,
    label: `${startYear}-${startYear + 1}`,
    startsOn: `${startYear}-09-01`,
    endsOn: `${startYear + 1}-08-31`,
  }
}

export default function CompleteStudioSchoolYearPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const studioIdFromQuery = searchParams.get('studioId')

  const defaults = useMemo(() => inferDefaultSchoolYearLabel(), [])

  const [studioId, setStudioId] = useState<string | null>(studioIdFromQuery)
  const [label, setLabel] = useState(defaults.label)
  const [startsOn, setStartsOn] = useState(defaults.startsOn)
  const [endsOn, setEndsOn] = useState(defaults.endsOn)

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

        // Determine studioId if not provided.
        let resolvedStudioId = studioIdFromQuery
        if (!resolvedStudioId) {
          const { data: owned } = await supabase
            .from('studios')
            .select('id')
            .eq('eigenaar_id', user.id)
            .maybeSingle()

          if (owned?.id) resolvedStudioId = String(owned.id)
        }

        if (!resolvedStudioId) {
          setError('Geen studio gevonden. Maak eerst een studio profiel aan.')
          return
        }

        if (!cancelled) setStudioId(resolvedStudioId)

        // If the table isn't deployed yet, do not block the user.
        const { data, missingTable, error: selError } = await safeSelect(
          supabase,
          'studio_school_years',
          'id,is_active',
          { studio_id: resolvedStudioId },
        )

        if (missingTable) {
          router.replace(`/studio/${resolvedStudioId}`)
          return
        }

        if (selError) {
          setError('Kon schooljaren niet laden. Probeer opnieuw.')
          return
        }

        const rows = (Array.isArray(data) ? data : data ? [data] : []) as any[]
        const active = rows.find((r) => !!(r as any)?.is_active)
        if (active?.id) {
          router.replace(`/studio/${resolvedStudioId}`)
          return
        }
      } catch (e) {
        setError('Kon schooljaar setup niet laden. Probeer opnieuw.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router, studioIdFromQuery])

  const isValid = useMemo(() => {
    return label.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(startsOn) && /^\d{4}-\d{2}-\d{2}$/.test(endsOn)
  }, [label, startsOn, endsOn])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!studioId) {
      setError('Studio ontbreekt. Herlaad de pagina.')
      return
    }

    if (!isValid) {
      setError('Vul alle velden correct in.')
      return
    }

    setSaving(true)
    try {
      // Deactivate any existing rows first (ensures the unique active constraint won't block us).
      try {
        await safeUpdate(supabase, 'studio_school_years', { is_active: false }, { studio_id: studioId })
      } catch {
        // ignore
      }

      // Create school year and make it active.
      const insertRes = await safeInsert(supabase, 'studio_school_years', {
        studio_id: studioId,
        label: label.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
        is_active: true,
      })

      if ((insertRes as any)?.missingTable) {
        // Migration not applied yet; let the user proceed.
        router.replace(`/studio/${studioId}`)
        return
      }

      if (!(insertRes as any)?.success) {
        const msg = (insertRes as any)?.error?.message || 'Schooljaar opslaan mislukt.'
        throw new Error(msg)
      }

      router.replace(`/studio/${studioId}`)
    } catch (e: any) {
      setError(e?.message || 'Schooljaar opslaan mislukt. Probeer opnieuw.')
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
        <h1 className="text-2xl font-bold text-slate-900">Stel je schooljaar in</h1>
        <p className="text-sm text-slate-600 mt-1">
          Voor je programma&apos;s, lessen en ledenbeheer hebben we een actief schooljaar nodig.
        </p>

        {error ? (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Schooljaar label *</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="2025-2026"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Startdatum *</label>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Einddatum *</label>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !isValid}
            className={
              saving || !isValid
                ? 'w-full px-4 py-3 rounded-lg bg-slate-200 text-slate-600 font-semibold'
                : 'w-full px-4 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700'
            }
          >
            {saving ? 'Opslaan…' : 'Schooljaar instellen'}
          </button>
        </form>
      </div>
    </div>
  )
}
