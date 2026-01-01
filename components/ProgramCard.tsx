import { Program } from '@/types/database'
import { MapPin, Calendar, Clock } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { formatDateOnly, formatTimeFromDate, formatTimeStr } from '@/lib/formatting'
import Tag from '@/components/ui/Tag'

interface ExtendedProgram extends Program {
  group_details?: {
    weekday: number;
    start_time: string;
    end_time: string;
    season_start?: string;
    season_end?: string;
  } | {
    weekday: number;
    start_time: string;
    end_time: string;
    season_start?: string;
    season_end?: string;
  }[];
  workshop_details?: {
    date?: string;
    start_time?: string;
    end_time?: string;
    start_datetime?: string;
    end_datetime?: string;
  } | {
    date?: string;
    start_time?: string;
    end_time?: string;
    start_datetime?: string;
    end_datetime?: string;
  }[];
  locations?: {
    id: string;
    name: string;
    city?: string;
    adres?: string;
  }[];
}

interface ProgramCardProps {
  program: ExtendedProgram
  // If false, capacity will not be shown. Default behavior when undefined is to show capacity.
  showCapacity?: boolean
  // When false, hides the program description (default: true)
  showDescription?: boolean
  // Optional current enrolled count (when parent fetched enrollment counts)
  enrolledCount?: number
  // Optional status (e.g. 'actief') to display as badge inside the card
  status?: string
  // Optional handler to open/view the program (renders chevron inside card)
  onOpen?: () => void
  // When true, show location information (default: true)
  showLocation?: boolean
  // When true, show a full-width "Meer info" button under the card (default: false)
  // showInfoLabel removed; full-width 'Meer info' buttons deprecated
}

const weekdayNames = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];



export default function ProgramCard({ program, showCapacity, showDescription = true, enrolledCount, status, onOpen, showLocation = true }: ProgramCardProps) {
  

  // normalize detail objects (some endpoints return an array, others a single object)
  const groupFirst = program.group_details ? (Array.isArray(program.group_details) ? program.group_details[0] : program.group_details) : null;
  const workshopFirst = program.workshop_details ? (Array.isArray(program.workshop_details) ? program.workshop_details[0] : program.workshop_details) : null;

  

  // Prefer explicit program location (name + address), fall back to studio name or generic label
  const firstLocation = program.locations && program.locations.length > 0 ? program.locations[0] : null;
  const locationDisplay = firstLocation
    ? `${firstLocation.name}${firstLocation.adres ? ` — ${firstLocation.adres}` : firstLocation.city ? ` — ${firstLocation.city}` : ''}`
    : ((program as any).studio?.naam || 'Locatie onbekend');

  // Detect trial programs (proeflessen) and prefer that styling
  const isTrialProgram = (p: any) => {
    const t = String((p as any).program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (p.title && String(p.title).toLowerCase().includes('proef')) return true;
    if ((p as any).is_trial) return true;
    if (p.price === 0) return true;
    return false;
  };

  const isTrial = isTrialProgram(program);

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

  // Robust workshop date/time display: support new fields (`date`, `start_time`, `end_time`) and legacy (`start_datetime`, `end_datetime`)
  const workshopDateRaw = workshopFirst?.date ?? workshopFirst?.start_datetime ?? null;
  const displayDate = workshopDateRaw ? formatDateOnly(String(workshopDateRaw)) : '';

  const startRaw = workshopFirst?.start_time ?? workshopFirst?.start_datetime ?? null;
  const endRaw = workshopFirst?.end_time ?? workshopFirst?.end_datetime ?? null;

  const displayStart = workshopFirst?.start_time ? formatTimeStr(workshopFirst.start_time) : (workshopFirst?.start_datetime ? formatTimeFromDate(String(workshopFirst.start_datetime)) : '');
  const displayEnd = workshopFirst?.end_time ? formatTimeStr(workshopFirst.end_time) : (workshopFirst?.end_datetime ? formatTimeFromDate(String(workshopFirst.end_datetime)) : '');

  const displayGroupStart = groupFirst?.start_time
    ? (String(groupFirst.start_time).includes('T') ? formatTimeFromDate(String(groupFirst.start_time)) : formatTimeStr(groupFirst.start_time))
    : '';
  const displayGroupEnd = groupFirst?.end_time
    ? (String(groupFirst.end_time).includes('T') ? formatTimeFromDate(String(groupFirst.end_time)) : formatTimeStr(groupFirst.end_time))
    : '';

  const capacityAllowedByProgram = (program as any).show_capacity_to_users ?? true

  const hasVisibleLinkedTrial = (() => {
    const titleKey = (program as any).linked_trial_program_title;
    if (titleKey !== undefined) return !!titleKey;

    const explicit = (program as any).__has_visible_linked_trial;
    if (typeof explicit === 'boolean') return explicit;

    return !!(program as any).linked_trial_program_id;
  })();

  return (
  <div
    role={onOpen ? 'button' : undefined}
    tabIndex={onOpen ? 0 : undefined}
    onClick={onOpen}
    onKeyDown={handleKey}
    className={`w-full bg-white rounded-2xl p-3 sm:p-4 flex flex-col relative overflow-visible elev-1 h-full min-h-[160px] sm:min-h-[200px] ${onOpen ? 'cursor-pointer' : ''} group`}
  >
    {/* Always-visible color indicator stripe (rounded to match card corners) */}
    <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${accentBgClass}`} />
    {/* Linked trial indicator: larger circle overlapping the top-right rounded corner */}
    {hasVisibleLinkedTrial && (
      <div className="absolute -top-2 -right-2 z-50">
        <span
          aria-hidden="true"
          className="inline-block w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-500 shadow-md"
        />
        <div className="pointer-events-none absolute -top-10 right-0 mb-2 w-max opacity-0 scale-95 transform transition-all duration-150 group-hover:opacity-100 group-hover:scale-105 z-50">
          <div className="bg-white border border-slate-100 rounded-lg px-3 py-2 t-bodySm font-medium shadow-md">
            Bevat proefles
          </div>
        </div>
      </div>
    )}
      <div className="flex justify-between items-start mb-2 sm:mb-3">
        <div className={`flex-1 min-w-0 ${onOpen ? 'pr-10' : ''}`}>
          <div className="flex items-start gap-2 mb-1 min-w-0">
            <h3 className="t-h3 font-semibold min-w-0 truncate">{program.title}</h3>
            {status && (
              <span className={`inline-flex items-center px-2 py-1 rounded-full t-caption font-semibold ${status.toLowerCase().startsWith('actief') ? 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200' : 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200'}`}>
                {status}
              </span>
            )}
                    {/* Volzet indicator when capacity reached */}
                    {program.capacity && ((typeof enrolledCount === 'number' && enrolledCount >= program.capacity) || (typeof (program as any).enrolled_count === 'number' && (program as any).enrolled_count >= program.capacity) || (typeof (program as any).enrolledCount === 'number' && (program as any).enrolledCount >= program.capacity)) && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full t-caption font-semibold bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200">
                        {(program as any).waitlist_enabled ? 'Volzet · Wachtlijst' : 'Volzet'}
                      </span>
                    )}
          </div>
          <div className="flex items-center gap-2 mb-1 sm:mb-2">
            {/* program type tag: hide on mobile, rely on left color stripe */}
            <span className={`hidden sm:inline-flex items-center px-2 py-1 rounded-md t-caption font-medium ${isTrial ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : (program.program_type === 'group' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : program.program_type === 'workshop' ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200')}`}>
              {isTrial ? 'Proefles' : (program.program_type === 'group' ? 'Cursus' : program.program_type === 'workshop' ? 'Workshop' : 'Proefles')}
            </span>

            {/* Always show the following tags: dance style, level, age info */}
            <div className="flex items-center gap-2">
              <Tag>
                {program.dance_style || 'Onbekend'}
              </Tag>
              <Tag>
                {program.level || 'Alle niveaus'}
              </Tag>
              {program.min_age !== undefined && program.min_age !== null ? (
                <Tag>{`${program.min_age}+ jaar`}</Tag>
              ) : program.max_age !== undefined && program.max_age !== null ? (
                <Tag>{`tot ${program.max_age} jaar`}</Tag>
              ) : (
                <Tag>Alle leeftijden</Tag>
              )}
            </div>
          </div>
        </div>
        {program.price && (
          <div className="text-right ml-4">
            <p className="t-h3 font-bold">€{program.price}</p>
          </div>
        )}
      </div>

  {showDescription && program.description && <p className="t-bodySm mb-2 sm:mb-3">{program.description}</p>}

      {/* Show linked proefles title when provided by parent data */}
      {(program as any).linked_trial_program_title && (
        <div className="t-bodySm mb-2 sm:mb-3">
          <span className="font-semibold">Proefles programma:</span> {(program as any).linked_trial_program_title}
        </div>
      )}

      <div className="space-y-1 sm:space-y-2 t-bodySm mb-3 sm:mb-4">
        {/* Location information */}
        {showLocation && (
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-gray-400" />
            <span>{locationDisplay}</span>
          </div>
        )}

        {/* Weekday/date and hours with icons */}
        {program.program_type === 'group' && groupFirst && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
              <span>{groupFirst && typeof groupFirst.weekday === 'number' ? (groupFirst.weekday === 0 ? 'Zondag' : weekdayNames[groupFirst.weekday - 1]) : ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-slate-400" />
              <span>{`${displayGroupStart}${displayGroupStart && displayGroupEnd ? ` - ${displayGroupEnd}` : displayGroupEnd ? displayGroupEnd : ''}`}</span>
            </div>
          </div>
        )}

        {program.program_type === 'workshop' && workshopFirst && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
                  <span>{displayDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-slate-400" />
                  <span>{displayStart && displayEnd ? `${displayStart} - ${displayEnd}` : (displayStart || displayEnd || '')}</span>
            </div>
          </div>
        )}

        {/* Show capacity only when allowed by parent (showCapacity !== false) and capacity exists */}
        {program.capacity && (showCapacity !== false) && capacityAllowedByProgram && (
          <p>
            <span className="font-semibold">Max. deelnemers:</span> {program.capacity}
          </p>
        )}
      </div>

  {/* Primary action: always require opening details (onOpen) so users add to cart from program detail */}
      {/* full-width 'Meer info' button removed per request */}

      {/* small chevron affordance for opening; keep if onOpen is present to hint detail view */}
      {onOpen && (
        <button
          onClick={onOpen}
          className="absolute top-3 right-3 text-slate-400 hover:text-blue-600 p-1 rounded-full"
          aria-label="Meer info"
          title={(program as any).linked_trial_program_id ? 'Bevat proefles' : undefined}
        >
          <span className="relative inline-flex items-center">
            {/* indicator moved to container to overlap rounded corner */}
            <ChevronRight size={18} />
          </span>
        </button>
      )}
    </div>
  )
}
