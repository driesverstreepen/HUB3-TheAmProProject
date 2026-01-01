import React from 'react'
import Tag from '@/components/ui/Tag'

function normalizeStyles(input: any): string[] {
  if (!input) return []
  if (Array.isArray(input)) return input.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof input === 'string') return input.split(',').map(s => s.trim()).filter(Boolean)
  // fallback: coerce to string and split on comma
  return String(input).split(',').map((s: string) => s.trim()).filter(Boolean)
}

export default function StyleTags({ styles, asPill = false, className = '' }: { styles?: any; asPill?: boolean; className?: string }) {
  const arr = normalizeStyles(styles)
  if (!arr || arr.length === 0) return null
  return (
    <>
      {arr.map((s) => (
        <Tag key={s} asPill={asPill} className={className}>{s}</Tag>
      ))}
    </>
  )
}
