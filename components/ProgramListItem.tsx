import React from 'react'
import { MapPin, Calendar, Clock, ChevronRight, Users } from 'lucide-react'
import { formatDateOnly, formatTimeFromDate, formatTimeStr } from '@/lib/formatting'
import Tag from '@/components/ui/Tag'
import StyleTags from '@/components/ui/StyleTags'

interface Props {
  program: any
  onOpen?: () => void
  status?: string
  showLocation?: boolean
  showTags?: boolean
  teachers?: any[]
  enrolledCount?: number
}

export default function ProgramListItem({ program, onOpen, status, showLocation = true, showTags = true, teachers, enrolledCount }: Props) {
  const assignedTeachers = (() => {
    try {
      const teacherIds: string[] = program.teacher_ids || [];
      if (!teacherIds || teacherIds.length === 0) return [] as any[];
      // prefer an explicit `teachers` prop if provided (global list), otherwise check program.teachers
      if (teachers && Array.isArray(teachers) && teachers.length > 0) {
        return teacherIds.map(id => teachers.find(t => String(t.id) === String(id))).filter(Boolean);
      }
      if (program.teachers && Array.isArray(program.teachers) && program.teachers.length > 0) {
        return program.teachers.filter((t: any) => teacherIds.includes(t.id));
      }
      return [] as any[];
    } catch {
      return [] as any[];
    }
  })();
  const firstLocation = program.locations && program.locations.length > 0 ? program.locations[0] : null;
  const locationDisplay = firstLocation
    ? `${firstLocation.name}`
    : ((program as any).studio?.naam || 'Locatie onbekend');

  const groupFirst = program.group_details ? (Array.isArray(program.group_details) ? program.group_details[0] : program.group_details) : null;
  const workshopFirst = program.workshop_details ? (Array.isArray(program.workshop_details) ? program.workshop_details[0] : program.workshop_details) : null;

  const workshopTime = (() => {
    if (!workshopFirst) return { start: '', end: '' }
    const start = (workshopFirst as any).start_time
      ? formatTimeStr((workshopFirst as any).start_time)
      : (workshopFirst as any).start_datetime
        ? formatTimeFromDate(String((workshopFirst as any).start_datetime))
        : ''
    const end = (workshopFirst as any).end_time
      ? formatTimeStr((workshopFirst as any).end_time)
      : (workshopFirst as any).end_datetime
        ? formatTimeFromDate(String((workshopFirst as any).end_datetime))
        : ''
    return { start, end }
  })();

  const isTrial = (() => {
    const t = String((program as any).program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (program.title && String(program.title).toLowerCase().includes('proef')) return true;
    if ((program as any).is_trial) return true;
    if (program.price === 0) return true;
    return false;
  })();

  const accentBgClass = isTrial
    ? 'bg-emerald-500'
    : program.program_type === 'group'
    ? 'bg-blue-500'
    : program.program_type === 'workshop'
    ? 'bg-orange-500'
    : 'bg-emerald-500';

  const handleKey = (e: React.KeyboardEvent) => {
    if (!onOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={handleKey}
      className={`relative overflow-hidden w-full bg-white rounded-xl p-3 sm:p-4 flex items-center gap-4 elev-1 ${onOpen ? 'cursor-pointer hover:shadow-md' : ''} transition-shadow`}
    >
      <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${accentBgClass}`} />
      <div className="flex-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <h3 className="t-h4 font-semibold truncate">{program.title}</h3>
            {status && (
              <span className={`inline-flex items-center px-2 py-1 rounded-full t-caption font-semibold ${status.toLowerCase().startsWith('actief') ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
                {status}
              </span>
            )}
            {program.capacity && ((typeof enrolledCount === 'number' && enrolledCount >= program.capacity) || (typeof (program as any).enrolled_count === 'number' && (program as any).enrolled_count >= program.capacity)) && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full t-caption font-semibold bg-red-100 text-red-800">
                Volzet
              </span>
            )}
          </div>
          {program.price ? <div className="text-right t-h4 font-semibold">€{program.price}</div> : null}
        </div>

        {showTags && (
          <div className="mt-1 flex items-center gap-2 t-bodySm">
            <div className="flex items-center gap-2">
              {isTrial ? (
                <span className="hidden sm:inline-flex">
                  <Tag>Proefles</Tag>
                </span>
              ) : null}
              {program.dance_style && <StyleTags styles={program.dance_style} />}
              {program.level && <Tag>{program.level}</Tag>}

              {/* Age tag(s): prefer range when both present */}
              {((program.min_age !== null && program.min_age !== undefined) || (program.max_age !== null && program.max_age !== undefined)) && (() => {
                if (program.min_age !== null && program.min_age !== undefined && program.max_age !== null && program.max_age !== undefined) {
                  return <Tag>{`${program.min_age}-${program.max_age} jaar`}</Tag>
                }
                if (program.min_age !== null && program.min_age !== undefined) {
                  return <Tag>{`${program.min_age}+ jaar`}</Tag>
                }
                return <Tag>{`tot ${program.max_age} jaar`}</Tag>
              })()}
            </div>
          </div>
        )}

        <div className="mt-2 t-bodySm flex flex-wrap items-center gap-x-4 gap-y-2">
          {showLocation && (
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-slate-400" />
              <span className="truncate">{locationDisplay}</span>
            </div>
          )}

          {program.program_type === 'group' && groupFirst && (
            <div className="flex items-center gap-4">
              {(() => {
                // prefer explicit weekday, but handle 0 (Sunday) which is falsy
                const wd = (groupFirst.weekday !== undefined && groupFirst.weekday !== null) ? groupFirst.weekday : (groupFirst.day !== undefined && groupFirst.day !== null ? groupFirst.day : null)
                // DB weekday may be 0=Zondag .. 6=Zaterdag. Map 0 to 7 for UI display 1=Maandag .. 7=Zondag
                const mappedWd = (wd === 0 || String(wd) === '0') ? 7 : wd
                const weekdayNames: Record<string, string> = { '1': 'Maandag', '2': 'Dinsdag', '3': 'Woensdag', '4': 'Donderdag', '5': 'Vrijdag', '6': 'Zaterdag', '7': 'Zondag' }
                const name = (mappedWd !== null && mappedWd !== undefined) ? (weekdayNames[String(mappedWd)] || String(mappedWd)) : null
                return (
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-slate-400" />
                    {name ? <span className="font-medium">{name}</span> : <span className="opacity-70">—</span>}
                  </div>
                )
              })()}

              <div className="flex items-center gap-2">
                <Clock size={14} className="text-slate-400" />
                <span className="whitespace-nowrap">{formatTimeStr(groupFirst.start_time)}{groupFirst.start_time && groupFirst.end_time ? ` — ${formatTimeStr(groupFirst.end_time)}` : ''}</span>
              </div>
            </div>
          )}

          {program.program_type === 'workshop' && workshopFirst && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-slate-400" />
                <span className="whitespace-nowrap">{formatDateOnly((workshopFirst as any).date ?? (workshopFirst as any).start_datetime)}</span>
              </div>
              {(workshopTime.start || workshopTime.end) && (
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  <span className="whitespace-nowrap">
                    {workshopTime.start && workshopTime.end ? `${workshopTime.start} — ${workshopTime.end}` : (workshopTime.start || workshopTime.end)}
                  </span>
                </div>
              )}
            </div>
          )}

          {assignedTeachers && assignedTeachers.length > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              <Users size={14} className="text-slate-400" />
              <span className="truncate">{assignedTeachers.map((t:any) => t.naam || `${t.first_name || ''} ${t.last_name || ''}`.trim()).join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="text-slate-400">
        <ChevronRight size={18} />
      </div>
    </div>
  )
}
