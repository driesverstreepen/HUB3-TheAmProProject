'use client'

import Modal from '@/components/Modal'
import { Calendar, Clock, MapPin } from 'lucide-react'
import { formatDateOnly, formatTimeStr, formatEndTime } from '@/lib/formatting'

interface Props {
  isOpen: boolean
  onClose: () => void
  program: any
  lesson: any
}

export default function UserLessonDetailsModal({ isOpen, onClose, program, lesson }: Props) {
  if (!lesson) return null

  const endTime = formatEndTime(lesson.time, lesson.duration_minutes || 0)
  const primaryLocation =
    (program?.program_locations && Array.isArray(program.program_locations) && program.program_locations[0]?.locations)
      ? program.program_locations[0].locations
      : null

  const addressLine = primaryLocation
    ? [primaryLocation.adres, primaryLocation.postcode, primaryLocation.city].filter(Boolean).join(' ')
    : ''

  return (
    <Modal isOpen={isOpen} onClose={onClose} contentClassName="max-w-md" ariaLabel="Les details">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900 truncate">{lesson.title || 'Les'}</h3>
          <div className="mt-1 space-y-1 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>{formatDateOnly(lesson.date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>{formatTimeStr(lesson.time)}{endTime ? ` - ${endTime}` : ''}</span>
            </div>
            {primaryLocation ? (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-500" />
                <div className="min-w-0">
                  <div className="truncate">{primaryLocation.name}</div>
                  {addressLine ? <div className="truncate text-slate-600">{addressLine}</div> : null}
                </div>
              </div>
            ) : null}
          </div>
          {lesson.description ? (
            <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{lesson.description}</p>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
