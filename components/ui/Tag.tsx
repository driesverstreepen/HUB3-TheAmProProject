import React, { ReactNode } from 'react'
import { getTagClass } from '@/lib/tagColors'

interface TagProps {
  children: ReactNode
  className?: string
  asPill?: boolean
}

export default function Tag({ children, className = '', asPill = false }: TagProps) {
  const base = asPill ? 'inline-block px-3 py-1 rounded-full text-xs font-medium' : 'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium'

  // If the child is a simple string, use the centralized tag color mapping
  let colorClass = className;
  if (!className && typeof children === 'string') {
    colorClass = getTagClass(children as string);
  }

  return (
    <span className={`${base} ${colorClass}`.trim()}>
      {children}
    </span>
  )
}
