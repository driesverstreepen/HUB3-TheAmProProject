"use client"

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
// theme handled via global CSS classes; explicit hook not required here
import { Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Notification } from '@/types/database'
import NotificationsPanel from './NotificationsPanel'
import { safeSelect } from '@/lib/supabaseHelpers'

export default function NotificationBell({ iconSize = 16 }: { iconSize?: number }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showPanel, setShowPanel] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | undefined>(undefined)
  // theme hook not needed — colors derive from currentColor and global dark-mode class

  useEffect(() => {
    let unsubscribe: (() => void) | null = null

    ;(async () => {
      const { missingTable } = await loadNotifications()
      if (missingTable) return

      try {
        const channel = supabase
          .channel('notifications-changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'notifications',
            },
            () => {
              loadNotifications()
            },
          )
          .subscribe()
        unsubscribe = () => {
          supabase.removeChannel(channel)
        }
      } catch {
        // ignore
      }
    })()

    return () => {
      try {
        unsubscribe?.()
      } catch {
        // ignore
      }
    }
  }, [])

  const loadNotifications = async (): Promise<{ missingTable?: boolean }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {}

      const { data, error, missingTable } = await safeSelect(
        supabase,
        'notifications',
        '*',
        { user_id: user.id },
      )

      if (missingTable) {
        setNotifications([])
        setUnreadCount(0)
        return { missingTable: true }
      }

      if (error) throw error

      // Put unread first, then sort by created_at desc
      const list = ((data as any) || []).slice()
      list.sort((a: any, b: any) => {
        if ((a.read ? 1 : 0) === (b.read ? 1 : 0)) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }
        return (a.read ? 1 : -1)
      })

      setNotifications(list)
      setUnreadCount(list.filter((n: any) => !n.read).length || 0)
    } catch (error) {
      console.error('Error loading notifications:', error)
    }

    return {}
  }

  const togglePanel = () => {
    if (!showPanel) {
      // compute position when opening
        try {
          const rect = buttonRef.current?.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const panelWidth = Math.min(384, Math.max(240, viewportWidth - 16))
        const maxPanelHeight = Math.max(viewportHeight - 96, 200)

        if (rect) {
          // prefer placing below the button
          let top = rect.bottom + 8
          // estimate panel height; we know it will be at most maxPanelHeight
          const estimatedPanelHeight = Math.min(maxPanelHeight, 600)
          if (top + estimatedPanelHeight > viewportHeight - 8) {
            // place above if it would overflow
            top = rect.top - estimatedPanelHeight - 8
            if (top < 8) top = 8
          }

          let left = rect.right - panelWidth
          if (left + panelWidth > viewportWidth - 8) left = viewportWidth - panelWidth - 8
          if (left < 8) left = 8

          setPanelStyle({ position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${panelWidth}px`, zIndex: 9999 })
        } else {
          // fallback to top-right
          setPanelStyle({ position: 'fixed', top: '4rem', right: '1rem', width: `${panelWidth}px`, zIndex: 9999 } as any)
        }
        } catch {
          const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 384
          const panelWidth = Math.min(384, Math.max(240, viewportWidth - 16))
          setPanelStyle({ position: 'fixed', top: '4rem', right: '1rem', width: `${panelWidth}px`, zIndex: 9999 } as any)
        }
    }

    setShowPanel(!showPanel)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={togglePanel}
        className={`relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors`}
        aria-label="Meldingen"
      >
        <Bell size={iconSize} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showPanel && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPanel(false)}
          />

          {/* Panel - positioned relative to the button and clamped to the viewport */}
          <div style={panelStyle} className="z-99999">
            <NotificationsPanel
              notifications={notifications}
              onClose={() => setShowPanel(false)}
              onRefresh={loadNotifications}
              style={panelStyle}
            />
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
