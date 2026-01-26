"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import FormSelect from '@/components/FormSelect'
import { Calendar, Users, MapPin, Building2, ArrowLeft, AlertCircle, User, UserMinus, Check, Circle, ChevronRight, Clock } from 'lucide-react'
import { formatDateOnly, formatTimeStr, formatTimeFromDate, formatEndTime } from '@/lib/formatting'
import Link from 'next/link'
import ReplacementRequestModal from '@/components/ReplacementRequestModal'
import TeacherLessonDetailsModal from '@/components/TeacherLessonDetailsModal'
import UserLessonDetailsModal from '@/components/user/UserLessonDetailsModal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useNotification } from '@/contexts/NotificationContext'
import { getTagClass } from '@/lib/tagColors'

interface Program {
  id: string;
  title: string;
  description: string | null;
  program_type: string;
  price: number | null;
  capacity: number | null;
  is_public: boolean;
  dance_style: string | null;
  level: string | null;
  min_age: number | null;
  max_age: number | null;
  studio_id: string;
  season_start?: string | null;
  season_end?: string | null;
  show_capacity_to_users?: boolean;
  program_locations?: {
    location_id: string;
    locations: {
      id: string;
      name: string;
      city?: string | null;
      adres?: string | null;
      postcode?: string | null;
    };
  }[];
  group_details?: any[];
  workshop_details?: any[];
}

interface Studio {
  id: string;
  naam: string;
  stad: string | null;
}

interface StudioWithFeatures extends Studio {
  features?: Record<string, any> | null;
}

interface ProgramDetailModalProps {
  isOpen: boolean
  onClose: () => void
  programId: string
  view?: 'auto' | 'user' | 'manage'
  renderMode?: 'modal' | 'page'
}

interface Student {
  enrollment_id?: string
  user_id: string
  email: string
  first_name?: string
  last_name?: string
  parent_name?: string
  is_sub_profile?: boolean
}

interface Lesson {
  id: string
  title: string
  date: string
  time: string
  duration_minutes?: number
  description?: string
}

const weekdayNames = [
  'Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'
]

const formatOneDecimalComma = (n?: number | null) => {
  if (n == null || Number.isNaN(n)) return ''
  try {
    return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
  } catch (e) {
    return (n.toFixed(1)).replace('.', ',')
  }
}

const roundToHalf = (n: number) => Math.round(n * 2) / 2

export default function ProgramDetailModal({ isOpen, onClose, programId, view = 'auto', renderMode = 'modal' }: ProgramDetailModalProps) {
  const isUserView = view === 'user'
  const { showSuccess, showError } = useNotification()
  const [program, setProgram] = useState<Program | null>(null)
  const [studio, setStudio] = useState<StudioWithFeatures | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewerLabel, setViewerLabel] = useState<string>('')
  const [enrolledCount, setEnrolledCount] = useState(0)
  const [isStudioAdmin, setIsStudioAdmin] = useState(false)
  const [isTeacherForProgram, setIsTeacherForProgram] = useState(false)
  const [canManageProgram, setCanManageProgram] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [subStudents, setSubStudents] = useState<any[]>([])
  const [attendanceAllowLate, setAttendanceAllowLate] = useState<boolean>(true)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [attendanceEnabled, setAttendanceEnabled] = useState(false)
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null)
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<string, string>>>({}) // lessonId -> userId -> status
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set()) // Track unsaved changes
  const [lessonAbsencesByLesson, setLessonAbsencesByLesson] = useState<Record<string, any[]>>({})
  const [showStudents, setShowStudents] = useState<boolean>(true)
  const [replacementLessonId, setReplacementLessonId] = useState<string | null>(null)
  const [lessonDetailsId, setLessonDetailsId] = useState<string | null>(null)
  const [evaluationFeatureEnabled, setEvaluationFeatureEnabled] = useState<boolean>(false)
  const [evaluationSettingsEnabled, setEvaluationSettingsEnabled] = useState<boolean>(false)
  const [evaluationDefaultVisibility, setEvaluationDefaultVisibility] = useState<'hidden' | 'visible_immediate' | 'visible_on_date'>('hidden')
  const [evaluationMethod, setEvaluationMethod] = useState<'score' | 'percent' | 'rating' | 'feedback'>('score')
  const [evaluationCategories, setEvaluationCategories] = useState<string[]>([])
  const [evaluationRatingScale, setEvaluationRatingScale] = useState<string[]>(['voldoende','goed','zeer goed','uitstekend'])
  const [evaluationPeriods, setEvaluationPeriods] = useState<string[]>([])
  const [showEvaluationModal, setShowEvaluationModal] = useState<boolean>(false)
  const [periodFilter, setPeriodFilter] = useState<string>('')
  const [expandedEvalUsers, setExpandedEvalUsers] = useState<Set<string>>(new Set())
  const [evalForms, setEvalForms] = useState<Record<string, { score?: number; comment: string; categoryValues: Record<string, number | string> }>>({})
  const [evalSaved, setEvalSaved] = useState<Record<string, boolean>>({})
  const [evalExistingIds, setEvalExistingIds] = useState<Record<string, string>>({})

  const shouldRender = renderMode === 'page' ? true : isOpen

  useEffect(() => {
    if (shouldRender && programId) {
      loadProgramData()
    }
  }, [shouldRender, programId])

  useEffect(() => {
    if (!canManageProgram) {
      setShowEvaluationModal(false)
      setSelectedLesson(null)
      setReplacementLessonId(null)
    }
  }, [canManageProgram])

  const loadProgramData = async () => {
    try {
      setLoading(true)

      const forcedUser = view === 'user'
      const forcedManage = false

      // Load program (no is_public filter - teachers need to see their assigned programs)
      const { data: programData, error: programError } = await supabase
        .from('programs')
        .select(`
          *,
          program_locations(location_id, locations(*) ),
          group_details(*),
          workshop_details(*)
        `)
        .eq('id', programId)
        .single();

      if (programError || !programData) {
        console.error('Program not found:', programError);
        return;
      }

      setProgram(programData);

      const { data: { user } } = await supabase.auth.getUser();

      // Resolve a friendly label for the current viewer (used in user-view header)
      try {
        let label = 'Jij'
        if (user?.id) {
          const { data: prof, error: profErr } = await supabase
            .from('user_profiles')
            .select('first_name, last_name, email')
            .eq('user_id', user.id)
            .maybeSingle()
          if (!profErr && prof) {
            const name = `${String((prof as any).first_name || '').trim()} ${String((prof as any).last_name || '').trim()}`.trim()
            label = name || String((prof as any).email || '').trim() || label
          } else if (user?.email) {
            label = user.email
          }
        } else if (user?.email) {
          label = user.email
        }
        setViewerLabel(label)
      } catch {
        setViewerLabel('Jij')
      }

      // Load studio (including features)
      const { data: studioData } = await supabase
        .from('studios')
        .select('id, naam, stad, features')
        .eq('id', programData.studio_id)
        .single();

      setStudio(studioData as StudioWithFeatures || null);

      // Resolve permissions: only studio admin or assigned teacher may see management sections
      let resolvedIsStudioAdmin = false
      let resolvedIsTeacherForProgram = false
      let resolvedCanManageProgram = false

      if (!forcedUser && user?.id && programData?.studio_id) {
        try {
          const [studioMemberRes, legacyRoleRes, programTeacherRes, lessonTeacherRes] = await Promise.all([
            supabase
              .from('studio_members')
              .select('role')
              .eq('user_id', user.id)
              .eq('studio_id', programData.studio_id)
              .in('role', ['owner', 'admin'])
              .maybeSingle(),
            supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', user.id)
              .eq('studio_id', programData.studio_id)
              .in('role', ['studio_admin', 'admin'])
              .maybeSingle(),
            supabase
              .from('program_teachers')
              .select('id')
              .eq('program_id', programId)
              .eq('user_id', user.id)
              .maybeSingle(),
            supabase
              .from('lessons')
              .select('id')
              .eq('program_id', programId)
              .eq('teacher_id', user.id)
              .limit(1)
              .maybeSingle(),
          ])

          resolvedIsStudioAdmin = !!(studioMemberRes.data || legacyRoleRes.data)
          resolvedIsTeacherForProgram = !!(programTeacherRes.data || lessonTeacherRes.data)
          resolvedCanManageProgram = resolvedIsStudioAdmin || resolvedIsTeacherForProgram
        } catch {
          resolvedIsStudioAdmin = false
          resolvedIsTeacherForProgram = false
          resolvedCanManageProgram = false
        }
      }

      setIsStudioAdmin(resolvedIsStudioAdmin)
      setIsTeacherForProgram(resolvedIsTeacherForProgram)
      setCanManageProgram(resolvedCanManageProgram)

      // read 'attendance_allow_late' from features (default to true for backward compatibility)
      try {
        const allowLate = (studioData && studioData.features && typeof studioData.features['attendance_allow_late'] !== 'undefined')
          ? Boolean(studioData.features['attendance_allow_late'])
          : true;
        setAttendanceAllowLate(allowLate);
      } catch (err) {
        setAttendanceAllowLate(true);
      }

      // Set evaluations feature flag from studio features
      try {
        const evalEnabled = !!(studioData?.features && studioData.features['evaluations'])
        setEvaluationFeatureEnabled(evalEnabled)
      } catch (err) {
        setEvaluationFeatureEnabled(false)
      }

      // Load enrollment count
      const { count } = await supabase
        .from('inschrijvingen')
        .select('*', { count: 'exact', head: true })
        .eq('program_id', programId)
        .in('status', ['actief', 'active', 'confirmed', 'approved']);

      setEnrolledCount(count || 0);

      // Keep enrollments available for later (attendance mapping, etc.)
      let enrollmentsForProgram: any[] = []


      // Load enrolled students ONLY for teachers/admins
      if (resolvedCanManageProgram) {
        console.log('🔐 Loading enrollments for program:', programId, 'User:', user?.id);

        // Direct Supabase query - may be blocked by RLS, fallback to API
        let { data: enrollments, error: enrollError } = await supabase
          .from('inschrijvingen')
          .select('id, user_id, status, sub_profile_id, profile_snapshot')
          .eq('program_id', programId)

        if (enrollError) {
          console.error('❌ Enrollment error:', enrollError);
          try {
            const response = await fetch(`/api/inschrijvingen?program_id=${programId}`);
            const json = await response.json();
            if (response.ok) {
              enrollments = json.enrollments || [];
              enrollError = null;
            } else {
              console.error('❌ API also failed:', json.error);
            }
          } catch (apiError) {
            console.error('❌ API fetch error:', apiError);
          }
        }

        enrollmentsForProgram = enrollments || []

        if (enrollError || !enrollments || enrollments.length === 0) {
          setStudents([]);
          setSubStudents([]);
        } else {
          const userIds = Array.from(new Set(enrollments.map((e: any) => e.user_id).filter(Boolean)))

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

          // Split enrollments by sub_profile_id (subaccounts) instead of profile_snapshot
          const mainEnrollments = enrollments.filter((e: any) => !e.sub_profile_id)
          const subEnrollments = enrollments.filter((e: any) => !!e.sub_profile_id)

          const mainStudentsList: Student[] = mainEnrollments.map((e: any) => {
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
              last_name,
              is_sub_profile: false,
            }
          })

          const subStudentsList: Student[] = subEnrollments.map((e: any) => {
            const snapshot = e.profile_snapshot || {}
            const prof = profilesMap[e.user_id]
            const email = snapshot?.email || prof?.email || ''
            const first_name = snapshot?.first_name || snapshot?.voornaam || ''
            const last_name = snapshot?.last_name || ''
            const parent_name = prof ? `${prof.first_name || ''} ${prof.last_name || ''}`.trim() : ''

            return {
              enrollment_id: e.id,
              user_id: e.user_id,
              email,
              first_name,
              last_name,
              parent_name,
              is_sub_profile: true,
            }
          })

          setStudents(mainStudentsList)
          setSubStudents(subStudentsList)
        }
      } else {
        setStudents([])
        setSubStudents([])
      }

      // Load lessons for this program.
      // Important: students should see all lessons even when a teacher is assigned.
      // We only apply the teacher filter when the current user is an assigned teacher for this program.
      let lessonsQuery = supabase
        .from('lessons')
        .select('*')
        .eq('program_id', programId)
        .order('date', { ascending: true })

      if (!forcedUser && user?.id && resolvedIsTeacherForProgram && !resolvedIsStudioAdmin) {
        lessonsQuery = lessonsQuery.or(`teacher_id.is.null,teacher_id.eq.${user.id}`)
      }

      const { data: lessonsData, error: lessonsError } = await lessonsQuery
      if (lessonsError) {
        console.error('Error loading lessons for program:', lessonsError)
        setLessons([])
      } else {
        setLessons(lessonsData || [])
      }

      // Load attendance data for lessons (admin/teacher only)
      // Use server API (service role) because client reads can be blocked by RLS for teachers.
      if (resolvedCanManageProgram && lessonsData && lessonsData.length > 0) {
        const lessonIds = lessonsData.map(l => l.id);

        let attendances: any[] = []
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = (session as any)?.access_token;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`/api/attendances?lesson_ids=${encodeURIComponent(lessonIds.join(','))}`, {
            method: 'GET',
            headers,
          })

          if (res.ok) {
            const json = await res.json()
            attendances = Array.isArray(json?.attendances) ? json.attendances : []
          }
        } catch {
          attendances = []
        }

        // Build helper map: user_id -> enrollments for this program
        const enrollmentsByUser: Record<string, any[]> = {}
        ;(enrollmentsForProgram || []).forEach((e: any) => {
          if (!e?.user_id) return
          const uid = String(e.user_id)
          enrollmentsByUser[uid] = enrollmentsByUser[uid] || []
          enrollmentsByUser[uid].push(e)
        })

        const pickMainEnrollment = (list: any[]) => {
          if (!Array.isArray(list) || list.length === 0) return null
          const main = list.find((x: any) => !x?.sub_profile_id) || list[0]
          return main || null
        }

        // Build attendance map (keyed by enrollment_id when available, else user_id)
        const attendanceMap: Record<string, Record<string, string>> = {};
        attendances?.forEach(att => {
          if (!attendanceMap[att.lesson_id]) {
            attendanceMap[att.lesson_id] = {};
          }

          // If we have an enrollment_id, use it.
          if (att.enrollment_id) {
            const key = String(att.enrollment_id)
            attendanceMap[String(att.lesson_id)][key] = String(att.status);
            return
          }

          // Legacy rows (no enrollment_id): try to map to the right enrollment for display.
          const uid = att.user_id ? String(att.user_id) : null
          if (uid) {
            const userEnrolls = enrollmentsByUser[uid] || []
            if (userEnrolls.length === 1) {
              attendanceMap[att.lesson_id][String(userEnrolls[0].id)] = att.status
              return
            }
            if (userEnrolls.length > 1) {
              const main = pickMainEnrollment(userEnrolls)
              if (main?.id) {
                attendanceMap[att.lesson_id][String(main.id)] = att.status
                return
              }
            }
            // fallback: keep it on user_id key (may not render for subprofiles)
            attendanceMap[String(att.lesson_id)][uid] = String(att.status)
            return
          }
        });
        setAttendanceData(attendanceMap);

        // Load reported absences
        try {
          const q = `/api/lesson-absences?lesson_ids=${lessonIds.join(',')}`;
          const { data: { session } } = await supabase.auth.getSession();
          const token = (session as any)?.access_token;
          const headers: Record<string,string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await fetch(q, { method: 'GET', headers });
          if (res.ok) {
            const json = await res.json();
            const abs: any[] = json?.absences || [];
            const absencesByLesson: Record<string, any[]> = {};
            abs.forEach((a: any) => {
              if (!absencesByLesson[a.lesson_id]) {
                absencesByLesson[a.lesson_id] = [];
              }
              absencesByLesson[a.lesson_id].push(a);
            });
            setLessonAbsencesByLesson(absencesByLesson);
          }
        } catch (error) {
          console.error('Could not load reported absences:', error);
        }
      }

      if (!resolvedCanManageProgram) {
        setAttendanceData({})
        setLessonAbsencesByLesson({})
        setAttendanceEnabled(false)
      }

      // Check if attendance is enabled for this studio (admin/teacher only)
      if (resolvedCanManageProgram) {
        const { data: studioData2 } = await supabase
          .from('studios')
          .select('attendance_enabled')
          .eq('id', programData.studio_id)
          .single();

        setAttendanceEnabled(studioData2?.attendance_enabled || false);
      }

      // Load evaluation settings (per program) only for admins/teachers
      if (resolvedCanManageProgram) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = (session as any)?.access_token;
          if (token && programData?.studio_id) {
            const res = await fetch(`/api/studio/${programData.studio_id}/evaluation-settings?programId=${encodeURIComponent(programData.id)}`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
              const settings = await res.json();
              setEvaluationSettingsEnabled(!!settings.enabled);
              const defVis = (settings.default_visibility || 'hidden') as 'hidden' | 'visible_immediate' | 'visible_on_date'
              setEvaluationDefaultVisibility(defVis)
              setEvaluationMethod((settings.method || 'score') as any)
              setEvaluationCategories(Array.isArray(settings.categories) ? settings.categories : [])
              setEvaluationRatingScale(Array.isArray(settings.rating_scale) && settings.rating_scale.length > 0 ? settings.rating_scale : ['voldoende','goed','zeer goed','uitstekend'])
              setEvaluationPeriods(Array.isArray(settings.periods) ? settings.periods : [])
            } else {
              setEvaluationSettingsEnabled(false)
            }
          } else {
            setEvaluationSettingsEnabled(false)
          }
        } catch (err) {
          setEvaluationSettingsEnabled(false)
        }
      } else {
        setEvaluationSettingsEnabled(false)
      }

    } catch (error) {
      console.error('Error loading program data:', error);
    } finally {
      setLoading(false);
    }
  };

  const canEvaluate = !!(canManageProgram && evaluationFeatureEnabled && evaluationSettingsEnabled)

  const openEvaluationModal = () => {
    if (!studio || !program || !canEvaluate) return
    // Build initial forms for all students deterministically
    const studentsList = [...students, ...subStudents]
    const forms: Record<string, { score?: number; comment: string; categoryValues: Record<string, number | string> }> = {}
    studentsList.forEach(s => {
      const key = s.enrollment_id || s.user_id
      forms[key] = { score: undefined, comment: '', categoryValues: {} }
    })

    // start with none expanded
    setExpandedEvalUsers(new Set());

    // fetch existing evaluations for this program to prepopulate forms and saved flags
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = (session as any)?.access_token;
        const { data: { user } } = await supabase.auth.getUser();
        if (token) {
          const res = await fetch(`/api/studio/${studio.id}/evaluations?programId=${program.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (res.ok) {
            const data = await res.json()
            const savedMap: Record<string, boolean> = {}
            studentsList.forEach(s => {
              const key = s.enrollment_id || s.user_id
              savedMap[key] = false
            })

            // data is ordered newest first; build latest per row (prefer enrollment_id when present)
            const latestByKey: Record<string, any> = {}
            const latestByKeyFromThisTeacher: Record<string, any> = {}
            ;(data || []).forEach((ev: any) => {
              const key = ev.enrollment_id || ev.user_id
              const skey = String(key)
              if (!latestByKey[skey]) latestByKey[skey] = ev
              if (user && ev.teacher_id === user.id && !latestByKeyFromThisTeacher[skey]) {
                latestByKeyFromThisTeacher[skey] = ev
              }
            })

            // apply strictly per row key (no sharing to sub/main counterparts)
            studentsList.forEach(s => {
              const key = s.enrollment_id || s.user_id
              const ev = latestByKey[String(key)]
              if (ev) {
                savedMap[key] = true
                if (evaluationMethod === 'score' && typeof ev.score === 'number') forms[key].score = ev.score
                if (ev.comment) forms[key].comment = ev.comment
                if (ev.criteria) forms[key].categoryValues = ev.criteria
                // track existing id if created by this teacher so we can PUT
                const myEv = latestByKeyFromThisTeacher[String(key)]
                if (myEv) {
                  // store the specific evaluation id per row
                  setEvalExistingIds(prev => ({ ...prev, [key]: myEv.id }))
                }
              }
            })

            setEvalForms(forms)
            setEvalSaved(savedMap)
            setShowEvaluationModal(true)
            return
          }
        }
        // Fallback when token missing or response not ok
        setEvalForms(forms)
        setEvalSaved({})
        setShowEvaluationModal(true)
      } catch (err) {
        console.error('Could not preload evaluations:', err)
        setEvalForms(forms)
        setEvalSaved({})
        setShowEvaluationModal(true)
      }
    })()
  }

  const toggleExpandEvalUser = (userKey: string) => {
    setExpandedEvalUsers(prev => {
      // Single-user expand: if clicking open, collapse others
      const isOpen = prev.has(userKey)
      if (isOpen) {
        const next = new Set(prev)
        next.delete(userKey)
        return next
      }
      return new Set([userKey])
    })
  }

  const setEvalValue = (userKey: string, patch: Partial<{ score?: number; comment: string; categoryValues: Record<string, number | string> }>) => {
    setEvalForms(prev => {
      const mergedCategoryValues = patch.categoryValues ? { ...prev[userKey]?.categoryValues, ...patch.categoryValues } : (prev[userKey]?.categoryValues || {})
      let next = { ...prev[userKey], ...patch, categoryValues: mergedCategoryValues }

      // If there are evaluation categories and method is score/percent, auto-compute overall score
      if (evaluationCategories && evaluationCategories.length > 0 && (evaluationMethod === 'score' || evaluationMethod === 'percent')) {
        const vals: number[] = []
        evaluationCategories.forEach(cat => {
          const v = mergedCategoryValues?.[cat]
          if (typeof v === 'number') vals.push(v)
          else if (typeof v === 'string') {
            const n = parseFloat(v)
            if (!isNaN(n)) vals.push(n)
          }
        })
        if (vals.length > 0) {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length
          if (evaluationMethod === 'percent') {
            // store as 0..100 integer for percent
            const rounded = Math.max(0, Math.min(100, Math.round(avg)))
            next.score = rounded
          } else {
            // store with one decimal precision (1-10)
            const rounded = Math.max(1, Math.min(10, parseFloat(avg.toFixed(1))))
            next.score = rounded
          }
        }
      }

      return {
        ...prev,
        [userKey]: next
      }
    })
  }

  const saveEvaluationForUser = async (userKey: string) => {
    try {
      if (!studio || !program) return
      const form = evalForms[userKey] || { comment: '', categoryValues: {} }
      // Resolve actual user_id from the student lists
      const match = [...students, ...subStudents].find((s: any) => (s.enrollment_id || s.user_id) === userKey)
      const userId = match?.user_id
      if (!userId) {
        alert('Kon gebruiker niet vinden voor evaluatie')
        return
      }
      const { data: { session } } = await supabase.auth.getSession();
      const token = (session as any)?.access_token;
      if (!token) {
        alert('Niet ingelogd')
        return
      }
      // Build criteria numeric map
      const criteria: Record<string, number> = {}
      if (evaluationCategories.length > 0) {
        evaluationCategories.forEach(cat => {
          const val = form.categoryValues?.[cat]
          if (typeof val === 'number') criteria[cat] = val
          else if (typeof val === 'string' && evaluationMethod === 'rating') {
            const idx = evaluationRatingScale.indexOf(val)
            if (idx >= 0) criteria[cat] = idx + 1
          }
        })
      }
      const payload: any = {
        program_id: program.id,
        user_id: userId,
        enrollment_id: match?.enrollment_id || null,
        comment: form.comment || '',
        criteria,
        visibility_status: evaluationDefaultVisibility,
        visible_from: null
      }
      if ((evaluationMethod === 'score' || evaluationMethod === 'percent') && typeof form.score === 'number') {
        payload.score = form.score
        payload.score_max = evaluationMethod === 'percent' ? 100 : 10
      }
      const existingId = evalExistingIds[userKey]
      const url = existingId ? `/api/studio/${studio.id}/evaluations/${existingId}` : `/api/studio/${studio.id}/evaluations`
      const method = existingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Kon evaluatie niet opslaan')
      }
      // mark saved
      setEvalSaved(prev => ({ ...prev, [userKey]: true }))
      alert('Evaluatie opgeslagen')
    } catch (err) {
      console.error('saveEvaluationForUser error', err)
      alert('Fout bij het opslaan van de evaluatie')
    }
  }

  const updateAttendanceStatus = (lessonId: string, userId: string, status: 'present' | 'absent' | 'excused' | 'late') => {
    setAttendanceData(prev => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        [userId]: status
      }
    }));
    setPendingChanges(prev => new Set(prev).add(`${lessonId}-${userId}`));
  };

  const saveAttendance = async (lessonId: string) => {
    try {
      const lessonAttendances = attendanceData[lessonId] || {};
      // Build updates by iterating known students so we can attach enrollment_id where applicable
      const withEnrollment: any[] = []
      const withoutEnrollment: any[] = []
      const allStudents = [...students, ...subStudents]
      allStudents.forEach(s => {
        const key = s.enrollment_id || s.user_id
        const status = lessonAttendances[key]
        if (!status) return
        const row = {
          lesson_id: lessonId,
          user_id: s.user_id,
          enrollment_id: s.enrollment_id || null,
          status
        }
        if (s.enrollment_id) withEnrollment.push(row)
        else withoutEnrollment.push(row)
      })

      // Save via server API (service role) to avoid RLS blocking teachers.
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
        const newSet = new Set(prev);
        Array.from(newSet).forEach(key => {
          if (key.startsWith(`${lessonId}-`)) {
            newSet.delete(key);
          }
        });
        return newSet;
      });


      showSuccess('Aanwezigheid opgeslagen')
    } catch (error) {
      console.error('Error saving attendance:', error);
      const message = error instanceof Error ? error.message : null
      showError(message || 'Fout bij het opslaan van aanwezigheid')
    }
  };

  const isWithinAttendanceWindow = (lessonDate: string) => {
    // Studio admins can always mark attendance.
    if (isStudioAdmin) return true

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

  const getCapacityDisplay = () => {
    if (!program) return '';

    const shouldShowCapacity = program.show_capacity_to_users || isStudioAdmin;
    if (!shouldShowCapacity) return '';

    const capacity = program.capacity || 0;
    const available = capacity - enrolledCount;

    if (capacity === 0) return 'Onbeperkte capaciteit';
    if (available <= 0) return 'Volgeboekt';
    return `${available} van ${capacity} plaatsen beschikbaar`;
  };

  const getScheduleDisplay = () => {
    if (!program) return '';

    if (program.program_type === 'workshop' && program.workshop_details && program.workshop_details.length > 0) {
      const workshop = program.workshop_details[0];
      if (workshop.date && workshop.start_time && workshop.end_time) {
        return `${formatDateOnly(workshop.date)} • ${formatTimeStr(workshop.start_time)} - ${formatTimeStr(workshop.end_time)}`;
      }
      const startDate = new Date(workshop.start_datetime);
      const endDate = new Date(workshop.end_datetime);
      return `${formatDateOnly(startDate.toISOString())} • ${formatTimeFromDate(startDate.toISOString())} - ${formatTimeFromDate(endDate.toISOString())}`;
    }

    if (program.program_type === 'group' && program.group_details && program.group_details.length > 0) {
      const group = program.group_details[0];
      const weekday = weekdayNames[group.weekday];
      const startTime = formatTimeStr(group.start_time);
      const endTime = formatTimeStr(group.end_time);

      return `${weekday} • ${startTime} - ${endTime}`;
    }

    return '';
  };

  const getWeekdayOnly = () => {
    if (!program) return ''

    try {
      if (program.program_type === 'group' && program.group_details && program.group_details.length > 0) {
        const group = program.group_details[0]
        const raw = Number((group as any).weekday)
        if (!Number.isFinite(raw)) return ''
        // support 0=Zondag..6=Zaterdag or 1=Maandag..7=Zondag
        const idx = raw === 7 ? 0 : raw
        return weekdayNames[idx] || ''
      }

      if (program.program_type === 'workshop' && program.workshop_details && program.workshop_details.length > 0) {
        const workshop = program.workshop_details[0]
        const dateRaw = (workshop as any).date ?? (workshop as any).start_datetime
        if (!dateRaw) return ''
        const d = new Date(String(dateRaw))
        if (Number.isNaN(d.getTime())) return ''
        return weekdayNames[d.getDay()] || ''
      }

      return ''
    } catch {
      return ''
    }
  }

  const getTimeRangeOnly = () => {
    if (!program) return ''

    try {
      if (program.program_type === 'group' && program.group_details && program.group_details.length > 0) {
        const group = program.group_details[0]
        const startTime = formatTimeStr((group as any).start_time)
        const endTime = formatTimeStr((group as any).end_time)
        return startTime && endTime ? `${startTime} - ${endTime}` : (startTime || endTime || '')
      }

      if (program.program_type === 'workshop' && program.workshop_details && program.workshop_details.length > 0) {
        const workshop = program.workshop_details[0]
        const startTime = (workshop as any).start_time
          ? formatTimeStr((workshop as any).start_time)
          : (workshop as any).start_datetime
            ? formatTimeFromDate(String((workshop as any).start_datetime))
            : ''
        const endTime = (workshop as any).end_time
          ? formatTimeStr((workshop as any).end_time)
          : (workshop as any).end_datetime
            ? formatTimeFromDate(String((workshop as any).end_datetime))
            : ''
        return startTime && endTime ? `${startTime} - ${endTime}` : (startTime || endTime || '')
      }

      return ''
    } catch {
      return ''
    }
  }

  const getNextUpcomingLesson = () => {
    if (!lessons || lessons.length === 0) return null;
    const now = new Date();

    const parseLessonDateTime = (l: any) => {
      try {
        const dateRaw = l?.date
        if (!dateRaw) return null

        const base = typeof dateRaw === 'string'
          ? (dateRaw.includes('T') ? new Date(dateRaw) : new Date(`${dateRaw}T00:00:00`))
          : new Date(dateRaw)

        if (isNaN(base.getTime())) return null

        let h = 0
        let m = 0
        const timeRaw = String(l?.time || '')
        if (timeRaw) {
          if (timeRaw.includes('T')) {
            const t = new Date(timeRaw)
            if (!isNaN(t.getTime())) {
              h = t.getHours()
              m = t.getMinutes()
            }
          } else {
            const parts = timeRaw.split(':')
            h = parseInt(parts[0] || '0', 10) || 0
            m = parseInt(parts[1] || '0', 10) || 0
          }
        }

        base.setHours(h, m, 0, 0)
        return base
      } catch {
        return null
      }
    }

    const withDateTime = lessons
      .map((lesson) => ({ lesson, dt: parseLessonDateTime(lesson) }))
      .filter((x): x is { lesson: any; dt: Date } => x.dt instanceof Date && !isNaN(x.dt.getTime()))

    const upcoming = withDateTime
      .filter((x) => x.dt >= now)
      .sort((a, b) => a.dt.getTime() - b.dt.getTime())

    return upcoming[0]?.lesson || null
  };

  if (!shouldRender) return null

  if (loading) {
    const content = (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size={32} label="Laden" />
        <span className="ml-2 t-bodySm">Programma laden…</span>
      </div>
    )

    return renderMode === 'page' ? content : (
      <Modal isOpen={isOpen} onClose={onClose} contentClassName="max-w-4xl">
        {content}
      </Modal>
    )
  }

  if (!program || !studio) {
    const content = (
      <div className="text-center py-12">
        <p className="t-bodySm">Programma niet gevonden</p>
      </div>
    )

    return renderMode === 'page' ? content : (
      <Modal isOpen={isOpen} onClose={onClose} contentClassName="max-w-4xl">
        {content}
      </Modal>
    )
  }

  const mainContent = (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 t-bodySm mb-2">
              <Building2 className="w-4 h-4" />
              {canManageProgram ? (
                <Link href={`/studio/${studio.id}`} className="hover:text-blue-600">
                  {studio.naam}
                </Link>
              ) : (
                <span>{studio.naam}</span>
              )}
            </div>
            <h1 className="t-h1 font-bold mb-2">{program.title}</h1>
            {/* Always show the tags under the title */}
            <div className="flex items-center gap-2 mb-4">
              {/* program type tag */}
              <span className={`inline-flex items-center px-2 py-1 rounded-md t-caption t-noColor font-medium ${
                program.program_type === 'group' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : 
                program.program_type === 'workshop' ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200' :
                program.program_type === 'trial' || program.program_type === 'proefles' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' :
                'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200'
              }`}>
                {program.program_type === 'group' ? 'Cursus' : 
                 program.program_type === 'workshop' ? 'Workshop' :
                 program.program_type === 'trial' || program.program_type === 'proefles' ? 'Proefles' :
                 program.program_type}
              </span>

              {/* Always show the following tags: dance style, level, age info */}
              <div className="flex items-center gap-2">
                {program.dance_style && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md t-caption t-noColor font-medium ${getTagClass(program.dance_style)}`}>
                    {program.dance_style}
                  </span>
                )}
                {program.level && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md t-caption t-noColor font-medium ${getTagClass(program.level)}`}>
                    {program.level}
                  </span>
                )}
                {(program.min_age !== null && program.min_age !== undefined) && (program.max_age !== null && program.max_age !== undefined) && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md t-caption t-noColor font-medium ${getTagClass(`${program.min_age}-${program.max_age}`)}`}>
                    {program.min_age}-{program.max_age} jaar
                  </span>
                )}
                {(program.min_age !== null && program.min_age !== undefined) && (program.max_age === null || program.max_age === undefined) && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md t-caption t-noColor font-medium ${getTagClass(String(program.min_age))}`}>
                    {program.min_age}+ jaar
                  </span>
                )}
                {(program.max_age !== null && program.max_age !== undefined) && (program.min_age === null || program.min_age === undefined) && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md t-caption t-noColor font-medium ${getTagClass(String(program.max_age))}`}>
                    tot {program.max_age} jaar
                  </span>
                )}
                {(program.min_age === null || program.min_age === undefined) && (program.max_age === null || program.max_age === undefined) && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md t-caption t-noColor font-medium ${getTagClass('all')}`}>
                    Alle leeftijden
                  </span>
                )}
              </div>
            </div>

            {/* Info row below badges */}
            {isUserView ? (
              <div className="flex flex-wrap items-start gap-x-6 gap-y-2 mb-2 t-bodySm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">{viewerLabel || 'Jij'}</span>
                </div>

                {(() => {
                  const weekday = getWeekdayOnly()
                  return weekday ? (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">{weekday}</span>
                    </div>
                  ) : null
                })()}

                {(() => {
                  const timeRange = getTimeRangeOnly()
                  return timeRange ? (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">{timeRange}</span>
                    </div>
                  ) : null
                })()}

                {program.program_locations && program.program_locations.length > 0 ? (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-slate-500 mt-0.5" />
                    <div>
                      <div className="t-bodySm font-medium">{program.program_locations[0].locations.name}</div>
                      <div className="t-bodySm">
                        {[program.program_locations[0].locations.adres, program.program_locations[0].locations.postcode, program.program_locations[0].locations.city].filter(Boolean).join(' ')}
                      </div>
                    </div>
                  </div>
                ) : (
                  studio?.stad ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">{studio.stad}</span>
                    </div>
                  ) : null
                )}

                {/* Season dates */}
                {((program.season_start || program.season_end) ||
                  (program.group_details && program.group_details.length > 0 && (program.group_details[0].season_start || program.group_details[0].season_end)) ||
                  (program.workshop_details && program.workshop_details.length > 0 && (program.workshop_details[0].start_datetime || program.workshop_details[0].end_datetime))) && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span className="t-bodySm">
                      {(() => {
                        const seasonStart = program.season_start ||
                          (program.group_details && program.group_details.length > 0 ? program.group_details[0].season_start : null) ||
                          (program.workshop_details && program.workshop_details.length > 0 ? program.workshop_details[0].start_datetime : null);
                        const seasonEnd = program.season_end ||
                          (program.group_details && program.group_details.length > 0 ? program.group_details[0].season_end : null) ||
                          (program.workshop_details && program.workshop_details.length > 0 ? program.workshop_details[0].end_datetime : null);

                        return `${seasonStart ? formatDateOnly(seasonStart) : '—'} — ${seasonEnd ? formatDateOnly(seasonEnd) : ''}`;
                      })()}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-6 mb-2 t-bodySm">
                {program.program_locations && program.program_locations.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <div>
                      <div className="t-bodySm font-medium">{program.program_locations[0].locations.name}</div>
                      <div className="t-bodySm">
                        {[program.program_locations[0].locations.adres, program.program_locations[0].locations.postcode, program.program_locations[0].locations.city].filter(Boolean).join(' ')}
                      </div>
                    </div>
                  </div>
                ) : (
                  studio?.stad && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{studio.stad}</span>
                    </div>
                  )
                )}

                {/* Season dates */}
                {((program.season_start || program.season_end) ||
                  (program.group_details && program.group_details.length > 0 && (program.group_details[0].season_start || program.group_details[0].season_end)) ||
                  (program.workshop_details && program.workshop_details.length > 0 && (program.workshop_details[0].start_datetime || program.workshop_details[0].end_datetime))) && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span className="t-bodySm">
                      {(() => {
                        const seasonStart = program.season_start ||
                          (program.group_details && program.group_details.length > 0 ? program.group_details[0].season_start : null) ||
                          (program.workshop_details && program.workshop_details.length > 0 ? program.workshop_details[0].start_datetime : null);
                        const seasonEnd = program.season_end ||
                          (program.group_details && program.group_details.length > 0 ? program.group_details[0].season_end : null) ||
                          (program.workshop_details && program.workshop_details.length > 0 ? program.workshop_details[0].end_datetime : null);

                        return `${seasonStart ? formatDateOnly(seasonStart) : '—'} — ${seasonEnd ? formatDateOnly(seasonEnd) : ''}`;
                      })()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            {program.price && program.price > 0 && (
              <div className="t-h2 font-bold t-noColor text-green-700">
                €{program.price.toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {program.description && (
          <div className="prose prose-slate max-w-none">
            <p className="t-body leading-relaxed">{program.description}</p>
          </div>
        )}

        {/* Program Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Schedule */}
          {!isUserView && (
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-5 h-5 text-slate-600" />
                <h3 className="t-h4 font-semibold">Rooster</h3>
              </div>
              <p className="t-bodySm">{getScheduleDisplay()}</p>
            </div>
          )}

          {/* Next Upcoming Lesson */}
          <div className="rounded-lg">
            {(() => {
              const next = getNextUpcomingLesson();
              return (
                <button
                  onClick={() => next && setLessonDetailsId(next.id)}
                  className={`w-full text-left flex items-center justify-between border rounded-lg p-4 ${isUserView ? 'border-blue-200 bg-blue-50 hover:bg-blue-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className={`w-5 h-5 ${isUserView ? 'text-blue-600' : 'text-slate-600'}`} />
                      <h3 className={`t-h4 font-semibold ${isUserView ? 'text-blue-900' : ''}`}>Volgende les</h3>
                    </div>
                    <div className={`t-bodySm ${isUserView ? 'text-blue-700' : ''}`}>
                      {(() => {
                        if (!next) return 'Geen komende lessen';
                        const endTime = formatEndTime(next.time, next.duration_minutes || 0);
                        return `${formatDateOnly(next.date)} • ${formatTimeStr(next.time)}${endTime ? ` - ${endTime}` : ''}`;
                      })()}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${isUserView ? 'text-blue-400' : 'text-slate-400'}`} />
                </button>
              );
            })()}
          </div>

          {/* Capacity */}
          {(program.show_capacity_to_users || isStudioAdmin) && (
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-slate-600" />
                <h3 className="t-h4 font-semibold">Capaciteit</h3>
              </div>
              <p className="t-bodySm">{getCapacityDisplay()}</p>
            </div>
          )}
        </div>

        {/* Students List (admin/teacher only) */}
        {canManageProgram && (
  <div className="bg-white no-gradient rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-600" />
              <h2 className="t-h3 font-semibold">Ingeschreven Studenten</h2>
              <span className="t-caption">({students.length + subStudents.length})</span>
            </div>
            <div className="flex items-center gap-3">
              {canEvaluate && (
                <button
                  onClick={openEvaluationModal}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 t-button t-noColor font-medium"
                >
                  Evalueren
                </button>
              )}
              <button
                onClick={() => setShowStudents(!showStudents)}
                className="t-bodySm font-medium hover:opacity-80"
              >
                {showStudents ? 'Verberg leden' : 'Toon leden'}
              </button>
            </div>
          </div>

          {showStudents && (
            (students.length + subStudents.length) === 0 ? (
              <p className="t-bodySm">Nog geen studenten ingeschreven.</p>
            ) : (
              <div className="space-y-2">
                {students.length > 0 && (
                  <div className="space-y-2">
                    {students.map((student) => (
                      <div
                        key={student.enrollment_id || student.user_id}
                        className="flex items-center gap-3 p-3 bg-slate-50 no-gradient rounded-lg border border-slate-200"
                      >
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="t-bodySm t-noColor text-blue-600 font-medium">
                            {student.first_name?.[0]?.toUpperCase() || student.email[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="t-bodySm font-medium">
                            {student.first_name && student.last_name
                              ? `${student.first_name} ${student.last_name}`
                              : 'Naam niet ingevuld'}
                          </div>
                          <div className="t-bodySm">{student.email}</div>
                        </div>
                        {/* Evalueren knop verplaatst naar globale knop bovenaan */}
                      </div>
                    ))}
                  </div>
                )}

                {subStudents.length > 0 && (
                  <div className="space-y-2">
                    {subStudents.map((student) => (
                      <div
                        key={student.enrollment_id || student.user_id}
                        className="flex items-center gap-3 p-3 bg-slate-50 no-gradient rounded-lg border border-slate-200"
                      >
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="t-bodySm t-noColor text-blue-600 font-medium">
                            {student.first_name?.[0]?.toUpperCase() || student.email[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="t-bodySm font-medium">
                            {student.first_name && student.last_name
                              ? `${student.first_name} ${student.last_name}`
                              : 'Naam niet ingevuld'}
                          </div>
                          <div className="t-bodySm">{student.email}</div>
                          {student.is_sub_profile && student.parent_name && <div className="t-caption">Ouder: {student.parent_name}</div>}
                        </div>
                        {/* Evalueren knop verplaatst naar globale knop bovenaan */}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
        )}

        {/* Lessons Overview - always visible (show Alle lessen for all roles, including teachers) */}
        {lessons.length > 0 && (
          <div className="bg-white no-gradient rounded-lg border border-slate-200 p-6">
            <h2 className="t-h3 font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-600" />
              Alle lessen
            </h2>
            <div className="space-y-3">
              {lessons.map((lesson) => {
                const endTime = formatEndTime(lesson.time, lesson.duration_minutes || 0);
                return (
                  <button
                    key={lesson.id}
                    onClick={() => setLessonDetailsId(lesson.id)}
                    className="w-full text-left flex items-center justify-between border border-slate-200 rounded-lg p-4 hover:bg-slate-50"
                  >
                    <div>
                      <div className="t-bodySm font-medium">{lesson.title}</div>
                      <div className="t-bodySm">
                        {formatDateOnly(lesson.date)} • {formatTimeStr(lesson.time)}{endTime ? ` - ${endTime}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Attendance saved indicator: green when saved, orange when not saved (for managers) */}
                      {(() => {
                        if (!attendanceEnabled) return null
                        const saved = attendanceData[lesson.id] && Object.keys(attendanceData[lesson.id] || {}).length > 0
                        if (saved) return <span title="Aanwezigheid opgeslagen" className="w-3 h-3 rounded-full bg-green-500" />
                        if (canManageProgram) return <span title="Aanwezigheid nog niet opgeslagen" className="w-3 h-3 rounded-full bg-amber-500" />
                        return null
                      })()}
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Attendance Feature Notice (admin/teacher only) */}
        {canManageProgram && !attendanceEnabled && lessons.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="t-h4 t-noColor font-semibold text-amber-900 mb-1">
                  Aanwezigheid tracking is uitgeschakeld
                </h3>
                <p className="t-bodySm t-noColor text-amber-800">
                  De studio admin moet aanwezigheid tracking inschakelen in de studio instellingen voordat je aanwezigheid kunt bijhouden.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Lessons and Attendance (studio admins only) - hide this block for teachers to avoid confusion */}
        {isStudioAdmin && attendanceEnabled && lessons.length > 0 && (
          <div className="bg-white no-gradient rounded-lg border border-slate-200 p-6">
            <h2 className="t-h3 font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-600" />
              Lessen & Aanwezigheid
            </h2>

            <div className="space-y-4">
              {lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setLessonDetailsId(lesson.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setLessonDetailsId(lesson.id);
                    }
                  }}
                  className="border border-slate-200 rounded-lg p-4 cursor-pointer hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="t-h4 font-semibold">{lesson.title}</h3>
                      <p className="t-bodySm">
                        {new Date(lesson.date).toLocaleDateString('nl-NL')}
                        {lesson.time && ` • ${lesson.time.substring(0, 5)}`}
                        {lesson.duration_minutes && ` (${lesson.duration_minutes} min)`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Absence indicator */}
                      {(() => {
                        const attMap = attendanceData[lesson.id] || {};
                        const teacherAbsentIds = Object.entries(attMap).filter(([, status]) => status === 'absent').map(([uid]) => uid);
                        const reported = lessonAbsencesByLesson[lesson.id] || [];
                        // Build keys that uniquely identify whether an absence applies to an enrollment or a user
                        const reportedKeys = reported.map((r:any) => r.enrollment_id ? `e:${r.enrollment_id}` : `u:${r.user_id}`).filter(Boolean);
                        const combined = Array.from(new Set([...teacherAbsentIds.map(id => `u:${id}`), ...reportedKeys]));
                        const absCount = combined.length;
                        return absCount > 0 ? (
                          <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-red-50 text-red-700 t-bodySm t-noColor font-medium">
                            <UserMinus className="w-4 h-4" />
                            <span>{absCount}</span>
                          </span>
                        ) : null;
                      })()}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLesson(selectedLesson === lesson.id ? null : lesson.id);
                        }}
                        className="t-bodySm font-medium hover:opacity-80"
                      >
                        {selectedLesson === lesson.id ? 'Verberg' : 'Aanwezigheid bijhouden'}
                      </button>

                      {/* Replacement request button for teachers/admins */}
                      {canManageProgram && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplacementLessonId(lesson.id);
                          }}
                          className="t-bodySm font-medium hover:opacity-80"
                        >
                          Vraag vervanging aan
                        </button>
                      )}
                    </div>
                  </div>

                  {selectedLesson === lesson.id && (
                    <div className="mt-4 space-y-3">
                      {(() => {
                        const allStudents = [...students, ...subStudents];
                        return allStudents.map((student: any) => {
                          const currentStatus = attendanceData[lesson.id]?.[student.enrollment_id || student.user_id];
                          const canMark = isWithinAttendanceWindow(String(lesson.date)) && attendanceEnabled;
                          const reported = (lessonAbsencesByLesson[lesson.id] || []).some((r: any) => {
                            // If the student has an enrollment_id, prefer matching by enrollment_id so sub-profiles are independent
                            if (student.enrollment_id) {
                              return r.enrollment_id && String(r.enrollment_id) === String(student.enrollment_id)
                            }
                            // Fallback: match by user_id for legacy rows or for enrollments without an id
                            return String(r.user_id) === String(student.user_id)
                          });

                          return (
                            <div key={student.enrollment_id || student.user_id} className="flex items-center justify-between p-2 bg-slate-50 no-gradient rounded">
                              <div className="t-bodySm font-medium">
                                {student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : student.email}
                                {student.is_sub_profile && student.parent_name && <div className="t-caption">Ouder: {student.parent_name}</div>}
                              </div>
                              <div className="flex items-center gap-2">
                                {reported ? (
                                  <span className="t-bodySm t-noColor text-red-600 font-semibold">Afwezig gemeld</span>
                                ) : (
                                  <>
                                    <button
                                      title={canMark ? '' : 'Aanwezigheid kan vanaf de lesdatum tot 14 dagen erna (en als de studio dit heeft ingeschakeld).'}
                                      onClick={() => canMark && updateAttendanceStatus(lesson.id, student.enrollment_id || student.user_id, 'present')}
                                      disabled={!canMark}
                                      className={`px-2 py-1 rounded-md t-caption t-noColor font-medium transition-all ${
                                        currentStatus === 'present' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
                                      } ${!canMark ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                      Aanwezig
                                    </button>
                                    <button
                                      title={canMark ? '' : 'Aanwezigheid kan vanaf de lesdatum tot 14 dagen erna (en als de studio dit heeft ingeschakeld).'}
                                      onClick={() => canMark && updateAttendanceStatus(lesson.id, student.enrollment_id || student.user_id, 'absent')}
                                      disabled={!canMark}
                                      className={`px-2 py-1 rounded-md t-caption t-noColor font-medium transition-all ${
                                        currentStatus === 'absent' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
                                      } ${!canMark ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                      Afwezig
                                    </button>
                                    {(attendanceAllowLate || isStudioAdmin) && (
                                      <button
                                        title={canMark ? '' : 'Aanwezigheid kan vanaf de lesdatum tot 14 dagen erna (en als de studio dit heeft ingeschakeld).'}
                                        onClick={() => canMark && updateAttendanceStatus(lesson.id, student.enrollment_id || student.user_id, 'late')}
                                        disabled={!canMark}
                                        className={`px-2 py-1 rounded-md t-caption t-noColor font-medium transition-all ${
                                          currentStatus === 'late' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                        } ${!canMark ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        Te laat
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })
                      })()}
                      
                      {/* Save Button */}
                      {Array.from(pendingChanges).some(key => key.startsWith(`${lesson.id}-`)) && (
                        <div className="flex justify-end pt-2 border-t border-slate-200">
                          <button
                            onClick={() => saveAttendance(lesson.id)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium t-button t-noColor transition-colors"
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
  )

  return (
    <>
      {renderMode === 'page' ? (
        !replacementLessonId ? mainContent : null
      ) : (
        <Modal isOpen={isOpen && !replacementLessonId} onClose={onClose} contentClassName="max-w-4xl">
          {mainContent}
        </Modal>
      )}

        {showEvaluationModal && (
          <Modal isOpen={showEvaluationModal} onClose={() => setShowEvaluationModal(false)}>
            <div className="p-6 max-w-3xl">
              <h2 className="t-h2 font-bold mb-4">Evaluaties</h2>

              {/* Period filter (from settings, optional) */}
              {evaluationPeriods.length > 0 && (
                <div className="mb-6">
                  <label className="block t-label font-medium mb-2">Periode</label>
                  <FormSelect value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
                    <option value="">Alle periodes</option>
                    {evaluationPeriods.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </FormSelect>
                </div>
              )}

              {/* Users list with expand/collapse */}
              <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
                {[...students, ...subStudents].map((s: any) => {
                  const userKey = s.enrollment_id || s.user_id
                  const isOpen = expandedEvalUsers.has(userKey)
                  const form = evalForms[userKey] || { score: (evaluationMethod === 'score' ? 5 : (evaluationMethod === 'percent' ? 50 : undefined)), comment: '', categoryValues: {} }
                  return (
                            <div key={userKey} className="border border-slate-200 rounded-lg">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                        onClick={() => toggleExpandEvalUser(userKey)}
                      >
                        <div className="text-left">
                          <div className="t-bodySm font-medium">
                            {s.first_name && s.last_name ? `${s.first_name} ${s.last_name}` : s.email}
                          </div>
                          {s.parent_name && <div className="t-caption">Ouder: {s.parent_name}</div>}
                        </div>
                                <div className="flex items-center gap-3">
                                  {evalSaved[userKey] ? (
                                    <Check className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Circle className="w-3 h-3 text-slate-400" />
                                  )}
                                  <div className="t-bodySm font-medium">{isOpen ? 'Sluit' : 'Open'}</div>
                                </div>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 space-y-4">
                          {(evaluationMethod === 'score' || evaluationMethod === 'percent') && (
                            <div>
                              <label className="block t-label font-medium mb-2">
                                {evaluationMethod === 'percent' ? '% (punten op 100)' : 'Score (1-10)'}{evaluationCategories.length > 0 ? ' — automatisch uit categorieën' : ''}
                              </label>
                              {evaluationCategories.length > 0 ? (
                                <div className="w-full rounded-lg border border-slate-300 px-4 py-2 bg-slate-50 t-bodySm">
                                  {formatOneDecimalComma(typeof form.score === 'number' ? form.score : undefined)}
                                </div>
                              ) : (
                                <input
                                  type="number"
                                  min={evaluationMethod === 'percent' ? 0 : 1}
                                  max={evaluationMethod === 'percent' ? 100 : 10}
                                  step={evaluationMethod === 'percent' ? 1 : 0.5}
                                  value={typeof form.score === 'number' ? form.score : ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    if (val === '') {
                                      setEvalValue(userKey, { score: undefined })
                                      return
                                    }
                                    const raw = parseFloat(val || '0')
                                    if (evaluationMethod === 'percent') {
                                      const v = Math.round(Number.isNaN(raw) ? 0 : raw)
                                      const clamped = Math.max(0, Math.min(100, v))
                                      setEvalValue(userKey, { score: clamped })
                                    } else {
                                      const v = roundToHalf(Number.isNaN(raw) ? 0 : raw)
                                      const clamped = Math.max(1, Math.min(10, v))
                                      setEvalValue(userKey, { score: clamped })
                                    }
                                  }}
                                  className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              )}
                            </div>
                          )}

                          {evaluationCategories.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {evaluationCategories.map(cat => (
                                <div key={cat}>
                                  <label className="block t-label font-medium mb-2">{cat}</label>
                                  {evaluationMethod === 'rating' ? (
                                    <FormSelect
                                      value={(form.categoryValues?.[cat] as string) || ''}
                                      onChange={(e) => setEvalValue(userKey, { categoryValues: { [cat]: e.target.value } })}
                                    >
                                      <option value="">—</option>
                                      {evaluationRatingScale.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                      ))}
                                    </FormSelect>
                                  ) : (
                                    <input
                                      type="number"
                                      min={evaluationMethod === 'percent' ? 0 : 1}
                                      max={evaluationMethod === 'percent' ? 100 : 10}
                                      step={evaluationMethod === 'percent' ? 1 : 0.5}
                                      value={typeof form.categoryValues?.[cat] === 'number' ? (form.categoryValues?.[cat] as number) : (evaluationMethod === 'percent' ? 50 : 5)}
                                      onChange={(e) => {
                                        const raw = parseFloat(e.target.value || '0')
                                        if (evaluationMethod === 'percent') {
                                          const v = Math.round(Number.isNaN(raw) ? 0 : raw)
                                          const clamped = Math.max(0, Math.min(100, v))
                                          setEvalValue(userKey, { categoryValues: { [cat]: clamped } })
                                        } else {
                                          const v = roundToHalf(Number.isNaN(raw) ? 0 : raw)
                                          const clamped = Math.max(1, Math.min(10, v))
                                          setEvalValue(userKey, { categoryValues: { [cat]: clamped } })
                                        }
                                      }}
                                      className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div>
                            <label className="block t-label font-medium mb-2">Feedback</label>
                            <textarea
                              rows={3}
                              value={form.comment}
                              onChange={(e) => setEvalValue(userKey, { comment: e.target.value })}
                              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() => saveEvaluationForUser(userKey)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium t-button t-noColor"
                            >
                              Opslaan
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

                          {/* Bottom close button removed; use top X or outside click to close */}
            </div>
          </Modal>
        )}

    {canManageProgram && replacementLessonId && program && (
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

    {/* Lesson Details Modal */}
    {lessonDetailsId && program && (
      (() => {
        const lesson = lessons.find(l => l.id === lessonDetailsId);
        if (!lesson) return null;
        if (!canManageProgram) {
          return (
            <UserLessonDetailsModal
              isOpen={!!lessonDetailsId}
              onClose={() => setLessonDetailsId(null)}
              program={program}
              lesson={lesson}
            />
          )
        }

        return (
          <TeacherLessonDetailsModal
            isOpen={!!lessonDetailsId}
            onClose={() => setLessonDetailsId(null)}
            program={program}
            lesson={lesson}
            students={students as any}
            subStudents={subStudents as any}
            attendanceEnabled={attendanceEnabled}
            attendanceAllowLate={attendanceAllowLate}
            isStudioAdmin={isStudioAdmin}
            attendanceData={attendanceData}
            lessonAbsencesByLesson={lessonAbsencesByLesson}
            updateAttendanceStatus={updateAttendanceStatus}
            saveAttendance={saveAttendance}
            onRequestReplacement={(lid) => {
              // Ensure the replacement modal appears on top by closing lesson details first.
              setLessonDetailsId(null);
              setReplacementLessonId(lid);
            }}
          />
        );
      })()
    )}
  </>
);
}
