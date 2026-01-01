"use client";

import React from 'react';
import { Calendar, Clock, MapPin, ChevronRight } from 'lucide-react';
import { formatDateOnly, formatTimeStr, formatTimeFromDate, formatCurrency } from '@/lib/formatting';
import Tag from '@/components/ui/Tag'

interface Props {
  lessonMeta?: any;
  formData?: any;
  program?: any;
  status?: string;
  onOpen?: () => void;
  className?: string;
  layout?: 'default' | 'programGrid' | 'programList';
}

export default function LessonCard({ lessonMeta, formData, program, status, onOpen, className, layout = 'default' }: Props) {
  const title = lessonMeta?.title || program?.title || 'Proefles';
  const date = lessonMeta?.date || lessonMeta?.start_datetime || (program?.workshop_details?.[0]?.date ?? program?.workshop_details?.[0]?.start_datetime ?? null);
  const start = lessonMeta?.start_time || lessonMeta?.time || (lessonMeta?.start_datetime ? formatTimeFromDate(String(lessonMeta.start_datetime)) : null) || (program?.workshop_details?.[0]?.start_time ?? (program?.workshop_details?.[0]?.start_datetime ? formatTimeFromDate(String(program.workshop_details[0].start_datetime)) : null)) || null;
  const end = lessonMeta?.end_time || lessonMeta?.end_datetime || (program?.workshop_details?.[0]?.end_time ?? program?.workshop_details?.[0]?.end_datetime) || null;
  const duration = lessonMeta?.duration_minutes || null;
  const locationObj = lessonMeta?.location || (program?.locations?.[0] || null)
  const locationName = locationObj?.name || null;
  const locationAddress = locationObj
    ? [locationObj.adres || locationObj.address, locationObj.postcode || locationObj.postal_code, locationObj.city].filter(Boolean).join(' ')
    : '';
  const locationDisplay = locationName ? (locationAddress ? `${locationName} — ${locationAddress}` : locationName) : null;

  const priceText = (
    formData?.price_snapshot ? formatCurrency(formData.price_snapshot, { cents: true }) :
    lessonMeta?.price_snapshot ? formatCurrency(lessonMeta.price_snapshot, { cents: true }) :
    program?.price ? formatCurrency(Number(program.price), { cents: false }) :
    null
  )

  const handleKey = (e: React.KeyboardEvent) => {
    if (!onOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }

  const isTrialLike = (() => {
    const t = String(program?.program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (program?.is_trial) return true;
    if (program?.title && String(program.title).toLowerCase().includes('proef')) return true;
    if (title && String(title).toLowerCase().includes('proef')) return true;
    if (typeof program?.price === 'number' && program.price === 0) return true;
    return false;
  })();

  const accentBgClass = isTrialLike
    ? 'bg-emerald-500'
    : String(program?.program_type || '').toLowerCase() === 'workshop'
    ? 'bg-orange-500'
    : String(program?.program_type || '').toLowerCase() === 'group'
    ? 'bg-blue-500'
    : 'bg-emerald-500';

  // Program-like layouts used on /mijn-lessen so proeflessen match the other program cards
  if (layout === 'programGrid') {
    return (
      <div
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={handleKey}
        className={`w-full rounded-2xl p-3 sm:p-4 flex flex-col relative overflow-visible border border-slate-200 border-l-4 border-l-emerald-500 elev-1 h-full min-h-40 sm:min-h-[200px] bg-white ${onOpen ? 'cursor-pointer' : ''}${className ? ` ${className}` : ''}`}
      >
        <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${accentBgClass}`} />
        {onOpen && (
          <button
            onClick={onOpen}
            className="absolute top-3 right-3 text-slate-400 hover:text-emerald-700 p-1 rounded-full"
            aria-label="Meer info"
          >
            <ChevronRight size={18} />
          </button>
        )}
        <div className="flex justify-between items-start mb-2 sm:mb-3">
          <div className={`flex-1 min-w-0 ${onOpen ? 'pr-10' : ''}`}>
            <div className="flex items-start gap-2 mb-1 min-w-0">
              <h3 className="t-h3 font-semibold min-w-0 truncate">{title}</h3>
              {status ? (
                <span className={`inline-flex items-center px-2 py-1 rounded-full t-caption font-semibold ${status?.toLowerCase().startsWith('actief') ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200'}`}>
                  {status}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <div className="hidden sm:inline-flex">
                <Tag asPill>Proefles</Tag>
              </div>

              <div className="flex items-center gap-2">
                <Tag>{program?.dance_style || 'Onbekend'}</Tag>
                <Tag>{program?.level || 'Alle niveaus'}</Tag>
                {program?.min_age !== undefined && program?.min_age !== null ? (
                  <Tag>{`${program.min_age}+ jaar`}</Tag>
                ) : program?.max_age !== undefined && program?.max_age !== null ? (
                  <Tag>{`tot ${program.max_age} jaar`}</Tag>
                ) : (
                  <Tag>Alle leeftijden</Tag>
                )}
              </div>
            </div>
          </div>

          {priceText ? (
            <div className="text-right ml-4">
              <p className="t-h3 font-bold">{priceText}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-1 sm:space-y-2 t-bodySm mb-3 sm:mb-4">
          {locationDisplay ? (
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-slate-400" />
              <span>{locationDisplay}</span>
            </div>
          ) : null}

          {(date || start || end) ? (
            <div className="flex items-center gap-4">
              {date ? (
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-slate-400" />
                  <span>{formatDateOnly(date)}</span>
                </div>
              ) : null}
              {(start || end) ? (
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  <span>{[start ? formatTimeStr(start) : '', end ? ` - ${formatTimeStr(end)}` : ''].filter(Boolean).join('')}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (layout === 'programList') {
    return (
      <div
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={handleKey}
        className={`relative overflow-hidden w-full rounded-xl p-3 sm:p-4 flex items-center gap-4 elev-1 ${onOpen ? 'cursor-pointer hover:shadow-md' : ''} transition-shadow bg-white border border-slate-200${className ? ` ${className}` : ''}`}
      >
        <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${accentBgClass}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h3 className="t-h4 font-semibold truncate">{title}</h3>
              {status ? (
                <span className={`inline-flex items-center px-2 py-1 rounded-full t-caption font-semibold ${status?.toLowerCase().startsWith('actief') ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200'}`}>
                  {status}
                </span>
              ) : null}
            </div>
            {priceText ? <div className="text-right t-h4 font-semibold">{priceText}</div> : null}
          </div>

          <div className="mt-1 flex items-center gap-2 t-bodySm">
            <div className="hidden sm:inline-flex">
              <Tag>Proefles</Tag>
            </div>
            {program?.dance_style ? <Tag>{program.dance_style}</Tag> : null}
            {program?.level ? <Tag>{program.level}</Tag> : null}
            {((program?.min_age !== null && program?.min_age !== undefined) || (program?.max_age !== null && program?.max_age !== undefined)) ? (
              (() => {
                if (program?.min_age !== null && program?.min_age !== undefined && program?.max_age !== null && program?.max_age !== undefined) {
                  return <Tag>{`${program.min_age}-${program.max_age} jaar`}</Tag>
                }
                if (program?.min_age !== null && program?.min_age !== undefined) {
                  return <Tag>{`${program.min_age}+ jaar`}</Tag>
                }
                return <Tag>{`tot ${program.max_age} jaar`}</Tag>
              })()
            ) : (
              <Tag>Alle leeftijden</Tag>
            )}
          </div>

          <div className="mt-2 t-bodySm flex flex-wrap items-center gap-x-4 gap-y-2">
            {locationDisplay ? (
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-slate-400" />
                <span className="truncate">{locationDisplay}</span>
              </div>
            ) : null}

            {date ? (
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-slate-400" />
                <span className="whitespace-nowrap">{formatDateOnly(date)}</span>
              </div>
            ) : null}

            {(start || end) ? (
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-slate-400" />
                <span className="whitespace-nowrap">
                  {start && end ? `${formatTimeStr(start)} — ${formatTimeStr(end)}` : (start ? formatTimeStr(start) : end ? formatTimeStr(end) : '')}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="text-slate-400">
          <ChevronRight size={18} />
        </div>
      </div>
    );
  }

  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={handleKey}
      className={`relative overflow-hidden cursor-pointer p-4 rounded-lg elev-1 transition-shadow bg-white border border-slate-200${className ? ` ${className}` : ''}`}
    >
      <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${accentBgClass}`} />
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="t-h4 font-semibold">{title}</h3>
          <div className="mt-1 flex items-center gap-2 t-bodySm">
            {date && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={14} className="text-emerald-600" />
                <span className="t-noColor">{formatDateOnly(date)}</span>
              </span>
            )}

            {start && (
              <span className="inline-flex items-center gap-1">
                <Clock size={14} className="text-emerald-600" />
                <span className="t-noColor">{formatTimeStr(start)}</span>
              </span>
            )}

            {end && (
              <span className="inline-flex items-center gap-1">
                <Clock size={14} className="text-emerald-600" />
                <span className="t-noColor">{formatTimeStr(end)}</span>
              </span>
            )}

            {duration && (
              <span className="t-bodySm t-noColor">{duration} min</span>
            )}
          </div>
        </div>

        <div className="text-right">
          {priceText ? (
            <div className="t-h4 font-semibold">{priceText}</div>
          ) : null}
          <span className={`inline-flex items-center px-2 py-1 rounded-full t-caption t-noColor font-semibold ${status === 'actief' || status?.toLowerCase().startsWith('actief') ? 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200' : 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200'}`}>{status}</span>
        </div>
      </div>

      {locationName && (
        <div className="flex items-center gap-2 t-bodySm t-noColor">
          <MapPin size={14} />
          <span>{locationName}</span>
        </div>
      )}

      {lessonMeta?.description && (
        <p className="t-bodySm mt-2">{lessonMeta.description}</p>
      )}
    </div>
  );
}
