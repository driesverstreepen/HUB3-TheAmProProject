import React from 'react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

type LoadingStateProps = {
  label?: string
  className?: string
  spinnerSize?: number
}

export function LoadingState({ label = 'Laden…', className = '', spinnerSize = 48 }: LoadingStateProps) {
  return (
    <div className={`text-center py-12 ${className}`}>
      <LoadingSpinner size={spinnerSize} />
      {label ? <p className="mt-4 text-slate-600">{label}</p> : null}
    </div>
  )
}
