"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { Calendar, DollarSign, Plus, FileText, Clock, Check, X } from 'lucide-react'
import FormSelect from '@/components/FormSelect'
import { useNotification } from '@/contexts/NotificationContext'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { LoadingState } from '@/components/ui/LoadingState'
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears'

interface Timesheet {
  id: string
  teacher_id: string
  month: number
  year: number
  status: 'draft' | 'confirmed'
  created_at: string
  confirmed_at: string | null
  teacher: {
    first_name: string | null
    last_name: string | null
    email: string
  }
  _count?: {
    entries: number
  }
}

interface Payroll {
  id: string
  teacher_id: string
  month: number
  year: number
  total_lessons: number
  total_hours: number
  total_amount: number
  payment_method: string
  payment_status: 'pending' | 'paid'
  paid_at: string | null
  created_at: string
  teacher: {
    first_name: string | null
    last_name: string | null
    email: string
  }
}

interface Teacher {
  user_id: string
  first_name: string | null
  last_name: string | null
  email: string
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

export default function BetalingenPage() {
  const params = useParams()
  const router = useRouter()
  const studioId = params?.id as string
  const { showError } = useNotification()
  const { selectedYearId: activeYearId, missingTable: schoolYearsMissing } = useStudioSchoolYears(studioId)

  const [activeTab, setActiveTab] = useState<'timesheets' | 'payrolls'>('timesheets')
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [availableTeachers, setAvailableTeachers] = useState<Array<{teacher_id: string, first_name: string, last_name: string, email: string, lesson_count: number}>>([])
  const [loadingAvailableTeachers, setLoadingAvailableTeachers] = useState(false)
  const [creating, setCreating] = useState(false)
  const [payrollFilter, setPayrollFilter] = useState<'all' | 'pending' | 'paid'>('all')

  useEffect(() => {
    if (studioId) {
      if (!schoolYearsMissing && !activeYearId) return
      loadTimesheets()
      loadPayrolls()
      loadTeachers()
    }
  }, [studioId, activeYearId, schoolYearsMissing])

  useEffect(() => {
    if (showCreateModal) {
      loadAvailableTeachers(selectedMonth, selectedYear)
    }
  }, [showCreateModal])

  async function loadTimesheets() {
    try {
      const { data, error } = await supabase
        .from('timesheets')
        .select(`
          id,
          studio_id,
          teacher_id,
          month,
          year,
          status,
          created_at,
          confirmed_at,
          notes
        `)
        .eq('studio_id', studioId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (error) {
        console.error('Error loading timesheets:', error)
        throw error
      }

      // Get teacher info and count entries for each timesheet
      const timesheetsWithCounts = await Promise.all(
        (data || []).map(async (timesheet) => {
          // Get entry count
          const { count } = await supabase
            .from('timesheet_entries')
            .select('*', { count: 'exact', head: true })
            .eq('timesheet_id', timesheet.id)

          // Get teacher profile
          const { data: teacher } = await supabase
            .from('user_profiles')
            .select('first_name, last_name, email')
            .eq('user_id', timesheet.teacher_id)
            .single()

          return {
            ...timesheet,
            teacher: teacher || { first_name: null, last_name: null, email: '' },
            _count: { entries: count || 0 }
          }
        })
      )

      setTimesheets(timesheetsWithCounts)
    } catch (error: any) {
      console.error('Error loading timesheets:', error?.message || error)
    } finally {
      setLoading(false)
    }
  }

  async function loadPayrolls() {
    try {
      const { data, error } = await supabase
        .from('payrolls')
        .select('*')
        .eq('studio_id', studioId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (error) throw error

      // Get teacher profiles for all payrolls
      if (data && data.length > 0) {
        const teacherIds = Array.from(new Set(data.map(p => p.teacher_id)))
        
        const { data: teachers } = await supabase
          .from('user_profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', teacherIds)

        const teacherMap = (teachers || []).reduce((acc, teacher) => {
          acc[teacher.user_id] = teacher
          return acc
        }, {} as Record<string, any>)

        const payrollsWithTeachers = data.map(payroll => ({
          ...payroll,
          teacher: teacherMap[payroll.teacher_id] || { first_name: null, last_name: null, email: '' }
        }))

        setPayrolls(payrollsWithTeachers)
      } else {
        setPayrolls([])
      }
    } catch (error) {
      console.error('Error loading payrolls:', error)
    }
  }

  async function loadTeachers() {
    try {
      const { data, error } = await supabase
        .from('teacher_programs')
        .select('teacher_id')
        .eq('studio_id', studioId)

      if (error) {
        console.error('Error loading teacher programs:', error)
        throw error
      }

      // Get unique teacher IDs
      const teacherIds = Array.from(new Set((data || []).map(tp => tp.teacher_id)))

      if (teacherIds.length === 0) {
        setTeachers([])
        return
      }

      // Fetch teacher profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', teacherIds)

      if (profilesError) {
        console.error('Error loading teacher profiles:', profilesError)
        throw profilesError
      }

      setTeachers(profiles || [])
    } catch (error: any) {
      console.error('Error loading teachers:', error?.message || error)
    }
  }

  async function loadAvailableTeachers(month: number, year: number) {
    setLoadingAvailableTeachers(true)
    try {
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0)
      
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

      console.log('Loading lessons for period:', startDateStr, 'to', endDateStr)

      // Limit lessons to programs of this studio (and active school year if enabled)
      let programsQuery = supabase
        .from('programs')
        .select('id')
        .eq('studio_id', studioId)
      if (activeYearId) programsQuery = programsQuery.eq('school_year_id', activeYearId)

      const { data: programs } = await programsQuery
      const programIds = Array.from(new Set((programs || []).map((p: any) => p.id).filter(Boolean)))
      if (programIds.length === 0) {
        setAvailableTeachers([])
        return
      }

      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, program_id, date')
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .in('program_id', programIds)

      if (lessonsError) {
        console.error('Error loading lessons:', lessonsError)
        throw lessonsError
      }

      console.log('Found lessons:', lessons?.length || 0)

      if (!lessons || lessons.length === 0) {
        setAvailableTeachers([])
        return
      }

      console.log('Unique program IDs:', programIds.length)

      const { data: teacherPrograms, error: tpError } = await supabase
        .from('teacher_programs')
        .select('teacher_id, program_id')
        .eq('studio_id', studioId)
        .in('program_id', programIds)

      if (tpError) {
        console.error('Error loading teacher programs:', tpError)
        throw tpError
      }

      console.log('Found teacher programs:', teacherPrograms?.length || 0)

      if (!teacherPrograms || teacherPrograms.length === 0) {
        setAvailableTeachers([])
        return
      }

      const programTeacherMap: Record<string, string> = {}
      teacherPrograms.forEach(tp => {
        programTeacherMap[tp.program_id] = tp.teacher_id
      })

      const teacherLessonCounts: Record<string, number> = {}
      lessons.forEach(lesson => {
        const teacherId = programTeacherMap[lesson.program_id]
        if (teacherId) {
          teacherLessonCounts[teacherId] = (teacherLessonCounts[teacherId] || 0) + 1
        }
      })

      const teacherIds = Object.keys(teacherLessonCounts)

      if (teacherIds.length === 0) {
        setAvailableTeachers([])
        return
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', teacherIds)

      if (profilesError) {
        console.error('Error loading teacher profiles:', profilesError)
        throw profilesError
      }

      const teachersWithCounts = (profiles || []).map(profile => ({
        teacher_id: profile.user_id,
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email,
        lesson_count: teacherLessonCounts[profile.user_id] || 0
      }))

      teachersWithCounts.sort((a, b) => {
        const nameA = `${a.first_name} ${a.last_name}`.trim()
        const nameB = `${b.first_name} ${b.last_name}`.trim()
        return nameA.localeCompare(nameB)
      })

      setAvailableTeachers(teachersWithCounts)
    } catch (error: any) {
      console.error('Error loading available teachers:', error?.message || error)
      setAvailableTeachers([])
    } finally {
      setLoadingAvailableTeachers(false)
    }
  }

  async function createTimesheets() {
    if (selectedTeachers.length === 0) {
      showError('Selecteer minimaal één docent')
      return
    }

    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`/api/studio/${studioId}/timesheets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          teacher_ids: selectedTeachers,
          month: selectedMonth,
          year: selectedYear
        })
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        throw new Error(json?.error || 'Er is een fout opgetreden bij het aanmaken van de timesheets')
      }

      await loadTimesheets()
      setShowCreateModal(false)
      setSelectedTeachers([])
    } catch (error) {
      console.error('Error creating timesheets:', error)
      showError('Er is een fout opgetreden bij het aanmaken van de timesheets')
    } finally {
      setCreating(false)
    }
  }

  function getTeacherName(teacher: any) {
    if (teacher?.first_name && teacher?.last_name) {
      return `${teacher.first_name} ${teacher.last_name}`
    }
    return teacher?.email || 'Onbekend'
  }

  function toggleTeacherSelection(teacherId: string) {
    setSelectedTeachers(prev =>
      prev.includes(teacherId)
        ? prev.filter(id => id !== teacherId)
        : [...prev, teacherId]
    )
  }

  const filteredPayrolls = payrolls.filter(p => {
    if (payrollFilter === 'pending') return p.payment_status === 'pending'
    if (payrollFilter === 'paid') return p.payment_status === 'paid'
    return true
  })

  const totalPending = payrolls
    .filter(p => p.payment_status === 'pending')
    .reduce((sum, p) => sum + Number(p.total_amount), 0)

  const totalPaid = payrolls
    .filter(p => p.payment_status === 'paid')
    .reduce((sum, p) => sum + Number(p.total_amount), 0)

  return (
    <FeatureGate flagKey="studio.finance" mode="page">
      {loading ? (
        <div className="max-w-7xl mx-auto">
          <LoadingState label="Laden…" />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Timesheets & Payrolls</h1>
            <p className="text-slate-600">
              Beheer timesheets en betalingen aan je docenten
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('timesheets')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'timesheets'
                  ? 'text-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Timesheets
              </div>
              {activeTab === 'timesheets' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('payrolls')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'payrolls'
                  ? 'text-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Payrolls
              </div>
              {activeTab === 'payrolls' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          </div>

          {/* Timesheets Tab */}
          {activeTab === 'timesheets' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <div className="text-sm text-slate-600">
                  {timesheets.length} {timesheets.length === 1 ? 'timesheet' : 'timesheets'}
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Nieuwe Timesheet
                </button>
              </div>

              {timesheets.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                  <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Nog geen timesheets
                  </h3>
                  <p className="text-slate-600 mb-6">
                    Maak je eerste timesheet aan om te beginnen met het bijhouden van lesuren
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Nieuwe Timesheet
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {timesheets.map((timesheet) => (
                    <div
                      key={timesheet.id}
                      onClick={() => router.push(`/studio/${studioId}/timesheets/${timesheet.id}`)}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-slate-900">
                              {getTeacherName(timesheet.teacher)}
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
                          <div className="flex items-center gap-6 text-sm text-slate-600">
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
            </>
          )}

          {/* Payrolls Tab */}
          {activeTab === 'payrolls' && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900">Te Betalen</h3>
                  </div>
                  <p className="text-3xl font-bold text-amber-600">€{totalPending.toFixed(2)}</p>
                  <p className="text-sm text-slate-600 mt-1">
                    {payrolls.filter(p => p.payment_status === 'pending').length} payrolls
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900">Betaald</h3>
                  </div>
                  <p className="text-3xl font-bold text-green-600">€{totalPaid.toFixed(2)}</p>
                  <p className="text-sm text-slate-600 mt-1">
                    {payrolls.filter(p => p.payment_status === 'paid').length} payrolls
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <DollarSign className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900">Totaal</h3>
                  </div>
                  <p className="text-3xl font-bold text-blue-600">€{(totalPending + totalPaid).toFixed(2)}</p>
                  <p className="text-sm text-slate-600 mt-1">
                    {payrolls.length} payrolls
                  </p>
                </div>
              </div>

              {/* Filter Buttons */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setPayrollFilter('all')}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    payrollFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Alle ({payrolls.length})
                </button>
                <button
                  onClick={() => setPayrollFilter('pending')}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    payrollFilter === 'pending'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Te Betalen ({payrolls.filter(p => p.payment_status === 'pending').length})
                </button>
                <button
                  onClick={() => setPayrollFilter('paid')}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    payrollFilter === 'paid'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Betaald ({payrolls.filter(p => p.payment_status === 'paid').length})
                </button>
              </div>

              {/* Payrolls List */}
              {filteredPayrolls.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                  <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Nog geen payrolls
                  </h3>
                  <p className="text-slate-600">
                    Bevestig eerst een timesheet om een payroll aan te maken
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredPayrolls.map((payroll) => (
                    <div
                      key={payroll.id}
                      onClick={() => router.push(`/studio/${studioId}/payrolls/${payroll.id}`)}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-slate-900">
                              {getTeacherName(payroll.teacher)}
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
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                              {paymentMethodLabels[payroll.payment_method] || payroll.payment_method}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {monthNames[payroll.month - 1]} {payroll.year}
                            </span>
                            <span>{payroll.total_lessons} lessen</span>
                            <span>{payroll.total_hours.toFixed(1)} uur</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-700">
                            €{Number(payroll.total_amount).toFixed(2)}
                          </div>
                          {payroll.paid_at && (
                            <div className="text-sm text-slate-500 mt-1">
                              Betaald: {new Date(payroll.paid_at).toLocaleDateString('nl-NL', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })} om {new Date(payroll.paid_at).toLocaleTimeString('nl-NL', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Create Timesheet Modal */}
          {showCreateModal && (
            <div onClick={() => { setShowCreateModal(false); setSelectedTeachers([]) }} className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-200 flex items-start justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">Nieuwe Timesheet Aanmaken</h2>
                        <p className="text-sm text-slate-600 mt-1">
                          Selecteer maand, jaar en docenten
                        </p>
                      </div>
                      <button onClick={() => { setShowCreateModal(false); setSelectedTeachers([]) }} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                        <X size={18} />
                      </button>
                    </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                  {/* Month and Year Selection */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Maand
                      </label>
                      <FormSelect
                        value={String(selectedMonth)}
                        onChange={(e) => {
                          const month = Number(e.target.value)
                          setSelectedMonth(month)
                          setSelectedTeachers([])
                          loadAvailableTeachers(month, selectedYear)
                        }}
                        className="w-full"
                        variant="sm"
                      >
                        {monthNames.map((name, index) => (
                          <option key={index} value={index + 1}>
                            {name}
                          </option>
                        ))}
                      </FormSelect>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Jaar
                      </label>
                      <FormSelect
                        value={String(selectedYear)}
                        onChange={(e) => {
                          const year = Number(e.target.value)
                          setSelectedYear(year)
                          setSelectedTeachers([])
                          loadAvailableTeachers(selectedMonth, year)
                        }}
                        className="w-full"
                        variant="sm"
                      >
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </FormSelect>
                    </div>
                  </div>

                  {/* Teacher Selection */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Docenten met lessen ({selectedTeachers.length} geselecteerd)
                    </label>
                    {loadingAvailableTeachers ? (
                      <div className="border border-slate-300 rounded-lg p-8 text-center">
                        <LoadingSpinner size={32} className="mx-auto mb-2" />
                        <p className="text-slate-600">Docenten laden...</p>
                      </div>
                    ) : (
                      <div className="border border-slate-300 rounded-lg max-h-64 overflow-y-auto">
                        {availableTeachers.length === 0 ? (
                          <p className="p-4 text-slate-600 text-center">
                            Geen docenten met lessen in {monthNames[selectedMonth - 1]} {selectedYear}
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-200">
                            {availableTeachers.map((teacher) => (
                              <label
                                key={teacher.teacher_id}
                                className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedTeachers.includes(teacher.teacher_id)}
                                  onChange={() => toggleTeacherSelection(teacher.teacher_id)}
                                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                />
                                <div className="flex-1">
                                  <div className="font-medium text-slate-900">
                                    {teacher.first_name && teacher.last_name
                                      ? `${teacher.first_name} ${teacher.last_name}`
                                      : 'Naam niet ingevuld'}
                                  </div>
                                  <div className="text-sm text-slate-600">{teacher.email}</div>
                                </div>
                                <div className="text-sm text-slate-600 font-medium">
                                  {teacher.lesson_count} {teacher.lesson_count === 1 ? 'les' : 'lessen'}
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                  <button
                    onClick={createTimesheets}
                    disabled={creating || selectedTeachers.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? 'Aanmaken...' : 'Timesheets Aanmaken'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </FeatureGate>
  )
}
