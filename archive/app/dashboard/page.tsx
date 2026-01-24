'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext'
import { useDevice } from '@/contexts/DeviceContext'
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Calendar, Building2, Clock, ArrowRight, User, FileText, ChevronRight, Check } from 'lucide-react';
import TeacherLessonDetailsModal from '@/components/TeacherLessonDetailsModal';
import ReplacementRequestModal from '@/components/ReplacementRequestModal';
import { formatDateOnly, formatTimeStr } from '@/lib/formatting';
import Tag from '@/components/ui/Tag';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import TimesheetModal from '@/components/TimesheetModal';
import CoursesModal from '@/components/CoursesModal';
import ProgramDetailModal from '@/components/ProgramDetailModal';
import UserProgramDetailModal from '@/components/user/UserProgramDetailModal';

interface NextLesson {
  id: string;
  program_id: string;
  program_title: string;
  dance_style: string;
  studio_name: string;
  location: string;
  next_session_date: string;
  start_time: string;
  end_time: string;
  program_type: string;
}

export default function UserDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams()
  const { isMobile } = useDevice()
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [nextLesson, setNextLesson] = useState<NextLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStudioOnly] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [isTeacher, setIsTeacher] = useState(false);
  const [teacherNextLessons, setTeacherNextLessons] = useState<any[]>([]);
  const [teacherPendingAttendanceCount, setTeacherPendingAttendanceCount] = useState<number>(0);
  const [teacherPendingAttendanceLessonId, setTeacherPendingAttendanceLessonId] = useState<string | null>(null);
  const [teacherDraftTimesheetsCount, setTeacherDraftTimesheetsCount] = useState<number>(0);
  const [teacherRecentPayrollsCount, setTeacherRecentPayrollsCount] = useState<number>(0);
  const [showTimesheetModal, setShowTimesheetModal] = useState(false);
  const [timesheetModalInitialTab, setTimesheetModalInitialTab] = useState<'timesheets' | 'payrolls'>('timesheets');
  const [showCoursesModal, setShowCoursesModal] = useState(false);
  const [showProgramDetailModal, setShowProgramDetailModal] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [programDetailView, setProgramDetailView] = useState<'user' | 'manage'>('user')
  const [showTeacherLessonModalFor, setShowTeacherLessonModalFor] = useState<string>('');
  const [teacherLessonContext, setTeacherLessonContext] = useState<any | null>(null);
  const [teacherLessonProgram, setTeacherLessonProgram] = useState<any | null>(null);
  const [teacherLessonStudents, setTeacherLessonStudents] = useState<any[]>([]);
  const [teacherLessonSubStudents, setTeacherLessonSubStudents] = useState<any[]>([]);
  const [teacherLessonAttendanceEnabled, setTeacherLessonAttendanceEnabled] = useState<boolean>(false);
  const [teacherLessonAttendanceAllowLate, setTeacherLessonAttendanceAllowLate] = useState<boolean>(true);
  const [teacherLessonAttendanceData, setTeacherLessonAttendanceData] = useState<Record<string, Record<string, string>>>({});
  const [teacherLessonAbsencesByLesson, setTeacherLessonAbsencesByLesson] = useState<Record<string, any[]>>({});
  const [replacementLessonId, setReplacementLessonId] = useState<string | null>(null);

  type TeacherActionPointKey = 'attendance' | 'timesheets' | 'payrolls'
  type TeacherActionPointSeen = Record<TeacherActionPointKey, boolean>
  const defaultTeacherActionPointSeen: TeacherActionPointSeen = { attendance: false, timesheets: false, payrolls: false }
  const [teacherActionPointSeen, setTeacherActionPointSeen] = useState<TeacherActionPointSeen>(defaultTeacherActionPointSeen)

  // Allow deep-linking back into the teacher finance modal from detail pages.
  // Example: /dashboard?teacherFinanceModal=1&tab=timesheets
  useEffect(() => {
    if (!isTeacher) return
    const open = searchParams?.get('teacherFinanceModal')
    if (open !== '1') return

    const tabParam = searchParams?.get('tab')
    const tab: 'timesheets' | 'payrolls' = tabParam === 'payrolls' ? 'payrolls' : 'timesheets'

    setTimesheetModalInitialTab(tab)
    setShowTimesheetModal(true)

    // Clean URL so refreshes don't keep reopening the modal.
    try {
      if (typeof window === 'undefined') return
      const url = new URL(window.location.href)
      url.searchParams.delete('teacherFinanceModal')
      url.searchParams.delete('tab')
      const next = `${url.pathname}${url.search}${url.hash}`
      router.replace(next)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, searchParams])

  useEffect(() => {
    if (!currentUserId) return
    try {
      const storageKey = `hub3.teacherActionPointsSeen.v1.${currentUserId}`
      const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(storageKey) : null
      if (!raw) return
      const parsed = JSON.parse(raw)
      setTeacherActionPointSeen({
        ...defaultTeacherActionPointSeen,
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
      })
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) return
    try {
      const storageKey = `hub3.teacherActionPointsSeen.v1.${currentUserId}`
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(storageKey, JSON.stringify(teacherActionPointSeen))
      }
    } catch {
      // ignore
    }
  }, [currentUserId, teacherActionPointSeen])

  const openTeacherLessonModal = async (lesson: any) => {
    try {
      setTeacherLessonContext(lesson);
      setShowTeacherLessonModalFor(String(lesson.lesson_id));

      // Load program details (including locations)
      const { data: programData } = await supabase
        .from('programs')
        .select('*, program_locations(location_id, locations(*)), group_details(*), workshop_details(*), studio_id')
        .eq('id', lesson.program_id)
        .single();
      setTeacherLessonProgram(programData || null);

      // Load studio features to get attendance flags
      if (programData?.studio_id) {
        const { data: studioData } = await supabase
          .from('studios')
          .select('id, features, attendance_enabled')
          .eq('id', programData.studio_id)
          .single();
        setTeacherLessonAttendanceEnabled(!!studioData?.attendance_enabled);
        const allowLate = (studioData?.features && typeof studioData.features['attendance_allow_late'] !== 'undefined')
          ? Boolean(studioData.features['attendance_allow_late'])
          : true;
        setTeacherLessonAttendanceAllowLate(allowLate);
      } else {
        setTeacherLessonAttendanceEnabled(false);
        setTeacherLessonAttendanceAllowLate(true);
      }

      // Load enrollments for participants (students and subprofiles)
      const { data: enrollments } = await supabase
        .from('inschrijvingen')
        .select('id, user_id, status, sub_profile_id, profile_snapshot')
        .eq('program_id', lesson.program_id);

      if (enrollments && enrollments.length > 0) {
        const userIds = Array.from(new Set(enrollments.map((e: any) => e.user_id).filter(Boolean)));
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('user_id, email, first_name, last_name')
          .in('user_id', userIds);
        const profilesMap: Record<string, any> = {};
        (profilesData || []).forEach(p => { profilesMap[p.user_id] = p });

        const mainEnrollments = enrollments.filter((e: any) => !e.profile_snapshot);
        const subEnrollments = enrollments.filter((e: any) => !!e.profile_snapshot);

        const mainStudentsList = mainEnrollments.map((e: any) => {
          const snapshot = e.profile_snapshot || null;
          const prof = profilesMap[e.user_id];
          const email = snapshot?.email || prof?.email || '';
          const first_name = snapshot?.first_name || snapshot?.voornaam || prof?.first_name || '';
          const last_name = snapshot?.last_name || prof?.last_name || '';
          return { enrollment_id: e.id, user_id: e.user_id, email, first_name, last_name };
        });
        const subStudentsList = subEnrollments.map((e: any) => {
          const snapshot = e.profile_snapshot || {};
          const prof = profilesMap[e.user_id];
          const email = snapshot?.email || prof?.email || '';
          const first_name = snapshot?.first_name || snapshot?.voornaam || '';
          const last_name = snapshot?.last_name || '';
          const parent_name = prof ? `${prof.first_name || ''} ${prof.last_name || ''}`.trim() : '';
          return { enrollment_id: e.id, user_id: e.user_id, email, first_name, last_name, parent_name };
        });
        setTeacherLessonStudents(mainStudentsList);
        setTeacherLessonSubStudents(subStudentsList);
      } else {
        setTeacherLessonStudents([]);
        setTeacherLessonSubStudents([]);
      }

      // Load attendance data for this lesson
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = (session as any)?.access_token;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/attendances?lesson_ids=${encodeURIComponent(String(lesson.lesson_id))}`, {
          method: 'GET',
          headers,
        });

        if (res.ok) {
          const json = await res.json();
          const attendances: any[] = json?.attendances || [];
          const attendanceMap: Record<string, Record<string, string>> = {};
          (attendances || []).forEach((att: any) => {
            const lid = String(att.lesson_id);
            if (!attendanceMap[lid]) attendanceMap[lid] = {};
            const key = att.enrollment_id ? String(att.enrollment_id) : String(att.user_id);
            attendanceMap[lid][key] = String(att.status);
          });
          setTeacherLessonAttendanceData(attendanceMap);
        } else {
          setTeacherLessonAttendanceData({});
        }
      } catch {
        setTeacherLessonAttendanceData({});
      }

      // Load reported absences via API
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = (session as any)?.access_token;
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`/api/lesson-absences?lesson_ids=${lesson.lesson_id}`, { method: 'GET', headers });
        if (res.ok) {
          const json = await res.json();
          const abs: any[] = json?.absences || [];
          const absencesByLesson: Record<string, any[]> = {};
          abs.forEach((a: any) => {
            if (!absencesByLesson[a.lesson_id]) absencesByLesson[a.lesson_id] = [];
            absencesByLesson[a.lesson_id].push(a);
          });
          setTeacherLessonAbsencesByLesson(absencesByLesson);
        }
      } catch {
        // ignore
      }
    } catch (e) {
      console.error('Failed to open teacher lesson modal context', e);
    }
  };
  const { theme } = useTheme();

  // Helper function to calculate end time from start time and duration
  const formatEndTime = (startTime: string | null, durationMinutes: number): string => {
    if (!startTime) return '';
    try {
      const [hours, minutes] = startTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + durationMinutes;
      const endHours = Math.floor(totalMinutes / 60) % 24;
      const endMinutes = totalMinutes % 60;
      return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  useEffect(() => {
    checkAccessAndLoadData();
  }, []);

  const checkAccessAndLoadData = async () => {
    try {
      const { data: { user } } = await Promise.race([
        supabase.auth.getUser(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Auth check timed out')), 5000)),
      ])
      if (!user) {
        setLoading(false);
        router.replace('/auth/login?redirect=/dashboard');
        return;
      }

      // Safety net: force profile completion before allowing dashboard usage.
      try {
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('profile_completed')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!prof || prof.profile_completed !== true) {
          setLoading(false)
          router.replace('/auth/complete-profile')
          return
        }
      } catch {
        setLoading(false)
        router.replace('/auth/complete-profile')
        return
      }

      // Do not redirect studio members/admins away from the user dashboard.
      // Post-login routing is handled in the login flow; here we always load user dashboard.

      // If access is OK, load dashboard data
      await loadDashboardData();
    } catch (error) {
      console.error('Error checking access:', error);
      setLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await Promise.race([
        supabase.auth.getUser(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Auth check timed out')), 5000)),
      ])
      if (!user) {
        return
      }

      setCurrentUserId(String(user.id))

      // Check if user is a teacher
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      let userIsTeacher = userRole?.role === 'teacher';
      // Fallback: consider user a teacher if they are assigned to any programs or lessons
      if (!userIsTeacher) {
        const { data: teacherPrograms } = await supabase
          .from('teacher_programs')
          .select('program_id')
          .eq('teacher_id', user.id)
          .limit(1);
        if (teacherPrograms && teacherPrograms.length > 0) {
          userIsTeacher = true;
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayISO = today.toISOString().split('T')[0];
          const { data: teacherLessons } = await supabase
            .from('lessons')
            .select('id')
            .eq('teacher_id', user.id)
            .gte('date', todayISO)
            .limit(1);
          if (teacherLessons && teacherLessons.length > 0) {
            userIsTeacher = true;
          }
        }
      }
      setIsTeacher(userIsTeacher);

      // Get user profile
      
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        const firstName = (profile.first_name || '').toString().trim()
        setUserName(firstName || 'daar');
      }

      // Load teacher lessons if user is a teacher (independent of student enrollments)
      console.info('[Dashboard] About to check teacher, userIsTeacher =', userIsTeacher, 'user.id =', user.id);
      if (userIsTeacher) {
        console.info('[Dashboard] Inside teacher block, about to load lessons');
        await loadTeacherLessons(user.id);
        
        // Also fetch service role debug info
        // Removed debug API fetch
      }

      // Get user's enrollments (accept multiple status variants to be robust)
      
      const { data: enrollments } = await supabase
        .from('inschrijvingen')
        .select(`
          id,
          program_id,
          status,
          programs (
            id,
            title,
            dance_style,
            program_type,
            studio_id,
            studios (
              naam,
              location
            ),
            group_details(*),
            workshop_details(*)
          )
        `)
        .eq('user_id', user.id);

      if (!enrollments || enrollments.length === 0) {
        return;
      }

      // Get program IDs from enrollments. Some rows may include nested `programs` and missing program_id.
      const programIds = (enrollments || [])
        .filter((e: any) => {
          // treat various status values as active
          const s = (e.status || '').toString().toLowerCase();
          return s === 'actief' || s === 'active' || s === 'ingeschreven' || s === '';
        })
        .map((e: any) => e.program_id || (e.programs && e.programs.id))
        .filter(Boolean);
      console.info('[Dashboard] User enrollments:', enrollments.length);
      console.info('[Dashboard] Program IDs:', programIds);

      // Fetch actual upcoming lessons from lessons table
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString().split('T')[0];
      console.info('[Dashboard] Fetching lessons from date:', todayISO);

      // First try a simpler query without embedded selects
      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, title, date, time, duration_minutes, program_id, location_id')
        .in('program_id', programIds)
        .gte('date', todayISO)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(5);

      console.info('[Dashboard] Lessons query result:', { 
        lessonsData, 
        lessonsError, 
        count: lessonsData?.length 
      });

      if (lessonsError) {
        console.error('[Dashboard] Error fetching lessons:', lessonsError);
      }

      // If we have lessons, enrich them with program and location data
      let nextSession: NextLesson | null = null;

      if (lessonsData && lessonsData.length > 0) {
        const lesson = lessonsData[0];
        console.info('[Dashboard] First lesson:', lesson);
        
        // Fetch program details separately
        const { data: programData } = await supabase
          .from('programs')
          .select('id, title, dance_style, program_type, studio_id, studios(naam)')
          .eq('id', lesson.program_id)
          .single();

        console.info('[Dashboard] Program data:', programData);

        // Fetch location details if available
        let locationName = 'Geen locatie';
        if (lesson.location_id) {
          const { data: locationData } = await supabase
            .from('locations')
            .select('name, adres, city')
            .eq('id', lesson.location_id)
            .single();
          
          if (locationData) {
            locationName = locationData.name || locationData.adres || 'Geen locatie';
          }
        }

        const program = programData as any;

        nextSession = {
          id: lesson.id,
          program_id: lesson.program_id,
          program_title: program?.title || 'Onbekende cursus',
          dance_style: program?.dance_style || '',
          studio_name: program?.studios?.naam || 'Onbekende studio',
          location: locationName || program?.studios?.location || program?.studios?.naam || 'Geen locatie',
          next_session_date: lesson.date,
          start_time: lesson.time || '',
          end_time: lesson.duration_minutes 
            ? formatEndTime(lesson.time, lesson.duration_minutes)
            : '',
          program_type: program?.program_type || 'group',
        };

        console.info('[Dashboard] Next session:', nextSession);
      } else {
        console.info('[Dashboard] No lessons found, trying fallback logic');
      }

      // Fallback: if no real lessons found, compute next session from group/workshop details
      if (!nextSession) {
        const now = new Date();

        for (const enrollment of enrollments) {
          const program = enrollment.programs as any;
          if (!program) continue;

        if (program.program_type === 'workshop' && program.workshop_details?.length > 0) {
          // Workshop: check start_datetime
          const workshopDate = new Date(program.workshop_details[0].start_datetime);
          if (workshopDate > now) {
            if (!nextSession || workshopDate < new Date(nextSession.next_session_date)) {
              nextSession = {
                id: enrollment.id,
                program_id: program.id,
                program_title: program.title,
                dance_style: program.dance_style,
                studio_name: program.studios?.naam || 'Onbekende studio',
                location: program.studios?.location || program.studios?.naam || 'Geen locatie',
                next_session_date: program.workshop_details[0].start_datetime,
                start_time: program.workshop_details[0].start_datetime,
                end_time: program.workshop_details[0].end_datetime,
                program_type: 'workshop',
              };
            }
          }
        } else if (program.program_type === 'group' && program.group_details?.length > 0) {
          // Group: find next occurrence based on weekday
          const groupDetail = program.group_details[0];
          const weekday = groupDetail.weekday; // 0 = Sunday, 1 = Monday, etc.
          
          // Find next occurrence of this weekday
          const today = new Date();
          const todayWeekday = today.getDay();
          let daysUntilNext = weekday - todayWeekday;
          if (daysUntilNext <= 0) daysUntilNext += 7;
          
          const nextDate = new Date(today);
          nextDate.setDate(today.getDate() + daysUntilNext);
          nextDate.setHours(0, 0, 0, 0);

          if (!nextSession || nextDate < new Date(nextSession.next_session_date)) {
            nextSession = {
              id: enrollment.id,
              program_id: program.id,
              program_title: program.title,
              dance_style: program.dance_style,
              studio_name: program.studios?.naam || 'Onbekende studio',
              location: program.studios?.location || program.studios?.naam || 'Geen locatie',
              next_session_date: nextDate.toISOString(),
              start_time: groupDetail.start_time,
              end_time: groupDetail.end_time,
              program_type: 'group',
            };
          }
        }
        }
      }

      setNextLesson(nextSession);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      // Ensure the page never stays stuck on Loading... due to an early return.
      setLoading(false);
    }
  };

  const loadTeacherLessons = async (userId: string) => {
    try {
      
      
      // Get lessons where teacher is assigned and date is today or later
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString().split('T')[0];

      

      // First, try to get upcoming lessons directly assigned to teacher
      let { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select(`
          id,
          date,
          time,
          duration_minutes,
          lesson_number,
          program_id,
          teacher_id,
          programs (
            id,
            title,
            dance_style,
            program_type,
            studio_id,
            studios (naam)
          )
        `)
        .eq('teacher_id', userId)
        .gte('date', todayISO)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(10);

      

      // If no direct lessons found, try to get lessons from programs assigned to teacher
      if ((!lessonsData || lessonsData.length === 0) && !lessonsError) {
  console.info('[Dashboard] No direct lessons, trying via teacher_programs...');
        
        const { data: teacherPrograms } = await supabase
          .from('teacher_programs')
          .select('program_id')
          .eq('teacher_id', userId);

        

        if (teacherPrograms && teacherPrograms.length > 0) {
          const programIds = teacherPrograms.map(tp => tp.program_id);
          console.info('[Dashboard] Fetching lessons for program IDs:', programIds);

          const { data: programLessons, error: programLessonsError } = await supabase
            .from('lessons')
            .select(`
              id,
              date,
              time,
              duration_minutes,
              lesson_number,
              program_id,
              teacher_id,
              programs (
                id,
                title,
                dance_style,
                program_type,
                studio_id,
                studios (naam)
              )
            `)
            .in('program_id', programIds)
            .gte('date', todayISO)
            .order('date', { ascending: true })
            .order('time', { ascending: true })
            .limit(10);

          
          
          lessonsData = programLessons;
          lessonsError = programLessonsError;
        }
      }

      if (lessonsError) {
        // Soft-handle RLS or query errors; use server-side fallback
        try {
          const res = await fetch(`/api/teacher/upcoming-lessons?teacherId=${userId}`);
          if (res.ok) {
            const json = await res.json();
            const lessons = (json.lessons || []).map((lesson: any) => {
              const program = lesson.programs as any;
              const lessonDate = new Date(lesson.date);
              return {
                lesson_id: lesson.id,
                program_id: lesson.program_id,
                program_title: program?.title || 'Onbekende cursus',
                dance_style: program?.dance_style || '',
                studio_name: program?.studios?.naam || 'Onbekende studio',
                date: lessonDate,
                start_time: (lesson as any).time,
                end_time: lesson.duration_minutes ? formatEndTime((lesson as any).time, lesson.duration_minutes) : '',
                lesson_number: lesson.lesson_number,
                type: program?.program_type || 'group'
              }
            });
            const deduped = [] as any[];
            const seenPrograms = new Set<string>();
            for (const l of lessons) {
              if (!seenPrograms.has(String(l.program_id))) {
                seenPrograms.add(String(l.program_id));
                deduped.push(l);
              }
              if (deduped.length >= 2) break;
            }
            setTeacherNextLessons(deduped);
            return;
          } else {
            console.warn('[Dashboard] Fallback API failed', await res.text());
          }
        } catch (e) {
          console.warn('[Dashboard] Fallback API threw', e);
        }
        return;
      }

      if (!lessonsData || lessonsData.length === 0) {
        
        try {
          const res = await fetch(`/api/teacher/upcoming-lessons?teacherId=${userId}`);
          if (res.ok) {
            const json = await res.json();
            const lessons = (json.lessons || []).map((lesson: any) => {
              const program = lesson.programs as any;
              const lessonDate = new Date(lesson.date);
              return {
                lesson_id: lesson.id,
                program_id: lesson.program_id,
                program_title: program?.title || 'Onbekende cursus',
                dance_style: program?.dance_style || '',
                studio_name: program?.studios?.naam || 'Onbekende studio',
                date: lessonDate,
                start_time: (lesson as any).time,
                end_time: lesson.duration_minutes ? formatEndTime((lesson as any).time, lesson.duration_minutes) : '',
                lesson_number: lesson.lesson_number,
                type: program?.program_type || 'group'
              }
            });
            const deduped = [] as any[];
            const seenPrograms = new Set<string>();
            for (const l of lessons) {
              if (!seenPrograms.has(String(l.program_id))) {
                seenPrograms.add(String(l.program_id));
                deduped.push(l);
              }
              if (deduped.length >= 2) break;
            }
            setTeacherNextLessons(deduped);
            return;
          } else {
            console.error('[Dashboard] Fallback API failed', await res.text());
          }
        } catch (e) {
          console.error('[Dashboard] Fallback API threw', e);
        }
        setTeacherNextLessons([]);
        return;
      }

      // Transform lessons data for display
      const nextLessons = lessonsData.map(lesson => {
        const program = lesson.programs as any;
        const lessonDate = new Date(lesson.date);
        
        return {
          lesson_id: lesson.id,
          program_id: lesson.program_id,
          program_title: program?.title || 'Onbekende cursus',
          dance_style: program?.dance_style || '',
          studio_name: program?.studios?.naam || 'Onbekende studio',
          date: lessonDate,
          start_time: (lesson as any).time,
          end_time: lesson.duration_minutes ? formatEndTime((lesson as any).time, lesson.duration_minutes) : '',
          lesson_number: lesson.lesson_number,
          type: program?.program_type || 'group'
        };
      });

      

      // Dedupe by program (only 1 per program) and cap at 2 lessons to keep layout compact
      const deduped = [] as any[];
      const seenPrograms = new Set<string>();
      for (const l of nextLessons) {
        if (!seenPrograms.has(String(l.program_id))) {
          seenPrograms.add(String(l.program_id));
          deduped.push(l);
        }
        if (deduped.length >= 2) break;
      }
      setTeacherNextLessons(deduped);

      // --- Checklist calculations ---
      try {
        // Pending attendance: lessons in the past 14 days where attendance feature is enabled and no attendance rows exist
        const start = new Date();
        start.setDate(start.getDate() - 14);
        const startISO = start.toISOString().split('T')[0];
        const today = new Date();
        const todayISO = today.toISOString().split('T')[0];

        const { data: recentLessons } = await supabase
          .from('lessons')
          .select('id, date, program_id')
          .eq('teacher_id', userId)
          .gte('date', startISO)
          .lte('date', todayISO)
          .order('date', { ascending: false })
          .limit(10);

        let pendingCount = 0;
        let firstPendingId: string | null = null;
        if (recentLessons && recentLessons.length > 0) {
          for (const rl of recentLessons) {
            try {
              const { count } = await supabase
                .from('lesson_attendances')
                .select('*', { head: true, count: 'exact' })
                .eq('lesson_id', rl.id as string)
              const c = (count as any) || 0
              if (!c) {
                // check program attendance feature
                const { data: prog } = await supabase
                  .from('programs')
                  .select('id, attendance_enabled')
                  .eq('id', rl.program_id)
                  .maybeSingle();
                if (prog && prog.attendance_enabled) {
                  pendingCount += 1;
                  if (!firstPendingId) firstPendingId = String(rl.id);
                }
              }
            } catch (e) {
              // ignore per-lesson checks
            }
          }
        }
        setTeacherPendingAttendanceCount(pendingCount);
        setTeacherPendingAttendanceLessonId(firstPendingId);

        // Draft timesheets
        try {
          const { data: drafts } = await supabase
            .from('timesheets')
            .select('id')
            .eq('teacher_id', userId)
            .eq('status', 'draft')
          setTeacherDraftTimesheetsCount((drafts || []).length || 0);
        } catch {}

        // Recent payrolls (last 30 days)
        try {
          const since = new Date();
          since.setDate(since.getDate() - 30);
          const sinceIso = since.toISOString();
          const { data: recentPayrolls } = await supabase
            .from('payrolls')
            .select('id')
            .eq('teacher_id', userId)
            .gte('created_at', sinceIso)
          setTeacherRecentPayrollsCount((recentPayrolls || []).length || 0);
        } catch {}
      } catch (e) {
        // ignore checklist calculation errors
      }
    } catch (error) {
      console.error('Error loading teacher lessons:', error);
    }
  };

  const getWeekdayName = (date: string) => {
    const days = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
    return days[new Date(date).getDay()];
  };

  if (loading || isStudioOnly) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingSpinner size={48} className="mx-auto mb-4" label="Laden" />
          <p className="text-slate-600">Laden…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen dashboard-surface ${theme === 'dark' ? 'bg-black' : 'bg-gray-50'}`}>

      <div className="max-w-7xl lg:max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welkom terug{userName ? `, ${userName}` : ''}!
          </h1>
          <p className="text-gray-500 dark:text-slate-400">
            Hier vind je een overzicht van je aankomende lessen
          </p>
        </div>

        {nextLesson ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Next Lesson Card - Takes 2 columns */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-linear-to-r from-blue-500 to-purple-600 p-6 text-white">
                  <h2 className="text-2xl font-bold mb-2 text-white!">Eerstvolgende Les</h2>
                  <p className="text-blue-100">Klaar voor je volgende danssessie?</p>
                </div>
                
                <div className="p-6">
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-gray-900 mb-3">
                      {nextLesson.program_title}
                    </h3>

                    <div className="flex items-center gap-2 mb-2">
                      {nextLesson.dance_style ? <Tag>{nextLesson.dance_style}</Tag> : null}
                      {nextLesson.program_type ? <Tag>{nextLesson.program_type === 'workshop' ? 'Workshop' : (nextLesson.program_type === 'group' ? 'Cursus' : nextLesson.program_type)}</Tag> : null}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start">
                      <Calendar className="w-5 h-5 text-gray-400 mr-3 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {getWeekdayName(nextLesson.next_session_date)}, {formatDateOnly(nextLesson.next_session_date)}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {(() => {
                            try {
                              const s = nextLesson.start_time || ''
                              const e = nextLesson.end_time || ''
                              const fmt = (t: string) => {
                                if (!t) return ''
                                if (t.includes('T') || t.includes('-')) {
                                  const d = new Date(t)
                                  if (!isNaN(d.getTime())) return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
                                }
                                return formatTimeStr(t)
                              }
                              const sd = fmt(s)
                              const ed = fmt(e)
                              if (sd && ed) return `${sd} - ${ed}`
                              if (sd) return sd
                              return ''
                            } catch {
                              return ''
                            }
                          })()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <Building2 className="w-5 h-5 text-gray-400 mr-3 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900">{nextLesson.studio_name}</p>
                        <p className="text-sm text-gray-600">{nextLesson.location}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (isMobile) {
                        router.push(`/dashboard/program/${nextLesson.program_id}`)
                        return
                      }
                      setSelectedProgramId(nextLesson.program_id)
                      setProgramDetailView('user')
                      setShowProgramDetailModal(true)
                    }}
                    className="mt-6 w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Bekijk programma details
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions - Takes 1 column */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Snelle acties</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => router.push('/hub')}
                    className="group w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-slate-100 hover:text-black dark:hover:bg-slate-200 dark:hover:text-black transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900">HUB3 verkennen</span>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-black" />
                  </button>

                  <button
                    onClick={() => router.push('/mijn-lessen')}
                    className="group w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-slate-100 hover:text-black dark:hover:bg-slate-200 dark:hover:text-black transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900">Alle lessen</span>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-black" />
                  </button>
                  
                  <button
                    onClick={() => router.push('/profile')}
                    className="group w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-slate-100 hover:text-black dark:hover:bg-slate-200 dark:hover:text-black transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900">Mijn profiel</span>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-black" />
                  </button>

                  {isTeacher && (
                    <>
                      <div className="border-t border-gray-200 pt-3 mt-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Docent</p>
                        <button
                          onClick={() => setShowCoursesModal(true)}
                          className="group w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-slate-100 hover:text-black dark:hover:bg-slate-200 dark:hover:text-black transition-colors"
                        >
                          <span className="text-sm font-medium text-gray-900">Mijn cursussen</span>
                          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-black" />
                        </button>
                        <button
                          onClick={() => setShowTimesheetModal(true)}
                          className="group w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-slate-100 hover:text-black dark:hover:bg-slate-200 dark:hover:text-black transition-colors mt-2"
                        >
                          <span className="text-sm font-medium text-gray-900">Timesheets & Payrolls</span>
                          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-black" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Geen aankomende lessen
            </h3>
            <p className="text-gray-600 mb-6">
              Je hebt momenteel geen geplande lessen.
              Ontdek nieuwe workshops en programma's!
            </p>
            <button
              onClick={() => router.push('/hub')}
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Explore HUB3
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        )}
        
        {/* Teacher Section */}
        {isTeacher && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Teacher Dashboard</h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-6 lg:grid-rows-2 lg:gap-6 lg:aspect-[4/1]">
              {/* Volgende lessen (2 cols x 2 rows) */}
              <div className="bg-white rounded-lg shadow p-4 h-full lg:col-span-2 lg:row-span-2">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                    <Calendar className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-md font-semibold text-gray-900">Volgende Lessen</h3>
                    <p className="text-xs text-gray-600">Je eerstvolgende lessen</p>
                  </div>
                </div>
                {teacherNextLessons.length > 0 ? (
                  <div className="space-y-3">
                    {teacherNextLessons.map((lesson, index) => (
                      <button
                        key={index}
                        onClick={() => openTeacherLessonModal(lesson)}
                        className="w-full text-left flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">{lesson.program_title}</p>
                          <p className="text-xs text-gray-600">
                            {lesson.studio_name}{lesson.dance_style ? ` • ${lesson.dance_style}` : ''}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDateOnly(lesson.date.toISOString())} • {formatTimeStr(lesson.start_time)} - {formatTimeStr(lesson.end_time)}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Geen lessen gepland
                  </p>
                )}

                
              </div>

              {/* Actiepunten (2 cols x 2 rows) */}
              <div className="bg-white rounded-lg shadow p-4 h-full lg:col-span-2 lg:row-span-2">
                  <div className="flex items-center mb-3">
                    <div className="w-9 h-9 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
                      <FileText className="w-4 h-4 text-yellow-600" />
                    </div>
                    <div>
                      <h3 className="text-md font-semibold text-slate-900 dark:text-white">Actiepunten</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300">Kort overzicht met acties voor jou</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const completedAttendance = teacherPendingAttendanceCount === 0 || teacherActionPointSeen.attendance
                      const completedTimesheets = teacherDraftTimesheetsCount === 0 || teacherActionPointSeen.timesheets
                      const completedPayrolls = teacherRecentPayrollsCount === 0 || teacherActionPointSeen.payrolls

                      return (
                        <>
                    <button
                      onClick={async () => {
                        if (completedAttendance) return
                        setTeacherActionPointSeen(prev => ({ ...prev, attendance: true }))
                        if (teacherPendingAttendanceLessonId) {
                          try {
                            const { data: lesson } = await supabase
                              .from('lessons')
                              .select(`id, date, time, duration_minutes, lesson_number, program_id, teacher_id, programs (id, title, dance_style, program_type, studio_id, studios (naam))`)
                              .eq('id', teacherPendingAttendanceLessonId)
                              .maybeSingle();
                            if (lesson) await openTeacherLessonModal({ ...lesson, lesson_id: lesson.id });
                          } catch (e) {
                            console.error('Failed to open pending lesson', e);
                          }
                        } else {
                          // nothing to open
                        }
                      }}
                      disabled={completedAttendance}
                      className={`w-full text-left flex items-center justify-between p-2 border border-gray-200 rounded-md ${completedAttendance ? 'opacity-70 cursor-default' : (teacherPendingAttendanceCount ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-60 cursor-default')}`}>
                      <div className="text-sm">
                        <div className="font-medium text-gray-900 dark:text-white">{teacherPendingAttendanceCount ? `${teacherPendingAttendanceCount} les(sen) zonder aanwezigheid` : 'Geen openstaande aanwezigheden'}</div>
                        <div className="text-xs text-gray-600 dark:text-slate-300">{teacherPendingAttendanceCount ? 'Vul de aanwezigheid in voor recente lessen' : 'Alles lijkt ingevuld'}</div>
                      </div>
                      {completedAttendance ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        if (completedTimesheets) return
                        setTeacherActionPointSeen(prev => ({ ...prev, timesheets: true }))
                        setTimesheetModalInitialTab('timesheets');
                        setShowTimesheetModal(true);
                      }}
                      disabled={completedTimesheets}
                      className={`w-full text-left flex items-center justify-between p-2 border border-gray-200 rounded-md ${completedTimesheets ? 'opacity-70 cursor-default' : (teacherDraftTimesheetsCount ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-80')}`}>
                      <div className="text-sm">
                        <div className="font-medium text-gray-900 dark:text-white">{teacherDraftTimesheetsCount ? `${teacherDraftTimesheetsCount} concept timesheet(s)` : 'Geen concept timesheets'}</div>
                        <div className="text-xs text-gray-600 dark:text-slate-300">Bekijk en bevestig je timesheets</div>
                      </div>
                      {completedTimesheets ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        if (completedPayrolls) return
                        setTeacherActionPointSeen(prev => ({ ...prev, payrolls: true }))
                        setTimesheetModalInitialTab('payrolls');
                        setShowTimesheetModal(true);
                      }}
                      disabled={completedPayrolls}
                      className={`w-full text-left flex items-center justify-between p-2 border border-gray-200 rounded-md ${completedPayrolls ? 'opacity-70 cursor-default' : (teacherRecentPayrollsCount ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-80')}`}>
                      <div className="text-sm">
                        <div className="font-medium text-gray-900 dark:text-white">{teacherRecentPayrollsCount ? `${teacherRecentPayrollsCount} recente payroll(s)` : 'Geen recente payrolls'}</div>
                        <div className="text-xs text-gray-600 dark:text-slate-300">Controleer je payroll informatie</div>
                      </div>
                      {completedPayrolls ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                        </>
                      )
                    })()}
                  </div>

              </div>

              {/* Mijn cursussen (2 cols x 1 row) */}
              <div className="bg-white rounded-lg shadow p-4 h-full lg:col-span-2 lg:row-span-1">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                    <User className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-md font-semibold text-gray-900">Mijn Cursussen</h3>
                    <p className="text-xs text-gray-600">Beheer je programma's en lessen</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCoursesModal(true)}
                  className="w-full flex items-center justify-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
                >
                  Cursussen bekijken
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>

              {/* Timesheets & Payrolls (2 cols x 1 row) */}
              <div className="bg-white rounded-lg shadow p-4 h-full lg:col-span-2 lg:row-span-1">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-md font-semibold text-gray-900">Timesheets & Payrolls</h3>
                    <p className="text-xs text-gray-600">Beheer je uren en betalingen</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTimesheetModal(true)}
                  className="w-full flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  Financiën bekijken
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <TimesheetModal
        isOpen={showTimesheetModal}
        onClose={() => setShowTimesheetModal(false)}
        initialTab={timesheetModalInitialTab}
      />
      <CoursesModal
        isOpen={showCoursesModal}
        onClose={() => setShowCoursesModal(false)}
        onOpenProgramDetail={(programId: string) => {
          setSelectedProgramId(programId);
          setProgramDetailView('manage')
          setShowProgramDetailModal(true);
        }}
      />
      {programDetailView === 'user' ? (
        <UserProgramDetailModal
          isOpen={showProgramDetailModal}
          onClose={() => setShowProgramDetailModal(false)}
          programId={selectedProgramId}
        />
      ) : (
        <ProgramDetailModal
          isOpen={showProgramDetailModal}
          onClose={() => setShowProgramDetailModal(false)}
          programId={selectedProgramId}
        />
      )}

      {/* Teacher Lesson Modal from dashboard */}
      {showTeacherLessonModalFor && teacherLessonContext && (
        <TeacherLessonDetailsModal
          isOpen={!!showTeacherLessonModalFor}
          onClose={() => { setShowTeacherLessonModalFor(''); setTeacherLessonContext(null); }}
          program={teacherLessonProgram || {
            id: teacherLessonContext.program_id,
            studio_id: '',
            dance_style: teacherLessonContext.dance_style,
            level: null,
            min_age: null,
            max_age: null,
            program_locations: [],
          }}
          lesson={{
            id: String(teacherLessonContext.lesson_id),
            title: teacherLessonContext.program_title,
            date: teacherLessonContext.date.toISOString().split('T')[0],
            time: teacherLessonContext.start_time,
            duration_minutes: 0,
          }}
          students={teacherLessonStudents}
          subStudents={teacherLessonSubStudents}
          attendanceEnabled={teacherLessonAttendanceEnabled}
          attendanceAllowLate={teacherLessonAttendanceAllowLate}
          isStudioAdmin={false}
          attendanceData={teacherLessonAttendanceData}
          lessonAbsencesByLesson={teacherLessonAbsencesByLesson}
          updateAttendanceStatus={(lessonId: string, userId: string, status: 'present' | 'absent' | 'excused' | 'late') => {
            setTeacherLessonAttendanceData(prev => ({
              ...prev,
              [lessonId]: { ...(prev[lessonId] || {}), [userId]: status }
            }))
          }}
          saveAttendance={async (lessonId: string) => {
            try {
              const lessonAttendances = teacherLessonAttendanceData[lessonId] || {};
              const withEnrollment: any[] = [];
              const withoutEnrollment: any[] = [];
              const allStudents = [...teacherLessonStudents, ...teacherLessonSubStudents];
              allStudents.forEach(s => {
                const key = s.enrollment_id || s.user_id;
                const status = lessonAttendances[key];
                if (!status) return;
                const row = { lesson_id: lessonId, user_id: s.user_id, enrollment_id: s.enrollment_id || null, status };
                if (s.enrollment_id) withEnrollment.push(row);
                else withoutEnrollment.push(row);
              });

              const { data: { session } } = await supabase.auth.getSession();
              const token = (session as any)?.access_token;
              const res = await fetch('/api/attendances/bulk', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ attendances: [...withEnrollment, ...withoutEnrollment] }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => null as any)
                const fallbackText = !data ? await res.text().catch(() => '') : ''
                const message = data?.error || fallbackText || `Failed saving attendance (${res.status})`
                throw new Error(message)
              }

              alert('Aanwezigheid opgeslagen');
            } catch (e) {
              console.error('Failed saving attendance from dashboard modal', e);
              const message = e instanceof Error ? e.message : null
              alert(message || 'Fout bij het opslaan van aanwezigheid');
            }
          }}
          onRequestReplacement={(lid) => setReplacementLessonId(lid)}
        />
      )}

      {replacementLessonId && teacherLessonProgram && (
        <ReplacementRequestModal
          studioId={String(teacherLessonProgram.studio_id)}
          programId={String(teacherLessonProgram.id)}
          lessonId={String(replacementLessonId)}
          onClose={() => setReplacementLessonId(null)}
          onSuccess={() => {
            setReplacementLessonId(null);
          }}
        />
      )}
    </div>
  );
}
