"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Important for SSR hydration: server render and first client render must match.
  // We start with a deterministic theme and then sync to system preference after mount.
  const [theme, setTheme] = useState<Theme>('light')

  // System-following theme: keep in sync with device preferences.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let mql: MediaQueryList | null = null
    try {
      mql = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      mql = null
    }

    const apply = (t: Theme) => {
      try {
        if (t === 'dark') document.body.classList.add('dark')
        else document.body.classList.remove('dark')
      } catch {
        // ignore
      }
    }

    const nextTheme: Theme = mql?.matches ? 'dark' : 'light'
    setTheme(nextTheme)
    apply(nextTheme)

    const handler = (e: MediaQueryListEvent) => {
      const t: Theme = e.matches ? 'dark' : 'light'
      setTheme(t)
      apply(t)
    }

    if (mql) {
      try {
        mql.addEventListener('change', handler)
      } catch {
        // Safari <14
        ;(mql as any).addListener?.(handler)
      }
    }

    return () => {
      if (!mql) return
      try {
        mql.removeEventListener('change', handler)
      } catch {
        ;(mql as any).removeListener?.(handler)
      }
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

export default ThemeContext
