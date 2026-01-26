'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ContentContainer from '@/components/ContentContainer'
import { ArrowLeft, Calendar, MapPin } from 'lucide-react'
import { formatDateOnlyFromISODate, isISODatePast } from '@/lib/formatting'
import { useNotification } from '@/contexts/NotificationContext'

type Programma = {
  id: string
  title: string
  description: string | null
  applications_open: boolean
  application_deadline: string | null
  location_id?: string | null
  rehearsal_period_start?: string | null
  rehearsal_period_end?: string | null
  performance_dates?: string[] | null
  region?: string | null
  program_type?: 'performance' | 'workshop' | string | null
}

type LocationRow = {
  id: string
  name: string
  address: string | null
}

export default function AmproProgrammaDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showError } = useNotification()
  const programmaId = useMemo(() => String((params as any)?.programmaId || ''), [params])

  const [programma, setProgramma] = useState<Programma | null>(null)
  const [location, setLocation] = useState<LocationRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      setIsLoggedIn(!!data?.session?.user)
    }

    load()

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => {
      cancelled = true
      try {
        authListener?.subscription?.unsubscribe?.()
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)

        const { data, error } = await supabase
          .from('ampro_programmas')
          .select(
            'id,title,description,applications_open,application_deadline,location_id,rehearsal_period_start,rehearsal_period_end,performance_dates,region,program_type',
          )
          .eq('id', programmaId)
          .maybeSingle()

        if (error) throw error
        if (!data?.id) {
          router.replace('/ampro/programmas')
          return
        }

        let loc: LocationRow | null = null
        const locationId = (data as any)?.location_id ? String((data as any).location_id) : ''
        if (locationId) {
          const locResp = await supabase
            .from('ampro_locations')
            .select('id,name,address')
            .eq('id', locationId)
            .maybeSingle()

          if (!locResp.error && locResp.data?.id) loc = locResp.data as any
        }

        if (!cancelled) {
          setProgramma(data as any)
          setLocation(loc)
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Kon programma niet laden')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [programmaId, router])

  const applyPath = `/ampro/programmas/${encodeURIComponent(programmaId)}/apply`
  const applyHref = isLoggedIn ? applyPath : `/ampro/login?next=${encodeURIComponent(applyPath)}`

  const deadlinePassed = isISODatePast(programma?.application_deadline)
  const isClosed = Boolean(programma && (!programma.applications_open || deadlinePassed))

  const performanceDatesLabel = (() => {
    const dates = programma?.performance_dates || []
    if (!Array.isArray(dates) || dates.length === 0) return null
    return dates.map((d) => formatDateOnlyFromISODate(d)).join(', ')
  })()

  const rehearsalLabel = (() => {
    const start = programma?.rehearsal_period_start
    const end = programma?.rehearsal_period_end
    if (start && end) return `${formatDateOnlyFromISODate(start)} – ${formatDateOnlyFromISODate(end)}`
    if (start) return `vanaf ${formatDateOnlyFromISODate(start)}`
    if (end) return `tot ${formatDateOnlyFromISODate(end)}`
    return null
  })()

  const infoHasAny = Boolean(location || performanceDatesLabel || rehearsalLabel || programma?.application_deadline)

  const typeLabel = (() => {
    const t = (programma?.program_type || '').toString().toLowerCase()
    if (t === 'workshop') return 'Workshop'
    if (t === 'performance') return 'Voorstelling'
    return t ? t : 'Programma'
  })()

  return (
    <div className="min-h-screen bg-gray-50">
      <ContentContainer className="py-8">
        <button
          type="button"
          onClick={() => router.push('/ampro/programmas')}
          className="mb-6 inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5" />
          Terug naar programma’s
        </button>

        {loading ? <div className="mt-6 text-sm text-gray-600">Laden…</div> : null}
        {programma ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="space-y-6 md:col-span-3">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">{programma.title}</h1>

                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center px-4 py-2 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                        {typeLabel}
                      </span>
                      {programma.region ? (
                        <span className="inline-flex items-center px-4 py-2 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {programma.region}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {infoHasAny ? (
                  <div className="mt-6 border-t border-gray-100 pt-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-3">Informatie</h2>
                    <div className="grid gap-3 text-sm text-gray-500">
                      {location ? (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                          <div className="grid gap-1">
                            <div>
                              <span className="text-gray-500">Locatie:</span> {location.name}
                            </div>
                            {location.address ? (
                              <div className="text-xs text-gray-500 whitespace-pre-wrap">{location.address}</div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {rehearsalLabel ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <span>Repetitie periode: {rehearsalLabel}</span>
                        </div>
                      ) : null}
                      {performanceDatesLabel ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <span>Voorstelling periode: {performanceDatesLabel}</span>
                        </div>
                      ) : null}
                      {programma.application_deadline ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <span>Deadline: {formatDateOnlyFromISODate(programma.application_deadline)}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {programma.description ? (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Beschrijving</h2>
                  <p className="text-gray-500 leading-relaxed whitespace-pre-wrap">{programma.description}</p>
                </div>
              ) : null}
            </div>

            <div className="md:col-span-1">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-blue-50 sticky top-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Inschrijven</h3>

                <div className="mb-4 p-4 bg-blue-50 border border-gray-200 rounded-3xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900">Status</span>
                    <span className="flex items-center pr-4 text-xl font-bold text-gray-900">
                      {isClosed ? 'Closed' : 'Open'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {programma.application_deadline ? `Deadline: ${formatDateOnlyFromISODate(programma.application_deadline)}` : ''}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isClosed}
                  onClick={() => router.push(applyHref)}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 mt-6 bg-blue-600 hover:bg-blue-700 text-gray-50 rounded-3xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Inschrijven
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ContentContainer>
    </div>
  )
}
