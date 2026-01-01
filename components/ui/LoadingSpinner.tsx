import React from 'react'

type LoadingSpinnerProps = {
  size?: number
  className?: string
  trackClassName?: string
  indicatorClassName?: string
  label?: string
}

export function LoadingSpinner({
  size = 48,
  className = '',
  trackClassName = 'border-transparent',
  indicatorClassName = 'border-b-blue-600',
  label = 'Laden…',
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full border-2 border-b-2 ${trackClassName} ${indicatorClassName} ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
