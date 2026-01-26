'use client'

import { useEffect, useState } from 'react'
import ContentContainer from '@/components/ContentContainer'
import PushNotificationsToggle from '@/components/PushNotificationsToggle'
import Select from '@/components/Select'
import { useNotification } from '@/contexts/NotificationContext'

type Channel = 'none' | 'in_app' | 'push'

type Preferences = {
  disable_all: boolean
  ampro_notes_channel: Channel
  ampro_corrections_channel: Channel
  ampro_availability_channel: Channel
}

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string }> = [
  { value: 'none', label: 'Uit' },
  { value: 'in_app', label: 'In-app' },
  { value: 'push', label: 'Push' },
]

export default function AmproNotificationSettingsPage() {
  const { showSuccess, showError } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Preferences>({
    disable_all: false,
    ampro_notes_channel: 'in_app',
    ampro_corrections_channel: 'in_app',
    ampro_availability_channel: 'in_app',
  })

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/notification-preferences', { method: 'GET', credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Kon voorkeuren niet laden')

        if (!cancelled) {
          setWarning(json?.warning ? String(json.warning) : null)
        }

        const p = json?.preferences || {}
        if (!cancelled) {
          setPrefs((prev) => ({
            ...prev,
            disable_all: Boolean(p.disable_all),
            ampro_notes_channel: (p.ampro_notes_channel as Channel) || 'in_app',
            ampro_corrections_channel: (p.ampro_corrections_channel as Channel) || 'in_app',
            ampro_availability_channel: (p.ampro_availability_channel as Channel) || 'in_app',
          }))
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Kon voorkeuren niet laden')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    try {
      setSaving(true)
      const res = await fetch('/api/notification-preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(prefs),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Opslaan mislukt')

      if (json?.warning) {
        setWarning(String(json.warning))
      }
      showSuccess('Notificatie-instellingen opgeslagen')
    } catch (e: any) {
      showError(e?.message || 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-white" />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ContentContainer className="py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900">Notificatie-instellingen</h1>
          <p className="mt-1 text-sm text-gray-500">Kies per type of je meldingen in-app of als push wilt krijgen.</p>

          {warning ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {warning}
            </div>
          ) : null}

          <div className="mt-6">
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 p-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Alles uitschakelen</div>
                <div className="text-sm text-gray-500">Zet alle AMPRO notificaties uit.</div>
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.disable_all}
                  onChange={(e) => setPrefs((p) => ({ ...p, disable_all: e.target.checked }))}
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-700">Uit</span>
              </label>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Notes</div>
              <div className="mt-2">
                <Select
                  value={prefs.ampro_notes_channel}
                  onChange={(e) => setPrefs((p) => ({ ...p, ampro_notes_channel: e.target.value as Channel }))}
                  disabled={prefs.disable_all}
                >
                  {CHANNEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Correcties</div>
              <div className="mt-2">
                <Select
                  value={prefs.ampro_corrections_channel}
                  onChange={(e) => setPrefs((p) => ({ ...p, ampro_corrections_channel: e.target.value as Channel }))}
                  disabled={prefs.disable_all}
                >
                  {CHANNEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Beschikbaarheden</div>
              <div className="mt-2">
                <Select
                  value={prefs.ampro_availability_channel}
                  onChange={(e) => setPrefs((p) => ({ ...p, ampro_availability_channel: e.target.value as Channel }))}
                  disabled={prefs.disable_all}
                >
                  {CHANNEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 p-4">
            <div className="text-sm font-semibold text-gray-900">Push op dit toestel</div>
            <div className="mt-1 text-sm text-gray-500">Zet pushmeldingen aan/uit voor deze browser.</div>
            <div className="mt-3">
              <PushNotificationsToggle variant="button" />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center rounded-3xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </div>
      </ContentContainer>
    </div>
  )
}
