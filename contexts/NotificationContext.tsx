"use client"

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Modal from '@/components/Modal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

type Notification = {
  id: string
  type: 'success' | 'error' | 'info'
  text: string
  persistent?: boolean
  withSpinner?: boolean
}

type NotificationContextValue = {
  showSuccess: (message: string) => void
  showError: (message: string) => void
  showInfo: (message: string, options?: { persistent?: boolean; duration?: number; withSpinner?: boolean }) => string
  dismissNotification: (id: string) => void
  showModal: (title: string, body?: string, onConfirm?: (() => void) | null) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Notification[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState<string | null>(null)
  const [modalBody, setModalBody] = useState<string | null>(null)
  const [modalOnConfirm, setModalOnConfirm] = useState<(() => void) | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const remove = useCallback((id: string) => {
    setMessages((m) => m.filter((x) => x.id !== id))
  }, [])

  const showSuccess = useCallback((text: string) => {
    const id = crypto.randomUUID?.() || String(Date.now())
    setMessages((m) => [...m, { id, type: 'success', text }])
    setTimeout(() => remove(id), 5000)
  }, [remove])

  const showError = useCallback((text: string) => {
    const id = crypto.randomUUID?.() || String(Date.now())
    setMessages((m) => [...m, { id, type: 'error', text }])
    setTimeout(() => remove(id), 7000)
  }, [remove])

  const showInfo = useCallback((text: string, options?: { persistent?: boolean; duration?: number; withSpinner?: boolean }) => {
    const id = crypto.randomUUID?.() || String(Date.now())
    const persistent = options?.persistent ?? false
    const withSpinner = options?.withSpinner ?? false
    setMessages((m) => [...m, { id, type: 'info', text, persistent, withSpinner }])
    const duration = options?.duration
    if (!persistent) {
      // if duration provided use it, otherwise default to 5000
      setTimeout(() => remove(id), typeof duration === 'number' ? duration : 5000)
    }
    return id
  }, [remove])

  const dismissNotification = useCallback((id: string) => {
    remove(id)
  }, [remove])

  // small defensive cleanup if running in SSR-ish env
  useEffect(() => {
    return () => setMessages([])
  }, [])

  const value: NotificationContextValue = {
    showSuccess,
    showError,
    showInfo,
    dismissNotification,
    showModal: (title: string, body?: string, onConfirm?: (() => void) | null) => {
      setModalTitle(title)
      setModalBody(body || null)
      setModalOnConfirm(() => (onConfirm || null))
      setModalOpen(true)
    }
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {/* Toast container */}
      {mounted
        ? createPortal(
            <div
              aria-live="polite"
              className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end sm:px-0"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-sm w-full sm:w-auto rounded-lg p-3 shadow-lg t-bodySm text-white! ${m.type === 'success' ? 'bg-green-600' : m.type === 'error' ? 'bg-red-600' : 'bg-slate-800'}`}
                >
                  <div className="flex items-center min-w-0">
                    {m.type === 'info' && m.withSpinner && (
                      <LoadingSpinner
                        size={16}
                        className="mr-3"
                        trackClassName="border-transparent"
                        indicatorClassName="border-b-white"
                        label="Laden"
                      />
                    )}
                    <div className="flex-1 min-w-0 wrap-break-word">{m.text}</div>
                    {/* show a small dismiss button for persistent/info toasts */}
                    {m.persistent && (
                      <button onClick={() => remove(m.id)} className="ml-3 text-white/80! hover:text-white t-caption">Sluiten</button>
                    )}
                  </div>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}

      {/* Modal notifications (centered) */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setModalOnConfirm(null) }} ariaLabel={modalTitle || 'Notificatie'}>
        <div className="p-4">
          <h3 className="t-h4 font-semibold mb-2">{modalTitle}</h3>
          {modalBody && <p className="t-bodySm mb-4">{modalBody}</p>}
          <div className="flex justify-end">
            <button onClick={() => { try { modalOnConfirm && modalOnConfirm(); } finally { setModalOpen(false); setModalOnConfirm(null) } }} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Ok</button>
          </div>
        </div>
      </Modal>
    </NotificationContext.Provider>
  )
}

export const useNotification = () => {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider')
  return ctx
}
