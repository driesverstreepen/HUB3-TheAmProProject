"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, ChevronDown } from 'lucide-react'

export type MobileSidebarItem = {
  label: string
  href?: string
  onClick?: () => void
  icon?: React.ComponentType<{ className?: string }>
  children?: MobileSidebarItem[]
  disabled?: boolean
  badge?: string
  tone?: 'default' | 'danger'
}

export type MobileSidebarSection = {
  title?: string
  items: MobileSidebarItem[]
  content?: React.ReactNode
}

export function MobileSidebar({
  open,
  onClose,
  onOpen,
  sections,
  header,
}: {
  open: boolean
  onClose: () => void
  onOpen?: () => void
  sections: MobileSidebarSection[]
  header?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const canUseDOM = typeof document !== 'undefined'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) return
    if (!onOpen) return

    const EDGE_PX = 24
    const TRIGGER_PX = 56
    const VERTICAL_SLOP_PX = 80

    let tracking = false
    let startX = 0
    let startY = 0

    const onTouchStart = (e: TouchEvent) => {
      if (open) return
      if (!e.touches || e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX > EDGE_PX) return
      tracking = true
      startX = t.clientX
      startY = t.clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return
      if (!e.touches || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY

      // Cancel if it's mostly vertical scrolling
      if (Math.abs(dy) > VERTICAL_SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
        tracking = false
        return
      }

      // Trigger if it's a clear left->right swipe
      if (dx >= TRIGGER_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        tracking = false
        onOpen()
      }
    }

    const onTouchEnd = () => {
      tracking = false
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [open, onOpen])

  useEffect(() => {
    if (!open) return

    const TRIGGER_PX = 56
    const VERTICAL_SLOP_PX = 80

    let tracking = false
    let startX = 0
    let startY = 0
    let startedInPanel = false

    const onTouchStart = (e: TouchEvent) => {
      if (!open) return
      if (!e.touches || e.touches.length !== 1) return
      const t = e.touches[0]
      const target = e.target as HTMLElement | null
      startedInPanel = !!target?.closest?.('[data-mobile-sidebar-panel="true"]')
      if (!startedInPanel) return

      tracking = true
      startX = t.clientX
      startY = t.clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return
      if (!startedInPanel) return
      if (!e.touches || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY

      // Cancel if it's mostly vertical scrolling
      if (Math.abs(dy) > VERTICAL_SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
        tracking = false
        return
      }

      // Trigger close if it's a clear right->left swipe
      if (dx <= -TRIGGER_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        tracking = false
        onClose()
      }
    }

    const onTouchEnd = () => {
      tracking = false
      startedInPanel = false
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [open, onClose])

  const content = useMemo(
    () => (
      <div className={`fixed inset-0 z-60 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute left-0 top-0 h-full w-[78vw] max-w-xs bg-white dark:bg-gray-900 shadow-xl transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="dialog"
        aria-modal="true"
        data-mobile-sidebar-panel="true"
      >
        <div className="flex items-center justify-between px-4 py-3">
          {header || <div className="font-semibold text-gray-900 dark:text-gray-100">Menu</div>}
          <button onClick={onClose} aria-label="Close menu" className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-white">
            <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        <nav className="overflow-y-auto h-[calc(100%-48px)] py-2 pb-[calc(env(safe-area-inset-bottom)+56px)]">
          {sections.map((section, si) => (
            <div key={si} className={`px-2 ${si === 0 ? '' : 'mt-4'}`}>
              {section.title && (
                <div className="px-2 py-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {section.title}
                </div>
              )}
              {section.content ? <div className="px-2">{section.content}</div> : null}
              <div className="space-y-0">
                {section.items.map((item, ii) => {
                  const Icon = item.icon
                  const hasChildren = Array.isArray(item.children) && item.children.length > 0
                  const isOpen = expanded[ii]
                  const onItem = () => {
                    if (item.onClick) item.onClick()
                    if (item.href) onClose()
                  }

                  const badge = typeof item.badge === 'string' && item.badge.trim().length > 0 ? item.badge.trim() : null

                  const labelClassName = item.tone === 'danger'
                    ? 'text-base font-medium text-red-600 dark:text-red-400 group-hover:!text-red-700 dark:group-hover:!text-red-700'
                    : 'text-base font-medium text-gray-900 dark:text-gray-100 group-hover:!text-gray-900 dark:group-hover:!text-gray-900'

                  const iconClassName = item.tone === 'danger'
                    ? 'w-5 h-5 text-red-600 dark:text-red-400 group-hover:!text-red-700 dark:group-hover:!text-red-700'
                    : 'w-5 h-5 text-gray-700 dark:text-gray-100 group-hover:!text-gray-900 dark:group-hover:!text-gray-900'

                  const RowContent = (
                    <>
                      <div className="flex items-center gap-3">
                        {Icon ? <Icon className={iconClassName} /> : null}
                        <div className="flex flex-col">
                          <span className={labelClassName}>{item.label}</span>
                          {badge ? (
                            <span className="mt-1 text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 self-start">
                              {badge}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </>
                  )

                  return (
                    <div key={`${si}-${ii}`}>
                      {item.disabled ? (
                        <div className="w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-gray-400 cursor-not-allowed opacity-60">
                          {RowContent}
                        </div>
                      ) : hasChildren ? (
                        <button
                          onClick={() => setExpanded(prev => ({ ...prev, [ii]: !prev[ii] }))}
                          className={`group w-full flex items-center justify-between px-4 py-2.5 rounded-md transition-colors hover:bg-gray-50 dark:hover:bg-white`}
                        >
                          {RowContent}
                          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''} ${item.tone === 'danger' ? 'text-red-600 dark:text-red-400 group-hover:!text-red-700 dark:group-hover:!text-red-700' : 'text-gray-500 dark:text-gray-300 group-hover:!text-gray-900 dark:group-hover:!text-gray-900'}`} />
                        </button>
                      ) : item.href ? (
                        <Link
                          href={item.href}
                          onClick={onItem}
                          className="group flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors hover:bg-gray-50 dark:hover:bg-white"
                        >
                          {RowContent}
                        </Link>
                      ) : (
                        <button
                          onClick={onItem}
                          className="group flex items-center gap-3 w-full px-4 py-2.5 rounded-md transition-colors hover:bg-gray-50 dark:hover:bg-white"
                        >
                          {RowContent}
                        </button>
                      )}

                      {hasChildren && isOpen && (
                        <div className="mt-2 pl-9 space-y-0">
                          {item.children!.map((child, ci) => (
                            child.disabled ? (
                              <div
                                key={`${si}-${ii}-${ci}`}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-md text-base text-gray-400 cursor-not-allowed opacity-60"
                              >
                                {child.icon ? <child.icon className="w-4 h-4" /> : null}
                                <span>{child.label}</span>
                                {typeof child.badge === 'string' && child.badge.trim().length > 0 ? (
                                    <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                                      {child.badge.trim()}
                                    </span>
                                ) : null}
                              </div>
                            ) : child.href ? (
                              <Link
                                key={`${si}-${ii}-${ci}`}
                                href={child.href}
                                onClick={() => onClose()}
                                className="group flex items-center gap-2 px-4 py-2.5 rounded-md text-base text-gray-800 dark:text-gray-100 transition-colors hover:bg-gray-50 dark:hover:bg-white"
                              >
                                {child.icon ? <child.icon className="w-4 h-4 text-gray-600 dark:text-gray-100 group-hover:!text-gray-900 dark:group-hover:!text-gray-900" /> : null}
                                <span className="text-gray-800 dark:text-gray-100 group-hover:!text-gray-900 dark:group-hover:!text-gray-900">{child.label}</span>
                              </Link>
                            ) : (
                              <button
                                key={`${si}-${ii}-${ci}`}
                                onClick={child.onClick}
                                className="group flex items-center gap-2 w-full px-4 py-2.5 rounded-md text-base text-gray-800 dark:text-gray-100 transition-colors hover:bg-gray-50 dark:hover:bg-white"
                              >
                                {child.icon ? <child.icon className="w-4 h-4 text-gray-600 dark:text-gray-100 group-hover:!text-gray-900 dark:group-hover:!text-gray-900" /> : null}
                                <span className="text-gray-800 dark:text-gray-100 group-hover:!text-gray-900 dark:group-hover:!text-gray-900">{child.label}</span>
                              </button>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
      </div>
    ),
    [header, onClose, open, sections, expanded]
  )

  if (!canUseDOM) return null
  return createPortal(content, document.body)
}
