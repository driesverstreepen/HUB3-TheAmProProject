"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Check, DollarSign, FileText } from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm'
import { LoadingState } from '@/components/ui/LoadingState'

interface Payroll {
  id: string
  teacher_id: string
  timesheet_id?: string | null
  month: number
  year: number
  total_lessons: number
  total_hours: number
  total_lesson_fees: number
  total_transport_fees: number
  total_amount: number
  payment_method: string
  payment_status: 'pending' | 'paid'
  paid_at: string | null
  notes: string | null
  teacher: {
    first_name: string | null
    last_name: string | null
    email: string
  }
  compensation?: {
    lesson_fee: number | string | null
    transport_fee: number | string | null
    iban: string | null
  } | null
  entries?: Array<{
    id: string
    date: string
    duration_minutes: number
    lesson_fee: number
    transport_fee: number
    notes: string | null
    is_manual: boolean
  }>
}

const monthNames = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
]

const paymentMethodLabels: Record<string, string> = {
  'factuur': 'Factuur',
  'vrijwilligersvergoeding': 'Vrijwilligersvergoeding',
  'verenigingswerk': 'Verenigingswerk',
  'akv': 'AKV'
}

export default function PayrollDetailPage() {
  const params = useParams()
  const router = useRouter()
  const studioId = params?.id as string
  const payrollId = params?.payrollId as string

  const [payroll, setPayroll] = useState<Payroll | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const { isArmed: isActionArmed, confirmOrArm: confirmOrArmAction } = useTwoStepConfirm<string>(4500)

  useEffect(() => {
    if (payrollId) {
      loadPayroll()
    }
  }, [payrollId])

  async function loadPayroll() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`/api/studio/${studioId}/payrolls/${payrollId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load payroll')
      }

      if (json?.payroll) {
        setPayroll(json.payroll)
      }
    } catch (error) {
      console.error('Error loading payroll:', error)
    } finally {
      setLoading(false)
    }
  }

  async function markAsPaid() {
    setUpdating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`/api/studio/${studioId}/payrolls/${payrollId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ payment_status: 'paid' }),
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to update payroll')
      }

      await loadPayroll()
    } catch (error) {
      console.error('Error updating payroll:', error)
      alert('Fout bij updaten')
    } finally {
      setUpdating(false)
    }
  }

  async function markAsUnpaid() {
    setUpdating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`/api/studio/${studioId}/payrolls/${payrollId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ payment_status: 'pending' }),
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to update payroll')
      }

      await loadPayroll()
    } catch (error) {
      console.error('Error updating payroll:', error)
      alert('Fout bij updaten')
    } finally {
      setUpdating(false)
    }
  }

  function getTeacherName() {
    if (!payroll) return ''
    const teacher = payroll.teacher
    if (teacher.first_name && teacher.last_name) {
      return `${teacher.first_name} ${teacher.last_name}`
    }
    return teacher.email
  }

  const entries = payroll?.entries || []
  const hourlyRate = payroll?.compensation?.lesson_fee != null ? Number(payroll.compensation.lesson_fee) : null
  const transportPerDay = payroll?.compensation?.transport_fee != null ? Number(payroll.compensation.transport_fee) : null
  const iban = payroll?.compensation?.iban || null

  return (
    <FeatureGate flagKey="studio.finance" mode="page">
      {loading ? (
        <div className="max-w-4xl mx-auto">
          <LoadingState label="Laden…" />
        </div>
      ) : !payroll ? (
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600">Payroll niet gevonden</p>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => router.push(`/studio/${studioId}/finance`)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar overzicht
          </button>

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">
                  Payroll - {getTeacherName()}
                </h1>
                <div className="flex items-center gap-3 text-slate-600">
                  <Calendar className="w-4 h-4" />
                  <span>{monthNames[payroll.month - 1]} {payroll.year}</span>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  payroll.payment_status === 'paid'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {payroll.payment_status === 'paid' ? 'Betaald' : 'Te Betalen'}
              </span>
            </div>

            {/* Payment Details */}
            <div className="grid grid-cols-2 gap-6 p-6 bg-slate-50 rounded-lg mb-4">
              <div>
                <div className="text-sm text-slate-600 mb-1">Betalingswijze</div>
                <div className="text-lg font-semibold text-slate-900">
                  {paymentMethodLabels[payroll.payment_method] || payroll.payment_method}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Totaal Bedrag</div>
                <div className="text-3xl font-bold text-green-700">
                  €{Number(payroll.total_amount).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Teacher payout details */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg mb-4">
              <div>
                <div className="text-sm text-slate-600 mb-1">Uurtarief</div>
                <div className="text-lg font-semibold text-slate-900">
                  {hourlyRate != null && Number.isFinite(hourlyRate) ? `€${hourlyRate.toFixed(2)}/uur` : '—'}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Vervoer (per lesdag)</div>
                <div className="text-lg font-semibold text-slate-900">
                  {transportPerDay != null && Number.isFinite(transportPerDay) ? `€${transportPerDay.toFixed(2)}` : '—'}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">IBAN</div>
                <div className="text-lg font-semibold text-slate-900 break-all">
                  {iban || '—'}
                </div>
              </div>
            </div>

            {/* Payment Date if paid */}
            {payroll.payment_status === 'paid' && payroll.paid_at && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                <div className="flex items-center gap-2 text-green-800">
                  <Check className="w-4 h-4" />
                  <span className="font-medium">Betaald op:</span>
                  <span>
                    {new Date(payroll.paid_at).toLocaleDateString('nl-NL', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                    {' om '}
                    {new Date(payroll.paid_at).toLocaleTimeString('nl-NL', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              {payroll.payment_status === 'pending' ? (
                <button
                  onClick={() => confirmOrArmAction('mark-paid', markAsPaid)}
                  disabled={updating}
                  className={`flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 ${
                    isActionArmed('mark-paid') ? 'ring-2 ring-green-200' : ''
                  }`}
                >
                  <Check className="w-4 h-4" />
                  {isActionArmed('mark-paid') ? 'Bevestig' : 'Markeer als Betaald'}
                </button>
              ) : (
                <button
                  onClick={() => confirmOrArmAction('mark-unpaid', markAsUnpaid)}
                  disabled={updating}
                  className={`flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50 ${
                    isActionArmed('mark-unpaid') ? 'ring-2 ring-amber-200' : ''
                  }`}
                >
                  {isActionArmed('mark-unpaid') ? 'Bevestig' : 'Markeer als Niet Betaald'}
                </button>
              )}
            </div>

            {payroll.paid_at && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-800">
                  <strong>Betaald op:</strong> {new Date(payroll.paid_at).toLocaleDateString('nl-NL')} om {new Date(payroll.paid_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}
          </div>

          {/* Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Overzicht
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-slate-200">
                <span className="text-slate-700">Aantal Lessen</span>
                <span className="font-semibold text-slate-900">{payroll.total_lessons}</span>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-200">
                <span className="text-slate-700">Totaal Uren</span>
                <span className="font-semibold text-slate-900">{Number(payroll.total_hours).toFixed(1)} uur</span>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-200">
                <span className="text-slate-700">Lesvergoeding</span>
                <span className="font-semibold text-green-700">€{Number(payroll.total_lesson_fees).toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-200">
                <span className="text-slate-700">Vervoersvergoeding</span>
                <span className="font-semibold text-blue-700">€{Number(payroll.total_transport_fees).toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between py-4 bg-slate-50 rounded-lg px-4">
                <span className="text-lg font-semibold text-slate-900">Totaal Te Betalen</span>
                <span className="text-2xl font-bold text-green-700">€{Number(payroll.total_amount).toFixed(2)}</span>
              </div>
            </div>

            {/* Line items */}
            {entries.length > 0 && (
              <div className="mt-8">
                <h3 className="font-semibold text-slate-900 mb-3">Details per entry</h3>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid grid-cols-5 gap-4 px-4 py-3 bg-slate-50 text-xs font-medium text-slate-600">
                      <div>Datum</div>
                      <div className="text-right">Duur</div>
                      <div className="text-right">Lesvergoeding</div>
                      <div className="text-right">Vervoer</div>
                      <div className="text-right">Totaal</div>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {entries.map((e) => {
                        const rowTotal = Number(e.lesson_fee || 0) + Number(e.transport_fee || 0)
                        return (
                          <div key={e.id} className="grid grid-cols-5 gap-6 px-5 py-3 text-sm text-slate-700">
                            <div className="whitespace-nowrap">{new Date(e.date).toLocaleDateString('nl-NL')}</div>
                            <div className="text-right whitespace-nowrap">{Number(e.duration_minutes || 0)} min</div>
                            <div className="text-right whitespace-nowrap">€{Number(e.lesson_fee || 0).toFixed(2)}</div>
                            <div className="text-right whitespace-nowrap">€{Number(e.transport_fee || 0).toFixed(2)}</div>
                            <div className="text-right font-medium whitespace-nowrap">€{rowTotal.toFixed(2)}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {payroll.notes && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-2">Notities</h3>
                <p className="text-blue-800">{payroll.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </FeatureGate>
  )
}
