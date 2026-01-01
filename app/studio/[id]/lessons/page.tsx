'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Calendar, MapPin, Clock, Users, ChevronDown, ChevronUp, UserMinus, Edit, Trash2, Check } from 'lucide-react';
import { formatTimeStr } from '@/lib/formatting';
import type { Lesson, Program, Location } from '@/types/database';
import Tag from '@/components/ui/Tag';
import dynamic from 'next/dynamic';
import ReplacementRequestModal from '@/components/ReplacementRequestModal';
import LessonEditModal from '@/components/LessonEditModal';
import ActionIcon from '@/components/ActionIcon';
import { useNotification } from '@/contexts/NotificationContext';
import { FeatureGate } from '@/components/FeatureGate';
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears';

interface LessonWithDetails extends Lesson {
  program?: Program;
  location?: Location;
}

interface ProgramRow {
  program: Program;
  teachers?: { id: string; naam: string }[];
}

export default function LessonsPage() {
  const params = useParams();
  const studioId = params.id as string;
  const { selectedYearId: activeYearId, missingTable: schoolYearsMissing } = useStudioSchoolYears(studioId);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lessonsByProgram, setLessonsByProgram] = useState<Record<string, LessonWithDetails[]>>({});
  const [loadingLessons, setLoadingLessons] = useState<Record<string, boolean>>({});
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [lessonCountsByProgram, setLessonCountsByProgram] = useState<Record<string, Record<string, number>>>({});
  const [lessonAbsencesByProgram, setLessonAbsencesByProgram] = useState<Record<string, Record<string, number>>>({});
   const [absenteesModalFor, setAbsenteesModalFor] = useState<string | null>(null);
   const [absenteesList, setAbsenteesList] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isStudioAdmin, setIsStudioAdmin] = useState(false);
  const [deletingLessonIds, setDeletingLessonIds] = useState<Record<string, boolean>>({});
  const { isArmed: isDeleteArmed, confirmOrArm: confirmOrArmDelete } = useTwoStepConfirm<string>(4500);
  const { showSuccess, showError } = useNotification()
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [modalLesson, setModalLesson] = useState<LessonWithDetails | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLessonId, setEditLessonId] = useState<string | null>(null);
  const [editLessonProgramId, setEditLessonProgramId] = useState<string | null>(null);
  const [replacementRequestsByLesson, setReplacementRequestsByLesson] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!schoolYearsMissing && !activeYearId) return;
    loadPrograms();
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) setCurrentUserId(user.id)
        // check studio admin role
        if (user) {
          try {
            const { data: memberRow } = await supabase
              .from('studio_members')
              .select('role')
              .eq('user_id', user.id)
              .eq('studio_id', studioId)
              .maybeSingle()
            const role = (memberRow as any)?.role
            setIsStudioAdmin(role === 'owner' || role === 'admin')
          } catch (e) {
            console.warn('Failed to check studio admin role', e)
          }
        }
      } catch (e) {
        // ignore
      }
    })()
  }, [studioId, activeYearId, schoolYearsMissing]);

  const loadPrograms = async () => {
    setLoading(true);

    const { data: programsData, error: programsError } = await supabase
      .from('programs')
      // include min_age / max_age so the lessons page can show correct age tags
      .select('id, title, program_type, dance_style, level, capacity, min_age, max_age, group_details(*), workshop_details(*)')
      .eq('studio_id', studioId)
      .match(activeYearId ? { school_year_id: activeYearId } : {})
      .in('program_type', ['group', 'workshop'])
      .order('title');

    if (programsError) {
      try {
        console.error('Error loading programs:', JSON.stringify(programsError));
      } catch (e) {
        console.error('Error loading programs (could not stringify):', programsError);
      }

      // Try a safer fallback query without selecting related details (sometimes RLS or select syntax can fail client-side)
      try {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('programs')
          .select('id, title, program_type, dance_style, level, capacity, min_age, max_age')
          .eq('studio_id', studioId)
          .match(activeYearId ? { school_year_id: activeYearId } : {})
          .in('program_type', ['group', 'workshop'])
          .order('title');

        if (fallbackError) {
          console.error('Fallback query also failed:', JSON.stringify(fallbackError));
          alert('Failed to load programs');
          setLoading(false);
          return;
        }

        if (!fallbackData || fallbackData.length === 0) {
          setPrograms([]);
          setLoading(false);
          return;
        }

        // Build rows with empty details to keep page functional
        const rows = (fallbackData || []).map((program: any) => ({
          program: { ...program, group_details: [], workshop_details: [] },
          teachers: [],
        } as ProgramRow));

        setPrograms(rows);
        setLoading(false);
        return;
      } catch (e) {
        console.error('Unexpected error during fallback loadPrograms:', e);
        alert('Failed to load programs');
        setLoading(false);
        return;
      }
    }

    if (!programsData || programsData.length === 0) {
      setPrograms([]);
      setLoading(false);
      return;
    }

    const programIds = programsData.map((p: any) => p.id);

    // Fetch member/enrollment counts for these programs
    try {
      const { data: insData, error: insError } = await supabase
        .from('inschrijvingen')
        .select('program_id')
        .in('program_id', programIds);

      if (!insError && insData) {
        const counts: Record<string, number> = {};
        for (const ins of insData) {
          counts[ins.program_id] = (counts[ins.program_id] || 0) + 1;
        }
        setMemberCounts(counts);
      }
    } catch (e) {
      console.warn('Failed to load enrollment counts', e);
    }

    // Fetch teacher mapping via service role API to bypass RLS
    let programTeachersMap: Record<string, any[]> = {}
    try {
      const res = await fetch(`/api/studio/${studioId}/program-teachers`)
      if (res.ok) {
        const json = await res.json()
        programTeachersMap = json?.mapping || {}
      }
    } catch (e) {
      console.warn('Failed to load program teachers via API', e)
    }

    const rows = programsData.map((program: any) => {
      // normalize details to be consistent with other pages
      const groupDetails = program.group_details ? (Array.isArray(program.group_details) ? program.group_details[0] : program.group_details) : null;
      const workshopDetails = program.workshop_details ? (Array.isArray(program.workshop_details) ? program.workshop_details[0] : program.workshop_details) : null;
      const assignedTeachers = programTeachersMap[String(program.id)] || []

      const enriched = { ...program, group_details: groupDetails ? [groupDetails] : [], workshop_details: workshopDetails ? [workshopDetails] : [] };
      return { program: enriched, teachers: assignedTeachers } as ProgramRow;
    });

    setPrograms(rows);
    setLoading(false);
  };

  const fetchLessonsForProgram = async (programId: string) => {
    if (lessonsByProgram[programId]) return;
    setLoadingLessons(s => ({ ...s, [programId]: true }));

    const { data: lessons, error } = await supabase
      .from('lessons')
      .select('*, location:locations(*)')
      .eq('program_id', programId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('Error loading lessons for program', programId, error);
      setLessonsByProgram(s => ({ ...s, [programId]: [] }));
    } else {
      const mapped = (lessons || []).map((l: any) => ({ ...l, location: l.location || undefined }));
      // Fetch teacher profiles for the lessons so we can show assigned teacher per lesson
      try {
        const lessonTeacherIds = Array.from(new Set((mapped || []).map((m:any) => m.teacher_id).filter(Boolean)));
        if (lessonTeacherIds.length > 0) {
          const { data: tProfiles, error: tProfErr } = await supabase
            .from('user_profiles')
            .select('user_id, first_name, last_name, email')
            .in('user_id', lessonTeacherIds)

          if (tProfErr) console.warn('Error loading lesson teacher profiles', tProfErr)
          else if (tProfiles) {
            // attach profile to lessons
            const profMap: Record<string, any> = {}
            for (const p of tProfiles) profMap[p.user_id] = p
            for (const mm of mapped) {
              if (mm.teacher_id) mm.teacher_profile = profMap[mm.teacher_id] || null
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load lesson teacher profiles', e)
      }
      setLessonsByProgram(s => ({ ...s, [programId]: mapped }));

      // fetch replacement_requests for these lessons
      try {
        const lessonIds = mapped.map((l:any) => String(l.id)).filter(Boolean)
        if (lessonIds.length > 0) {
          const { data: reqs, error: reqErr } = await supabase
            .from('replacement_requests')
            .select('*')
            .in('lesson_id', lessonIds)

          if (!reqErr && reqs) {
            const map: Record<string, any> = {}
            for (const r of reqs) {
              map[String(r.lesson_id)] = r
            }
            setReplacementRequestsByLesson(prev => ({ ...prev, ...map }))
          }
        }
      } catch (e) {
        console.warn('Failed to load replacement requests for lessons', e)
      }
    }

    // fetch absences for these lessons so studio admins can see counts at a glance
    try {
      const lessonIds = (lessons || []).map((l: any) => String(l.id)).filter(Boolean);
      if (lessonIds.length > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const q = `/api/lesson-absences?lesson_ids=${lessonIds.join(',')}`;
        const res = await fetch(q, { method: 'GET', headers });
        if (res.ok) {
          const json = await res.json();
          const abs: any[] = json?.absences || [];
          const counts: Record<string, number> = {};
          for (const a of abs) {
            const lid = String(a.lesson_id);
            counts[lid] = (counts[lid] || 0) + 1;
          }
          setLessonAbsencesByProgram(prev => ({ ...prev, [programId]: counts }));
        } else {
          // non-fatal; show nothing
        }
      }
    } catch (e) {
      console.warn('Failed to load lesson absences for program', programId, e);
    }

    setLoadingLessons(s => ({ ...s, [programId]: false }));
 
    // clear existing per-lesson absentees list for this program (will fetch on demand)
    setAbsenteesList(prev => ({ ...prev }));
  };

  const toggleProgram = async (programId: string) => {
    const isOpen = !!expanded[programId];
    setExpanded(s => ({ ...s, [programId]: !isOpen }));
    if (!isOpen) await fetchLessonsForProgram(programId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('nl-NL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    return timeString ? timeString.substring(0, 5) : '';
  };

  const weekdayShort = (n?: number) => {
    const names = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
    if (n === undefined || n === null) return '';
    return names[n % 7];
  };

  // reuse ProgramCard color hashing for tags
  const getTagColor = (value: string) => {
    const colors = [
      "bg-blue-100 text-blue-800",
      "bg-green-100 text-green-800",
      "bg-purple-100 text-purple-800",
      "bg-pink-100 text-pink-800",
      "bg-indigo-100 text-indigo-800",
      "bg-red-100 text-red-800",
      "bg-yellow-100 text-yellow-800",
      "bg-teal-100 text-teal-800",
      "bg-orange-100 text-orange-800",
      "bg-cyan-100 text-cyan-800"
    ];
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // assign unique colors to different tag values on this page
  const colorPool = [
    'bg-blue-100 text-blue-800',
    'bg-green-100 text-green-800',
    'bg-purple-100 text-purple-800',
    'bg-pink-100 text-pink-800',
    'bg-indigo-100 text-indigo-800',
    'bg-red-100 text-red-800',
    'bg-yellow-100 text-yellow-800',
    'bg-teal-100 text-teal-800',
    'bg-orange-100 text-orange-800',
    'bg-cyan-100 text-cyan-800'
  ];
  const tagColorMap = new Map();

  const getUniqueColor = (tagValue: string) => {
    if (!tagValue) return colorPool[0];
    if (tagColorMap.has(tagValue)) return tagColorMap.get(tagValue);
    // find first unused color
    const used = new Set(tagColorMap.values());
    const free = colorPool.find(c => !used.has(c));
    const chosen = free || colorPool[Math.abs(tagValue.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % colorPool.length];
    tagColorMap.set(tagValue, chosen);
    return chosen;
  };

  // detect proeflessen (trial) the same way other pages do
  const isTrialProgram = (p: any) => {
    const t = String((p as any).program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (p?.title && String(p.title).toLowerCase().includes('proef')) return true;
    if ((p as any).is_trial) return true;
    if (p?.price === 0) return true;
    return false;
  };

  return (
    <FeatureGate flagKey="studio.lessons" mode="page">
      {loading ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <LoadingSpinner size={48} className="mb-4" label="Programma's laden…" />
            <p className="text-gray-600">Programma's laden…</p>
          </div>
        </div>
      ) : (
        <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lessen</h1>
        <p className="text-gray-600">Compact overzicht van programma's — open een programma om de lessen te zien</p>
      </div>

      {programs.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Geen programma's gevonden</h3>
          <p className="mt-1 text-sm text-gray-500">Er zijn nog geen groepsprogramma's voor deze studio.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {programs.map(({ program, teachers }) => (
            <div key={program.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                type="button"
                onClick={() => toggleProgram(program.id)}
                className="w-full text-left px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3 w-full sm:w-auto">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900">{program.title}</span>

                    {/* Tags like ProgramCard */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {/* program type tag (treat heuristically detected trials as proeflessen) */}
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${isTrialProgram(program) ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : program.program_type === 'group' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : program.program_type === 'workshop' ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'}`}>
                        {isTrialProgram(program) ? 'Proefles' : (program.program_type === 'group' ? 'Cursus' : program.program_type === 'workshop' ? 'Workshop' : 'Proefles')}
                      </span>

                      {/* small tags: let Tag pick a consistent unique color globaly */}
                      <Tag>{program.dance_style || 'Onbekend'}</Tag>
                      <Tag>{program.level || 'Alle niveaus'}</Tag>

                      {program.min_age !== undefined && program.min_age !== null ? (
                        <Tag>{`${program.min_age}+ jaar`}</Tag>
                      ) : program.max_age !== undefined && program.max_age !== null ? (
                        <Tag>{`tot ${program.max_age} jaar`}</Tag>
                      ) : (
                        <Tag>Alle leeftijden</Tag>
                      )}

                      {/* Small schedule summary (weekday/date + time) */}
                      {program.program_type === 'group' && (program as any).group_details && (program as any).group_details[0] ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs text-gray-600">
                          <Clock className="h-4 w-4 mr-1 text-gray-400" />
                          <span>{weekdayShort((program as any).group_details[0].weekday)} • {formatTime((program as any).group_details[0].start_time)}–{formatTime((program as any).group_details[0].end_time)}</span>
                        </span>
                      ) : program.program_type === 'workshop' && (program as any).workshop_details && (program as any).workshop_details[0] ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs text-gray-600">
                          <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                          <span>{(() => {
                            const wd: any = (program as any).workshop_details[0];
                            const dStr = wd?.date ? new Date(wd.date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }) : '';
                            const s = wd?.start_time ? formatTimeStr(wd.start_time) : '';
                            const e = wd?.end_time ? formatTimeStr(wd.end_time) : '';
                            const time = [s, e].filter(Boolean).join('-');
                            // legacy fallback
                            if (!dStr && (wd?.start_datetime || wd?.end_datetime)) {
                              const ds = wd?.start_datetime ? new Date(wd.start_datetime).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }) : '';
                              const ts = wd?.start_datetime ? new Date(wd.start_datetime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
                              const te = wd?.end_datetime ? new Date(wd.end_datetime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
                              return [ds, ts && te ? `${ts}-${te}` : ts].filter(Boolean).join(' • ');
                            }
                            return [dStr, time].filter(Boolean).join(' • ');
                          })()}</span>
                        </span>
                      ) : null}

                      {/* Capacity pill showing enrolled / capacity with member icon */}
                      {program.capacity ? (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
                          <Users className="h-4 w-4 mr-1 text-gray-500" />
                          <span>{memberCounts[program.id] ?? 0} / {program.capacity}</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Mobile-only: show teachers under tags */}
                    <div className="sm:hidden mt-2 text-xs text-gray-600">
                      {teachers && teachers.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-800">{teachers.map(t => t.naam || 'Docent').join(', ')}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400">
                          <Users className="h-4 w-4" />
                          <span>Geen docent</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="sm:hidden p-1 text-gray-500">
                    {expanded[program.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Desktop-only: teachers on the right */}
                <div className="hidden sm:flex items-center gap-4">
                  <div className="text-xs text-gray-600">
                    {teachers && teachers.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-800">{teachers.map(t => t.naam || 'Docent').join(', ')}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Users className="h-4 w-4" />
                        <span>Geen docent</span>
                      </div>
                    )}
                  </div>

                  <div className="p-1">
                    {expanded[program.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
              </button>

              {expanded[program.id] && (
                <div className="p-4 border-t border-gray-100">
                  {loadingLessons[program.id] ? (
                    <div className="text-sm text-gray-600">Lessen laden…</div>
                  ) : (
                    <div className="space-y-2">
                      {(() => {
                        const baseLessons = lessonsByProgram[program.id] || [];
                        const workshopDetails = (program as any).workshop_details || [];

                        // convert workshop_details into lesson-like objects so they also show up
                        const derivedFromWorkshops = (Array.isArray(workshopDetails) ? workshopDetails : [workshopDetails]).filter(Boolean).map((w: any, idx: number) => {
                          try {
                            // prefer new fields
                            const dateStr: string | undefined = w.date || (w.start_datetime ? String(w.start_datetime).slice(0,10) : undefined);
                            const startTime: string | undefined = w.start_time || undefined;
                            const endTime: string | undefined = w.end_time || undefined;

                            let startISO: string | null = null;
                            let endISO: string | null = null;
                            if (dateStr && startTime) startISO = `${dateStr}T${startTime}`;
                            if (dateStr && endTime) endISO = `${dateStr}T${endTime}`;

                            const start = startISO ? new Date(startISO) : (w.start_datetime ? new Date(w.start_datetime) : null);
                            const end = endISO ? new Date(endISO) : (w.end_datetime ? new Date(w.end_datetime) : null);

                            const dateOut = start ? start.toISOString().split('T')[0] : (dateStr || '');
                            const timeOut = start ? `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}` : (startTime ? formatTimeStr(startTime) : '');
                            const duration = (start && end) ? Math.round((end.getTime() - start.getTime()) / 60000) : (startTime && endTime ? (() => {
                              const [sh, sm] = String(startTime).split(':').map((x:string)=>parseInt(x,10));
                              const [eh, em] = String(endTime).split(':').map((x:string)=>parseInt(x,10));
                              return (eh*60+em) - (sh*60+sm);
                            })() : undefined);

                            return {
                              id: `workshop-${w.id || idx}-${program.id}`,
                              program_id: program.id,
                              title: program.title,
                              date: dateOut,
                              time: timeOut,
                              duration_minutes: typeof duration === 'number' && !Number.isNaN(duration) ? duration : undefined,
                              original_workshop_id: w.id || null,
                            } as any as LessonWithDetails;
                          } catch (e) {
                            return null;
                          }
                        }).filter(Boolean) as LessonWithDetails[];

                        // merge and dedupe by date+time
                        const all = [...baseLessons, ...derivedFromWorkshops];
                        const uniqMap: Record<string, LessonWithDetails> = {};
                        for (const l of all) {
                          const key = `${l.date || ''}-${l.time || ''}`;
                          uniqMap[key] = l;
                        }
                        const combined = Object.values(uniqMap).sort((a: any, b: any) => {
                          const da = new Date(`${a.date}T${a.time || '00:00'}`);
                          const db = new Date(`${b.date}T${b.time || '00:00'}`);
                          return da.getTime() - db.getTime();
                        });

                        // If this program is a trial program, fetch per-lesson enrollments
                        (async () => {
                          try {
                            const prog = program as any;
                            if (isTrialProgram(prog)) {
                              // collect ids to consider: lesson ids and workshop ids
                              const lessonIds: string[] = [];
                              const workshopIds: string[] = [];
                              combined.forEach((l: any) => {
                                if (l.original_workshop_id) workshopIds.push(String(l.original_workshop_id));
                                else if (l.id) lessonIds.push(String(l.id));
                              });

                              // fetch enrollments for this program and derive counts client-side
                              const { data: enrollments } = await supabase
                                .from('inschrijvingen')
                                .select('id, form_data')
                                .eq('program_id', prog.id)
                                .eq('status', 'actief');

                              const counts: Record<string, number> = {};
                              if (enrollments && Array.isArray(enrollments)) {
                                for (const e of enrollments) {
                                  const fd = (e as any).form_data || {};
                                  const ldType = fd?.lesson_detail_type;
                                  const ldId = fd?.lesson_detail_id;
                                  if (!ldType || !ldId) continue;
                                  if ((ldType === 'lesson' && lessonIds.includes(String(ldId))) || (ldType === 'workshop' && workshopIds.includes(String(ldId)))) {
                                    counts[String(ldId)] = (counts[String(ldId)] || 0) + 1;
                                  }
                                }
                              }

                              setLessonCountsByProgram(prev => ({ ...prev, [prog.id]: counts }));
                            }
                          } catch (e) {
                            console.warn('Failed to load per-lesson enrollment counts', e);
                          }
                        })();

                        if (combined.length === 0) {
                          return <div className="text-sm text-gray-600">Geen lessen gevonden voor dit programma.</div>;
                        }

                        return combined.map(lesson => (
                          <div key={lesson.id} className="flex items-center justify-between bg-gray-50 rounded p-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{formatDate(lesson.date)}</div>
                              <div className="text-xs text-gray-600 flex items-center gap-3 mt-1">
                                <Clock className="h-4 w-4" />
                                <span>{formatTime(lesson.time)}{lesson.duration_minutes ? ` • ${lesson.duration_minutes} min` : ''}</span>
                                {lesson.location && (
                                  <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{lesson.location.name}</span>
                                )}
                                  <span className="flex items-center gap-1 text-sm text-gray-700 mt-1">
                                    <Users className="h-4 w-4 text-gray-400" />
                                    {(() => {
                                      // Prefer explicit per-lesson teacher if present
                                      if (lesson.teacher_id) {
                                        const t = teachers?.find(t => String(t.id) === String(lesson.teacher_id))
                                        if (t) return t.naam
                                        const profile = (lesson as any).teacher_profile
                                        if (profile) return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Docent'
                                      }
                                      // Otherwise show program-level assigned teachers (if any)
                                      if (teachers && teachers.length > 0) {
                                        return teachers.map(t => t.naam || 'Docent').join(', ')
                                      }
                                      // Last fallback
                                      return 'Docent'
                                    })()}
                                  </span>
                              </div>
                            </div>

                            <div className="text-right">
                              {/* show per-lesson absence count (if any) and for trial programs show enrolled / capacity */}
                              {(() => {
                                const absForProg = lessonAbsencesByProgram[program.id] || {};
                                const lessonKey = (lesson as any).original_workshop_id ? String((lesson as any).original_workshop_id) : String(lesson.id);
                                const absCount = absForProg[lessonKey] || 0;
                                return (
                                  <div className="flex items-center justify-end gap-3">
                                    {absCount > 0 && (
                                      <button
                                        title={`${absCount} afwezig`}
                                        onClick={() => {
                                          const key = lesson.id;
                                          ;(async () => {
                                            try {
                                              if (!absenteesList[key]) {
                                                const { data: { session } } = await supabase.auth.getSession()
                                                const token = (session as any)?.access_token
                                                const headers: Record<string,string> = { 'Content-Type': 'application/json' }
                                                if (token) headers['Authorization'] = `Bearer ${token}`
                                                const res = await fetch(`/api/lesson-absences?lesson_ids=${key}`, { headers })
                                                if (res.ok) {
                                                  const json = await res.json()
                                                  const abs = json?.absences || []
                                                  const userIds = Array.from(new Set(abs.map((a:any) => a.user_id))).filter(Boolean)
                                                  const enrollmentIds = Array.from(new Set(abs.map((a:any) => a.enrollment_id))).filter(Boolean)
                                                  let profiles: any[] = []
                                                  if (userIds.length > 0) {
                                                    const pRes = await supabase
                                                      .from('user_profiles')
                                                      .select('user_id, first_name, last_name, email')
                                                      .in('user_id', userIds)
                                                    profiles = pRes.data || []
                                                  }

                                                  let enrollmentMap: Record<string, any> = {}
                                                  if (enrollmentIds.length > 0) {
                                                    const eRes = await supabase
                                                      .from('inschrijvingen')
                                                      .select('id, sub_profile_id, profile_snapshot')
                                                      .in('id', enrollmentIds)
                                                    ;(eRes.data || []).forEach((e: any) => {
                                                      enrollmentMap[String(e.id)] = e
                                                    })
                                                  }

                                                  const deriveNameFromSnapshot = (snap: any) => {
                                                    const first = (snap?.first_name || snap?.voornaam || '').toString().trim()
                                                    const last = (snap?.last_name || snap?.achternaam || '').toString().trim()
                                                    const full = `${first} ${last}`.trim()
                                                    return full || (snap?.name || snap?.full_name || '').toString().trim() || null
                                                  }
                                                  setAbsenteesList(prev => ({
                                                    ...prev,
                                                    [key]: abs.map((a: any) => {
                                                      const profile = (profiles || []).find((p:any) => p.user_id === a.user_id)
                                                      const enr = a.enrollment_id ? enrollmentMap[String(a.enrollment_id)] : null
                                                      const snapName = enr ? deriveNameFromSnapshot(enr.profile_snapshot) : null
                                                      const display_name = snapName || (profile ? (profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : profile.email) : a.user_id)
                                                      const display_subtitle = (enr && enr.sub_profile_id && profile)
                                                        ? `Ouder: ${(profile.first_name || '')} ${(profile.last_name || '')}`.trim()
                                                        : ''
                                                      return { ...a, profile, display_name, display_subtitle }
                                                    })
                                                  }))
                                                  setAbsenteesModalFor(key)
                                                } else {
                                                  console.warn('Failed to fetch absentees', res.status)
                                                }
                                              } else {
                                                setAbsenteesModalFor(key)
                                              }
                                            } catch (e) {
                                              console.error('Failed to load absentees for lesson', e)
                                            }
                                          })()
                                        }}
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100"
                                      >
                                        <UserMinus className="h-4 w-4 mr-1 text-red-600" />
                                        <span>{absCount}</span>
                                      </button>
                                    )}

                                    {/* For trial programs we show per-lesson enrolled / capacity */}
                                    {isTrialProgram(program) && program.capacity ? (
                                (() => {
                                  const countsForProg = lessonCountsByProgram[program.id] || {};
                                  const key = (lesson as any).original_workshop_id ? String((lesson as any).original_workshop_id) : String(lesson.id);
                                  const perCount = countsForProg[key] ?? 0;
                                  return (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                                      <Users className="h-4 w-4 mr-1 text-gray-500" />
                                      <span>{perCount} / {program.capacity}</span>
                                    </span>
                                  );
                                })()
                                    ) : (
                                      <div className="text-xs text-gray-500">Gepland</div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Replacement badge + action for teachers */}
                              <div className="mt-2 flex items-center justify-end gap-3">
                                {(() => {
                                  const req = replacementRequestsByLesson[String((lesson as any).id)]
                                  if (req) {
                                    const label = req.status === 'pending' ? 'Vervanging aangevraagd' : req.status === 'approved' ? 'Vervanging goedgekeurd' : req.status === 'declined' ? 'Vervangen: afgewezen' : ''
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-800">
                                        {label}
                                      </span>
                                    )
                                  }
                                  return null
                                })()}

                                {/* show request button if current user is an assigned teacher for this program */}
                                {currentUserId && teachers && teachers.find((t:any) => t.id === currentUserId) && (
                                  <button className="text-sm text-slate-700 hover:text-blue-600" onClick={() => { setModalLesson(lesson); setShowReplacementModal(true) }}>
                                    Vraag vervanging aan
                                  </button>
                                )}

                                {/* show edit button for studio admins */}
                                {isStudioAdmin && (
                                  <div className="flex items-center gap-2">
                                    <ActionIcon title="Bewerk les" onClick={() => { setEditLessonId(String(lesson.id)); setEditLessonProgramId(program.id); setShowEditModal(true); }}>
                                      <Edit className="w-4 h-4" />
                                    </ActionIcon>
                                    <ActionIcon
                                      title={isDeleteArmed(String(lesson.id)) ? 'Klik opnieuw om te verwijderen' : 'Verwijder les'}
                                      variant="danger"
                                      className={isDeleteArmed(String(lesson.id)) ? 'ring-2 ring-red-200' : ''}
                                      onClick={() =>
                                        confirmOrArmDelete(String(lesson.id), async () => {
                                          try {
                                            setDeletingLessonIds(s => ({ ...s, [String(lesson.id)]: true }))
                                            const { error } = await supabase.from('lessons').delete().eq('id', lesson.id)
                                            if (error) throw error
                                            // remove from local state
                                            setLessonsByProgram(prev => {
                                              const copy = { ...prev }
                                              const arr = (copy[program.id] || []).filter((l: any) => String(l.id) !== String(lesson.id))
                                              copy[program.id] = arr
                                              return copy
                                            })
                                            showSuccess('Les verwijderd')
                                          } catch (e:any) {
                                            console.error('Failed deleting lesson', e)
                                            showError(e?.message || 'Fout bij verwijderen')
                                          } finally {
                                            setDeletingLessonIds(s => ({ ...s, [String(lesson.id)]: false }))
                                          }
                                        })
                                      }
                                    >
                                      {deletingLessonIds[String(lesson.id)] ? (
                                        <LoadingSpinner size={16} label="Verwijderen" indicatorClassName="border-b-red-600" />
                                      ) : isDeleteArmed(String(lesson.id)) ? (
                                        <>
                                          <span className="hidden sm:inline text-sm font-medium">Verwijderen</span>
                                          <span className="sm:hidden">
                                            <Check className="w-4 h-4" />
                                          </span>
                                        </>
                                      ) : (
                                        <Trash2 className="w-4 h-4" />
                                      )}
                                    </ActionIcon>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Absentees modal for studio admin */}
      {absenteesModalFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAbsenteesModalFor(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Afwezigheden</h3>
              <button onClick={() => setAbsenteesModalFor(null)} className="text-slate-500 hover:text-slate-900">Sluit</button>
            </div>
            <div className="space-y-3">
              {(() => {
                const list = absenteesList[absenteesModalFor] || [];
                if (list.length === 0) return <div className="text-sm text-slate-600">Geen gemelde afwezigheden voor deze les.</div>;
                return list.map((a: any) => (
                  <div key={a.id || `${a.user_id}-${a.lesson_id}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <div className="font-medium text-slate-900">{a.display_name || (a.profile ? (a.profile.first_name ? `${a.profile.first_name} ${a.profile.last_name || ''}`.trim() : a.profile.email) : a.user_id)}</div>
                      {(a.display_subtitle || a.profile?.email) && (
                        <div className="text-sm text-slate-600">{a.display_subtitle || a.profile?.email || ''}</div>
                      )}
                    </div>
                    <div className="text-sm text-slate-600">{a.reason || ''}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
      {/* Replacement request modal */}
      {showReplacementModal && modalLesson && (
        <ReplacementRequestModal
          studioId={studioId}
          programId={modalLesson.program_id || modalLesson.program?.id}
          lessonId={String(modalLesson.id)}
          onClose={() => { setShowReplacementModal(false); setModalLesson(null) }}
          onSuccess={(req: any): void => {
            // store request in map so badge appears
            setReplacementRequestsByLesson(prev => ({ ...prev, [String(req.lesson_id)]: req }))
          }}
        />
      )}
      {/* Lesson edit modal for studio admins */}
      {showEditModal && editLessonId && (
        <LessonEditModal
          studioId={studioId}
          lessonId={String(editLessonId)}
          onClose={() => { setShowEditModal(false); setEditLessonId(null); setEditLessonProgramId(null); }}
          onSaved={() => {
            // close modal and refresh lessons for the program
            const pid = editLessonProgramId
            setShowEditModal(false)
            setEditLessonId(null)
            setEditLessonProgramId(null)
            if (pid) {
              // clear and refetch
              setLessonsByProgram(prev => ({ ...prev, [pid]: undefined } as any))
              fetchLessonsForProgram(pid)
            }
          }}
        />
      )}
        </div>
      )}
    </FeatureGate>
  );
}