'use client'

import { useEffect } from 'react'

export default function ScrollbarsOnScroll() {
  useEffect(() => {
    let timeout: number | null = null

    const show = () => {
      try {
        document.body.classList.add('show-scrollbars')
        if (timeout != null) window.clearTimeout(timeout)
        timeout = window.setTimeout(() => {
          document.body.classList.remove('show-scrollbars')
        }, 900)
      } catch {
        // ignore
      }
    }

    document.addEventListener('scroll', show, true)

    return () => {
      document.removeEventListener('scroll', show, true)
      if (timeout != null) window.clearTimeout(timeout)
      try {
        document.body.classList.remove('show-scrollbars')
      } catch {
        // ignore
      }
    }
  }, [])

  return null
}
