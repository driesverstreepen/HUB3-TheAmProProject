"use client";

import { useEffect, useMemo, useState } from 'react';
import { MapPin, UserMinus } from 'lucide-react';
import Modal from '@/components/Modal';
import { formatDateOnly, formatTimeStr, formatEndTime } from '@/lib/formatting';

interface StudentItem {
  enrollment_id?: string;
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  parent_name?: string;
}

interface ProgramLite {
  id: string;
  studio_id: string;
  dance_style?: string | null;
  level?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  program_locations?: { locations: { name: string; adres?: string | null; postcode?: string | null; city?: string | null } }[];
}

interface LessonLite {
  id: string;
  title: string;
  date: string;
  time: string;
  duration_minutes?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  program: ProgramLite;
  lesson: LessonLite;
  students: StudentItem[];
  subStudents: StudentItem[];
  attendanceEnabled: boolean;
  attendanceAllowLate: boolean;
  isStudioAdmin: boolean;
  attendanceData: Record<string, Record<string, string>>;
  lessonAbsencesByLesson: Record<string, any[]>;
  updateAttendanceStatus: (lessonId: string, userId: string, status: 'present' | 'absent' | 'excused' | 'late') => void;
  saveAttendance: (lessonId: string) => Promise<void>;
  onRequestReplacement?: (lessonId: string) => void;
}

export default function TeacherLessonDetailsModal({
  isOpen,
  onClose,
  program,
  lesson,
  students,
  subStudents,
  attendanceEnabled,
  attendanceAllowLate,
  isStudioAdmin,
  attendanceData,
  lessonAbsencesByLesson,
  updateAttendanceStatus,
  saveAttendance,
  onRequestReplacement,
}: Props) {
  const normalizeLessonAttendanceMap = (map: Record<string, string> | undefined | null) => {
    const normalized: Record<string, string> = {}
    if (!map) return normalized
    Object.entries(map).forEach(([key, value]) => {
      if (!key) return
      if (!value) return
      normalized[String(key)] = String(value).toLowerCase()
    })
    return normalized
  }

  const areAttendanceMapsEqual = (a: Record<string, string>, b: Record<string, string>) => {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    for (const key of aKeys) {
      if (a[key] !== b[key]) return false
    }
    return true
  }

  const [savedSnapshot, setSavedSnapshot] = useState<Record<string, string>>({})

  // Auto-preselect reported absences as 'absent' in the attendance map
  // so teachers see them preselected and can save quickly.
  // Do not overwrite if a teacher already marked a status.
  useEffect(() => {
    if (!isOpen) return;
    const reportedAbsences = lessonAbsencesByLesson[lesson.id] || [];
    if (!reportedAbsences || reportedAbsences.length === 0) return;
    reportedAbsences.forEach((r: any) => {
      const key = r.enrollment_id ? String(r.enrollment_id) : String(r.user_id);
      const existing = attendanceData[lesson.id] && attendanceData[lesson.id][key];
      if (!existing) {
        // mark as absent locally (does not persist until saveAttendance is called)
        try {
          updateAttendanceStatus(lesson.id, key, 'absent');
        } catch (e) {
          // ignore
        }
      }
    })
  }, [isOpen, lessonAbsencesByLesson, lesson.id])

  // Track the last-saved state for this lesson so the indicator only turns green
  // after the teacher explicitly saved.
  useEffect(() => {
    if (!isOpen) return
    setSavedSnapshot(normalizeLessonAttendanceMap(attendanceData[lesson.id]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, lesson.id])

  const currentNormalizedAttendance = useMemo(() => {
    return normalizeLessonAttendanceMap(attendanceData[lesson.id])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceData, lesson.id])

  const participantKeys = useMemo(() => {
    const keys = [...students, ...subStudents]
      .map((s: any) => String(s?.enrollment_id || s?.user_id || ''))
      .filter(Boolean)
    return Array.from(new Set(keys))
  }, [students, subStudents])

  const allParticipantsHaveStatus = participantKeys.length > 0 && participantKeys.every((key) => !!currentNormalizedAttendance[key])
  const hasUnsavedChanges = !areAttendanceMapsEqual(currentNormalizedAttendance, savedSnapshot)
  const showAttendanceSavedIndicator = attendanceEnabled
  const isAttendanceSavedByTeacher = showAttendanceSavedIndicator && allParticipantsHaveStatus && !hasUnsavedChanges

  const endTime = formatEndTime(lesson.time, lesson.duration_minutes || 0);
  const primaryLocation = program?.program_locations && program.program_locations.length > 0 ? program.program_locations[0].locations : null;

  const isWithinAttendanceWindow = (lessonDate: string) => {
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

  // Absence indicator: combine teacher-marked absences and reported absences
  const attMap = attendanceData[lesson.id] || {};
  const teacherAbsentIds = Object.entries(attMap).filter(([, status]) => status === 'absent').map(([uid]) => uid);
  const reported = lessonAbsencesByLesson[lesson.id] || [];
  const reportedKeys = reported.map((r: any) => (r.enrollment_id ? `e:${r.enrollment_id}` : `u:${r.user_id}`)).filter(Boolean);
  const combinedAbsenceCount = Array.from(new Set([...teacherAbsentIds.map((id) => `u:${id}`), ...reportedKeys]))?.length || 0;

  const handleSave = async () => {
    try {
      await saveAttendance(lesson.id)
      setSavedSnapshot(currentNormalizedAttendance)
    } catch {
      // keep indicator orange if save failed
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} contentClassName="max-w-xl">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{lesson.title}</h2>
            <div className="text-sm text-slate-600">
              {formatDateOnly(lesson.date)} • {formatTimeStr(lesson.time)}{endTime ? ` - ${endTime}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showAttendanceSavedIndicator ? (
              isAttendanceSavedByTeacher ? (
                <span title="Aanwezigheid opgeslagen" className="w-3 h-3 rounded-full bg-green-500" />
              ) : (
                <span title="Aanwezigheid niet opgeslagen" className="w-3 h-3 rounded-full bg-amber-500" />
              )
            ) : null}
            {combinedAbsenceCount > 0 && (
              <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-red-50 text-red-700 text-sm font-medium">
                <UserMinus className="w-4 h-4" />
                <span>{combinedAbsenceCount}</span>
              </span>
            )}
            {onRequestReplacement && (
              <button
                onClick={() => onRequestReplacement(lesson.id)}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
              >
                Vervanging aanvragen
              </button>
            )}
          </div>
        </div>

        {/* Extra info: location, dance style, level, and age */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-2 text-slate-700">
            <MapPin className="w-4 h-4 mt-0.5" />
            <div>
              <div className="font-medium">Locatie</div>
              <div className="text-sm">
                {primaryLocation ? (
                  <>
                    <div>{primaryLocation.name}</div>
                    <div className="text-slate-500">{[primaryLocation.adres, primaryLocation.postcode, primaryLocation.city].filter(Boolean).join(' ')}</div>
                  </>
                ) : (
                  <span className="text-slate-500">Niet gespecificeerd</span>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-1 text-slate-700">
            {program?.dance_style && (
              <div>
                <span className="font-medium">Dansstijl:</span> {program.dance_style}
              </div>
            )}
            {program?.level && (
              <div>
                <span className="font-medium">Niveau:</span> {program.level}
              </div>
            )}
            {(program?.min_age != null || program?.max_age != null) && (
              <div>
                <span className="font-medium">Leeftijd:</span>{' '}
                {(() => {
                  const min = program?.min_age;
                  const max = program?.max_age;
                  if (min != null && max != null) return `${min}-${max} jaar`;
                  if (min != null) return `${min}+ jaar`;
                  if (max != null) return `tot ${max} jaar`;
                  return 'Alle leeftijden';
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Participants list */}
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-3">Deelnemers ({students.length + subStudents.length})</h3>
          <div className="space-y-2 max-h-56 overflow-auto pr-1">
            {[...students, ...subStudents].map((student: any) => {
              const canMark = isWithinAttendanceWindow(String(lesson.date)) && attendanceEnabled;
              const currentStatusRaw = attendanceData[lesson.id]?.[student.enrollment_id || student.user_id];
              const currentStatus = currentStatusRaw ? String(currentStatusRaw).toLowerCase() : undefined;
              const reportedAbsences = (lessonAbsencesByLesson[lesson.id] || []);
              const isReportedAbsent = reportedAbsences.some((r: any) => {
                if (student.enrollment_id) {
                  return r.enrollment_id && String(r.enrollment_id) === String(student.enrollment_id)
                }
                return String(r.user_id) === String(student.user_id)
              });
              return (
                <div key={student.enrollment_id || student.user_id} className="flex items-center justify-between p-2 bg-white no-gradient rounded border border-slate-200">
                  <div className="text-sm font-medium text-slate-900">
                    {student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : student.email}
                    {student.parent_name && <div className="text-xs text-slate-500">Ouder: {student.parent_name}</div>}
                    {isReportedAbsent && (
                      <div className="text-xs font-semibold text-red-700">Afwezig gemeld</div>
                    )}
                  </div>
                  {attendanceEnabled ? (
                    <div className="flex items-center gap-2">
                      <button
                        title={canMark ? '' : 'Aanwezigheid kan vanaf de lesdatum tot 14 dagen erna (en als de studio dit heeft ingeschakeld).'}
                        onClick={() => canMark && updateAttendanceStatus(lesson.id, student.enrollment_id || student.user_id, 'present')}
                        disabled={!canMark}
                        className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${currentStatus === 'present' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'} ${!canMark ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        Aanwezig
                      </button>
                      <button
                        title={canMark ? '' : 'Aanwezigheid kan vanaf de lesdatum tot 14 dagen erna (en als de studio dit heeft ingeschakeld).'}
                        onClick={() => canMark && updateAttendanceStatus(lesson.id, student.enrollment_id || student.user_id, 'absent')}
                        disabled={!canMark}
                        className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${currentStatus === 'absent' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'} ${!canMark ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        Afwezig
                      </button>
                      {(attendanceAllowLate || isStudioAdmin) && (
                        <button
                          title={canMark ? '' : 'Aanwezigheid kan vanaf de lesdatum tot 14 dagen erna (en als de studio dit heeft ingeschakeld).'}
                          onClick={() => canMark && updateAttendanceStatus(lesson.id, student.enrollment_id || student.user_id, 'late')}
                          disabled={!canMark}
                          className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${currentStatus === 'late' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'} ${!canMark ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          Te laat
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {isReportedAbsent ? (
                        <span className="px-2 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700">Afwezig gemeld</span>
                      ) : currentStatus ? (
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${currentStatus === 'present' ? 'bg-green-50 text-green-700' : currentStatus === 'absent' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {currentStatus === 'present' ? 'Aanwezig' : currentStatus === 'absent' ? 'Afwezig' : currentStatus === 'late' ? 'Te laat' : String(currentStatus)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">Geen aanwezigheid geregistreerd</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {Object.keys(attendanceData[lesson.id] || {}).some((key) => key) && (
            <div className="flex justify-end pt-3">
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
                Opslaan
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
