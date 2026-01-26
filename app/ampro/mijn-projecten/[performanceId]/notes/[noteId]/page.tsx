'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import ContentContainer from '@/components/ContentContainer'
import SafeRichText from '@/components/SafeRichText'
import { supabase } from '@/lib/supabase'
import { formatDateOnlyFromISODate } from '@/lib/formatting'
import { useNotification } from '@/contexts/NotificationContext'

type NoteRow = {
  id: string
  title: string
  body: string
  created_at: string
}

export default function AmproNoteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showError } = useNotification()

  const performanceId = useMemo(() => String((params as any)?.performanceId || ''), [params])
  const noteId = useMemo(() => String((params as any)?.noteId || ''), [params])

  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<NoteRow | null>(null)
  const [hasPaid, setHasPaid] = useState(false)
  const [adminPaymentUrl, setAdminPaymentUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)

        const { data: sessionData } = await supabase.auth.getSession()
        const user = sessionData?.session?.user
        if (!user) {
          router.replace(
            `/ampro/login?next=${encodeURIComponent(`/ampro/mijn-projecten/${performanceId}/notes/${noteId}`)}`,
          )
          return
        }

        // Require accepted user (roster)
        const rosterResp = await supabase
          .from('ampro_roster')
          .select('performance_id')
          .eq('performance_id', performanceId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (rosterResp.error) throw rosterResp.error
        if (!rosterResp.data?.performance_id) {
          router.replace('/ampro/mijn-projecten')
          return
        }

        // Payment status
        try {
          const appResp = await supabase
            .from('ampro_applications')
            .select('paid,payment_received_at')
            .eq('performance_id', performanceId)
            .eq('user_id', user.id)
            .maybeSingle()

          if (!appResp.error && appResp.data) {
            const paid = Boolean((appResp.data as any).paid) || Boolean((appResp.data as any).payment_received_at)
            if (!cancelled) setHasPaid(paid)
          }
        } catch {
          // ignore
        }

        // Payment URL (optional)
        try {
          const perfResp = await supabase
            .from('ampro_programmas')
            .select('admin_payment_url')
            .eq('id', performanceId)
            .maybeSingle()
          if (!perfResp.error) setAdminPaymentUrl(((perfResp.data as any)?.admin_payment_url as string) || null)
        } catch {
          // ignore
        }

        const noteResp = await supabase
          .from('ampro_notes')
          .select('id,title,body,created_at')
          .eq('id', noteId)
          .eq('performance_id', performanceId)
          .maybeSingle()

        if (noteResp.error) throw noteResp.error

        if (!cancelled) {
          setNote((noteResp.data as any) || null)
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Failed to load note')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [performanceId, noteId, router, showError])

  if (loading) return <div className="min-h-screen bg-white" />

  return (
    <div className="min-h-screen bg-gray-50">
      <ContentContainer className="py-8">
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/ampro/mijn-projecten/${encodeURIComponent(performanceId)}`)}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {!hasPaid ? (
            <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
              This note is only visible after payment.
              {adminPaymentUrl ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        window.open(String(adminPaymentUrl), '_blank', 'noopener')
                      } catch {
                        window.location.href = String(adminPaymentUrl)
                      }
                    }}
                    className="h-11 rounded-3xl px-6 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Pay
                  </button>
                </div>
              ) : null}
            </div>
          ) : note ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xl font-bold text-gray-900">{note.title}</div>
                <div className="text-xs text-gray-500">{formatDateOnlyFromISODate(String(note.created_at))}</div>
              </div>
              <SafeRichText value={note.body} className="prose prose-sm max-w-none text-gray-700" />
            </div>
          ) : (
            <div className="mt-4 text-sm text-gray-600">Note not found.</div>
          )}
        </div>
      </ContentContainer>
    </div>
  )
}
