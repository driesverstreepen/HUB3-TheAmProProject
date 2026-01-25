'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import ContentContainer from '@/components/ContentContainer'
import { supabase } from '@/lib/supabase'
import { formatDateOnlyFromISODate } from '@/lib/formatting'
import { useNotification } from '@/contexts/NotificationContext'

type CorrectionRow = {
  id: string
  title?: string | null
  correction_date: string
  body: string
  created_at: string
}

export default function AmproCorrectieDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showError } = useNotification()

  const performanceId = useMemo(() => String((params as any)?.performanceId || ''), [params])
  const correctionId = useMemo(() => String((params as any)?.correctionId || ''), [params])

  const [loading, setLoading] = useState(true)
  const [correction, setCorrection] = useState<CorrectionRow | null>(null)
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
            `/ampro/login?next=${encodeURIComponent(`/ampro/mijn-projecten/${performanceId}/correcties/${correctionId}`)}`,
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

        const corrResp = await supabase
          .from('ampro_corrections')
          .select('id,title,correction_date,body,created_at')
          .eq('id', correctionId)
          .eq('performance_id', performanceId)
          .eq('visible_to_accepted', true)
          .maybeSingle()

        if (corrResp.error) throw corrResp.error

        if (!cancelled) {
          setCorrection((corrResp.data as any) || null)
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Kon correctie niet laden')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [performanceId, correctionId, router, showError])

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
            Terug
          </button>
          <Link href="/ampro/mijn-projecten" className="text-sm text-gray-500 hover:text-gray-700">
            Mijn projecten
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900">{correction?.title ? String(correction.title) : 'Correctie'}</h1>

          {!hasPaid ? (
            <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
              Correcties worden pas zichtbaar na betaling.
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
                    Betaal
                  </button>
                </div>
              ) : null}
            </div>
          ) : correction ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-base font-semibold text-gray-900">{String(correction.title || 'Correctie')}</div>
                <div className="text-xs text-gray-500">{formatDateOnlyFromISODate(String(correction.correction_date))}</div>
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{correction.body}</div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-gray-600">Correctie niet gevonden.</div>
          )}
        </div>
      </ContentContainer>
    </div>
  )
}
