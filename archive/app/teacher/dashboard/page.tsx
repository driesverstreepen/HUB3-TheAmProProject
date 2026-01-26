"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useNotification } from '@/contexts/NotificationContext'
import { supabase } from '@/lib/supabase'
import { GraduationCap, BookMarked, Users, CheckCircle, UserMinus } from 'lucide-react'
import { formatTimeStr, formatEndTime } from '@/lib/formatting'
import { useRouter } from 'next/navigation'
import UserSidebar from '@/components/user/UserSidebar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface TeacherStats {
  total_programs: number
  total_students: number
  studios: { studio_id: string; studio_name: string }[]
}


export default function TeacherDashboard() {
  const router = useRouter()
  const { showSuccess, showError } = useNotification()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<TeacherStats>({
    total_programs: 0,
    total_students: 0,
    studios: []
  })
  const [dashboardLessons, setDashboardLessons] = useState<any[]>([])
  const [dashboardStudentsByLesson, setDashboardStudentsByLesson] = useState<Record<string, any[]>>({})
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<string, string>>>({})
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set())
  const [lessonAbsencesByLesson, setLessonAbsencesByLesson] = useState<Record<string, any[]>>({})
  const [programToStudio, setProgramToStudio] = useState<Record<string, string>>({})
  const [studioMap, setStudioMap] = useState<Record<string, any>>({})
  const [selectedDashboardLesson, setSelectedDashboardLesson] = useState<string | null>(null)
  const { theme } = useTheme()

  // NOTE: This route is intentionally inactive.
  // The teacher dashboard is presented inside /dashboard (user dashboard).
  useEffect(() => {
    router.replace('/dashboard')
  }, [router])

  // Use central time formatting helper
  function formatTime(time?: string) {
    return formatTimeStr(time)
  }

  // Keep legacy logic in place, but never run it because we immediately redirect.
  // This avoids future accidental edits targeting this page.
  // useEffect(() => {
  //   loadTeacherData()
  // }, [])

  // (notes feature removed from this view to avoid unused state/console warnings)

  const loadTeacherData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Check if user is a teacher
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()

      if (roleError && roleError.code !== 'PGRST116') throw roleError

      if (!userRole || userRole.role !== 'teacher') {
        // User is not a teacher
        router.push('/hub/studios')
        return
      }

      // Get studios this teacher is linked to via studio_teachers
      const { data: studioLinks, error: linksError } = await supabase
        .from('studio_teachers')
        .select('studio_id, studios(naam)')
        .eq('user_id', user.id)

      if (linksError) throw linksError

      const studios = (studioLinks || []).map(link => ({
        studio_id: link.studio_id,
        studio_name: (link as any).studios?.naam || 'Studio'
      }))

      // Get assigned programs count
      const { count: programCount } = await supabase
        .from('teacher_programs')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', user.id)

      // Get total students (enrolled in programs I teach)
      const { data: myPrograms } = await supabase
        .from('teacher_programs')
        .select('program_id')
        .eq('teacher_id', user.id)

      let totalStudents = 0
      if (myPrograms && myPrograms.length > 0) {
        const programIds = myPrograms.map(p => p.program_id)
        const { count: studentCount } = await supabase
          .from('inschrijvingen')
          .select('*', { count: 'exact', head: true })
          .in('program_id', programIds)
          .eq('status', 'actief')

        totalStudents = studentCount || 0
      }

      setStats({
        total_programs: programCount || 0,
        total_students: totalStudents,
        studios
      })

      // Load notes for this teacher
      if (user?.id) {
        // load dashboard lessons after notes
        loadDashboardLessons(user.id)
      }
      // Load dashboard lessons
      if (user?.id) await loadDashboardLessons(user.id)
    } catch (error) {
      console.error('Error loading teacher data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDashboardLessons = async (teacherId: string) => {
    try {
      // get program ids for this teacher
      const { data: myPrograms } = await supabase
        .from('teacher_programs')
        .select('program_id')
        .eq('teacher_id', teacherId)

      const programIds = (myPrograms || []).map((p: any) => p.program_id)
      if (programIds.length === 0) {
        setDashboardLessons([])
        return
      }

      const today = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const todayISO = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

      // fetch upcoming lessons for these programs
      const { data: lessonsData, error } = await supabase
        .from('lessons')
        .select('*')
        .in('program_id', programIds)
        .gte('date', todayISO)
        // only include lessons that are unassigned or assigned to this teacher
        .or(`teacher_id.is.null,teacher_id.eq.${teacherId}`)
        .order('date', { ascending: true })
        .limit(10)

      if (error) {
        // Supabase error objects can be empty; stringify for clearer logs
        try {
          console.error('Error fetching dashboard lessons:', JSON.stringify(error))
        } catch {
          console.error('Error fetching dashboard lessons:', error)
        }
        return
      }

      const lessons = lessonsData || []

      // Build mapping program_id -> studio_id and fetch studio settings
      const programIdsFromLessons = Array.from(new Set(lessons.map((l: any) => l.program_id).filter(Boolean)))
      let programToStudio: Record<string, string> = {}
      if (programIdsFromLessons.length > 0) {
        const { data: programsData } = await supabase
          .from('programs')
          .select('id, studio_id')
          .in('id', programIdsFromLessons)
        programToStudio = (programsData || []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p.studio_id }), {})
      }
      // persist mapping for UI to read
      setProgramToStudio(programToStudio)

      const studioIds = Array.from(new Set(Object.values(programToStudio).filter(Boolean)))
      let studioMap: Record<string, any> = {}
      if (studioIds.length > 0) {
        const { data: studiosData } = await supabase
          .from('studios')
          .select('id, attendance_enabled, naam')
          .in('id', studioIds)
        studioMap = (studiosData || []).reduce((acc: any, s: any) => ({ ...acc, [s.id]: s }), {})
      }
      // persist studio map for UI use
      setStudioMap(studioMap)

      // decide which to show: all lessons on the earliest upcoming lesson date (today if present)
      const lessonDates = Array.from(new Set(lessons.map((l: any) => String(l.date).slice(0, 10))))
      const futureDates = lessonDates.filter(d => d >= todayISO).sort()
      let visibleLessons: any[] = []
      if (futureDates.length === 0) {
        visibleLessons = []
        setDashboardLessons([])
      } else {
        const targetDate = futureDates[0]
        visibleLessons = lessons.filter((l: any) => String(l.date).startsWith(targetDate))
        setDashboardLessons(visibleLessons)
      }

      // for shown lessons, fetch enrolled students in a batched way (performance)
      const lessonIds = visibleLessons.map((l: any) => l.id)
      if (lessonIds.length === 0) return

      // Collect program ids from visible lessons
      const progIds = Array.from(new Set(visibleLessons.map((l: any) => l.program_id).filter(Boolean)))

      // 1) Fetch enrollments for these programs in one query (only active enrollments)
      const { data: allEnrolls } = await supabase
        .from('inschrijvingen')
        .select('user_id, program_id')
        .in('program_id', progIds)
        .eq('status', 'actief')

      const enrolls = allEnrolls || []

      // 2) Collect unique user ids and fetch profiles in one query
      const allUserIds = Array.from(new Set(enrolls.map((e: any) => e.user_id).filter(Boolean)))
      let profilesMap: Record<string, any> = {}
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, email, first_name, last_name')
          .in('user_id', allUserIds)
        ;(profiles || []).forEach((p: any) => { profilesMap[p.user_id] = p })
      }

      // 3) Build per-lesson student lists using the enrollments + profiles map
      const byLesson: Record<string, any[]> = {}
      for (const lesson of visibleLessons) {
        const enrollsForProgram = enrolls.filter((en: any) => en.program_id === lesson.program_id)
        const profilesForLesson = enrollsForProgram.map((en: any) => profilesMap[en.user_id]).filter(Boolean)
        byLesson[lesson.id] = profilesForLesson
      }
      setDashboardStudentsByLesson(byLesson)

      // attendance records - include enrollment_id and map by enrollment when present
      const { data: attendances } = await supabase
        .from('lesson_attendances')
        .select('lesson_id, user_id, enrollment_id, status')
        .in('lesson_id', lessonIds)

      const attMap: Record<string, Record<string, string>> = {}
      attendances?.forEach((att: any) => {
        if (!attMap[att.lesson_id]) attMap[att.lesson_id] = {}
        const key = att.enrollment_id || att.user_id
        attMap[att.lesson_id][key] = att.status
      })
      setAttendanceData(attMap)

      // reported absences via API (to respect RLS)
      try {
        const q = `/api/lesson-absences?lesson_ids=${lessonIds.join(',')}`
        const { data: { session } } = await supabase.auth.getSession()
        const token = (session as any)?.access_token
        const headers: Record<string,string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await fetch(q, { method: 'GET', headers })
        if (res.ok) {
          const json = await res.json()
          const abs: any[] = json?.absences || []
          const map: Record<string, any[]> = {}
          for (const a of abs) {
            const lid = String(a.lesson_id)
            map[lid] = map[lid] || []
            map[lid].push(a)
          }
          setLessonAbsencesByLesson(map)
        }
      } catch (e) {
        console.error('Error fetching reported absences for dashboard', e)
      }

    } catch (error) {
      console.error('Error in loadDashboardLessons', error)
    }
  }

  const updateAttendanceStatus = (lessonId: string, userId: string, status: 'present' | 'absent' | 'excused' | 'late') => {
    setAttendanceData(prev => ({
      ...prev,
      [lessonId]: {
        ...(prev[lessonId] || {}),
        [userId]: status
      }
    }))
    setPendingChanges(prev => new Set(prev).add(`${lessonId}-${userId}`))
  }

  const saveAttendance = async (lessonId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const lessonAttendances = attendanceData[lessonId] || {}
      const withEnrollment: any[] = []
      const withoutEnrollment: any[] = []
      ;(dashboardStudentsByLesson[lessonId] || []).forEach((s: any) => {
        const key = s.enrollment_id || s.user_id
        const status = lessonAttendances[key]
        if (!status) return
        const row = {
          lesson_id: lessonId,
          user_id: s.user_id,
          enrollment_id: s.enrollment_id || null,
          status,
        }
        if (s.enrollment_id) withEnrollment.push(row)
        else withoutEnrollment.push(row)
      })

      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      const res = await fetch('/api/attendances/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ attendances: [...withEnrollment, ...withoutEnrollment] }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null as any)
        const fallbackText = !data ? await res.text().catch(() => '') : ''
        const message = data?.error || fallbackText || `Failed saving attendance (${res.status})`
        throw new Error(message)
      }

      // clear pending
      setPendingChanges(prev => {
        const newSet = new Set(prev)
        const students = dashboardStudentsByLesson[lessonId] || []
        students.forEach((s:any) => newSet.delete(`${lessonId}-${s.user_id}`))
        return newSet
      })

      // reload dashboard lessons to refresh counts
      if (user?.id) await loadDashboardLessons(user.id)
      showSuccess('Aanwezigheid opgeslagen')
    } catch (error) {
      console.error('Error saving dashboard attendance', error)
      const message = error instanceof Error ? error.message : null
      showError(message || 'Fout bij het opslaan van aanwezigheid')
    }
  }

  const isWithinAttendanceWindow = (lessonDate: string) => {
    const raw = String(lessonDate || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
    const ld = new Date(`${raw}T00:00:00`)
    if (isNaN(ld.getTime())) return false
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const lessonDay = new Date(ld.getFullYear(), ld.getMonth(), ld.getDate())
    const diffDays = Math.floor((today.getTime() - lessonDay.getTime()) / 86400000)
    return diffDays >= 0 && diffDays <= 14
  }

  if (loading) {
    return (
      <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
        <UserSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size={48} className="mb-4" />
            <p className="text-slate-600">Dashboard laden…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
      <UserSidebar />
      <div className="flex-1 p-8">
      <div className="max-w-screen-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-blue-600" />
            Teacher Dashboard
          </h1>
          <p className="text-slate-600 mt-2">
            Welkom terug! Hier is een overzicht van je cursussen en studenten.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 bg-transparent rounded-lg flex items-center justify-center border border-blue-200 dark:border-blue-500/40">
                <BookMarked className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900">{stats.total_programs}</h3>
            <p className="text-xs text-slate-600 mt-1">Toegewezen Cursussen</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 bg-transparent rounded-lg flex items-center justify-center border border-green-200 dark:border-green-500/40">
                <Users className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900">{stats.total_students}</h3>
            <p className="text-xs text-slate-600 mt-1">Totaal Studenten</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 bg-transparent rounded-lg flex items-center justify-center border border-purple-200 dark:border-purple-500/40">
                <GraduationCap className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900">{stats.studios.length}</h3>
            <p className="text-xs text-slate-600 mt-1">Studio's</p>
          </div>
        </div>

        {/* Today quick dashboard section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-slate-900">Vandaag — Snel dashboard</h2>
            <div className="text-sm text-slate-600">Snel aanwezigheden registreren voor lessen van vandaag</div>
          </div>
          <div className="text-xs text-slate-500 mb-3">Aanwezigheid kan alleen gemarkeerd worden op de dag van de les en wanneer de studio dit heeft ingeschakeld.</div>

          {dashboardLessons.length === 0 ? (
            <p className="text-sm text-slate-600">Geen lessen vandaag of komende lessen gevonden.</p>
          ) : (
            (() => {
              // group lessons by studio (using programToStudio mapping)
              const groups: Record<string, any[]> = {}
              for (const l of dashboardLessons) {
                const progId = (l as any).program_id
                const studioId = programToStudio?.[progId] || 'unknown'
                groups[studioId] = groups[studioId] || []
                groups[studioId].push(l)
              }

              return (
                <div className="space-y-4">
                  {Object.entries(groups).map(([studioId, lessons]) => (
                    <div key={studioId} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-semibold text-slate-900">{studioMap?.[studioId]?.naam || 'Studio'}</div>
                        <div className="text-sm text-slate-600">{lessons.length} les(sen)</div>
                      </div>

                      <div className="space-y-3">
                        {lessons.map((lesson: any) => {
                          const studioAllows = studioMap?.[studioId]?.attendance_enabled ?? false
                          return (
                            <div key={lesson.id} className="border border-slate-200 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-semibold text-slate-900">{lesson.title || 'Les'}</div>
                                  <div className="text-sm text-slate-600">{new Date(lesson.date).toLocaleDateString('nl-NL')}{lesson.time ? ` • ${formatTime(lesson.time)}` : ''}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {(() => {
                                    const attMap = attendanceData[lesson.id] || {}
                                    const teacherAbsentIds = Object.entries(attMap).filter(([, status]) => status === 'absent').map(([uid]) => uid)
                                    const reported = lessonAbsencesByLesson[lesson.id] || []
                                    // reportedKeys: prefer enrollment-specific keys (e:enrollmentId) else user-specific (u:userId)
                                    const reportedKeys = reported.map((r:any) => r.enrollment_id ? `e:${r.enrollment_id}` : `u:${r.user_id}`).filter(Boolean)
                                    const combined = Array.from(new Set([...teacherAbsentIds.map(id => `u:${id}`), ...reportedKeys]))
                                    const absCount = combined.length
                                    return absCount > 0 ? (
                                      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-red-50 text-red-700 text-sm font-medium">
                                        <UserMinus className="w-4 h-4" />
                                        <span>{absCount}</span>
                                      </span>
                                    ) : null
                                  })()}

                                  {/* show the toggle button only if studio has attendance enabled */}
                                  {studioAllows ? (
                                    <button
                                      onClick={() => setSelectedDashboardLesson(selectedDashboardLesson === lesson.id ? null : lesson.id)}
                                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                      {selectedDashboardLesson === lesson.id ? 'Verberg' : 'Markeer aanwezigheid'}
                                    </button>
                                  ) : null}
                                </div>
                              </div>

                              {selectedDashboardLesson === lesson.id && (
                                <div className="mt-3 space-y-2">
                                  {(dashboardStudentsByLesson[lesson.id] || []).map((student: any) => {
                                    const currentStatus = attendanceData[lesson.id]?.[student.enrollment_id || student.user_id]
                                    const reported = (lessonAbsencesByLesson[lesson.id] || []).some((r:any) => {
                                      if (student.enrollment_id) {
                                        return r.enrollment_id && String(r.enrollment_id) === String(student.enrollment_id)
                                      }
                                      return String(r.user_id) === String(student.user_id)
                                    })
                                    const canMark = isWithinAttendanceWindow(String(lesson.date)) && (studioMap?.[studioId]?.attendance_enabled ?? false)

                                    return (
                                      <div key={student.user_id} className="flex items-center justify-between p-2 bg-white rounded">
                                        <div className="text-sm font-medium text-slate-900">{student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : student.email}</div>
                                        <div className="flex items-center gap-2">
                                          {reported ? (
                                            <span className="text-sm text-red-600 font-semibold">Afwezig gemeld</span>
                                          ) : (
                                            <>
                                              <button
                                                title={canMark ? '' : 'Aanwezigheid kan vanaf de lesdatum tot 14 dagen erna (en als de studio dit heeft ingeschakeld).'}
                                                onClick={() => canMark && updateAttendanceStatus(lesson.id, student.enrollment_id || student.user_id, 'present')}
                                                disabled={!canMark}
                                                className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                                                  currentStatus === 'present' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                } ${!canMark ? 'opacity-50 cursor-not-allowed' : ''}`}
                                              >
                                                Aanwezig
                                              </button>
                                              <button
                                                title={canMark ? '' : 'Aanwezigheid kan vanaf de lesdatum tot 14 dagen erna (en als de studio dit heeft ingeschakeld).'}
                                                onClick={() => canMark && updateAttendanceStatus(lesson.id, student.enrollment_id || student.user_id, 'absent')}
                                                disabled={!canMark}
                                                className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                                                  currentStatus === 'absent' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                } ${!canMark ? 'opacity-50 cursor-not-allowed' : ''}`}
                                              >
                                                Afwezig
                                              </button>
                                              <button
                                                title={canMark ? '' : 'Aanwezigheid kan vanaf de lesdatum tot 14 dagen erna (en als de studio dit heeft ingeschakeld).'}
                                                onClick={() => canMark && updateAttendanceStatus(lesson.id, student.enrollment_id || student.user_id, 'late')}
                                                disabled={!canMark}
                                                className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                                                  currentStatus === 'late' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                } ${!canMark ? 'opacity-50 cursor-not-allowed' : ''}`}
                                              >
                                                Te laat
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}

                                  {Array.from(pendingChanges).some(key => key.startsWith(`${lesson.id}-`)) && (
                                    <div className="flex justify-end pt-2 border-t border-slate-200">
                                      <button
                                        onClick={() => saveAttendance(lesson.id)}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
                                      >
                                        Opslaan
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()
          )}
        </div>

        {/* Bottom Section - Studios and Quick Actions side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Studios List */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Mijn Studio's</h2>
            {stats.studios.length === 0 ? (
              <p className="text-slate-600">Je bent nog niet toegewezen aan een studio.</p>
            ) : (
              <div className="space-y-3">
                {stats.studios.map((studio) => (
                  <div
                    key={studio.studio_id}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-slate-900 text-sm">{studio.studio_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Snelle Acties</h2>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/teacher/courses')}
                className="w-full flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <BookMarked className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">Bekijk Mijn Cursussen</h3>
                  <p className="text-xs text-slate-600">Zie alle cursussen die je geeft</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
