"use client"

import { useEffect, useMemo, useState } from 'react'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import SuperAdminGuard from '@/components/admin/SuperAdminGuard'
import { supabase } from '@/lib/supabase'
import { safeSelect } from '@/lib/supabaseHelpers'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

type PromoCardRow = {
  interface: 'user' | 'studio'
  is_visible: boolean
  title: string
  description: string
  button_label: string | null
  button_href: string | null
}

function PromoCardEditor({
  card,
  setCard,
  label,
  buttonHint,
  saving,
  onSave,
}: {
  card: PromoCardRow
  setCard: React.Dispatch<React.SetStateAction<PromoCardRow>>
  label: string
  buttonHint: string
  saving: null | 'user' | 'studio'
  onSave: (card: PromoCardRow) => void
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
          <p className="text-sm text-slate-600 mt-1">{buttonHint}</p>
          {card.interface === 'studio' ? (
            <p className="text-xs text-slate-500 mt-2">
              Tip: voor studio links kan je <span className="font-mono">{'{studioId}'}</span> gebruiken.
            </p>
          ) : null}
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={card.is_visible}
            onChange={(e) => setCard((prev) => ({ ...prev, is_visible: e.target.checked }))}
          />
          Zichtbaar
        </label>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Titel</label>
          <input
            type="text"
            value={card.title}
            onChange={(e) => setCard((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Beschrijving</label>
          <textarea
            value={card.description}
            onChange={(e) => setCard((prev) => ({ ...prev, description: e.target.value }))}
            rows={3}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Knoptekst</label>
            <input
              type="text"
              value={card.button_label || ''}
              onChange={(e) => setCard((prev) => ({ ...prev, button_label: e.target.value }))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Knoplink</label>
            <input
              type="text"
              value={card.button_href || ''}
              onChange={(e) => setCard((prev) => ({ ...prev, button_href: e.target.value }))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={card.interface === 'studio' ? '/studio/{studioId}/future-features' : '/future-features'}
            />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => onSave(card)}
            disabled={saving !== null}
            className="px-4 py-2 rounded-lg bg-purple-600! text-white font-semibold hover:bg-purple-700 disabled:opacity-50"
          >
            {saving === card.interface ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

const emptyCard = (iface: PromoCardRow['interface']): PromoCardRow => ({
  interface: iface,
  is_visible: false,
  title: '',
  description: '',
  button_label: null,
  button_href: null,
})

export default function SuperAdminPromoCardsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<null | 'user' | 'studio'>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [userCard, setUserCard] = useState<PromoCardRow>(emptyCard('user'))
  const [studioCard, setStudioCard] = useState<PromoCardRow>(emptyCard('studio'))

  const canShowButtonHint = useMemo(() => {
    return "Als je geen knoplink invult, verbergen we de knop in de UI."
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      setInfo(null)

      const { data, error: selErr, missingTable } = await safeSelect(
        supabase,
        'promo_cards',
        'interface,is_visible,title,description,button_label,button_href'
      )

      if (missingTable) {
        if (!cancelled) {
          setError('Tabel promo_cards bestaat niet. Draai de migratie 100_promo_cards.sql in Supabase.')
          setLoading(false)
        }
        return
      }

      if (selErr) {
        if (!cancelled) {
          setError((selErr as any)?.message || 'Kon promo cards niet laden.')
          setLoading(false)
        }
        return
      }

      const rows = (data ?? []) as any[]
      const user = rows.find((r) => r.interface === 'user')
      const studio = rows.find((r) => r.interface === 'studio')

      if (!cancelled) {
        setUserCard(user ? (user as PromoCardRow) : emptyCard('user'))
        setStudioCard(studio ? (studio as PromoCardRow) : emptyCard('studio'))
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  const save = async (card: PromoCardRow) => {
    setSaving(card.interface)
    setError(null)
    setInfo(null)

    const payload = {
      interface: card.interface,
      is_visible: card.is_visible,
      title: card.title,
      description: card.description,
      button_label: card.button_label && card.button_label.trim().length > 0 ? card.button_label.trim() : null,
      button_href: card.button_href && card.button_href.trim().length > 0 ? card.button_href.trim() : null,
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const resp = await fetch('/api/super-admin/promo-cards', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      const json = await resp.json().catch(() => ({} as any))

      if (resp.status === 401) {
        setError('Je sessie is verlopen. Log opnieuw in.')
        setSaving(null)
        return
      }

      if (resp.status === 403) {
        setError('Geen toegang (super admin vereist).')
        setSaving(null)
        return
      }

      if (!resp.ok) {
        setSaving(null)
        setError(json?.error || 'Kon promo card niet opslaan.')
        return
      }

      setSaving(null)
      setInfo('Opgeslagen.')
    } catch (e: any) {
      setSaving(null)
      setError(e?.message || 'Kon promo card niet opslaan.')
    }
  }

  return (
    <SuperAdminGuard>
      <div className="min-h-screen bg-slate-50 overflow-x-auto">
        <SuperAdminSidebar />

        <div className="w-full min-w-0 sm:ml-64">
          <header className="bg-white border-b border-slate-200">
            <div className="px-4 sm:px-8 py-4 sm:py-6">
              <h1 className="text-2xl font-bold text-slate-900">Promo Cards</h1>
              <p className="text-sm text-slate-600">Beheer de promo kaart per interface.</p>
            </div>
          </header>

          <main className="px-4 sm:px-8 py-6 sm:py-8">
            {loading ? (
              <div className="text-slate-600 flex items-center gap-2">
                <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
                <span>Laden…</span>
              </div>
            ) : null}

            {error ? (
              <div className="mb-6 bg-white border border-red-200 text-red-700 rounded-xl p-4">{error}</div>
            ) : null}

            {info ? (
              <div className="mb-6 bg-white border border-green-200 text-green-700 rounded-xl p-4">{info}</div>
            ) : null}

            {!loading && !error ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PromoCardEditor
                  label="User interface"
                  card={userCard}
                  setCard={setUserCard}
                  buttonHint={canShowButtonHint}
                  saving={saving}
                  onSave={save}
                />
                <PromoCardEditor
                  label="Studio interface"
                  card={studioCard}
                  setCard={setStudioCard}
                  buttonHint={canShowButtonHint}
                  saving={saving}
                  onSave={save}
                />
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
