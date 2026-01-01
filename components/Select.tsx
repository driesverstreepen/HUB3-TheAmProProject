"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode
  /** optional element shown before the select (e.g. an icon) */
  startAdornment?: React.ReactNode
  /** small visual size variants; named 'variant' to avoid colliding with native `size` attr */
  variant?: 'sm' | 'md' | 'lg'
}

export default function Select({ children, className = '', disabled, startAdornment, variant = 'md', ...rest }: SelectProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const sizeClasses = variant === 'sm'
    ? 'h-8 text-sm'
    : variant === 'lg'
    ? 'h-12 text-base'
    : 'h-10 text-sm'

  const disabledClasses = disabled
    ? 'text-slate-500 dark:text-slate-400 cursor-not-allowed'
    : 'text-slate-900 dark:text-slate-100'

  // Default wrapper styling so Select looks like other inputs out-of-the-box.
  // Callers can still pass additional classes via `className` which will be merged.
  // NOTE: Don't combine fixed height (h-*) with vertical padding, otherwise text can look clipped.
  const defaultWrapperVisual = 'px-4 border border-slate-300 dark:border-slate-700/60 rounded-lg bg-white dark:bg-slate-800'
  const wrapperClass = `relative inline-flex items-center align-middle ${sizeClasses} ${defaultWrapperVisual} ${className} focus-within:ring-2 focus-within:ring-blue-500`

  const selectClass = `sr-only`

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)

  type OptionItem = { value: string; label: string; disabled?: boolean }

  const options: OptionItem[] = useMemo(() => {
    const out: OptionItem[] = []
    const nodes = React.Children.toArray(children)
    for (const node of nodes) {
      if (!React.isValidElement(node)) continue
      // Support <option> directly; ignore other nodes (optgroup etc.) for now.
      if (String((node as any).type) !== 'option' && (node as any).type !== 'option') continue
      const value = (node.props as any).value
      const label = (node.props as any).children
      out.push({
        value: value === undefined || value === null ? '' : String(value),
        label: label === undefined || label === null ? '' : String(label),
        disabled: Boolean((node.props as any).disabled),
      })
    }
    return out
  }, [children])

  const currentValue = rest.value === undefined || rest.value === null ? '' : String(rest.value)
  const currentLabel = useMemo(() => {
    const match = options.find(o => o.value === currentValue)
    return match ? match.label : ''
  }, [options, currentValue])

  const close = () => {
    setOpen(false)
    setActiveIndex(-1)
  }

  const openMenu = () => {
    if (disabled) return
    setOpen(true)
    const idx = options.findIndex(o => o.value === currentValue)
    setActiveIndex(idx >= 0 ? idx : 0)
  }

  const toggleMenu = () => {
    if (disabled) return
    setOpen(o => {
      const next = !o
      if (next) {
        const idx = options.findIndex(opt => opt.value === currentValue)
        setActiveIndex(idx >= 0 ? idx : 0)
      }
      return next
    })
  }

  const commitValue = (value: string) => {
    if (disabled) return
    const onChange = rest.onChange
    if (typeof onChange === 'function') {
      // Most call sites only rely on e.target.value, so we provide that shape.
      const syntheticEvent = { target: { value } } as any
      onChange(syntheticEvent)
    }
  }

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = wrapperRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) close()
    }
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [open])

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleMenu()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        openMenu()
        return
      }
      setActiveIndex(i => Math.min(options.length - 1, Math.max(0, i + 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        openMenu()
        return
      }
      setActiveIndex(i => Math.max(0, i - 1))
      return
    }
  }

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(options.length - 1, Math.max(0, i + 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = options[activeIndex]
      if (item && !item.disabled) {
        commitValue(item.value)
        close()
        buttonRef.current?.focus()
      }
      return
    }
  }

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      {startAdornment ? <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{startAdornment}</span> : null}

      {/* Hidden native select kept for form compatibility */}
      <select
        {...rest}
        disabled={disabled}
        className={selectClass}
      >
        {children}
      </select>

      {/* Styled trigger */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleMenu}
        onKeyDown={onButtonKeyDown}
        className={`w-full h-full text-left bg-transparent border-0 pr-10 leading-tight min-w-0 ${startAdornment ? 'pl-10' : ''} ${disabledClasses}`}
      >
        <span className="block truncate">{currentLabel}</span>
      </button>

      {/* custom arrow placed inside the control */}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-300" aria-hidden />
      </span>

      {open ? (
        <div
          role="listbox"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
        >
          <div className="max-h-64 overflow-auto">
            {options.map((opt, idx) => {
              const isActive = idx === activeIndex
              const isSelected = opt.value === currentValue
              const isDisabled = Boolean(opt.disabled)
              return (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    if (isDisabled) return
                    commitValue(opt.value)
                    close()
                    buttonRef.current?.focus()
                  }}
                  className={`w-full text-left px-4 py-2 t-bodySm transition-colors text-slate-900 dark:text-slate-100 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'font-semibold' : ''} ${isActive ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white' : ''} ${!isActive && !isDisabled ? 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white' : ''}`}
                >
                  <span className="block truncate">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
