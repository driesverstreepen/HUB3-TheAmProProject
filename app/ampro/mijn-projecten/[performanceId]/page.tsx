'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, MapPin, ChevronDown } from 'lucide-react'
import Select from '@/components/Select'
import Modal from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import ContentContainer from '@/components/ContentContainer'
import { formatDateOnlyFromISODate, isISODatePast } from '@/lib/formatting'
import { useNotification } from '@/contexts/NotificationContext'
import { useDevice } from '@/contexts/DeviceContext'

type Programma = {
  id: string
  title: string
  description: string | null
  location_id?: string | null
  rehearsal_period_start?: string | null
  rehearsal_period_end?: string | null
  performance_dates?: string[] | null
  region?: string | null
  program_type?: 'performance' | 'workshop' | string | null
  price?: number | null
  admin_payment_url?: string | null
}

type LocationRow = {
  id: string
  name: string
  address: string | null
}

type NoteRow = {
  id: string
  title: string
  body: string
  created_at: string
  sort_order?: number
}

type CorrectionRow = {
  id: string
  title?: string | null
  correction_date: string
  body: string
  created_at: string
  sort_order?: number
}

type AvailabilityRequestRow = {
  id: string
  performance_id: string
  is_visible: boolean
  responses_locked?: boolean
  responses_lock_at?: string | null
}

type AvailabilityDateRow = {
  id: string
  request_id: string
  day: string
  location_id?: string | null
}

type AvailabilityResponseRow = {
  request_date_id: string
  status: 'yes' | 'no' | 'maybe'
  comment: string | null
}

function formatYesNoMaybe(status: 'yes' | 'no' | 'maybe'): string {
  if (status === 'yes') return 'Beschikbaar'
  if (status === 'no') return 'Niet beschikbaar'
  return 'Misschien'
}

export default function AmproMijnProjectenDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showError, showSuccess } = useNotification()
  const { isMobile } = useDevice()
  const performanceId = useMemo(() => String((params as any)?.performanceId || ''), [params])

  const [checking, setChecking] = useState(true)
  const [programma, setProgramma] = useState<Programma | null>(null)
  const [location, setLocation] = useState<LocationRow | null>(null)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [corrections, setCorrections] = useState<CorrectionRow[]>([])
  const [creatingCheckout, setCreatingCheckout] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasPaid, setHasPaid] = useState(false)
  const [paymentPending, setPaymentPending] = useState(false)
  const [paymentReceivedAt, setPaymentReceivedAt] = useState<string | null>(null)

  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [activeNote, setActiveNote] = useState<NoteRow | null>(null)
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false)
  const [activeCorrection, setActiveCorrection] = useState<CorrectionRow | null>(null)

  const [availabilityRequest, setAvailabilityRequest] = useState<AvailabilityRequestRow | null>(null)
  const [availabilityDates, setAvailabilityDates] = useState<AvailabilityDateRow[]>([])
  const [availabilityDateLocationsById, setAvailabilityDateLocationsById] = useState<Record<string, LocationRow>>({})
  const [availabilityDraft, setAvailabilityDraft] = useState<Record<string, { status: 'yes' | 'no' | 'maybe'; comment: string }>>({})
  const [savingAvailability, setSavingAvailability] = useState(false)
  const [hasAnyAvailabilityResponse, setHasAnyAvailabilityResponseState] = useState<boolean>(false)
  const [isAssignedToRequest, setIsAssignedToRequest] = useState(false)
  const [availabilityOpen, setAvailabilityOpen] = useState(true)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setChecking(true)

        const { data: sessionData } = await supabase.auth.getSession()
        const user = sessionData?.session?.user
        const clientAccessToken = String((sessionData as any)?.session?.access_token || '')
        if (!cancelled) setUserId(String((user as any)?.id || ''))
        if (!user) {
          router.replace(`/ampro/login?next=${encodeURIComponent(`/ampro/mijn-projecten/${performanceId}`)}`)
          return
        }

        // Require that the user is accepted (in roster) for this performance.
        const rosterResp = await supabase
          .from('ampro_roster')
          .select('performance_id')
          .eq('performance_id', performanceId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (rosterResp.error) throw rosterResp.error
        if (!rosterResp.data?.performance_id) {
          router.replace('/ampro/mijn-projecten')
          return
        }

        const perfResp = await supabase
          .from('ampro_programmas')
          .select(
            'id,title,description,location_id,rehearsal_period_start,rehearsal_period_end,performance_dates,region,program_type,price,admin_payment_url'
          )
          .eq('id', performanceId)
          .maybeSingle()

        if (perfResp.error) throw perfResp.error
        if (!perfResp.data?.id) {
          router.replace('/ampro/mijn-projecten')
          return
        }

        let loc: LocationRow | null = null
        const locationId = (perfResp.data as any)?.location_id ? String((perfResp.data as any).location_id) : ''
        if (locationId) {
          const locResp = await supabase
            .from('ampro_locations')
            .select('id,name,address')
            .eq('id', locationId)
            .maybeSingle()

          if (!locResp.error && locResp.data?.id) loc = locResp.data as any
        }

        const notesResp = await supabase
          .from('ampro_notes')
          .select('id,title,body,sort_order,created_at')
          .eq('performance_id', performanceId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })

        if (notesResp.error) throw notesResp.error

        const correctionsResp = await supabase
          .from('ampro_corrections')
          .select('id,title,correction_date,body,sort_order,created_at')
          .eq('performance_id', performanceId)
          .eq('visible_to_accepted', true)
          .order('sort_order', { ascending: true })
          .order('correction_date', { ascending: false })
          .order('created_at', { ascending: false })
        if (correctionsResp.error) throw correctionsResp.error

        // Load the current user's application to obtain payment status
        try {
          const appResp = await supabase
            .from('ampro_applications')
            .select('id,paid,payment_received_at')
            .eq('performance_id', performanceId)
            .eq('user_id', user.id)
            .maybeSingle()

          if (!appResp.error && appResp.data) {
            setHasPaid(Boolean((appResp.data as any).paid))
            setPaymentReceivedAt(((appResp.data as any).payment_received_at as string) || null)
          }
        } catch (e) {
          // swallow; payment status is optional
        }

        // Stripe integration removed from AmPro detail: admin_payment_url on the program is used.

        // Fetch availability via server API to avoid RLS hiding private requests
        let dates: AvailabilityDateRow[] = []
        let draft: Record<string, { status: 'yes' | 'no' | 'maybe'; comment: string }> = {}
        let anyResponse = false
        let dateLocationMap: Record<string, LocationRow> = {}

        try {
          const resp = await fetch(`/api/ampro/availability/${encodeURIComponent(performanceId)}`, {
            headers: { Authorization: `Bearer ${clientAccessToken}` },
          })

          const json = await resp.json()
          if (!resp.ok) {
            // No request visible or forbidden — keep graceful fallback
          } else if (json?.request) {
            const req = json.request
            const fetchedDates = Array.isArray(json.dates) ? json.dates : []
            const fetchedResponses = Array.isArray(json.responses) ? json.responses : []
            const fetchedDateLocations = Array.isArray(json.dateLocations) ? json.dateLocations : []

            dates = fetchedDates as any

            const locMap: Record<string, LocationRow> = {}
            for (const l of fetchedDateLocations) {
              const id = String((l as any)?.id || '')
              if (!id) continue
              locMap[id] = {
                id,
                name: String((l as any)?.name || id),
                address: (l as any)?.address ? String((l as any).address) : null,
              }
            }
            dateLocationMap = locMap

            const byDateId: Record<string, AvailabilityResponseRow> = {}
            for (const r of fetchedResponses) {
              const id = String((r as any)?.request_date_id || '')
              if (!id) continue
              byDateId[id] = r as any
              anyResponse = true
            }

            for (const d of dates) {
              const existing = byDateId[String(d.id)]
              const status = (existing?.status || 'maybe') as any
              const comment = String(existing?.comment || '')
              draft[String(d.id)] = {
                status: status === 'yes' || status === 'no' ? status : 'maybe',
                comment,
              }
            }

            setIsAssignedToRequest(Boolean(json.isAssignedToRequest))
            setAvailabilityRequest(req as any)
          }
        } catch (err) {
          // ignore and fall back to original behavior
        }

        if (!cancelled) {
          setProgramma(perfResp.data as any)
          setLocation(loc)
          setNotes((notesResp.data as any) || [])
          setCorrections((correctionsResp.data as any) || [])
          // availabilityRequest is set earlier when the server API returns data
          setAvailabilityDates(dates)
          setAvailabilityDateLocationsById(dateLocationMap)
          setAvailabilityDraft(draft)
          setHasAnyAvailabilityResponseState(anyResponse)
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Kon programma niet laden')
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [performanceId, router])

  const typeLabel = (() => {
    const t = (programma?.program_type || '').toString().toLowerCase()
    if (t === 'workshop') return 'Workshop'
    if (t === 'performance') return 'Voorstelling'
    return t ? t : 'Programma'
  })()

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

  const infoHasAny = Boolean(location || performanceDatesLabel || rehearsalLabel)

  const adminPaymentUrl = (programma as any)?.admin_payment_url || null
  const priceCents = (programma as any)?.price
  const priceLabel = typeof priceCents === 'number' && !Number.isNaN(priceCents)
    ? `${(Number(priceCents) / 100).toFixed(2)} EUR`
    : null

  function openNote(n: NoteRow) {
    if (isMobile) {
      router.push(`/ampro/mijn-projecten/${encodeURIComponent(performanceId)}/notes/${encodeURIComponent(n.id)}`)
      return
    }
    setActiveNote(n)
    setNoteModalOpen(true)
  }

  function openCorrection(c: CorrectionRow) {
    if (isMobile) {
      router.push(`/ampro/mijn-projecten/${encodeURIComponent(performanceId)}/correcties/${encodeURIComponent(c.id)}`)
      return
    }
    setActiveCorrection(c)
    setCorrectionModalOpen(true)
  }

  async function handleCheckout() {
    try {
      if (!programma?.id) return
      setCreatingCheckout(true)

      if (!adminPaymentUrl) throw new Error('Geen betaallink beschikbaar voor dit programma')
      window.location.href = String(adminPaymentUrl)
    } catch (err: any) {
      showError(err?.message || 'Betalen mislukt')
    } finally {
      setCreatingCheckout(false)
    }
  }

  const availabilityLocked = Boolean(
    availabilityRequest &&
      (Boolean((availabilityRequest as any)?.responses_locked) ||
        (availabilityRequest as any)?.responses_lock_at && isISODatePast(String((availabilityRequest as any).responses_lock_at))),
  )

  const availabilityIsVisibleToUsers = Boolean(availabilityRequest?.is_visible)
  const availabilityHasRequest = Boolean(availabilityRequest?.id)
  const availabilityCanSeeRequest = availabilityIsVisibleToUsers && isAssignedToRequest
  const availabilityShouldShowRequest = availabilityHasRequest && availabilityDates.length > 0 && (hasAnyAvailabilityResponse || availabilityCanSeeRequest)

  const canEditAvailability = Boolean(
    availabilityRequest?.id && !availabilityLocked && (availabilityRequest?.is_visible || hasAnyAvailabilityResponse || isAssignedToRequest),
  )

  async function saveAvailability() {
    try {
      if (!availabilityRequest?.id) return
      if (!availabilityDates.length) return
      if (!canEditAvailability) {
        throw new Error('Beschikbaarheid is vergrendeld of kan niet meer aangepast worden')
      }

      setSavingAvailability(true)

      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData?.session?.user
      const token = String((sessionData as any)?.session?.access_token || '')
      if (!user || !token) throw new Error('Je bent niet ingelogd')

      const rows = availabilityDates.map((d) => {
        const v = availabilityDraft[String(d.id)] || { status: 'maybe' as const, comment: '' }
        return {
          request_date_id: d.id,
          user_id: user.id,
          status: v.status,
          comment: v.comment.trim() || null,
        }
      })

      const res = await fetch(`/api/ampro/availability/${encodeURIComponent(performanceId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ responses: rows }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String((json as any)?.error || 'Opslaan mislukt'))
      showSuccess('Beschikbaarheid opgeslagen')
      // Immediately reflect that the user has submitted availability so the
      // notification updates without a page refresh.
      setHasAnyAvailabilityResponseState(true)
    } catch (e: any) {
      showError(e?.message || 'Opslaan mislukt')
    } finally {
      setSavingAvailability(false)
    }
  }

  if (checking) return <div className="min-h-screen bg-white" />

  if (!programma) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <Link href="/ampro/mijn-projecten" className="text-sm font-semibold text-gray-900">
            ← Terug
          </Link>
          <div className="mt-6 text-sm text-gray-600">Programma niet gevonden.</div>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ContentContainer className="py-8">
        <button
          type="button"
          onClick={() => router.push('/ampro/mijn-projecten')}
          className="mb-6 inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5" />
          Terug naar mijn projecten
        </button>

        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch">
            <div className="lg:col-span-3 h-full">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 h-full">
                <h1 className="text-3xl font-bold text-gray-900">{programma.title}</h1>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-4 py-2 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {typeLabel}
                  </span>
                  {programma.region ? (
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {programma.region}
                    </span>
                  ) : null}
                </div>

                {infoHasAny ? (
                  <div className="mt-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Informatie</h2>
                    <div className="grid gap-3 text-sm text-gray-700">
                      {location ? (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                          <div className="grid gap-1">
                            <div>
                              <span className="text-gray-900">Locatie:</span> {location.name}
                            </div>
                            {location.address ? (
                              <div className="text-xs text-gray-600 whitespace-pre-wrap">{location.address}</div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {rehearsalLabel ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>Repetitie periode: {rehearsalLabel}</span>
                        </div>
                      ) : null}

                      {performanceDatesLabel ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>Voorstelling periode: {performanceDatesLabel}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="lg:col-span-1 h-full">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 h-full flex flex-col justify-between">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Betaling</h2>
                <div className="text-sm text-gray-700 mb-4">Je inschrijving wordt pas geldig na betaling. Het kan enkele dagen duren om je betaling te registreren.</div>
                {paymentPending ? (
                  <div className="rounded-3xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 text-sm mb-4">
                    Betaling in behandeling — we verwerken je betaling handmatig.
                  </div>
                ) : null}

                {hasPaid ? (
                  <div className="rounded-3xl bg-green-50 border border-green-200 text-green-800 px-4 py-2 text-sm mb-4">
                    Betaald{paymentReceivedAt ? ` op ${formatDateOnlyFromISODate(paymentReceivedAt)}` : ''}.
                  </div>
                ) : null}

                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold">{priceLabel || 'Prijs niet ingesteld'}</div>
                  {hasPaid ? (
                    <button type="button" disabled className="h-11 ml-4 rounded-3xl px-6 text-sm font-semibold bg-green-50 border border-green-200 text-green-800">
                      Betaald
                    </button>
                  ) : adminPaymentUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          window.open(String(adminPaymentUrl), '_blank', 'noopener')
                          setPaymentPending(true)
                        } catch (e) {
                          window.location.href = String(adminPaymentUrl)
                        }
                      }}
                      className={`h-11 ml-4 rounded-3xl px-6 text-sm font-semibold transition-colors ${
                        creatingCheckout ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      Betaal
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="h-11 ml-4 rounded-3xl px-6 text-sm font-semibold bg-gray-100 text-gray-400"
                    >
                      Geen betaal-URL
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Notes</h2>
              {hasPaid ? (
                <div className="grid gap-3">
                  {notes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openNote(n)}
                      className="rounded-3xl border border-gray-200 p-4 text-left hover:bg-gray-50 transition-colors"
                      aria-label={`Open note: ${n.title}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold text-gray-900">{n.title}</div>
                        <div className="shrink-0 text-xs text-gray-500">{formatDateOnlyFromISODate(String(n.created_at))}</div>
                      </div>
                    </button>
                  ))}
                  {notes.length === 0 ? <div className="text-sm text-gray-600">Nog geen notes.</div> : null}
                </div>
              ) : (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
                  Deze sectie is pas zichtbaar na betaling. Voltooi je betaling via de betaalknop om Notes te bekijken.
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Correcties</h2>
              {hasPaid ? (
                <div className="grid gap-3">
                  {corrections.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openCorrection(c)}
                      className="rounded-3xl border border-gray-200 p-4 text-left hover:bg-gray-50 transition-colors"
                      aria-label={`Open correctie van ${formatDateOnlyFromISODate(String(c.correction_date))}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold text-gray-900">{String(c.title || 'Correctie')}</div>
                        <div className="shrink-0 text-xs text-gray-500">{formatDateOnlyFromISODate(String(c.correction_date))}</div>
                      </div>
                    </button>
                  ))}
                  {corrections.length === 0 ? <div className="text-sm text-gray-600">Nog geen correcties.</div> : null}
                </div>
              ) : (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
                  Correcties worden pas zichtbaar na betaling. Voltooi je betaling via de betaalknop om deze sectie te bekijken.
                </div>
              )}
            </div>
          </div>

          <Modal
            isOpen={noteModalOpen && !!activeNote}
            onClose={() => {
              setNoteModalOpen(false)
              setActiveNote(null)
            }}
            ariaLabel="Note"
            contentClassName="bg-white rounded-2xl shadow-xl max-w-2xl w-full"
          >
            {activeNote ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-gray-900">{activeNote.title}</h3>
                  <div className="text-xs text-gray-500">{formatDateOnlyFromISODate(String(activeNote.created_at))}</div>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{activeNote.body}</div>
              </div>
            ) : null}
          </Modal>

          <Modal
            isOpen={correctionModalOpen && !!activeCorrection}
            onClose={() => {
              setCorrectionModalOpen(false)
              setActiveCorrection(null)
            }}
            ariaLabel="Correctie"
            contentClassName="bg-white rounded-2xl shadow-xl max-w-2xl w-full"
          >
            {activeCorrection ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-gray-900">{String(activeCorrection.title || 'Correctie')}</h3>
                  <div className="text-xs text-gray-500">{formatDateOnlyFromISODate(String(activeCorrection.correction_date))}</div>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{activeCorrection.body}</div>
              </div>
            ) : null}
          </Modal>

          {hasPaid ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Beschikbaarheid</h2>
                <button
                  type="button"
                  aria-expanded={availabilityOpen}
                  onClick={() => setAvailabilityOpen((s) => !s)}
                  className="-mr-2 inline-flex items-center justify-center rounded-md p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700 focus:outline-none"
                  title={availabilityOpen ? 'Verberg beschikbaarheid' : 'Toon beschikbaarheid'}
                >
                  <ChevronDown className={`h-5 w-5 transform transition-transform ${availabilityOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {availabilityRequest?.id && (availabilityCanSeeRequest || hasAnyAvailabilityResponse) ? (
                <div className="mb-4">
                  {hasAnyAvailabilityResponse ? (
                    <div className="rounded-3xl bg-green-50 border border-green-200 text-green-800 px-4 py-2 text-sm">
                      Je hebt je beschikbaarheid doorgegeven.
                    </div>
                  ) : (
                    <div className="rounded-3xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 text-sm">
                      Je hebt je beschikbaarheid nog niet doorgegeven.
                    </div>
                  )}
                </div>
              ) : null}

              {availabilityOpen ? (
                <>
                  {!availabilityRequest?.id ? (
                    <div className="text-sm text-gray-600">Er is momenteel geen beschikbaarheidsvraag.</div>
                  ) : !availabilityShouldShowRequest ? (
                    <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                      Er wordt momenteel geen beschikbaarheid gevraagd.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {!canEditAvailability ? (
                        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                          Beschikbaarheid is vergrendeld. Je kan je antwoorden nog bekijken maar niet meer aanpassen.
                        </div>
                      ) : null}
                      {availabilityDates.map((d) => {
                        const v = availabilityDraft[String(d.id)] || { status: 'maybe' as const, comment: '' }
                        const dateLocId = (d as any)?.location_id ? String((d as any).location_id) : ''
                        const dateLoc = dateLocId ? availabilityDateLocationsById[dateLocId] : null
                        return (
                          <div key={d.id} className="rounded-3xl border border-gray-200 p-4">
                            <div className="text-sm font-semibold text-gray-900">{formatDateOnlyFromISODate(String(d.day))}</div>
                            {dateLoc ? (
                              <div className="mt-1 flex items-start gap-2 text-xs text-gray-600">
                                <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                                <div className="min-w-0">
                                  <div className="text-gray-900 font-semibold truncate">{dateLoc.name}</div>
                                  {dateLoc.address ? <div className="whitespace-pre-wrap">{dateLoc.address}</div> : null}
                                </div>
                              </div>
                            ) : null}

                            <div className="mt-3 grid gap-3">
                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Status
                                <Select
                                  value={v.status}
                                  onChange={(e) =>
                                    setAvailabilityDraft((prev) => ({
                                      ...prev,
                                      [String(d.id)]: { ...v, status: e.target.value as any },
                                    }))
                                  }
                                  disabled={!canEditAvailability}
                                  className="h-11 rounded-3xl border border-gray-200 bg-white px-3 text-sm"
                                >
                                  <option value="yes">Beschikbaar</option>
                                  <option value="no">Niet beschikbaar</option>
                                  <option value="maybe">Misschien</option>
                                </Select>
                              </label>

                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Comment (optioneel)
                                <textarea
                                  value={v.comment}
                                  onChange={(e) =>
                                    setAvailabilityDraft((prev) => ({
                                      ...prev,
                                      [String(d.id)]: { ...v, comment: e.target.value },
                                    }))
                                  }
                                  disabled={!canEditAvailability}
                                  placeholder="Bv. 30 min later op deze datum…"
                                  className="min-h-20 rounded-3xl border border-gray-200 bg-white px-3 py-2 text-sm"
                                />
                              </label>

                              <div className="text-xs text-gray-600">Huidig: {formatYesNoMaybe(v.status)}</div>
                            </div>
                          </div>
                        )
                      })}

                      <button
                        type="button"
                        onClick={saveAvailability}
                        disabled={savingAvailability || !canEditAvailability}
                        className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                          savingAvailability || !canEditAvailability
                            ? 'bg-blue-100 text-blue-400'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {savingAvailability ? 'Opslaan…' : 'Opslaan'}
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Beschikbaarheid</h2>
              <div className="rounded-3xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
                Beschikbaarheid wordt pas zichtbaar na betaling. Voltooi je betaling via de betaalknop om deze sectie te gebruiken.
              </div>
            </div>
          )}
        </div>
      </ContentContainer>
    </div>
  )
}
