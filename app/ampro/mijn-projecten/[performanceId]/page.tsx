'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, MapPin, ChevronDown } from 'lucide-react'
import Select from '@/components/Select'
import { supabase } from '@/lib/supabase'
import ContentContainer from '@/components/ContentContainer'
import { formatDateOnlyFromISODate, isISODatePast } from '@/lib/formatting'
import { useNotification } from '@/contexts/NotificationContext'

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
  const performanceId = useMemo(() => String((params as any)?.performanceId || ''), [params])

  const [checking, setChecking] = useState(true)
  const [programma, setProgramma] = useState<Programma | null>(null)
  const [location, setLocation] = useState<LocationRow | null>(null)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [creatingCheckout, setCreatingCheckout] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasPaid, setHasPaid] = useState(false)

  const [availabilityRequest, setAvailabilityRequest] = useState<AvailabilityRequestRow | null>(null)
  const [availabilityDates, setAvailabilityDates] = useState<AvailabilityDateRow[]>([])
  const [availabilityDraft, setAvailabilityDraft] = useState<Record<string, { status: 'yes' | 'no' | 'maybe'; comment: string }>>({})
  const [savingAvailability, setSavingAvailability] = useState(false)
  const [hasAnyAvailabilityResponse, setHasAnyAvailabilityResponse] = useState(false)
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
            'id,title,description,location_id,rehearsal_period_start,rehearsal_period_end,performance_dates,region,program_type',
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
          .from('ampro_updates')
          .select('id,title,body,created_at')
          .eq('performance_id', performanceId)
          .order('created_at', { ascending: false })

        if (notesResp.error) throw notesResp.error

        // Fetch Stripe product/price separately — there is no DB FK relationship
        // between `ampro_programmas` and `stripe_products` in the schema cache.
        let stripeProducts: any[] = []
        try {
          // Match `ampro_program_id` (AmPro program rows) — `program_id` was removed
          const spResp = await supabase
            .from('stripe_products')
            .select('*')
            .eq('ampro_program_id', performanceId)

          if (!spResp.error && spResp.data) stripeProducts = spResp.data as any
        } catch (err) {
          // ignore — optional feature
        }

        // Check if the current user already has a successful payment for this program
        try {
          if (user) {
            const paidResp = await supabase
              .from('stripe_transactions')
              .select('id')
              .eq('ampro_program_id', performanceId)
              .eq('user_id', user.id)
              .eq('status', 'succeeded')
              .limit(1)
              .maybeSingle()

            if (!paidResp.error && paidResp.data && (paidResp.data as any).id) {
              if (!cancelled) setHasPaid(true)
            }
          }
        } catch (err) {
          // ignore
        }

        // Fetch availability via server API to avoid RLS hiding private requests
        let dates: AvailabilityDateRow[] = []
        let draft: Record<string, { status: 'yes' | 'no' | 'maybe'; comment: string }> = {}
        let anyResponse = false

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

            dates = fetchedDates as any

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
          // availabilityRequest is set earlier when the server API returns data
          setAvailabilityDates(dates)
          setAvailabilityDraft(draft)
          setHasAnyAvailabilityResponse(anyResponse)
          // Attach fetched stripe products to programa for UI use
          ;(setProgramma as any)((prev: any) => ({ ...(perfResp.data || {}), stripe_products: stripeProducts }))
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

  const stripeProduct = (programma as any)?.stripe_products?.[0]
  const priceLabel = stripeProduct && stripeProduct.price_active && stripeProduct.price_amount
    ? `${(stripeProduct.price_amount / 100).toFixed(2)} ${String(stripeProduct.price_currency || '').toUpperCase()}`
    : null

  async function handleCheckout() {
    try {
      if (!programma?.id) return
      setCreatingCheckout(true)

      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program_id: programma.id }),
        credentials: 'same-origin',
      })

      const data = await res.json()
      if (!res.ok || data?.error) {
        throw new Error(data?.error || 'Kon checkout sessie niet aanmaken')
      }

      // Redirect browser to Stripe Checkout
      if (data.url) {
        window.location.href = data.url
      } else if (data.session_id) {
        // Fallback: open stripe hosted URL via session id if provided
        window.location.href = `https://checkout.stripe.com/pay/${data.session_id}`;
      } else {
        throw new Error('Geen checkout URL ontvangen')
      }
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
      setHasAnyAvailabilityResponse(true)
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
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
          </div>

          {infoHasAny ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
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
                    <span>Voorstellingsdata: {performanceDatesLabel}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Notes</h2>
            <div className="grid gap-3">
              {notes.map((n) => (
                <div key={n.id} className="rounded-3xl border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">{n.title}</div>
                  <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{n.body}</div>
                </div>
              ))}
              {notes.length === 0 ? <div className="text-sm text-gray-600">Nog geen notes.</div> : null}
            </div>
          </div>

              {stripeProduct && priceLabel && !hasPaid ? (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Betaling</h2>
                  <div className="text-sm text-gray-700 mb-4">Je inschrijving wordt pas geldig na betaling.</div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold">{priceLabel}</div>
                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={creatingCheckout}
                      className={`h-11 ml-4 rounded-3xl px-6 text-sm font-semibold transition-colors ${
                        creatingCheckout ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {creatingCheckout ? 'Doorsturen…' : 'Betaal'}
                    </button>
                  </div>
                </div>
              ) : null}

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
            {availabilityRequest?.id ? (
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
                ) : availabilityDates.length === 0 ? (
                  <div className="text-sm text-gray-600">Geen data ingesteld.</div>
                ) : (
                  <div className="space-y-4">
                    {!canEditAvailability ? (
                      <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                        Beschikbaarheid is vergrendeld. Je kan je antwoorden nog bekijken maar niet meer aanpassen.
                      </div>
                    ) : null}
                    {availabilityDates.map((d) => {
                      const v = availabilityDraft[String(d.id)] || { status: 'maybe' as const, comment: '' }
                      return (
                        <div key={d.id} className="rounded-3xl border border-gray-200 p-4">
                          <div className="text-sm font-semibold text-gray-900">{formatDateOnlyFromISODate(String(d.day))}</div>

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
        </div>
      </ContentContainer>
    </div>
  )
}
