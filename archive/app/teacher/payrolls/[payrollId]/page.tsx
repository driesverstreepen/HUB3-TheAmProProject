"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Check, Clock, DollarSign, FileText } from 'lucide-react'
import UserTopNav from '@/components/user/UserTopNav'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Payroll {
  id: string
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
  studio: {
    naam: string
  }
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

export default function TeacherPayrollDetailPage() {
  const params = useParams()
  const router = useRouter()
  const payrollId = params?.payrollId as string

  const [payroll, setPayroll] = useState<Payroll | null>(null)
  const [loading, setLoading] = useState(true)
  const { theme } = useTheme()

  useEffect(() => {
    if (payrollId) {
      loadPayroll()
    }
  }, [payrollId])

  async function loadPayroll() {
    try {
      const { data, error } = await supabase
        .from('payrolls')
        .select(`
          *,
          studio:studio_id (naam)
        `)
        .eq('id', payrollId)
        .single()

      if (error) throw error
      setPayroll(data)
    } catch (error) {
      console.error('Error loading payroll:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
        <UserTopNav />
        <main className="p-4 sm:p-8">
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <LoadingSpinner size={48} className="mb-4" label="Laden" />
              <p className="text-slate-600">Laden…</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!payroll) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
        <UserTopNav />
        <main className="p-4 sm:p-8">
          <div className="max-w-4xl mx-auto">
            <p className="text-red-600">Payroll niet gevonden</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
      <UserTopNav />
      <main className="p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => router.push('/dashboard?teacherFinanceModal=1&tab=payrolls')}
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
                  Payroll - {payroll.studio.naam}
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

            {/* Payment Status */}
            {payroll.payment_status === 'paid' ? (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200 flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-semibold text-green-900">Betaling Ontvangen</div>
                  <div className="text-sm text-green-700">
                    Betaald op {new Date(payroll.paid_at!).toLocaleDateString('nl-NL', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                    {' om '}
                    {new Date(payroll.paid_at!).toLocaleTimeString('nl-NL', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600" />
                <div>
                  <div className="font-semibold text-amber-900">Betaling In Behandeling</div>
                  <div className="text-sm text-amber-700">
                    Deze betaling is nog niet verwerkt door je studio admin
                  </div>
                </div>
              </div>
            )}

            {/* Total Amount */}
            <div className="mt-6 p-6 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-green-700 mb-1">Totaal Bedrag</div>
                  <div className="text-4xl font-bold text-green-900">
                    €{Number(payroll.total_amount).toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-green-700 mb-1">Betalingswijze</div>
                  <div className="text-lg font-semibold text-green-900">
                    {paymentMethodLabels[payroll.payment_method] || payroll.payment_method}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Gedetailleerd Overzicht
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-slate-200">
                <span className="text-slate-700">Aantal Lessen</span>
                <span className="font-semibold text-slate-900">{payroll.total_lessons}</span>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-200">
                <span className="text-slate-700">Totaal Uren</span>
                <span className="font-semibold text-slate-900">
                  {Number(payroll.total_hours).toFixed(1)} uur
                </span>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-200">
                <div>
                  <div className="text-slate-700">Lesvergoeding</div>
                  <div className="text-xs text-slate-500">
                    {payroll.total_lessons} lessen
                  </div>
                </div>
                <span className="font-semibold text-green-700">
                  €{Number(payroll.total_lesson_fees).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-200">
                <div>
                  <div className="text-slate-700">Vervoersvergoeding</div>
                  <div className="text-xs text-slate-500">
                    {payroll.total_lessons} lessen
                  </div>
                </div>
                <span className="font-semibold text-blue-700">
                  €{Number(payroll.total_transport_fees).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between py-4 bg-slate-50 rounded-lg px-4 mt-4">
                <span className="text-lg font-semibold text-slate-900">Totaal Te Ontvangen</span>
                <span className="text-2xl font-bold text-green-700">
                  €{Number(payroll.total_amount).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Betalingsinformatie
            </h3>
            <div className="space-y-2 text-sm text-blue-800">
              <p>
                <strong>Betalingswijze:</strong> {paymentMethodLabels[payroll.payment_method] || payroll.payment_method}
              </p>
              {payroll.payment_method === 'factuur' && (
                <p className="text-blue-700 italic">
                  Je ontvangt deze betaling via een factuur. Zorg ervoor dat je factuurgegevens up-to-date zijn.
                </p>
              )}
              {payroll.payment_method === 'vrijwilligersvergoeding' && (
                <p className="text-blue-700 italic">
                  Dit is een vrijwilligersvergoeding. Er worden geen sociale lasten ingehouden.
                </p>
              )}
              {payroll.notes && (
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <strong>Notities van Studio Admin:</strong>
                  <p className="mt-1">{payroll.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
