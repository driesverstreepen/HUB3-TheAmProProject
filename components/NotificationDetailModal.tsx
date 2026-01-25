"use client"

import { useState } from 'react'
import { X, CheckCircle, XCircle } from 'lucide-react'
import { Notification } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface NotificationDetailModalProps {
  notification: Notification
  onClose: () => void
  onRefresh: () => void
}

export default function NotificationDetailModal({ notification, onClose, onRefresh }: NotificationDetailModalProps) {
  const router = useRouter()
  const [processing, setProcessing] = useState(false)

  const maybeWaitlistProgramId = (notification.action_type === 'waitlist_enrollment')
    ? (notification.action_data?.program_id as string | undefined)
    : undefined

  const openUrl = (notification.action_type === 'open_url')
    ? (notification.action_data?.url as string | undefined)
    : undefined

  const handleTeacherInvitationResponse = async (action: 'accept' | 'decline') => {
    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('Je moet ingelogd zijn om deze actie uit te voeren')
        return
      }

      const invitationId = notification.action_data?.invitation_id
      const studioId = notification.action_data?.studio_id

      if (!invitationId || !studioId) {
        alert('Ongeldige uitnodiging data')
        return
      }

      // Get the access token to pass to the API
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token

      if (!accessToken) {
        alert('Geen geldige sessie gevonden')
        return
      }

      // Call API to handle the response
      const response = await fetch('/api/notifications/teacher-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          action,
          invitation_id: invitationId,
          studio_id: studioId,
          notification_id: notification.id,
          user_id: user.id
        })
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('API Error Response:', result)
        const errorMessage = result.details 
          ? `${result.error}: ${result.details}` 
          : (result.error || 'Fout bij verwerken van uitnodiging')
        throw new Error(errorMessage)
      }

      if (action === 'accept') {
        alert('Uitnodiging geaccepteerd! Je hebt nu toegang tot de docent interface.')
        // Refresh the page to show teacher interface
        window.location.reload()
      } else {
        alert('Uitnodiging geweigerd.')
        onClose()
        onRefresh()
      }
    } catch (error: any) {
      console.error('Error handling invitation response:', error)
      alert(error.message || 'Er is een fout opgetreden')
    } finally {
      setProcessing(false)
    }
  }

  const handleStudioAdminInvitationResponse = async (action: 'accept' | 'decline') => {
    setProcessing(true)
    try {
      const invitationId = notification.action_data?.invitation_id
      const studioId = notification.action_data?.studio_id
      const notificationId = notification.id

      if (!invitationId || !studioId) {
        alert('Ongeldige uitnodiging data')
        return
      }

      // Get access token
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        alert('Geen geldige sessie gevonden')
        return
      }

      // Call API to handle the response with auth header
      const response = await fetch('/api/studio/invites/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          invitation_id: invitationId,
          action,
          notification_id: notificationId,
          studio_id: studioId
        })
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('API Error Response:', result)
        throw new Error(result.error || 'Fout bij verwerken van uitnodiging')
      }

      if (action === 'accept') {
        alert(`Uitnodiging geaccepteerd! Je hebt nu toegang tot de studio interface van ${result.studio_name}.`)
        // Redirect naar studio dashboard
        router.push(`/studio/${result.studio_id}`)
      } else {
        alert('Uitnodiging geweigerd.')
        onClose()
        onRefresh()
      }
    } catch (error: any) {
      console.error('Error handling studio invitation response:', error)
      alert(error.message || 'Er is een fout opgetreden')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div onClick={() => onClose()} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 20000 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <h3 className="t-h3 font-bold">{notification.title}</h3>
          <button
            onClick={onClose}
            className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors"
            disabled={processing}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Message */}
        <div className="mb-6">
          <p className="t-body whitespace-pre-wrap">{notification.message}</p>
        </div>

        {/* Actions for teacher invitation */}
        {notification.action_type === 'teacher_invitation_accept_decline' && notification.action_data && (
          <div className="flex gap-3">
            <button
              onClick={() => handleTeacherInvitationResponse('decline')}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {processing ? (
                <LoadingSpinner size={20} label="Bezig" indicatorClassName="border-b-slate-600" />
              ) : (
                <>
                  <XCircle size={18} />
                  Weigeren
                </>
              )}
            </button>
            <button
              onClick={() => handleTeacherInvitationResponse('accept')}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {processing ? (
                <LoadingSpinner size={20} label="Bezig" indicatorClassName="border-b-white" />
              ) : (
                <>
                  <CheckCircle size={18} />
                  Accepteren
                </>
              )}
            </button>
          </div>
        )}

        {/* Actions for studio admin invitation */}
        {notification.action_type === 'studio_admin_invitation_accept_decline' && notification.action_data && (
          <div className="flex gap-3">
            <button
              onClick={() => handleStudioAdminInvitationResponse('decline')}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {processing ? (
                <LoadingSpinner size={20} label="Bezig" indicatorClassName="border-b-slate-600" />
              ) : (
                <>
                  <XCircle size={18} />
                  Weigeren
                </>
              )}
            </button>
            <button
              onClick={() => handleStudioAdminInvitationResponse('accept')}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {processing ? (
                <LoadingSpinner size={20} label="Bezig" indicatorClassName="border-b-white" />
              ) : (
                <>
                  <CheckCircle size={18} />
                  Accepteren
                </>
              )}
            </button>
          </div>
        )}

        {/* Action for waitlist enrollment */}
        {maybeWaitlistProgramId && (
          <div className="flex gap-3">
            <button
              onClick={() => { onClose(); router.push(`/program/${maybeWaitlistProgramId}`) }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Inschrijven
            </button>
          </div>
        )}

        {/* Generic open-url action (used by AMPRO notifications) */}
        {openUrl && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                onClose()
                router.push(openUrl)
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Openen
            </button>
          </div>
        )}

        {/* bottom close button removed - top X and clicking outside will close */}

        {/* Metadata */}
        <div className="mt-4 pt-4 border-t border-slate-100 t-caption opacity-80">
          {new Date(notification.created_at).toLocaleString('nl-NL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </div>
  )
}
