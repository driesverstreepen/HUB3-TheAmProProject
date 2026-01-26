"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import { Calendar, FileText, DollarSign } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useRouter } from 'next/navigation'

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

interface TimesheetModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: 'timesheets' | 'payrolls'
}

export default function TimesheetModal({ isOpen, onClose, initialTab }: TimesheetModalProps) {
  const router = useRouter()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'timesheets' | 'payrolls'>('timesheets')

  useEffect(() => {
    if (isOpen) {
      loadData()
      if (initialTab) setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])

  async function loadData() {
    setLoading(true)
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="max-w-4xl"
      ariaLabel="Timesheets en Payrolls"
    >
      <div className="mb-6">
        <h2 className="t-h2 font-bold mb-2">Mijn Timesheets & Payrolls</h2>
        <p className="t-bodySm">
          Bekijk je lesuren en betalingen per studio
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('timesheets')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
            activeTab === 'timesheets'
              ? 'bg-blue-600 !text-white'
              : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5'
          } t-button`}
        >
          <FileText className="w-4 h-4" />
          Timesheets ({timesheets.length})
        </button>
        <button
          onClick={() => setActiveTab('payrolls')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
            activeTab === 'payrolls'
              ? 'bg-blue-600 !text-white'
              : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5'
          } t-button`}
        >
          <DollarSign className="w-4 h-4" />
          Payrolls ({payrolls.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
            <LoadingSpinner size={32} label="Laden" />
          <span className="ml-2 t-bodySm">Laden…</span>
        </div>
      ) : (
        <>
          {/* Timesheets Tab */}
          {activeTab === 'timesheets' && (
            <div>
              {timesheets.length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                  <FileText className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <h3 className="t-h4 font-semibold mb-2">
                    Nog geen timesheets
                  </h3>
                  <p className="t-bodySm">
                    Je studio admin moet eerst een timesheet voor je aanmaken
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 max-h-96 overflow-y-auto">
                  {timesheets.map((timesheet) => (
                    <div
                      key={timesheet.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        router.push(`/teacher/timesheets/${timesheet.id}`)
                        onClose()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          router.push(`/teacher/timesheets/${timesheet.id}`)
                          onClose()
                        }
                      }}
                      className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="t-h4 font-semibold">
                              {timesheet.studio.naam}
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full t-caption t-noColor font-medium ${
                                timesheet.status === 'confirmed'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-200'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                              }`}
                            >
                              {timesheet.status === 'confirmed' ? 'Bevestigd' : 'Concept'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 t-bodySm">
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
                <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                  <DollarSign className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <h3 className="t-h4 font-semibold mb-2">
                    Nog geen payrolls
                  </h3>
                  <p className="t-bodySm">
                    Payrolls worden aangemaakt nadat je timesheet is bevestigd
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 max-h-96 overflow-y-auto">
                  {payrolls.map((payroll) => (
                    <div
                      key={payroll.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        router.push(`/teacher/payrolls/${payroll.id}`)
                        onClose()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          router.push(`/teacher/payrolls/${payroll.id}`)
                          onClose()
                        }
                      }}
                      className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="t-h4 font-semibold">
                              {payroll.studio.naam}
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full t-caption t-noColor font-medium ${
                                payroll.payment_status === 'paid'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-200'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                              }`}
                            >
                              {payroll.payment_status === 'paid' ? 'Betaald' : 'Te Betalen'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 t-bodySm">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {monthNames[payroll.month - 1]} {payroll.year}
                            </span>
                            <span>{payroll.total_lessons} lessen</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="t-h2 font-bold t-noColor text-green-700">
                            €{Number(payroll.total_amount).toFixed(2)}
                          </div>
                          {payroll.paid_at && (
                            <div className="t-caption mt-1">
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
        </>
      )}
    </Modal>
  )
}