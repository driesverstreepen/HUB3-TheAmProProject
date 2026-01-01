'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

import Modal from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import { useNotification } from '@/contexts/NotificationContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

type Props = {
  interface: 'user' | 'studio'
  studioId?: string | null
}

export default function FloatingFeedbackButton({ interface: iface, studioId }: Props) {
  const pathname = usePathname()
  const { showSuccess, showError } = useNotification()
  const { isEnabled, loading: flagsLoading } = useFeatureFlags()

  const [isOpen, setIsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (cancelled) return
        setIsAuthenticated(!!data?.user)
      } catch {
        if (!cancelled) setIsAuthenticated(false)
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [])

  const canRender = useMemo(() => {
    if (!pathname) return false
    if (flagsLoading) return false
    if (!isEnabled('ui.floating-feedback', true)) return false
    if (pathname.startsWith('/super-admin')) return false
    if (pathname.startsWith('/admin')) return false
    if (pathname.startsWith('/auth')) return false
    if (iface === 'user' && pathname.startsWith('/studio')) return false
    if (iface === 'user' && pathname.startsWith('/teacher')) return false
    return isAuthenticated
  }, [flagsLoading, iface, isAuthenticated, isEnabled, pathname])

  const currentLocation = useMemo(() => {
    return pathname || ''
  }, [pathname])

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setLocation('')
    setError(null)
  }

  const onClose = () => {
    setIsOpen(false)
    setSubmitting(false)
    setError(null)
  }

  const handleSubmit = async () => {
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    const trimmedLocation = location.trim()

    if (trimmedTitle.length === 0) {
      setError('Titel is verplicht.')
      return
    }

    if (trimmedDescription.length === 0) {
      setError('Beschrijving is verplicht.')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      interface: iface,
      studio_id: studioId ? studioId : null,
      title: trimmedTitle,
      description: trimmedDescription,
      location: trimmedLocation.length > 0 ? trimmedLocation : null,
    }

    const { error: insErr } = await supabase.from('app_feedback').insert(payload as any)

    if (insErr) {
      setSubmitting(false)
      const msg = (insErr as any)?.message || 'Kon feedback niet verzenden.'
      setError(msg)
      showError(msg)
      return
    }

    showSuccess('Feedback verzonden. Bedankt!')

    setSubmitting(false)
    resetForm()
    setIsOpen(false)
  }

  if (!canRender) return null

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setIsOpen(true)
        }}
        className="no-shadow fixed right-4 md:right-6 bottom-[calc(env(safe-area-inset-bottom)+16px)] md:bottom-6 z-40 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors duration-200 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
      >
        Feedback
      </button>

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        ariaLabel="Feedback"
        contentClassName="bg-white rounded-2xl border border-slate-200"
        contentStyle={{ maxWidth: 560 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Feedback</h2>
            <p className="mt-1 text-sm text-slate-600">Geef snel en gericht feedback over de app.</p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-800">Titel *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
              placeholder="Bijv. Bug in inschrijving"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800">Beschrijving *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
              placeholder="Wat ging er mis of wat stel je voor?"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-semibold text-slate-800">Locatie</label>
              <button
                type="button"
                onClick={() => setLocation(currentLocation)}
                className="text-sm font-semibold text-slate-700 hover:text-slate-900"
              >
                Gebruik huidige pagina
              </button>
            </div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
              placeholder="Bijv. /dashboard of /studio/123/programs"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? 'Verzenden…' : 'Verzenden'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
