"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useNotification } from '@/contexts/NotificationContext'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { Calendar, DollarSign, Plus, FileText, Check, Clock, X } from 'lucide-react'
import FormSelect from '@/components/FormSelect'
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

export default function FinancePage() {
  const params = useParams()
  const router = useRouter()
  const studioId = params?.id as string
  const { selectedYearId: activeYearId, missingTable: schoolYearsMissing } = useStudioSchoolYears(studioId)

  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'timesheets' | 'payrolls'>('timesheets')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([])
  const [availableTeachers, setAvailableTeachers] = useState<Array<{teacher_id: string, first_name: string, last_name: string, email: string, lesson_count: number}>>([])
  const [loadingAvailableTeachers, setLoadingAvailableTeachers] = useState(false)
  const [creating, setCreating] = useState(false)
  const [payrollFilter, setPayrollFilter] = useState<'all' | 'pending' | 'paid'>('all')
  const { theme } = useTheme()
  const [featureEnabled, setFeatureEnabled] = useState(true)
  const { showError } = useNotification()

  useEffect(() => {
    if (studioId) {
      if (!schoolYearsMissing && !activeYearId) return
      loadData()
    }
  }, [studioId, activeYearId, schoolYearsMissing])

  async function loadData() {
    // Feature check
    const { data: studioRow } = await supabase
      .from('studios')
      .select('features')
      .eq('id', studioId)
      .maybeSingle()
    setFeatureEnabled(!!studioRow?.features?.finances)

    await Promise.all([loadTimesheets(), loadPayrolls()])
    setLoading(false)
  }

  async function loadTimesheets() {
    try {
      // Try admin GET endpoint first (for studio admins). If it fails,
      // fall back to the regular client-side Supabase reads.
      const { data: { session: initialSession } } = await supabase.auth.getSession()
      let session = initialSession as any

      // If the token is (nearly) expired, refresh it before calling our admin API.
      const expiresAtSeconds = Number(session?.expires_at || 0)
      const shouldRefresh = expiresAtSeconds > 0 && expiresAtSeconds * 1000 < Date.now() + 60_000
      if (shouldRefresh) {
        const refreshed = await supabase.auth.refreshSession().catch(() => null)
        session = (refreshed as any)?.data?.session || session
      }

      const token = session?.access_token
      if (token) {
        const tryAdminFetch = async (bearer: string) => {
          const url = activeYearId
            ? `/api/studio/${studioId}/timesheets?schoolYearId=${encodeURIComponent(activeYearId)}`
            : `/api/studio/${studioId}/timesheets`

          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${bearer}` },
          })
          const json = await res.json().catch(() => ({} as any))
          return { res, json }
        }

        try {
          let { res, json } = await tryAdminFetch(token)

          // If token is stale, refresh once and retry.
          if (res.status === 401) {
            const refreshed = await supabase.auth.refreshSession().catch(() => null)
            const refreshedToken = (refreshed as any)?.data?.session?.access_token
            if (refreshedToken) {
              ;({ res, json } = await tryAdminFetch(refreshedToken))
            }
          }

          if (res.ok && json?.timesheets) {
            setTimesheets(json.timesheets)
            return
          }

          if (!res.ok) {
            console.error('Admin timesheets GET failed, falling back:', {
              status: res.status,
              error: json?.error,
            })
          }
        } catch (err) {
          console.error('Admin timesheets GET failed, falling back:', err)
        }
      }

      // Fallback: client-side Supabase reads
      const runTimesheetsQuery = async (withYear: boolean) => {
        let q: any = supabase
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
        if (withYear && activeYearId) q = q.eq('school_year_id', activeYearId)
        return await q
      }

      let tsRes: any = await runTimesheetsQuery(true)
      if (tsRes?.error) {
        const msg = String(tsRes?.error?.message || '')
        if (msg.toLowerCase().includes('school_year_id') && activeYearId) {
          tsRes = await runTimesheetsQuery(false)
        }
      }

      const { data, error } = tsRes as any
      if (error) {
        console.error('Error loading timesheets:', error)
        throw error
      }

      // Get teacher info and count entries for each timesheet
      const timesheetsWithCounts = await Promise.all(
        ((data ?? []) as any[]).map(async (timesheet: any) => {
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
    }
  }

  async function loadPayrolls() {
    try {
      // Try admin GET endpoint first (for studio admins). If it fails,
      // fall back to the regular client-side Supabase reads.
      const { data: { session: initialSession } } = await supabase.auth.getSession()
      let session = initialSession as any

      // If the token is (nearly) expired, refresh it before calling our admin API.
      const expiresAtSeconds = Number(session?.expires_at || 0)
      const shouldRefresh = expiresAtSeconds > 0 && expiresAtSeconds * 1000 < Date.now() + 60_000
      if (shouldRefresh) {
        const refreshed = await supabase.auth.refreshSession().catch(() => null)
        session = (refreshed as any)?.data?.session || session
      }

      const token = session?.access_token
      if (token) {
        const tryAdminFetch = async (bearer: string) => {
          const url = activeYearId
            ? `/api/studio/${studioId}/payrolls?schoolYearId=${encodeURIComponent(activeYearId)}`
            : `/api/studio/${studioId}/payrolls`

          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${bearer}` },
          })
          const json = await res.json().catch(() => ({} as any))
          return { res, json }
        }

        try {
          let { res, json } = await tryAdminFetch(token)

          // If token is stale, refresh once and retry.
          if (res.status === 401) {
            const refreshed = await supabase.auth.refreshSession().catch(() => null)
            const refreshedToken = (refreshed as any)?.data?.session?.access_token
            if (refreshedToken) {
              ;({ res, json } = await tryAdminFetch(refreshedToken))
            }
          }

          if (res.ok && json?.payrolls) {
            setPayrolls(json.payrolls)
            return
          }

          if (!res.ok) {
            console.error('Admin payrolls GET failed, falling back:', {
              status: res.status,
              error: json?.error,
            })
          }
        } catch (err) {
          console.error('Admin payrolls GET failed, falling back:', err)
        }
      }

      // Fallback: client-side Supabase reads
      const runPayrollsQuery = async (withYear: boolean) => {
        let q: any = supabase
          .from('payrolls')
          .select('*')
          .eq('studio_id', studioId)
          .order('year', { ascending: false })
          .order('month', { ascending: false })
        if (withYear && activeYearId) q = q.eq('school_year_id', activeYearId)
        return await q
      }

      let prRes: any = await runPayrollsQuery(true)
      if (prRes?.error) {
        const msg = String(prRes?.error?.message || '')
        if (msg.toLowerCase().includes('school_year_id') && activeYearId) {
          prRes = await runPayrollsQuery(false)
        }
      }

      const { data, error } = prRes as any

      if (error) throw error

      // Get teacher profiles for all payrolls
      if (data && data.length > 0) {
        const teacherIds = Array.from(new Set(((data ?? []) as any[]).map((p: any) => p.teacher_id)))
        
        const { data: teachers } = await supabase
          .from('user_profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', teacherIds)

        const teacherMap = (teachers || []).reduce((acc: Record<string, any>, teacher: any) => {
          acc[teacher.user_id] = teacher
          return acc
        }, {} as Record<string, any>)

        const payrollsWithTeachers = ((data ?? []) as any[]).map((payroll: any) => ({
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

  async function loadAvailableTeachers(month: number, year: number) {
    setLoadingAvailableTeachers(true)
    try {
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0)
      
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

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

      if (lessonsError) throw lessonsError

      if (!lessons || lessons.length === 0) {
        setAvailableTeachers([])
        return
      }

      const { data: teacherPrograms, error: tpError } = await supabase
        .from('teacher_programs')
        .select('teacher_id, program_id')
        .eq('studio_id', studioId)
        .in('program_id', programIds)

      if (tpError) throw tpError

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

      if (profilesError) throw profilesError

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
          year: selectedYear,
          school_year_id: activeYearId || null,
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
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Financiën</h1>
            <p className="text-slate-600">
              Beheer timesheets en betalingen aan je docenten
            </p>
          </div>

          {!featureEnabled && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">
                Financiën zijn uitgeschakeld voor deze studio. Ga naar Settings → Features om Financiën in te schakelen.
              </p>
            </div>
          )}

          {featureEnabled && (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Timesheets</h3>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600">{timesheets.length}</p>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    {timesheets.filter(t => t.status === 'draft').length} concept
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Payrolls</h3>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600">{payrolls.length}</p>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    {payrolls.filter(p => p.payment_status === 'pending').length} openstaand
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Te Betalen</h3>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600">€{totalPending.toFixed(2)}</p>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    {payrolls.filter(p => p.payment_status === 'pending').length} payrolls
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Betaald</h3>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-green-600">€{totalPaid.toFixed(2)}</p>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    {payrolls.filter(p => p.payment_status === 'paid').length} payrolls
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setActiveTab('timesheets')}
                className={`flex-1 px-6 py-4 font-medium transition-colors ${
                  activeTab === 'timesheets'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5" />
                  Timesheets
                </div>
              </button>
              <button
                onClick={() => setActiveTab('payrolls')}
                className={`flex-1 px-6 py-4 font-medium transition-colors ${
                  activeTab === 'payrolls'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Payrolls
                </div>
              </button>
            </div>

            {/* Timesheets Tab */}
            {activeTab === 'timesheets' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-slate-900">Timesheets Overzicht</h2>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium sm:px-4 sm:py-2 sm:text-base"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="sm:hidden">Nieuw</span>
                    <span className="hidden sm:inline">Nieuw Timesheet</span>
                  </button>
                </div>

                {timesheets.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      Nog geen timesheets
                    </h3>
                    <p className="text-slate-600 mb-6">
                      Maak je eerste timesheet aan om te beginnen met het bijhouden van lesuren
                    </p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium sm:px-4 sm:py-2 sm:text-base"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="sm:hidden">Nieuw</span>
                      <span className="hidden sm:inline">Nieuw Timesheet</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {timesheets.map((timesheet) => (
                      <div
                        key={timesheet.id}
                        onClick={() => router.push(`/studio/${studioId}/timesheets/${timesheet.id}`)}
                        className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors cursor-pointer"
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
                              <span>{timesheet._count?.entries || 0} entries</span>
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
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-slate-900">Payrolls Overzicht</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => setPayrollFilter('all')}
                      className={`px-4 py-2 rounded-lg font-medium ${
                        payrollFilter === 'all'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Alle ({payrolls.length})
                    </button>
                    <button
                      onClick={() => setPayrollFilter('pending')}
                      className={`px-4 py-2 rounded-lg font-medium ${
                        payrollFilter === 'pending'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Te Betalen ({payrolls.filter(p => p.payment_status === 'pending').length})
                    </button>
                    <button
                      onClick={() => setPayrollFilter('paid')}
                      className={`px-4 py-2 rounded-lg font-medium ${
                        payrollFilter === 'paid'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Betaald ({payrolls.filter(p => p.payment_status === 'paid').length})
                    </button>
                  </div>
                </div>

                {filteredPayrolls.length === 0 ? (
                  <div className="text-center py-12">
                    <DollarSign className="w-16 h-16 text-slate-300 mx-auto mb-4" />
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
                        className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="sm:flex sm:items-center sm:gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-slate-900">
                                {getTeacherName(payroll.teacher)}
                              </h3>
                              <div className="mt-2 flex flex-wrap gap-2 sm:mt-0">
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
                            </div>

                            <div className="hidden sm:flex items-center gap-6 text-sm text-slate-600">
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Calendar className="w-4 h-4" />
                                {monthNames[payroll.month - 1]} {payroll.year}
                              </span>
                              <span className="whitespace-nowrap">{payroll.total_lessons} lessen</span>
                              <span className="whitespace-nowrap">{payroll.total_hours.toFixed(1)} uur</span>
                            </div>
                          </div>

                          <div className="sm:text-right">
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

                        <div className="mt-2 sm:hidden flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-600">
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Calendar className="w-4 h-4" />
                            {monthNames[payroll.month - 1]} {payroll.year}
                          </span>
                          <span className="whitespace-nowrap">{payroll.total_lessons} lessen</span>
                          <span className="whitespace-nowrap">{payroll.total_hours.toFixed(1)} uur</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

      {/* Create Timesheet Modal */}
      {showCreateModal && featureEnabled && (
        <div onClick={() => setShowCreateModal(false)} className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Nieuwe Timesheet Aanmaken
                </h2>
                <p className="text-slate-600 mt-1">
                  Selecteer de maand/jaar en kies de docenten
                </p>
              </div>
              <button onClick={() => setShowCreateModal(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
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
