"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Select from '@/components/Select'
import Modal from '@/components/Modal'
import { useNotification } from '@/contexts/NotificationContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Props {
  studioId: string
  programId?: string
  lessonId: string
  onClose: () => void
  onSuccess?: Function
}

export default function ReplacementRequestModal({ studioId, programId, lessonId, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'internal' | 'external'>('internal')
  const [internalTeachers, setInternalTeachers] = useState<Array<{user_id: string, first_name: string, last_name: string, email?: string}>>([])
  const [selectedInternal, setSelectedInternal] = useState<string | null>(null)
  const [externalName, setExternalName] = useState('')
  const [externalEmail, setExternalEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { showSuccess, showError } = useNotification()

  useEffect(() => {
    // load internal teachers based on studio (preferred) or program as fallback
    if (studioId) loadInternalTeachers()
  }, [studioId, programId])

  const loadInternalTeachers = async () => {
    try {
      // Use server API to get studio + (optionally) program teachers.
      // Server uses the service role so we don't hit RLS limits from the client.
      const params = new URLSearchParams({ studioId })
      if (programId) params.set('programId', programId)

      const res = await fetch(`/api/teachers?${params.toString()}`)
      if (!res.ok) {
        const txt = await res.text()
        console.warn('Failed loading teachers from API', res.status, txt)
        setInternalTeachers([])
        return
      }

      const json = await res.json()
      // API returns { teachers: [{ id, first_name, last_name, email }] }
      const teachers = (json?.teachers || []).map((t: any) => ({
        user_id: String(t.id),
        first_name: t.first_name || '',
        last_name: t.last_name || '',
        email: t.email || undefined,
      }))

      setInternalTeachers(teachers)
    } catch (e) {
      console.error('Error loading internal teachers', e)
      setInternalTeachers([])
    }
  }

  const submit = async () => {
    setError(null)
    setLoading(true)
    try {
      const payload: any = { studio_id: studioId, lesson_id: lessonId, program_id: programId || null, notes }
      if (mode === 'internal') {
        if (!selectedInternal) { setError('Kies eerst een interne docent'); setLoading(false); return }
        payload.chosen_internal_teacher_id = selectedInternal
      } else {
        if (!externalName) { setError('Vul de naam van de externe docent in'); setLoading(false); return }
        if (!externalEmail) { setError('Vul het e-mailadres van de externe docent in'); setLoading(false); return }
        payload.external_teacher_name = externalName
        payload.external_teacher_email = externalEmail
      }

      // include user's access token in Authorization header so server-side route can authenticate
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      const headers: any = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/studio/${studioId}/lessons/${lessonId}/replacement-requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        // ensure cookies are sent so server can read session when Authorization header isn't provided
        credentials: 'include',
      })

      // Safely parse response: some environments may return empty/non-JSON bodies
      const text = await res.text()
      let json: any = {}
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        // keep raw text available for error messages
        json = { __raw: text }
      }

      if (!res.ok) {
        const msg = json?.error || json?.message || json?.__raw || 'Fout bij het aanmaken van aanvraag'
        // surface server-side errors as a toast (centralized notification)
        setError(null)
        showError(msg)
        setLoading(false)
        return
      }

      if (onSuccess) onSuccess(json.request)
      onClose()
      showSuccess('Vervangingsaanvraag succesvol verzonden')
    } catch (e:any) {
      console.error('Failed submitting replacement request', e)
      setError(e?.message || 'Fout')
      showError(e?.message || 'Fout bij verzenden')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} ariaLabel="Vervanging aanvragen" backdropClassName="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="space-y-6">
        <div className="pb-2 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">Vervanging aanvragen</h3>
          <p className="mt-1 text-sm text-slate-500">Vraag een vervanging aan voor deze les — kies een interne docent of voeg een externe docent toe.</p>
        </div>

        {error && <div className="rounded-md bg-red-50 border border-red-100 p-3 text-sm text-red-700">{error}</div>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('internal')}
            className={`px-3 py-1 rounded-md text-sm ${mode === 'internal' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-700 border border-slate-200'}`}>
            Interne docent
          </button>
          <button
            type="button"
            onClick={() => setMode('external')}
            className={`px-3 py-1 rounded-md text-sm ${mode === 'external' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-700 border border-slate-200'}`}>
            Externe docent
          </button>
        </div>

        {mode === 'internal' ? (
          <div>
            <label className="block text-sm font-medium text-slate-700">Kies een interne docent</label>
            <div className="mt-1">
              <Select value={selectedInternal || ''} onChange={(e:any) => setSelectedInternal(e.target.value || null)}>
                <option value="">-- Kies --</option>
                {internalTeachers.map((t: any) => (
                  <option key={t.user_id} value={t.user_id}>{t.first_name} {t.last_name}</option>
                ))}
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Naam externe docent</label>
              <input
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                value={externalName}
                onChange={e => setExternalName(e.target.value)}
                placeholder="Voornaam Achternaam"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">E-mail externe docent</label>
              <input
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                value={externalEmail}
                onChange={e => setExternalEmail(e.target.value)}
                placeholder="naam@example.com"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700">Optionele toelichting</label>
          <textarea className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          {/* Removed bottom close button; users can close with X or backdrop */}
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-650 disabled:opacity-60" onClick={submit} disabled={loading}>
            {loading ? (<><LoadingSpinner size={16} label="Versturen" indicatorClassName="border-b-white" /> Versturen…</>) : 'Verstuur aanvraag'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
