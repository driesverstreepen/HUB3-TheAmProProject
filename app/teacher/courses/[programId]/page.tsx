"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useNotification } from '@/contexts/NotificationContext'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { Users, Calendar, AlertCircle, UserMinus } from 'lucide-react'
import { formatTimeStr, formatEndTime } from '@/lib/formatting'
import ReplacementRequestModal from '@/components/ReplacementRequestModal'
import { Program } from '@/types/database'
import UserSidebar from '@/components/user/UserSidebar'
import ProgramDetailHeader from '@/components/ProgramDetailHeader'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Student {
  user_id: string
  email: string
  first_name?: string
  last_name?: string
}

interface EnrollmentStudent extends Student {
  enrollment_id?: string
}

interface Lesson {
  id: string
  title: string
  date: string
  time: string
  duration_minutes?: number
  description?: string
}

export default function TeacherCourseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const programId = params.programId as string
  const { showSuccess, showError } = useNotification()

  const [loading, setLoading] = useState(true)
  const [program, setProgram] = useState<Program | null>(null)
  const [studioName, setStudioName] = useState('')
  const [students, setStudents] = useState<EnrollmentStudent[]>([])
  
  
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [attendanceEnabled, setAttendanceEnabled] = useState(false)
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null)
  const [locations, setLocations] = useState<Array<{ id: string; name: string; city?: string; adres?: string }>>([])
  const [groupDetails, setGroupDetails] = useState<{ weekday: number; start_time: string; end_time: string; season_start?: string; season_end?: string } | null>(null)
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<string, string>>>({}) // lessonId -> userId -> status
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set()) // Track unsaved changes
  const [lessonAbsencesByLesson, setLessonAbsencesByLesson] = useState<Record<string, any[]>>({})
  
  const [replacementLessonId, setReplacementLessonId] = useState<string | null>(null)
  const [showStudents, setShowStudents] = useState<boolean>(false)
  const { theme } = useTheme()

  useEffect(() => {
    loadProgramData()
  }, [programId])

  const loadProgramData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      

      // Verify teacher has access to this program
      const { data: teacherProgram, error: tpError } = await supabase
        .from('teacher_programs')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('program_id', programId)
        .single()

      if (tpError || !teacherProgram) {
        showError('Je hebt geen toegang tot deze cursus')
        router.push('/teacher/courses')
        return
      }

      // Get program details
      const { data: programData, error: programError } = await supabase
        .from('programs')
        .select('*')
        .eq('id', programId)
        .single()

      if (programError) {
        console.error('Program query error:', programError)
        throw programError
      }

      if (!programData) {
        throw new Error('Program not found')
      }

      // Get studio details separately
      const { data: studioData, error: studioError } = await supabase
        .from('studios')
        .select('naam, attendance_enabled')
        .eq('id', programData.studio_id)
        .single()

      if (studioError) {
        console.error('Studio query error:', studioError)
      }

      setProgram(programData)
      setStudioName(studioData?.naam || 'Onbekend')
      setAttendanceEnabled(studioData?.attendance_enabled || false)

      // Fetch any user_roles for the current user scoped to this program's studio (for debugging / permissions)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: rolesData, error: rolesError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('studio_id', programData.studio_id)

          if (rolesError) {
            console.info('user_roles query error:', rolesError)
          }
          const roles = (rolesData || []).map((r: any) => r.role)
          console.info('User roles for current user in studio:', roles)
        }
      } catch (err) {
        console.error('Failed to fetch user_roles:', err)
      }

      // Get locations for this program - safer query
      try {
        const { data: programLocations, error: locationsError } = await supabase
          .from('program_locations')
          .select('locations(*)')
          .eq('program_id', programId)

        if (locationsError) {
          console.error('Locations query error:', locationsError)
        } else {
          const loadedLocations = programLocations?.map((pl: any) => pl.locations).filter(Boolean) || []
          console.info('Loaded locations:', loadedLocations)
          setLocations(loadedLocations)
        }
      } catch (error) {
        console.error('Failed to load locations:', error)
        // Continue without locations if this fails
      }

      // Get schedule details if it's a group program
      if (programData.program_type === 'group') {
        const { data: groupData } = await supabase
          .from('group_details')
          .select('weekday, start_time, end_time, season_start, season_end')
          .eq('program_id', programId)
          .single()
        
        if (groupData) {
          setGroupDetails(groupData)
        }
      }

      // Get enrolled students - include enrollment id and profile snapshot for sub-profiles
      const { data: allEnrollments } = await supabase
        .from('inschrijvingen')
        .select('id, user_id, status, sub_profile_id, profile_snapshot')
        .eq('program_id', programId)

  console.info('All enrollments for program:', allEnrollments)

      const enrollments = allEnrollments || []

      if (enrollments.length === 0) {
        setStudents([])
      } else {
        const enrollmentsWithoutSnapshot = enrollments.filter((e: any) => !e.profile_snapshot)
        const userIds = Array.from(new Set(enrollmentsWithoutSnapshot.map((e: any) => e.user_id).filter(Boolean)))

        let profiles: any[] = []
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('user_profiles')
            .select('user_id, email, first_name, last_name')
            .in('user_id', userIds)

          if (profilesError) {
            console.error('Profiles error:', profilesError)
          } else {
            profiles = profilesData || []
          }
        }

        const profilesMap: Record<string, any> = {}
        profiles.forEach(p => { profilesMap[p.user_id] = p })

        const studentsList: EnrollmentStudent[] = enrollments.map((e: any) => {
          const snapshot = e.profile_snapshot || null
          const prof = profilesMap[e.user_id]
          const email = snapshot?.email || prof?.email || ''
          const first_name = snapshot?.first_name || snapshot?.voornaam || prof?.first_name || ''
          const last_name = snapshot?.last_name || prof?.last_name || ''

          return {
            enrollment_id: e.id,
            user_id: e.user_id,
            email,
            first_name,
            last_name
          }
        })

        setStudents(studentsList)
        console.info('Students set to:', studentsList)
      }

      // Get lessons for this program
      // Only show lessons that are unassigned or assigned to the current teacher.
      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('*')
        .eq('program_id', programId)
        .or(`teacher_id.is.null,teacher_id.eq.${user.id}`)
        .order('date', { ascending: true })

      if (lessonsError) {
        console.error('Lessons query error:', lessonsError)
        throw lessonsError
      }

      setLessons(lessonsData || [])

      // Get existing attendance data for these lessons
      if (lessonsData && lessonsData.length > 0) {
        const lessonIds = lessonsData.map(l => l.id)
        const { data: attendances } = await supabase
          .from('lesson_attendances')
          .select('lesson_id, user_id, enrollment_id, status')
          .in('lesson_id', lessonIds)

        // Build attendance map
        const attendanceMap: Record<string, Record<string, string>> = {}
        attendances?.forEach(att => {
          if (!attendanceMap[att.lesson_id]) {
            attendanceMap[att.lesson_id] = {}
          }
          const key = att.enrollment_id || att.user_id
          attendanceMap[att.lesson_id][key] = att.status
        })
          setAttendanceData(attendanceMap)
          // Fetch reported absences (student-reported) for these lessons via API
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
            } else {
              console.error('Failed to fetch lesson absences', res.status)
            }
          } catch (e) {
            console.error('Error fetching lesson absences', e)
          }
      }
    } catch (error) {
      console.error('Error loading program data:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      if (error instanceof Error) {
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
      }
      showError('Fout bij het laden van cursus gegevens')
    } finally {
      setLoading(false)
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
      students.forEach(s => {
        const key = s.enrollment_id || s.user_id
        const status = lessonAttendances[key]
        if (!status) return
        const row = {
          lesson_id: lessonId,
          user_id: s.user_id,
          enrollment_id: s.enrollment_id || null,
          status: status,
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

      // Clear pending changes for this lesson
      setPendingChanges(prev => {
        const newSet = new Set(prev)
        students.forEach(s => newSet.delete(`${lessonId}-${s.user_id}`))
        return newSet
      })

      showSuccess('Aanwezigheid opgeslagen')
    } catch (error) {
      console.error('Error saving attendance:', error)
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
            <p className="text-slate-600">Laden…</p>
          </div>
        </div>
      </div>
    )
  }

  if (!program) {
    return (
      <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
        <UserSidebar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-600">Cursus niet gevonden</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
      <UserSidebar />
      <div className="flex-1 p-8">
      <div className="max-w-7xl mx-auto">
        <ProgramDetailHeader
          program={program}
          studioName={studioName}
          groupDetails={groupDetails}
          locations={locations}
          onBack={() => router.push('/teacher/courses')}
          backText="Terug naar Mijn Programma's"
        />

        {/* Students List (collapsed by default) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <h2 className="text-xl font-semibold text-slate-900">Ingeschreven Studenten</h2>
              <span className="text-sm text-slate-500">({students.length})</span>
            </div>
            <div>
              <button
                aria-expanded={showStudents}
                onClick={() => setShowStudents(s => !s)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showStudents ? 'Verberg leden' : 'Toon leden'}
              </button>
            </div>
          </div>

          {!showStudents ? null : students.length === 0 ? (
            <p className="text-slate-600">Nog geen studenten ingeschreven.</p>
          ) : (
            <div className="space-y-2">
              {students.map((student) => (
                <div
                  key={student.enrollment_id || student.user_id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-medium text-sm">
                      {student.first_name?.[0]?.toUpperCase() || student.email[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">
                      {student.first_name && student.last_name
                        ? `${student.first_name} ${student.last_name}`
                        : 'Naam niet ingevuld'}
                    </div>
                    <div className="text-sm text-slate-600">{student.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* NOTE: 'Vandaag — Snel dashboard' removed from program detail page.
            This quick dashboard should only live on the main teacher dashboard.
            The lessons list below now shows absence indicators similar to the quick view. */}

        {/* Attendance Feature Notice */}
        {!attendanceEnabled && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900 mb-1">
                  Aanwezigheid tracking is uitgeschakeld
                </h3>
                <p className="text-sm text-amber-800">
                  De studio admin moet aanwezigheid tracking inschakelen in de studio instellingen voordat je aanwezigheid kunt bijhouden.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Lessons and Attendance (only if feature is enabled) */}
        {attendanceEnabled && lessons.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Lessen & Aanwezigheid
            </h2>

            <div className="space-y-4">
              {lessons.map((lesson) => (
                <div key={lesson.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{lesson.title}</h3>
                      <p className="text-sm text-slate-600">
                        {new Date(lesson.date).toLocaleDateString('nl-NL')}
                        {lesson.time && ` • ${formatTimeStr(lesson.time)}${lesson.duration_minutes ? ` - ${formatEndTime(lesson.time, lesson.duration_minutes)}` : ''}`}
                        {lesson.duration_minutes && ` (${lesson.duration_minutes} min)`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Absence indicator: combine teacher-marked absences and reported absences */}
                      {(() => {
                        const attMap = attendanceData[lesson.id] || {}
                        const teacherAbsentIds = Object.entries(attMap).filter(([, status]) => status === 'absent').map(([uid]) => uid)
                        const reported = lessonAbsencesByLesson[lesson.id] || []
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

                      <button
                        onClick={() => setSelectedLesson(selectedLesson === lesson.id ? null : lesson.id)}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {selectedLesson === lesson.id ? 'Verberg' : 'Aanwezigheid bijhouden'}
                      </button>

                      {/* Replacement request button for teachers assigned to this program */}
                      <button
                        onClick={() => setReplacementLessonId(lesson.id)}
                        className="text-sm text-slate-700 hover:text-slate-900 font-medium"
                      >
                        Vraag vervanging aan
                      </button>
                    </div>
                  </div>

                  {selectedLesson === lesson.id && (
                    <div className="mt-4 space-y-3">
                      {students.map((student) => {
                        const currentStatus = attendanceData[lesson.id]?.[student.enrollment_id || student.user_id];
                        const canMark = isWithinAttendanceWindow(String(lesson.date)) && attendanceEnabled
                        const reported = (lessonAbsencesByLesson[lesson.id] || []).some((r: any) => {
                          if (student.enrollment_id) {
                            return r.enrollment_id && String(r.enrollment_id) === String(student.enrollment_id)
                          }
                          return String(r.user_id) === String(student.user_id)
                        })

                        return (
                          <div key={student.enrollment_id || student.user_id} className="flex items-center justify-between p-2 bg-white rounded">
                            <div className="text-sm font-medium text-slate-900">
                              {student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : student.email}
                            </div>
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
                      
                      {/* Save Button - only show when there are pending changes for this lesson */}
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
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
      {replacementLessonId && program && (
        <ReplacementRequestModal
          studioId={String(program.studio_id)}
          programId={program.id}
          lessonId={replacementLessonId}
          onClose={() => setReplacementLessonId(null)}
          onSuccess={(): void => {
            // refresh data after successful request
            loadProgramData()
          }}
        />
      )}
    </div>
  )
}
