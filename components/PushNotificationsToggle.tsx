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
    return <span className="t-caption text-slate-500">{getUnsupportedMessage()}</span>
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
        await deleteSubscription(sub.endpoint)
        await sub.unsubscribe()
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
              ? 'px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-sm font-medium text-blue-700 dark:text-blue-400 disabled:opacity-60'
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
              ? 'px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-sm font-medium text-slate-700 dark:text-slate-200 disabled:opacity-60'
              : 't-caption font-medium text-slate-600 hover:text-slate-700 disabled:opacity-60'
          }
        >
          {loading ? 'Even wachten…' : 'Pushmeldingen uitschakelen'}
        </button>
      )}

      {error ? <span className="t-caption text-red-600">{error}</span> : null}
    </div>
  )
}
