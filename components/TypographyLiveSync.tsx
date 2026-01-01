'use client'

import { useEffect } from 'react'

const STORAGE_KEY = 'hub3.typographyCss'
const STYLE_ID = 'hub3-typography-vars-live'

function applyCss(cssText: string | null) {
  if (!cssText) return
  if (typeof document === 'undefined') return

  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  if (el.textContent !== cssText) {
    el.textContent = cssText
  }
}

export default function TypographyLiveSync() {
  useEffect(() => {
    try {
      applyCss(window.localStorage.getItem(STORAGE_KEY))
    } catch {
      // ignore
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      applyCss(e.newValue)
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return null
}
