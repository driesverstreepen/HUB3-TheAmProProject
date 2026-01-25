import React, { FocusEvent, ChangeEvent, SelectHTMLAttributes, useState } from 'react'
import { ChevronDown } from 'lucide-react'

type Props = SelectHTMLAttributes<HTMLSelectElement> & { 
  className?: string
  variant?: 'sm' | 'md'
}

export default function Select({ className = '', variant = 'md', children, onFocus, onBlur, onChange, ...rest }: Props) {
  const [open, setOpen] = useState(false)

  function handleFocus(e: FocusEvent<HTMLSelectElement>) {
    setOpen(true)
    if (onFocus) onFocus(e)
  }

  function handleBlur(e: FocusEvent<HTMLSelectElement>) {
    setOpen(false)
    if (onBlur) onBlur(e)
  }

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    // close dropdown icon when a choice is made
    setOpen(false)
    if (onChange) onChange(e)
  }

  const sizeClasses = variant === 'sm' 
    ? 'h-9 text-xs' 
    : 'h-11 text-sm'

  return (
    <div className="relative inline-block w-full">
      <select
        {...(rest as any)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        className={`appearance-none w-full rounded-3xl border border-gray-200 bg-white pl-3 pr-10 ${sizeClasses} ${className}`}
      >
        {children}
      </select>

      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500">
        <ChevronDown className={`h-4 w-4 mr-2 transform transition-transform ${open ? 'rotate-180' : ''}`} />
      </span>
    </div>
  )
}
