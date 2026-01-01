"use client"

import React from 'react'
import Select from './Select'

interface FormSelectProps extends React.ComponentProps<typeof Select> {
  /** forwards everything to Select; use this wrapper to apply form-specific defaults */
}

export default function FormSelect(props: FormSelectProps) {
  const { className = '', variant = 'md', ...rest } = props as any
  return <Select {...(rest as any)} variant={variant} className={`w-full ${className}`} />
}
