import { Program } from '@/types/database'
import { Calendar, Clock, MapPin, Users } from 'lucide-react'
import Tag from '@/components/ui/Tag'
import StyleTags from '@/components/ui/StyleTags'
import { formatDateOnly } from '@/lib/formatting'

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
    date: string;
    start_time: string;
    end_time: string;
  } | {
    date: string;
    start_time: string;
    end_time: string;
  }[];
  locations?: {
    id: string;
    name: string;
    city?: string;
    adres?: string;
  }[];
}

interface ProgramDetailHeaderProps {
  program: ExtendedProgram
  studioName: string
  groupDetails?: {
    weekday: number;
    start_time: string;
    end_time: string;
    season_start?: string;
    season_end?: string;
  } | null
  locations?: {
    id: string;
    name: string;
    city?: string;
    adres?: string;
  }[]
  onBack?: () => void
  backText?: string
}

const weekdayNames = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

function getWeekdayName(weekday: number): string {
  // DB weekday: 0 = Zondag .. 6 = Zaterdag
  if (typeof weekday === 'number' && weekday >= 0 && weekday <= 6) {
    if (weekday === 0) return 'Zondag';
    // weekdayNames array is Monday-first, so subtract 1 for 1..6
    return weekdayNames[weekday - 1];
  }
  return 'Onbekend';
}

function formatTime(time: string): string {
  return time.substring(0, 5);
}

export default function ProgramDetailHeader({
  program,
  studioName,
  groupDetails,
  locations = [],
  onBack,
  backText = "Terug naar Mijn Programma's"
}: ProgramDetailHeaderProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 mb-6">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {backText}
        </button>
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">{program.title}</h1>

          {/* Badges directly under title */}
          <div className="mb-4 flex flex-wrap gap-2">
            {program.dance_style && (
              <StyleTags styles={program.dance_style} asPill className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" />
            )}
            {program.level && (
              <Tag asPill className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 capitalize">{program.level.replace('_', ' ')}</Tag>
            )}
            {(program.min_age || program.max_age) && (
              <Tag asPill className="bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                {program.min_age && program.max_age
                  ? `${program.min_age}-${program.max_age} jaar`
                  : program.min_age
                    ? `vanaf ${program.min_age} jaar`
                    : `tot ${program.max_age} jaar`}
              </Tag>
            )}
          </div>

          <p className="text-sm text-slate-600 mb-2">{studioName}</p>
        </div>
        <span className={`px-4 py-2 rounded-full text-xs font-medium ${
          program.program_type === 'workshop'
            ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
        }`}>
          {program.program_type === 'workshop' ? 'Workshop' : 'Groepscursus'}
        </span>
      </div>

      {/* Description */}
      {program.description && (
        <p className="text-sm text-slate-700 mb-6 leading-relaxed">{program.description}</p>
      )}

      {/* Program Details Inline */}
      {groupDetails && (
        <div className="mb-6">
          <div className="flex items-center flex-wrap gap-4 text-sm text-slate-700">
            {groupDetails.weekday !== undefined && (
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-slate-400" />
                <span className="capitalize">{getWeekdayName(groupDetails.weekday)}</span>
              </div>
            )}

            {groupDetails.start_time && groupDetails.end_time && (
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                <span>{formatTime(groupDetails.start_time)} - {formatTime(groupDetails.end_time)}</span>
              </div>
            )}

            {locations.length > 0 && (
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-slate-400" />
                <span>
                  <span className="font-medium">{locations[0].name}</span>
                  {locations[0].adres ? <span className="text-slate-600"> — {locations[0].adres}</span> : null}
                  {locations[0].city && (
                    <span className="text-slate-600">, {locations[0].city}</span>
                  )}
                </span>
              </div>
            )}

            {groupDetails.season_start && groupDetails.season_end && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-slate-400" />
                  <span className="text-slate-600">Seizoen: {formatDateOnly(groupDetails.season_start)} - {formatDateOnly(groupDetails.season_end)}</span>
                </div>

                {/* Capacity next to season dates */}
                {program.capacity && (
                  <div className="flex items-center gap-2 text-slate-700">
                    <Users size={14} className="text-slate-400" />
                    <span className="text-sm">Max. {program.capacity} deelnemers</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Additional Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Price */}
        {program.price && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-green-700">€{program.price.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  )
}