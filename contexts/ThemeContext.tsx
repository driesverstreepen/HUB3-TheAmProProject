"use client"

import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  // On mount, check localStorage/prefers and apply to body immediately (sync)
  // to prevent white flash. This runs before paint in the browser.
  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem('theme') as Theme | null
      let initialTheme: Theme = 'light'
      if (stored === 'dark' || stored === 'light') {
        initialTheme = stored
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        initialTheme = 'dark'
      }
      setTheme(initialTheme)
      // Apply to body immediately
      if (initialTheme === 'dark') document.body.classList.add('dark')
      else document.body.classList.remove('dark')
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // ignore
    }
    try {
      // Persist theme to a cookie so server-rendered pages can read it and
      // include the correct class on the initial render. Keep for 1 year.
      document.cookie = `theme=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    } catch {
      // ignore
    }
  }, [theme])

  // Apply theme class on the body element so global styles can react to it.
  // We avoid modifying <html> because Next/React manages that element during
  // hydration and changing it before hydration may cause a mismatch.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.body
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  const toggle = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
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
