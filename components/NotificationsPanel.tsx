"use client"

import { useState } from 'react'
import Link from 'next/link'
import { X, CheckCircle, Clock, AlertTriangle, Info, Check, Settings } from 'lucide-react'
import { Notification } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { Trash2 } from 'lucide-react'
import NotificationDetailModal from './NotificationDetailModal'
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm'
import PushNotificationsToggle from '@/components/PushNotificationsToggle'

interface NotificationsPanelProps {
  notifications: Notification[]
  onClose: () => void
  onRefresh: () => void
  style?: React.CSSProperties
  scope?: string
}

export default function NotificationsPanel({ notifications, onClose, onRefresh, style, scope }: NotificationsPanelProps) {
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { isArmed: isDeleteArmed, confirmOrArm: confirmOrArmDelete } = useTwoStepConfirm<string>(4500)

  const getIcon = (type: string) => {
    switch (type) {
      case 'teacher_invitation':
        return <CheckCircle className="w-5 h-5 text-blue-600" />
      case 'ampro_note':
        return <Info className="w-5 h-5 text-blue-600" />
      case 'ampro_correction':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />
      case 'ampro_availability':
        return <Clock className="w-5 h-5 text-gray-700" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />
      case 'info':
        return <Info className="w-5 h-5 text-gray-600" />
      default:
        return <Info className="w-5 h-5 text-gray-600" />
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
      
      onRefresh()
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const handleDeleteNotification = async (id: string) => {
    if (!id) return
    try {
      setDeleting(true)
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) {
        console.error('Failed to delete notification', error)
        alert('Verwijderen mislukt — probeer het opnieuw.')
      } else {
        // refresh list
        onRefresh && onRefresh()
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }
    setSelectedNotification(notification)
  }

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false)
      
      onRefresh()
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  return (
    <>
      <div style={style} className="w-[calc(100vw-16px)] max-w-sm bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="relative flex flex-wrap items-center justify-between gap-2 p-4 pr-12 border-b border-gray-200 bg-gray-50">
          <h3 className="text-md font-semibold">Meldingen</h3>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PushNotificationsToggle />
            {scope === 'ampro' ? (
              <Link
                href="/ampro/profile/notifications"
                onClick={() => onClose()}
                aria-label="Notificatie-instellingen"
                title="Instellingen"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                <Settings size={16} />
              </Link>
            ) : null}
            {notifications.some(n => !n.read) && (
              <button
                onClick={markAllAsRead}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Alles als gelezen markeren
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={() =>
                  confirmOrArmDelete('all', async () => {
                    try {
                      setDeleting(true)
                      const { data: { user } } = await supabase.auth.getUser()
                      if (!user) return
                      const { error } = await supabase.from('notifications').delete().eq('user_id', user.id)
                      if (error) {
                        console.error('Failed to delete all notifications', error)
                        alert('Verwijderen mislukt — probeer het opnieuw.')
                      } else {
                        onRefresh && onRefresh()
                      }
                    } finally {
                      setDeleting(false)
                    }
                  })
                }
                disabled={deleting}
                className={`text-sm text-red-600 hover:text-red-700 font-medium ${
                  isDeleteArmed('all') ? 'ring-2 ring-red-200 rounded px-1' : ''
                }`}
              >
                {isDeleteArmed('all') ? 'Bevestig' : 'Alles verwijderen'}
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Sluiten"
            title="Sluiten"
          >
            <X size={18} />
          </button>
        </div>

  {/* Notifications List */}
        <div className="max-h-[calc(100vh-6rem)] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm">
              <Info className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p className="text-sm font-semibold text-gray-500">Geen meldingen</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((notification) => (
                <div key={notification.id} className="relative">
                  <button
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full p-4 pr-10 text-left hover:bg-gray-50 transition-colors ${
                      !notification.read ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">{getIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4
                            className={`t-bodySm ${!notification.read ? 'font-semibold' : 'font-medium opacity-80'}`}
                          >
                            {notification.title}
                          </h4>
                        </div>
                        <p className="t-caption mt-1 line-clamp-2">{notification.message}</p>
                        <p className="t-caption mt-1 flex items-center gap-1 opacity-70">
                          <Clock size={12} />
                          {new Date(notification.created_at).toLocaleDateString('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Unread indicator positioned above delete button */}
                  {!notification.read && (
                    <span className="absolute right-3 top-3 w-2 h-2 bg-blue-600 rounded-full"></span>
                  )}

                  {/* Delete button positioned below unread indicator */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      confirmOrArmDelete(`one:${notification.id}`, () => handleDeleteNotification(notification.id))
                    }}
                    disabled={deleting}
                    aria-label="Verwijder notificatie"
                    className={`absolute right-2 top-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 ${
                      isDeleteArmed(`one:${notification.id}`) ? 'ring-2 ring-red-200 text-red-600' : ''
                    }`}
                    title={isDeleteArmed(`one:${notification.id}`) ? 'Klik opnieuw om te verwijderen' : 'Verwijderen'}
                  >
                    {isDeleteArmed(`one:${notification.id}`) ? <Check size={14} /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedNotification && (
        <NotificationDetailModal
          notification={selectedNotification}
          onClose={() => {
            setSelectedNotification(null)
            onRefresh()
          }}
          onRefresh={onRefresh}
        />
      )}
    </>
  )
}
