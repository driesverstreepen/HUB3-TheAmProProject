"use client"

import React from 'react'
import { Calendar, Clock, MapPin } from 'lucide-react'
import { formatDateOnly, formatTimeStr } from '@/lib/formatting'

interface Props {
  title?: string
  date?: string | null
  time?: string | null
  duration?: number | null
  locationName?: string | null
  programTitle?: string | null
  requester?: string | null
  chosenTeacher?: string | null
  acceptedAt?: string | null
}

export default function ApprovedReplacementCard({ title, date, time, duration, locationName, programTitle, requester, chosenTeacher, acceptedAt }: Props) {
  return (
  <div className="p-4 rounded-lg elev-1">
      <div className="mb-3">
      <div className="font-semibold text-slate-900 dark:text-white">{title || '—'}</div>
        {programTitle ? <div className="text-xs text-slate-500 mt-1">{programTitle}</div> : null}
      </div>

      <div className="flex items-start gap-4 text-sm text-slate-700 mb-3">
        {date ? (
          <div className="inline-flex items-center gap-2">
            <Calendar size={14} className="text-slate-600" />
            <span className="text-slate-800">{formatDateOnly(date)}</span>
          </div>
        ) : null}

        {time ? (
          <div className="inline-flex items-center gap-2">
            <Clock size={14} className="text-slate-600" />
            <span className="text-slate-800">{formatTimeStr(time)}</span>
          </div>
        ) : null}

        {locationName ? (
          <div className="inline-flex items-center gap-2">
            <MapPin size={14} className="text-slate-600" />
            <span className="text-slate-800">{locationName}</span>
          </div>
        ) : null}
      </div>

      <div className="text-sm text-slate-700 space-y-1">
        <div><span className="text-slate-500">Aangevraagd door:</span> <span className="text-slate-800">{requester || '—'}</span></div>
        <div><span className="text-slate-500">Vervangingsdocent:</span> <span className="text-slate-800">{chosenTeacher || '—'}</span></div>
        <div><span className="text-slate-500">Geaccepteerd op:</span> <span className="text-slate-800">{acceptedAt ? new Date(acceptedAt).toLocaleString('nl-NL') : '—'}</span></div>
      </div>
    </div>
  )
}
