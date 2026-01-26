'use client'

import { useEffect, useState } from 'react'
import {
  deleteSubscription,
  ensureServiceWorker,
  getExistingSubscription,
  isPushSupported,
  saveSubscription,
  subscribeToPush,
} from '@/lib/pushClient'

type PushNotificationsToggleProps = {
  variant?: 'link' | 'button'
}

export default function PushNotificationsToggle({ variant = 'link' }: PushNotificationsToggleProps) {
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getUnsupportedMessage = () => {
    if (typeof window === 'undefined') return 'Pushmeldingen niet beschikbaar op dit toestel/browser'

    const ua = navigator.userAgent || ''
    const isIOS =
      /iP(hone|od|ad)/.test(ua) ||
      // iPadOS 13+ lies as MacIntel but has touch points
      ((navigator as any).platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)

    const isStandalone =
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as any).standalone === true

    const iosMatch = ua.match(/OS (\d+)[._](\d+)(?:[._](\d+))?/) // e.g. OS 17_2
    const major = iosMatch ? Number(iosMatch[1]) : null
    const minor = iosMatch ? Number(iosMatch[2]) : null

    if (isIOS) {
      if (!isStandalone) {
        return 'Open HUB3 via het beginscherm-icoon (Add to Home Screen) om push te kunnen gebruiken'
      }

      // Web Push on iOS requires iOS 16.4+ (and an installed web app).
      if (major !== null && minor !== null) {
        const version = major + minor / 10
        if (version < 16.4) {
          return 'Update iOS naar 16.4+ om pushmeldingen te kunnen gebruiken'
        }
      }

      return 'Pushmeldingen niet beschikbaar: controleer of iOS push toestaat voor webapps (iOS 16.4+)'
    }

    return 'Pushmeldingen niet beschikbaar op dit toestel/browser'
  }

  useEffect(() => {
    const init = async () => {
      const ok = isPushSupported()
      setSupported(ok)
      setError(null)

      if (!ok) return

      try {
        await ensureServiceWorker()
        const sub = await getExistingSubscription()
        setEnabled(!!sub)
      } catch {
        // ignore
      }
    }

    init()
  }, [])

  if (!supported) {
    return <span className="t-caption text-gray-500">{getUnsupportedMessage()}</span>
  }

  const enable = async () => {
    try {
      setLoading(true)
      setError(null)

      const subscription = await subscribeToPush()
      await saveSubscription(subscription)
      setEnabled(true)
    } catch (e: any) {
      setError(e?.message || 'Kon pushmeldingen niet inschakelen')
    } finally {
      setLoading(false)
    }
  }

  const disable = async () => {
    try {
      setLoading(true)
      setError(null)

      const sub = await getExistingSubscription()
      if (sub) {
        let unsubOk = false
        try {
          await deleteSubscription(sub.endpoint)
        } catch (e) {
          // best-effort; we still unsubscribe locally below
          console.warn('Failed to delete push subscription on server', e)
        }

        try {
          unsubOk = await sub.unsubscribe()
        } catch (e) {
          console.warn('Failed to unsubscribe push subscription in browser', e)
          unsubOk = false
        }

        if (!unsubOk) {
          throw new Error('Kon push subscription niet uitschrijven op dit toestel')
        }
      }
      setEnabled(false)
    } catch (e: any) {
      setError(e?.message || 'Kon pushmeldingen niet uitschakelen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!enabled ? (
        <button
          onClick={enable}
          disabled={loading}
          className={
            variant === 'button'
              ? 'px-3 py-2 rounded-3xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-sm font-medium text-blue-700 dark:text-blue-400 disabled:opacity-60'
              : 't-caption font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60'
          }
        >
          {loading ? 'Even wachten…' : 'Pushmeldingen inschakelen'}
        </button>
      ) : (
        <button
          onClick={disable}
          disabled={loading}
          className={
            variant === 'button'
              ? 'px-3 py-2 rounded-3xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-sm font-medium text-gray-700 dark:text-gray-200 disabled:opacity-60'
              : 't-caption font-medium text-gray-500 hover:text-gray-700 disabled:opacity-60'
          }
        >
          {loading ? 'Even wachten…' : 'Pushmeldingen uitschakelen'}
        </button>
      )}

      {error ? <span className="t-caption text-red-600">{error}</span> : null}
    </div>
  )
}
