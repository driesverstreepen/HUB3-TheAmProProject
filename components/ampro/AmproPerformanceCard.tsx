'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, ChevronRight, MapPin } from 'lucide-react'
import { formatDateOnlyFromISODate, isISODatePast } from '@/lib/formatting'

export type AmproPerformanceCardModel = {
  id: string
  title: string
  description: string | null
  applications_open: boolean
  application_deadline: string | null
  rehearsal_period_start?: string | null
  rehearsal_period_end?: string | null
  performance_dates?: string[] | null
  region?: string | null
}

export default function AmproPerformanceCard({
  performance,
  applyHref,
}: {
  performance: AmproPerformanceCardModel
  applyHref: string
}) {
  const router = useRouter()

  const deadlinePassed = isISODatePast(performance.application_deadline)
  const isClosed = !performance.applications_open || deadlinePassed

  const performanceDatesLabel = (() => {
    const dates = performance.performance_dates || []
    if (!Array.isArray(dates) || dates.length === 0) return null
    const formatted = dates.map((d) => formatDateOnlyFromISODate(d))
    if (formatted.length <= 2) return formatted.join(', ')
    return `${formatted.slice(0, 2).join(', ')} +${formatted.length - 2}`
  })()

  const rehearsalLabel = (() => {
    const start = performance.rehearsal_period_start
    const end = performance.rehearsal_period_end
    if (start && end) return `${formatDateOnlyFromISODate(start)} – ${formatDateOnlyFromISODate(end)}`
    if (start) return `vanaf ${formatDateOnlyFromISODate(start)}`
    if (end) return `tot ${formatDateOnlyFromISODate(end)}`
    return null
  })()

  return (
    <div className="h-full">
      <Link
        href={`/ampro/programmas/${encodeURIComponent(performance.id)}`}
        className="w-full bg-white rounded-3xl p-4 flex flex-col relative overflow-visible elev-1 h-full min-h-[180px] group hover:bg-gray-50"
      >
        {/* color accent removed */}

        {deadlinePassed ? (
          <div className="absolute inset-0 rounded-3xl bg-gray-200/60 flex items-center justify-center pointer-events-none">
            <div className="text-xl font-bold text-gray-700">Applications closed</div>
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xl font-bold min-w-0 truncate text-gray-900">{performance.title}</h3>
            {performance.description ? (
              <p className="mt-2 text-sm text-gray-500 line-clamp-3">{performance.description}</p>
            ) : null}

            {(performance.region || performanceDatesLabel || rehearsalLabel) ? (
              <div className="mt-3 flex flex-col gap-1 text-xs text-gray-500">
                {performance.region ? (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-gray-500" />
                    <span className="truncate">{performance.region}</span>
                  </div>
                ) : null}
                {performanceDatesLabel ? (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-gray-500" />
                    <span>Voorstelling: {performanceDatesLabel}</span>
                  </div>
                ) : null}
                {rehearsalLabel ? (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-gray-500" />
                    <span>Repetitie: {rehearsalLabel}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 rounded-full p-1 text-gray-500 group-hover:text-blue-600">
            <ChevronRight className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-auto pt-4 flex items-end justify-between gap-4">
          <div className="text-xs text-gray-500">
            Inschrijvingen: {isClosed ? 'gesloten' : 'open'}
            {performance.application_deadline ? ` • Deadline: ${formatDateOnlyFromISODate(performance.application_deadline)}` : ''}
          </div>

          {!isClosed ? (
            <button
              type="button"
              onClick={(e) => {
                // Allow clicking the CTA without triggering the card navigation.
                e.preventDefault()
                e.stopPropagation()
                router.push(applyHref)
              }}
              className="inline-flex h-9 items-center justify-center rounded-3xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Inschrijven
            </button>
          ) : null}

        </div>
      </Link>
    </div>
  )
}
