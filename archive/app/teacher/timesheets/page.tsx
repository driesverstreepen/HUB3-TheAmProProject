"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Calendar, FileText, DollarSign, MessageSquare } from 'lucide-react'
import UserTopNav from '@/components/user/UserTopNav'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Timesheet {
  id: string
  studio_id: string
  month: number
  year: number
  status: 'draft' | 'confirmed'
  created_at: string
  confirmed_at: string | null
  studio: {
    naam: string
  }
  _count?: {
    entries: number
  }
}

interface Payroll {
  id: string
  month: number
  year: number
  total_lessons: number
  total_amount: number
  payment_status: 'pending' | 'paid'
  paid_at: string | null
  studio: {
    naam: string
  }
}

const monthNames = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
]

export default function TeacherTimesheetsPage() {
  const router = useRouter()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'timesheets' | 'payrolls'>('timesheets')
  const { theme } = useTheme()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Load timesheets
      const { data: timesheetsData, error: timesheetsError } = await supabase
        .from('timesheets')
        .select(`
          *,
          studio:studio_id (naam)
        `)
        .eq('teacher_id', user.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (timesheetsError) {
        console.error('Timesheets error:', timesheetsError)
        throw timesheetsError
      }

      // Count entries for each timesheet
      const timesheetsWithCounts = await Promise.all(
        (timesheetsData || []).map(async (timesheet) => {
          const { count } = await supabase
            .from('timesheet_entries')
            .select('*', { count: 'exact', head: true })
            .eq('timesheet_id', timesheet.id)

          return {
            ...timesheet,
            _count: { entries: count || 0 }
          }
        })
      )

      setTimesheets(timesheetsWithCounts)

      // Load payrolls
      const { data: payrollsData, error: payrollsError } = await supabase
        .from('payrolls')
        .select(`
          *,
          studio:studio_id (naam)
        `)
        .eq('teacher_id', user.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (payrollsError) {
        console.error('Payrolls error:', payrollsError)
        throw payrollsError
      }

      setPayrolls(payrollsData || [])
    } catch (error: any) {
      console.error('Error loading data:', error)
      console.error('Error details:', error?.message, error?.code, error?.details)
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

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
      <UserTopNav />
      <main className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Mijn Timesheets & Payrolls</h1>
            <p className="text-slate-600">
              Bekijk je lesuren en betalingen per studio
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('timesheets')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                activeTab === 'timesheets'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              Timesheets ({timesheets.length})
            </button>
            <button
              onClick={() => setActiveTab('payrolls')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                activeTab === 'payrolls'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Payrolls ({payrolls.length})
            </button>
          </div>

          {/* Timesheets Tab */}
          {activeTab === 'timesheets' && (
            <div>
              {timesheets.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                  <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Nog geen timesheets
                  </h3>
                  <p className="text-slate-600">
                    Je studio admin moet eerst een timesheet voor je aanmaken
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {timesheets.map((timesheet) => (
                    <div
                      key={timesheet.id}
                      onClick={() => router.push(`/teacher/timesheets/${timesheet.id}`)}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-slate-900">
                              {timesheet.studio.naam}
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                timesheet.status === 'confirmed'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {timesheet.status === 'confirmed' ? 'Bevestigd' : 'Concept'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {monthNames[timesheet.month - 1]} {timesheet.year}
                            </span>
                            <span>{timesheet._count?.entries || 0} lessen</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Payrolls Tab */}
          {activeTab === 'payrolls' && (
            <div>
              {payrolls.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                  <DollarSign className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Nog geen payrolls
                  </h3>
                  <p className="text-slate-600">
                    Payrolls worden aangemaakt nadat je timesheet is bevestigd
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {payrolls.map((payroll) => (
                    <div
                      key={payroll.id}
                      onClick={() => router.push(`/teacher/payrolls/${payroll.id}`)}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-slate-900">
                              {payroll.studio.naam}
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                payroll.payment_status === 'paid'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {payroll.payment_status === 'paid' ? 'Betaald' : 'Te Betalen'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {monthNames[payroll.month - 1]} {payroll.year}
                            </span>
                            <span>{payroll.total_lessons} lessen</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-700">
                            €{Number(payroll.total_amount).toFixed(2)}
                          </div>
                          {payroll.paid_at && (
                            <div className="text-sm text-slate-500 mt-1">
                              Betaald op {new Date(payroll.paid_at).toLocaleDateString('nl-NL')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
