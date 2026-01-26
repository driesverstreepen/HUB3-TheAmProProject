'use client'

import { useMemo } from 'react'
import DOMPurify from 'dompurify'

type Props = {
  value?: string | null
  className?: string
  maxLines?: number
}

function looksLikeHtml(value: string) {
  return /<\s*\w+[\s>]/.test(value)
}

export default function SafeRichText({ value, className, maxLines }: Props) {
  const raw = (value ?? '').toString()
  const trimmed = raw.trim()

  const clampStyle = useMemo(() => {
    const n = typeof maxLines === 'number' ? maxLines : 0
    if (!n || n <= 0) return undefined
    return {
      display: '-webkit-box',
      WebkitLineClamp: n,
      WebkitBoxOrient: 'vertical' as const,
      overflow: 'hidden',
    }
  }, [maxLines])

  const { html, isHtml } = useMemo(() => {
    const isHtml = looksLikeHtml(trimmed)
    if (!isHtml) return { html: '', isHtml: false }

    const sanitized = DOMPurify.sanitize(trimmed, {
      USE_PROFILES: { html: true },
      ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    })

    return { html: sanitized, isHtml: true }
  }, [trimmed])

  if (!trimmed) return null

  const mergedClassName = ['safe-richtext', className, '[&_a:hover]:text-blue-600'].filter(Boolean).join(' ')

  if (!isHtml) {
    return (
      <div className={mergedClassName || 'whitespace-pre-wrap'} style={clampStyle}>
        {raw}
      </div>
    )
  }

  return (
    <div
      className={mergedClassName}
      style={clampStyle}
      // Sanitized above (no raw HTML passthrough).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
