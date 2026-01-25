'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, MessageSquare, ClipboardList, Users, Plus, MapPin, Edit2, Eye, FileText, Trash2, Calendar, ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isAmproAdmin, parseAmproFormFields, type AmproFormField } from '@/lib/ampro'
import { useNotification } from '@/contexts/NotificationContext'
import { formatDateOnlyFromISODate } from '@/lib/formatting'
import SearchFilterBar from '@/components/SearchFilterBar'
import Select from '@/components/Select'
import Modal from '@/components/Modal'
import ActionIcon from '@/components/ActionIcon'

type AdminSection = 'programmas' | 'forms' | 'notes' | 'applications' | 'members' | 'locations' | 'availability'

function parseFlexibleDateToISODate(input: string): string | null {
  const v = (input || '').trim()
  if (!v) return null

  // Accept yyyy-mm-dd too (handy for copy/paste).
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00Z`)
    if (!Number.isFinite(d.getTime())) throw new Error(`Ongeldige datum: ${v}`)
    return v
  }

  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (!m) throw new Error(`Gebruik dd/mm/jjjj (bv. 31/12/2025). Ontvangen: ${v}`)

  const dd = Number(m[1])
  const mm = Number(m[2])
  const yyyy = Number(m[3])
  if (!dd || !mm || !yyyy) throw new Error(`Ongeldige datum: ${v}`)
  if (mm < 1 || mm > 12) throw new Error(`Ongeldige maand in datum: ${v}`)
  if (dd < 1 || dd > 31) throw new Error(`Ongeldige dag in datum: ${v}`)

  const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  if (date.getUTCFullYear() !== yyyy || date.getUTCMonth() + 1 !== mm || date.getUTCDate() !== dd) {
    throw new Error(`Ongeldige datum: ${v}`)
  }

  return iso
}

function parseFlexibleDateListToISODateArray(input: string): string[] {
  const raw = (input || '')
    .split(/\r?\n|,/g)
    .map((v) => v.trim())
    .filter(Boolean)

  const out: string[] = []
  for (const part of raw) {
    const iso = parseFlexibleDateToISODate(part)
    if (iso) out.push(iso)
  }
  return out
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function slugToKey(input: string) {
  // Make keys stable for accented/unicode labels by stripping diacritics first.
  // (e.g. "Geboortedátum" -> "geboortedatum")
  const normalized = (input || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

type FormOptionDraft = { id: string; label: string; value: string }

type FormFieldDraft = {
  id: string
  label: string
  type: AmproFormField['type']
  required: boolean
  placeholder: string
  options: FormOptionDraft[]
}

function makeEmptyFieldDraft(): FormFieldDraft {
  return {
    id: makeId(),
    label: '',
    type: 'text',
    required: false,
    placeholder: '',
    options: [{ id: makeId(), label: '', value: '' }],
  }
}

function uniqueKey(base: string, used: Set<string>, fallbackBase = 'field') {
  const normalized = slugToKey(base) || slugToKey(fallbackBase) || 'field'
  if (!used.has(normalized)) {
    used.add(normalized)
    return normalized
  }
  let i = 2
  while (used.has(`${normalized}_${i}`)) i++
  const out = `${normalized}_${i}`
  used.add(out)
  return out
}

function availabilityStatusLabel(status: string | null | undefined) {
  const s = String(status || '').toLowerCase()
  if (s === 'yes') return 'Beschikbaar'
  if (s === 'no') return 'Niet beschikbaar'
  if (s === 'maybe') return 'Misschien'
  return 'Geen antwoord'
}

export default function AmproAdminPage() {
  const router = useRouter()
  const { showSuccess, showError } = useNotification()
  const [checking, setChecking] = useState(true)
  const [active, setActive] = useState<AdminSection>('programmas')
  const [performances, setPerformances] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [forms, setForms] = useState<any[]>([])
  const [formIdByProgramId, setFormIdByProgramId] = useState<Record<string, string>>({})
  const [applications, setApplications] = useState<any[]>([])
  const [appsExpandedByProgram, setAppsExpandedByProgram] = useState<Record<string, boolean>>({})
  const [stagedStatuses, setStagedStatuses] = useState<Record<string, string>>({})
  const [savingGroup, setSavingGroup] = useState<Record<string, boolean>>({})
  const [roster, setRoster] = useState<any[]>([])
  const [updates, setUpdates] = useState<any[]>([])
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, { first_name?: string | null; last_name?: string | null }>>({})

  const [inviteManageOpen, setInviteManageOpen] = useState(false)
  const [inviteManageProgram, setInviteManageProgram] = useState<{ id: string; title: string } | null>(null)
  const [inviteManageUrl, setInviteManageUrl] = useState('')
  const [inviteManageToken, setInviteManageToken] = useState<string | null>(null)
  const [inviteManageLoading, setInviteManageLoading] = useState(false)
  const [inviteConfigMaxUses, setInviteConfigMaxUses] = useState<string>('')
  const [inviteConfigExpiresAt, setInviteConfigExpiresAt] = useState<string>('')
  const [inviteManageStatus, setInviteManageStatus] = useState<
    | null
    | {
        ok: boolean
        revoked: boolean
        expired: boolean
        maxed: boolean
        uses_count: number
        max_uses: number | null
        expires_at: string | null
      }
  >(null)

  async function refreshInviteStatus(token: string) {
    const t = String(token || '').trim()
    if (!t) return
    try {
      const resp = await fetch(`/api/ampro/program-invites/lookup?token=${encodeURIComponent(t)}`)
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Kon status niet laden')

      setInviteManageStatus({
        ok: Boolean(json?.status?.ok),
        revoked: Boolean(json?.status?.revoked),
        expired: Boolean(json?.status?.expired),
        maxed: Boolean(json?.status?.maxed),
        uses_count: Number(json?.invite?.uses_count || 0),
        max_uses: json?.invite?.max_uses != null ? Number(json.invite.max_uses) : null,
        expires_at: json?.invite?.expires_at ? String(json.invite.expires_at) : null,
      })

      // Keep the config inputs in sync with current invite values (best-effort).
      const maxUses = json?.invite?.max_uses
      setInviteConfigMaxUses(maxUses != null && String(maxUses) !== 'null' ? String(maxUses) : '')
      const exp = json?.invite?.expires_at ? String(json.invite.expires_at) : ''
      // datetime-local expects YYYY-MM-DDTHH:mm; use UTC representation for consistency.
      setInviteConfigExpiresAt(exp ? new Date(exp).toISOString().slice(0, 16) : '')
    } catch {
      // Don't block the modal; status is best-effort.
      setInviteManageStatus(null)
    }
  }

  async function openInviteManager(performanceId: string, title: string) {
    try {
      setInviteManageProgram({ id: performanceId, title })
      setInviteManageUrl('')
      setInviteManageToken(null)
      setInviteManageStatus(null)
      setInviteConfigMaxUses('')
      setInviteConfigExpiresAt('')
      setInviteManageOpen(true)
      setInviteManageLoading(true)

      const resp = await fetch('/api/ampro/program-invites/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performance_id: performanceId }),
      })

      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Kon link niet genereren')

      const url = String(json?.url || '')
      if (!url) throw new Error('Geen link ontvangen')

      setInviteManageUrl(url)
      setInviteManageToken(json?.token ? String(json.token) : null)
      if (json?.token) {
        await refreshInviteStatus(String(json.token))
      }
      showSuccess(json?.reused ? 'Bestaande link geladen' : 'Nieuwe link aangemaakt')
    } catch (e: any) {
      showError(e?.message || 'Kon link niet genereren')
    }
    finally {
      setInviteManageLoading(false)
    }
  }

  async function rotateInviteWithSettings() {
    const pid = String(inviteManageProgram?.id || '')
    if (!pid) return

    let maxUses: number | null = null
    if (inviteConfigMaxUses.trim()) {
      const n = Number(inviteConfigMaxUses)
      if (!Number.isFinite(n) || n < 1) {
        showError('Max uses moet leeg zijn of >= 1')
        return
      }
      maxUses = n
    }

    let expiresAt: string | null = null
    if (inviteConfigExpiresAt.trim()) {
      const d = new Date(inviteConfigExpiresAt)
      if (!Number.isFinite(d.getTime())) {
        showError('Ongeldige vervaldatum')
        return
      }
      expiresAt = d.toISOString()
    }

    if (!window.confirm('Nieuwe link maken met deze instellingen? De huidige link wordt gedeactiveerd.')) return

    try {
      setInviteManageLoading(true)
      const resp = await fetch('/api/ampro/program-invites/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          performance_id: pid,
          max_uses: maxUses,
          expires_at: expiresAt,
          force_new: true,
        }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Kon nieuwe link niet maken')

      const url = String(json?.url || '')
      if (!url) throw new Error('Geen link ontvangen')

      setInviteManageUrl(url)
      setInviteManageToken(json?.token ? String(json.token) : null)
      if (json?.token) await refreshInviteStatus(String(json.token))
      showSuccess('Nieuwe link aangemaakt')
    } catch (e: any) {
      showError(e?.message || 'Kon nieuwe link niet maken')
    } finally {
      setInviteManageLoading(false)
    }
  }

  async function copyInviteUrl() {
    if (!inviteManageUrl) return
    try {
      await navigator.clipboard.writeText(inviteManageUrl)
      showSuccess('Link gekopieerd')
    } catch {
      window.prompt('Kopieer deze link:', inviteManageUrl)
    }
  }

  async function revokeInviteLinks() {
    const pid = String(inviteManageProgram?.id || '')
    if (!pid) return
    if (!window.confirm('Groepslink deactiveren? De huidige link werkt dan niet meer.')) return

    try {
      setInviteManageLoading(true)
      const tokenBefore = inviteManageToken
      const resp = await fetch('/api/ampro/program-invites/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performance_id: pid }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Deactiveren mislukt')

      // Keep the last URL visible for audit/reference, but status will flip to inactive.
      if (tokenBefore) await refreshInviteStatus(String(tokenBefore))
      showSuccess(`Link gedeactiveerd (${Number(json?.revoked_count || 0)})`)
    } catch (e: any) {
      showError(e?.message || 'Deactiveren mislukt')
    } finally {
      setInviteManageLoading(false)
    }
  }

  async function deleteInviteLinks() {
    const pid = String(inviteManageProgram?.id || '')
    if (!pid) return

    const confirm = window.prompt('Typ DELETE om alle invite links voor dit programma te verwijderen:')
    if (confirm !== 'DELETE') return

    try {
      setInviteManageLoading(true)
      const resp = await fetch('/api/ampro/program-invites/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performance_id: pid, confirm: 'DELETE' }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Verwijderen mislukt')

      setInviteManageUrl('')
      setInviteManageToken(null)
      setInviteManageStatus(null)
      showSuccess(`Links verwijderd (${Number(json?.deleted_count || 0)})`)
    } catch (e: any) {
      showError(e?.message || 'Verwijderen mislukt')
    } finally {
      setInviteManageLoading(false)
    }
  }

  const [availabilityPerformanceId, setAvailabilityPerformanceId] = useState('')
  const [availabilityRequestId, setAvailabilityRequestId] = useState<string | null>(null)
  const [availabilityVisible, setAvailabilityVisible] = useState(false)
  const [availabilityLocked, setAvailabilityLocked] = useState(false)
  const [availabilityLockAt, setAvailabilityLockAt] = useState('')
  const [availabilityDatesText, setAvailabilityDatesText] = useState('')
  const [availabilitySelectedUserIds, setAvailabilitySelectedUserIds] = useState<string[]>([])
  const [availabilityOverview, setAvailabilityOverview] = useState<
    Array<{ day: string; rows: Array<{ user_id: string; status: string | null; comment: string | null }> }>
  >([])
  const [savingAvailability, setSavingAvailability] = useState(false)

  useEffect(() => {
    if (!availabilityPerformanceId && performances.length) {
      setAvailabilityPerformanceId(String((performances as any[])[0]?.id || ''))
    }
  }, [availabilityPerformanceId, performances])

  const acceptedUserIdsForSelectedPerformance = (() => {
    const pid = String(availabilityPerformanceId || '')
    if (!pid) return [] as string[]
    return roster
      .filter((r: any) => String(r?.performance_id || '') === pid)
      .map((r: any) => String(r?.user_id || ''))
      .filter(Boolean)
  })()

  async function loadAvailability(performanceId: string) {
    try {
      setAvailabilityRequestId(null)
      setAvailabilityVisible(false)
      setAvailabilityLocked(false)
      setAvailabilityLockAt('')
      setAvailabilityDatesText('')
      setAvailabilitySelectedUserIds([])
      setAvailabilityOverview([])

      if (!performanceId) return

      const reqResp = await supabase
        .from('ampro_availability_requests')
        .select('id,performance_id,is_visible,responses_locked,responses_lock_at')
        .eq('performance_id', performanceId)
        .maybeSingle()

      if (reqResp.error) throw reqResp.error

      if (!reqResp.data?.id) {
        setAvailabilityRequestId(null)
        setAvailabilityVisible(false)
        setAvailabilityLocked(false)
        setAvailabilityLockAt('')
        setAvailabilityDatesText('')
        setAvailabilitySelectedUserIds(acceptedUserIdsForSelectedPerformance)
        setAvailabilityOverview([])
        return
      }

      const requestId = String((reqResp.data as any).id)
      setAvailabilityRequestId(requestId)
      setAvailabilityVisible(Boolean((reqResp.data as any).is_visible))
      setAvailabilityLocked(Boolean((reqResp.data as any).responses_locked))
      setAvailabilityLockAt(
        (reqResp.data as any)?.responses_lock_at ? formatDateOnlyFromISODate(String((reqResp.data as any).responses_lock_at)) : '',
      )

      const datesResp = await supabase
        .from('ampro_availability_request_dates')
        .select('id,day')
        .eq('request_id', requestId)
        .order('day', { ascending: true })

      if (datesResp.error) throw datesResp.error
      const dates = (datesResp.data as any[]) || []
      setAvailabilityDatesText(dates.map((d) => formatDateOnlyFromISODate(String(d.day))).join('\n'))

      const dateIds = dates.map((d) => String(d.id)).filter(Boolean)
      if (!dateIds.length) {
        setAvailabilitySelectedUserIds(acceptedUserIdsForSelectedPerformance)
        setAvailabilityOverview([])
        return
      }

      const duResp = await supabase
        .from('ampro_availability_request_date_users')
        .select('request_date_id,user_id')
        .in('request_date_id', dateIds)

      if (duResp.error) throw duResp.error
      const assigned = (duResp.data as any[]) || []
      const assignedUserIds = Array.from(new Set(assigned.map((r) => String(r.user_id)).filter(Boolean)))
      setAvailabilitySelectedUserIds(assignedUserIds.length ? assignedUserIds : acceptedUserIdsForSelectedPerformance)

      const respResp = await supabase
        .from('ampro_availability_responses')
        .select('request_date_id,user_id,status,comment')
        .in('request_date_id', dateIds)

      if (respResp.error) throw respResp.error
      const responses = (respResp.data as any[]) || []
      const responseMap: Record<string, { status: string | null; comment: string | null }> = {}
      for (const r of responses) {
        const key = `${String(r.request_date_id)}:${String(r.user_id)}`
        responseMap[key] = { status: (r as any)?.status ?? null, comment: (r as any)?.comment ?? null }
      }

      const overview = dates.map((d) => {
        const day = String(d.day)
        const usersForDate = assigned
          .filter((a) => String(a.request_date_id) === String(d.id))
          .map((a) => {
            const uid = String(a.user_id)
            const key = `${String(d.id)}:${uid}`
            const rr = responseMap[key]
            return { user_id: uid, status: rr?.status ?? null, comment: rr?.comment ?? null }
          })

        return { day, rows: usersForDate }
      })

      setAvailabilityOverview(overview)
    } catch (e: any) {
      showError(e?.message || 'Kon beschikbaarheid niet laden')
    }
  }

  useEffect(() => {
    if (active !== 'availability') return
    if (!availabilityPerformanceId) return
    loadAvailability(availabilityPerformanceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, availabilityPerformanceId])

  async function saveAvailabilityConfig() {
    try {
      if (!availabilityPerformanceId) throw new Error('Kies een programma')
      setSavingAvailability(true)

      const desiredDays = Array.from(new Set(parseFlexibleDateListToISODateArray(availabilityDatesText))).sort()
      if (!desiredDays.length) throw new Error('Voeg minstens 1 datum toe')

      const selectedUserIds = Array.from(new Set((availabilitySelectedUserIds || []).map(String).filter(Boolean)))
      if (!selectedUserIds.length) throw new Error('Selecteer minstens 1 user')

      const lockAt = availabilityLockAt.trim() ? parseFlexibleDateToISODate(availabilityLockAt.trim()) : null

      // Ensure request exists
      let requestId = availabilityRequestId
      if (!requestId) {
        const ins = await supabase
          .from('ampro_availability_requests')
          .insert({
            performance_id: availabilityPerformanceId,
            is_visible: availabilityVisible,
            responses_locked: availabilityLocked,
            responses_lock_at: lockAt,
          })
          .select('id')
          .single()
        if (ins.error) throw ins.error
        requestId = String((ins.data as any)?.id || '')
      } else {
        const up = await supabase
          .from('ampro_availability_requests')
          .update({
            is_visible: availabilityVisible,
            responses_locked: availabilityLocked,
            responses_lock_at: lockAt,
          })
          .eq('id', requestId)
        if (up.error) throw up.error
      }
      if (!requestId) throw new Error('Kon request niet opslaan')
      setAvailabilityRequestId(requestId)

      const existingDatesResp = await supabase
        .from('ampro_availability_request_dates')
        .select('id,day')
        .eq('request_id', requestId)
      if (existingDatesResp.error) throw existingDatesResp.error

      const existingDates = (existingDatesResp.data as any[]) || []
      const existingByDay = new Map(existingDates.map((d) => [String(d.day), String(d.id)]))

      const toDeleteIds = existingDates
        .filter((d) => !desiredDays.includes(String(d.day)))
        .map((d) => String(d.id))
        .filter(Boolean)

      if (toDeleteIds.length) {
        const del = await supabase
          .from('ampro_availability_request_dates')
          .delete()
          .in('id', toDeleteIds)
        if (del.error) throw del.error
      }

      const toAddDays = desiredDays.filter((day) => !existingByDay.has(day))
      if (toAddDays.length) {
        const insDates = await supabase
          .from('ampro_availability_request_dates')
          .insert(toAddDays.map((day) => ({ request_id: requestId, day })))
        if (insDates.error) throw insDates.error
      }

      // Reload dates to get all ids
      const allDatesResp = await supabase
        .from('ampro_availability_request_dates')
        .select('id,day')
        .eq('request_id', requestId)
      if (allDatesResp.error) throw allDatesResp.error
      const allDates = (allDatesResp.data as any[]) || []

      // Apply the same selected users to every date.
      for (const d of allDates) {
        const dateId = String(d.id)
        if (!dateId) continue
        const delUsers = await supabase
          .from('ampro_availability_request_date_users')
          .delete()
          .eq('request_date_id', dateId)
        if (delUsers.error) throw delUsers.error

        const insUsers = await supabase
          .from('ampro_availability_request_date_users')
          .insert(selectedUserIds.map((uid) => ({ request_date_id: dateId, user_id: uid })))
        if (insUsers.error) throw insUsers.error
      }

      showSuccess('Beschikbaarheid opgeslagen')
      await loadAvailability(availabilityPerformanceId)
    } catch (e: any) {
      showError(e?.message || 'Opslaan mislukt')
    } finally {
      setSavingAvailability(false)
    }
  }

  const [memberDetailOpen, setMemberDetailOpen] = useState(false)
  const [memberDetailApp, setMemberDetailApp] = useState<any | null>(null)
  const [memberDeleteOpen, setMemberDeleteOpen] = useState(false)
  const [memberDeleteApp, setMemberDeleteApp] = useState<any | null>(null)
  const [memberDeleteConfirm, setMemberDeleteConfirm] = useState('')

  const [programmaSearch, setProgrammaSearch] = useState('')
  const [memberFilterPerformanceId, setMemberFilterPerformanceId] = useState('')
  const [memberFilterStatus, setMemberFilterStatus] = useState<'all' | 'pending' | 'accepted' | 'rejected' | 'maybe'>('all')
  const [memberFilterPaid, setMemberFilterPaid] = useState<'all' | 'paid' | 'unpaid'>('all')
  const [programmaModalOpen, setProgrammaModalOpen] = useState(false)
  const [editingProgrammaId, setEditingProgrammaId] = useState<string | null>(null)
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)

  const [newProgramType, setNewProgramType] = useState<'performance' | 'workshop'>('performance')
  const [newLocationId, setNewLocationId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newRegion, setNewRegion] = useState('')
  const [newApplicationDeadline, setNewApplicationDeadline] = useState('')
  const [newFormId, setNewFormId] = useState('')
  const [newRehearsalStart, setNewRehearsalStart] = useState('')
  const [newRehearsalEnd, setNewRehearsalEnd] = useState('')
  const [newPerformanceDates, setNewPerformanceDates] = useState('')
  const [newIsPublic, setNewIsPublic] = useState(true)
  const [newApplicationsOpen, setNewApplicationsOpen] = useState(true)
  const [newPrice, setNewPrice] = useState('')
  const [newAdminPaymentUrl, setNewAdminPaymentUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingPaid, setSavingPaid] = useState(false)

  const [newFormName, setNewFormName] = useState('')
  const [newFormFields, setNewFormFields] = useState<FormFieldDraft[]>([])
  const [savingForm, setSavingForm] = useState(false)
  const [editingFormId, setEditingFormId] = useState<string | null>(null)

  const [newLocationName, setNewLocationName] = useState('')
  const [newLocationAddress, setNewLocationAddress] = useState('')
  const [savingLocation, setSavingLocation] = useState(false)

  const [newUpdatePerformanceId, setNewUpdatePerformanceId] = useState('')
  const [newUpdateTitle, setNewUpdateTitle] = useState('')
  const [newUpdateBody, setNewUpdateBody] = useState('')
  const [savingUpdate, setSavingUpdate] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setChecking(true)

        const { data } = await supabase.auth.getSession()
        const user = data?.session?.user
        if (!user) {
          router.replace('/ampro/login?next=/ampro/admin')
          return
        }

        const ok = await isAmproAdmin()
        if (!ok) {
          router.replace('/ampro/user')
          return
        }

        const perfResp = await supabase
          .from('ampro_programmas')
          .select(
            'id,title,description,program_type,is_public,applications_open,application_deadline,created_at,rehearsal_period_start,rehearsal_period_end,performance_dates,region,location_id',
          )
          .order('created_at', { ascending: false })
        if (perfResp.error) throw perfResp.error

        const locationsResp = await supabase
          .from('ampro_locations')
          .select('id,name,address,created_at')
          .order('created_at', { ascending: false })
        if (locationsResp.error) throw locationsResp.error

        const formsResp = await supabase
          .from('ampro_forms')
          .select('id,name,fields_json,created_at,updated_at')
          .order('created_at', { ascending: false })
        if (formsResp.error) throw formsResp.error

        const linksResp = await supabase
          .from('ampro_performance_forms')
          .select('performance_id,form_id')

        const linksMap: Record<string, string> = {}
        if (!linksResp.error) {
          for (const row of linksResp.data || []) {
            const pid = String((row as any)?.performance_id || '')
            const fid = String((row as any)?.form_id || '')
            if (pid && fid) linksMap[pid] = fid
          }
        }

        const appsResp = await supabase
          .from('ampro_applications')
          .select('id,performance_id,user_id,status,submitted_at,answers_json,snapshot_json,paid,payment_received_at')
          .order('submitted_at', { ascending: false })
          .limit(200)
        if (appsResp.error) throw appsResp.error

        const rosterResp = await supabase
          .from('ampro_roster')
          .select('performance_id,user_id,role_name,added_at')
          .order('added_at', { ascending: false })
        if (rosterResp.error) throw rosterResp.error

        const updatesResp = await supabase
          .from('ampro_updates')
          .select('id,performance_id,title,body,visibility,created_at,updated_at')
          .order('created_at', { ascending: false })
          .limit(200)
        if (updatesResp.error) throw updatesResp.error

        const userIds = Array.from(
          new Set(
            [...(appsResp.data || []).map((a: any) => String(a.user_id)), ...(rosterResp.data || []).map((r: any) => String(r.user_id))]
              .filter(Boolean),
          ),
        )

        let profilesMap: Record<string, { first_name?: string | null; last_name?: string | null }> = {}
        if (userIds.length) {
          const profilesResp = await supabase
            .from('ampro_dancer_profiles')
            .select('user_id,first_name,last_name')
            .in('user_id', userIds)

          if (!profilesResp.error) {
            for (const row of profilesResp.data || []) {
              const id = String((row as any)?.user_id || '')
              if (!id) continue
              profilesMap[id] = {
                first_name: (row as any)?.first_name ?? null,
                last_name: (row as any)?.last_name ?? null,
              }
            }
          }
        }

        if (!cancelled) {
          setPerformances(perfResp.data || [])
          setLocations(locationsResp.data || [])
          setForms(formsResp.data || [])
          setFormIdByProgramId(linksMap)
          setApplications(appsResp.data || [])
          setRoster(rosterResp.data || [])
          setUpdates(updatesResp.data || [])
          setProfilesByUserId(profilesMap)
          if (!newUpdatePerformanceId && (perfResp.data || []).length) {
            setNewUpdatePerformanceId(String((perfResp.data as any[])[0]?.id || ''))
          }
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Kon admin data niet laden')
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  if (checking) return <div className="min-h-screen bg-white" />

  async function refresh() {
    const perfResp = await supabase
      .from('ampro_programmas')
      .select(
        'id,title,description,program_type,is_public,applications_open,application_deadline,created_at,rehearsal_period_start,rehearsal_period_end,performance_dates,region,location_id,price,admin_payment_url',
      )
      .order('created_at', { ascending: false })
    if (!perfResp.error) setPerformances(perfResp.data || [])

    const locationsResp = await supabase
      .from('ampro_locations')
      .select('id,name,address,created_at')
      .order('created_at', { ascending: false })
    if (!locationsResp.error) setLocations(locationsResp.data || [])

    const formsResp = await supabase
      .from('ampro_forms')
      .select('id,name,fields_json,created_at,updated_at')
      .order('created_at', { ascending: false })
    if (!formsResp.error) setForms(formsResp.data || [])

    const linksResp = await supabase
      .from('ampro_performance_forms')
      .select('performance_id,form_id')
    if (!linksResp.error) {
      const map: Record<string, string> = {}
      for (const row of linksResp.data || []) {
        const pid = String((row as any)?.performance_id || '')
        const fid = String((row as any)?.form_id || '')
        if (pid && fid) map[pid] = fid
      }
      setFormIdByProgramId(map)
    }

    const appsResp = await supabase
      .from('ampro_applications')
      .select('id,performance_id,user_id,status,submitted_at,answers_json,snapshot_json,paid,payment_received_at')
      .order('submitted_at', { ascending: false })
      .limit(200)
    if (!appsResp.error) setApplications(appsResp.data || [])

    const rosterResp = await supabase
      .from('ampro_roster')
      .select('performance_id,user_id,role_name,added_at')
      .order('added_at', { ascending: false })
    if (!rosterResp.error) setRoster(rosterResp.data || [])

    const updatesResp = await supabase
      .from('ampro_updates')
      .select('id,performance_id,title,body,visibility,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!updatesResp.error) setUpdates(updatesResp.data || [])

    const userIds = Array.from(
      new Set(
        [...(appsResp.data || []).map((a: any) => String(a.user_id)), ...(rosterResp.data || []).map((r: any) => String(r.user_id))]
          .filter(Boolean),
      ),
    )
    if (userIds.length) {
      const profilesResp = await supabase
        .from('ampro_dancer_profiles')
        .select('user_id,first_name,last_name')
        .in('user_id', userIds)

      if (!profilesResp.error) {
        const map: Record<string, { first_name?: string | null; last_name?: string | null }> = {}
        for (const row of profilesResp.data || []) {
          const id = String((row as any)?.user_id || '')
          if (!id) continue
          map[id] = {
            first_name: (row as any)?.first_name ?? null,
            last_name: (row as any)?.last_name ?? null,
          }
        }
        setProfilesByUserId(map)
      }
    } else {
      setProfilesByUserId({})
    }
  }

  function openCreateProgrammaModal() {
    setEditingProgrammaId(null)
    setNewLocationId('')
    setNewTitle('')
    setNewDescription('')
    setNewRegion('')
    setNewApplicationDeadline('')
    setNewFormId('')
    setNewRehearsalStart('')
    setNewRehearsalEnd('')
    setNewPerformanceDates('')
    setNewProgramType('performance')
    setNewIsPublic(true)
    setNewApplicationsOpen(true)
    setNewPrice('')
    setNewAdminPaymentUrl('')
    setProgrammaModalOpen(true)
  }

  function openMemberDetail(app: any) {
    setMemberDetailApp(app)
    setMemberDetailOpen(true)
  }

  function openMemberDelete(app: any) {
    setMemberDeleteApp(app)
    setMemberDeleteConfirm('')
    setMemberDeleteOpen(true)
  }

  async function deleteMemberApplication() {
    if (!memberDeleteApp?.id) return
    try {
      const { error } = await supabase.from('ampro_applications').delete().eq('id', memberDeleteApp.id)
      if (error) throw error
      showSuccess('Member verwijderd')
      setMemberDeleteOpen(false)
      setMemberDeleteApp(null)
      await refresh()
    } catch (e: any) {
      showError(e?.message || 'Verwijderen mislukt')
    }
  }

  async function toggleMemberPaid() {
    if (!memberDetailApp?.id) return
    try {
      setSavingPaid(true)
      const currentlyPaid = Boolean((memberDetailApp as any)?.paid)
      const updates: any = { paid: !currentlyPaid }
      updates.payment_received_at = !currentlyPaid ? new Date().toISOString() : null

      const { error } = await supabase.from('ampro_applications').update(updates).eq('id', memberDetailApp.id)
      if (error) throw error
      showSuccess('Betaalstatus bijgewerkt')
      setMemberDetailOpen(false)
      setMemberDetailApp(null)
      await refresh()
    } catch (e: any) {
      showError(e?.message || 'Kon betaalstatus niet bijwerken')
    } finally {
      setSavingPaid(false)
    }
  }

  function openEditProgrammaModal(p: any) {
    setEditingProgrammaId(String(p?.id || ''))
    setNewLocationId(p?.location_id ? String(p.location_id) : '')
    setNewTitle(String(p?.title || ''))
    setNewDescription(String(p?.description || ''))
    setNewRegion(String(p?.region || ''))
    setNewApplicationDeadline(p?.application_deadline ? formatDateOnlyFromISODate(String(p.application_deadline)) : '')
    setNewFormId(formIdByProgramId[String(p?.id || '')] || '')
    setNewRehearsalStart(p?.rehearsal_period_start ? formatDateOnlyFromISODate(String(p.rehearsal_period_start)) : '')
    setNewRehearsalEnd(p?.rehearsal_period_end ? formatDateOnlyFromISODate(String(p.rehearsal_period_end)) : '')

    const dates = Array.isArray(p?.performance_dates) ? (p.performance_dates as string[]) : []
    setNewPerformanceDates(dates.map((d) => formatDateOnlyFromISODate(String(d))).join('\n'))

    const t = String(p?.program_type || 'performance').toLowerCase()
    setNewProgramType(t === 'workshop' ? 'workshop' : 'performance')
    setNewIsPublic(Boolean(p?.is_public))
    setNewApplicationsOpen(Boolean(p?.applications_open))
    setNewPrice(p?.price != null ? String(p.price / 100) : '')
    setNewAdminPaymentUrl(p?.admin_payment_url || '')
    setProgrammaModalOpen(true)
  }

  async function saveProgramma() {
    try {
      setSaving(true)
      if (!newTitle.trim()) throw new Error('Titel is verplicht')

      const parsedDates = parseFlexibleDateListToISODateArray(newPerformanceDates)
      const rehearsalStart = parseFlexibleDateToISODate(newRehearsalStart)
      const rehearsalEnd = parseFlexibleDateToISODate(newRehearsalEnd)
      const application_deadline = parseFlexibleDateToISODate(newApplicationDeadline)
      const region = newRegion.trim() || null
      const performance_dates = parsedDates.length ? parsedDates : null

      const payload = {
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        program_type: newProgramType,
        location_id: newLocationId ? newLocationId : null,
        is_public: newIsPublic,
        applications_open: newApplicationsOpen,
        application_deadline,
        region,
        rehearsal_period_start: rehearsalStart,
        rehearsal_period_end: rehearsalEnd,
        performance_dates,
        price: newPrice ? Math.round(Number(parseFloat(newPrice) * 100)) : null,
        admin_payment_url: newAdminPaymentUrl || null,
      }

      const id = editingProgrammaId
      let programmaId = id

      if (id) {
        const { error } = await supabase.from('ampro_programmas').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('ampro_programmas').insert(payload).select('id').single()
        if (error) throw error
        programmaId = String((data as any)?.id || '')
        if (!programmaId) throw new Error('Kon programma niet aanmaken (geen id)')
      }

      if (programmaId) {
        if (newFormId) {
          const { error } = await supabase
            .from('ampro_performance_forms')
            .upsert({ performance_id: programmaId, form_id: newFormId }, { onConflict: 'performance_id' })
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('ampro_performance_forms')
            .delete()
            .eq('performance_id', programmaId)
          if (error) throw error
        }
      }

      setEditingProgrammaId(null)
      setProgrammaModalOpen(false)
      await refresh()

      showSuccess(id ? 'Programma bijgewerkt' : 'Programma aangemaakt')
    } catch (e: any) {
      showError(e?.message || (editingProgrammaId ? 'Kon programma niet bijwerken' : 'Kon programma niet aanmaken'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteProgram(programId: string) {
    try {
      if (!programId) return
      if (!confirm('Weet je zeker dat je dit programma wilt verwijderen?')) return
      const { error } = await supabase.from('ampro_programmas').delete().eq('id', programId)
      if (error) throw error
      await refresh()
      showSuccess('Programma verwijderd')
    } catch (e: any) {
      showError(e?.message || 'Kon programma niet verwijderen')
    }
  }

  async function createForm() {
    try {
      setSavingForm(true)
      if (!newFormName.trim()) throw new Error('Naam is verplicht')

      if (!newFormFields.length) throw new Error('Voeg minstens 1 veld toe')

      const keySet = new Set<string>()
      const built: AmproFormField[] = newFormFields.map((f) => {
        const label = (f.label || '').trim()
        if (!label) throw new Error('Elk veld moet een label hebben')
        const key = uniqueKey(label, keySet)

        if (f.type === 'select') {
          const options = (f.options || [])
            .map((o, idx) => {
              const optLabel = (o.label || '').trim()
              const explicitValue = (o.value || '').trim()
              const derivedValue = slugToKey(optLabel)
              const optValue = explicitValue || derivedValue || `option_${idx + 1}`
              if (!optLabel) return null
              if (!optValue) return null
              return { label: optLabel, value: optValue }
            })
            .filter(Boolean) as Array<{ label: string; value: string }>

          if (!options.length) throw new Error(`Select-veld "${label}" moet minstens 1 optie hebben`)

          return {
            key,
            label,
            type: 'select',
            required: Boolean(f.required),
            options,
          }
        }

        if (f.type === 'checkbox') {
          return {
            key,
            label,
            type: 'checkbox',
            required: Boolean(f.required),
          }
        }

        return {
          key,
          label,
          type: f.type as any,
          required: Boolean(f.required),
          placeholder: (f.placeholder || '').trim() || undefined,
        }
      })

      if (editingFormId) {
        const { error } = await supabase.from('ampro_forms').update({ name: newFormName.trim(), fields_json: built }).eq('id', editingFormId)
        if (error) throw error
        setEditingFormId(null)
        showSuccess('Form bijgewerkt')
      } else {
        const { error } = await supabase.from('ampro_forms').insert({ name: newFormName.trim(), fields_json: built })
        if (error) throw error
        showSuccess('Form aangemaakt')
      }

      setNewFormName('')
      setNewFormFields([])
      setFormModalOpen(false)
      await refresh()
    } catch (e: any) {
      showError(e?.message || 'Kon form niet aanmaken')
    } finally {
      setSavingForm(false)
    }
  }

  async function setStatus(appId: string, status: 'pending' | 'accepted' | 'rejected' | 'maybe') {
    try {
      const fromState = (applications || []).find((a: any) => String(a?.id || '') === String(appId))
      let performanceId = fromState ? String(fromState.performance_id || '') : ''
      let userId = fromState ? String(fromState.user_id || '') : ''

      if (!performanceId || !userId) {
        const lookup = await supabase
          .from('ampro_applications')
          .select('performance_id,user_id')
          .eq('id', appId)
          .maybeSingle()
        if (lookup.error) throw lookup.error
        performanceId = lookup.data?.performance_id ? String((lookup.data as any).performance_id) : ''
        userId = lookup.data?.user_id ? String((lookup.data as any).user_id) : ''
      }

      const { error } = await supabase.from('ampro_applications').update({ status }).eq('id', appId)
      if (error) throw error

      if (performanceId && userId) {
        if (status === 'accepted') {
          // Try to infer a role name from the application's answers if present.
          const answers = (fromState as any)?.answers_json || {}
          const possibleKeys = ['role', 'rol', 'desired_role', 'functie', 'position', 'requested_role']
          let inferredRole: string | null = null
          for (const k of possibleKeys) {
            const v = (answers as any)[k]
            if (!v) continue
            if (typeof v === 'string' && v.trim()) {
              inferredRole = v.trim()
              break
            }
            if (typeof v === 'object') {
              if (v.label) {
                inferredRole = String(v.label)
                break
              }
              if (v.value) {
                inferredRole = String(v.value)
                break
              }
            }
          }

          const upsertRoster = await supabase
            .from('ampro_roster')
            .upsert({ performance_id: performanceId, user_id: userId, role_name: inferredRole } as any)
          if (upsertRoster.error) throw upsertRoster.error
        } else {
          const delRoster = await supabase
            .from('ampro_roster')
            .delete()
            .eq('performance_id', performanceId)
            .eq('user_id', userId)
          if (delRoster.error) throw delRoster.error
        }
      }

      await refresh()

      showSuccess('Status aangepast')
    } catch (e: any) {
      showError(e?.message || 'Status aanpassen mislukt')
    }
  }

  function stageStatus(appId: string, status: 'pending' | 'accepted' | 'rejected' | 'maybe') {
    setStagedStatuses((prev) => ({ ...prev, [appId]: status }))
  }

  async function saveGroupStatuses(performanceId: string) {
    try {
      setSavingGroup((s) => ({ ...s, [performanceId]: true }))

      const apps = (applications || []).filter((a: any) => String(a.performance_id || '') === String(performanceId))
      const toSave = apps.filter((a: any) => {
        const staged = stagedStatuses[String(a.id)]
        return staged !== undefined && String(staged) !== String(a.status)
      })

      for (const a of toSave) {
        const desired = stagedStatuses[String(a.id)]
        if (!desired) continue

        const { error } = await supabase.from('ampro_applications').update({ status: desired }).eq('id', a.id)
        if (error) throw error

        const performanceId = String(a.performance_id || '')
        const userId = String(a.user_id || '')
        if (desired === 'accepted') {
          // Attempt to extract a role from the application's answers JSON.
          const answers = (a as any)?.answers_json || {}
          const possibleKeys = ['role', 'rol', 'desired_role', 'functie', 'position', 'requested_role']
          let inferredRole: string | null = null
          for (const k of possibleKeys) {
            const v = (answers as any)[k]
            if (!v) continue
            if (typeof v === 'string' && v.trim()) {
              inferredRole = v.trim()
              break
            }
            if (typeof v === 'object') {
              if (v.label) {
                inferredRole = String(v.label)
                break
              }
              if (v.value) {
                inferredRole = String(v.value)
                break
              }
            }
          }

          const upsertRoster = await supabase.from('ampro_roster').upsert({ performance_id: performanceId, user_id: userId, role_name: inferredRole } as any)
          if (upsertRoster.error) throw upsertRoster.error
        } else {
          const delRoster = await supabase
            .from('ampro_roster')
            .delete()
            .eq('performance_id', performanceId)
            .eq('user_id', userId)
          if (delRoster.error) throw delRoster.error
        }
      }

      setStagedStatuses((prev) => {
        const next = { ...prev }
        for (const a of toSave) delete next[String(a.id)]
        return next
      })

      await refresh()
      showSuccess('Statussen opgeslagen')
    } catch (e: any) {
      showError(e?.message || 'Kon statussen niet opslaan')
    } finally {
      setSavingGroup((s) => ({ ...s, [performanceId]: false }))
    }
  }

  async function createUpdate() {
    try {
      setSavingUpdate(true)
      if (!newUpdatePerformanceId) throw new Error('Kies een programma')
      if (!newUpdateTitle.trim()) throw new Error('Titel is verplicht')
      if (!newUpdateBody.trim()) throw new Error('Inhoud is verplicht')

      const { error } = await supabase
        .from('ampro_updates')
        .insert({
          performance_id: newUpdatePerformanceId,
          title: newUpdateTitle.trim(),
          body: newUpdateBody.trim(),
          visibility: 'accepted_only',
        })

      if (error) throw error

      setNewUpdateTitle('')
      setNewUpdateBody('')
      setNoteModalOpen(false)
      await refresh()
      showSuccess('Note geplaatst')
    } catch (e: any) {
      showError(e?.message || 'Kon note niet plaatsen')
    } finally {
      setSavingUpdate(false)
    }
  }

  function openCreateLocationModal() {
    setEditingLocationId(null)
    setNewLocationName('')
    setNewLocationAddress('')
    setLocationModalOpen(true)
  }

  function openEditLocationModal(l: any) {
    setEditingLocationId(String(l?.id || ''))
    setNewLocationName(String(l?.name || ''))
    setNewLocationAddress(String(l?.address || ''))
    setLocationModalOpen(true)
  }

  async function saveLocation() {
    try {
      setSavingLocation(true)
      if (!newLocationName.trim()) throw new Error('Naam is verplicht')

      const payload = {
        name: newLocationName.trim(),
        address: newLocationAddress.trim() || null,
      }

      const resp = editingLocationId
        ? await supabase.from('ampro_locations').update(payload).eq('id', editingLocationId)
        : await supabase.from('ampro_locations').insert(payload)

      if (resp.error) throw resp.error

      setEditingLocationId(null)
      setNewLocationName('')
      setNewLocationAddress('')
      setLocationModalOpen(false)
      await refresh()
      showSuccess(editingLocationId ? 'Locatie bijgewerkt' : 'Locatie aangemaakt')
    } catch (e: any) {
      showError(e?.message || (editingLocationId ? 'Kon locatie niet bijwerken' : 'Kon locatie niet aanmaken'))
    } finally {
      setSavingLocation(false)
    }
  }

  const performanceTitleById = performances.reduce((acc: Record<string, string>, p: any) => {
    const id = String(p?.id || '')
    if (id) acc[id] = String(p?.title || id)
    return acc
  }, {})

  const locationNameById = locations.reduce((acc: Record<string, string>, l: any) => {
    const id = String(l?.id || '')
    if (id) acc[id] = String(l?.name || id)
    return acc
  }, {})

  const sidebarItems: Array<{ key: AdminSection; label: string; icon: any }> = [
    { key: 'programmas', label: "Programma's", icon: BookOpen },
    { key: 'forms', label: 'Forms', icon: FileText },
    { key: 'locations', label: 'Locaties', icon: MapPin },
    { key: 'availability', label: 'Beschikbaarheid', icon: Calendar },
    { key: 'notes', label: 'Notes', icon: MessageSquare },
    { key: 'applications', label: 'Applicaties', icon: ClipboardList },
    { key: 'members', label: 'Members', icon: Users },
  ]

  const filteredProgrammas = (() => {
    const q = programmaSearch.trim().toLowerCase()
    if (!q) return performances
    return performances.filter((p) => {
      const title = String(p?.title || '').toLowerCase()
      const region = String(p?.region || '').toLowerCase()
      const type = String(p?.program_type || '').toLowerCase()
      return title.includes(q) || region.includes(q) || type.includes(q)
    })
  })()

  const updatesByProgramId = updates.reduce((acc: Record<string, any[]>, u: any) => {
    const id = String(u?.performance_id || '')
    if (!id) return acc
    if (!acc[id]) acc[id] = []
    acc[id].push(u)
    return acc
  }, {})

  const unknownProgramUpdates = updates.filter((u: any) => {
    const pid = String(u?.performance_id || '')
    if (!pid) return true
    return !performances.some((p) => String(p?.id || '') === pid)
  })

  const filteredMembers = (applications || []).filter((a: any) => {
    if (memberFilterPerformanceId && String(a.performance_id) !== String(memberFilterPerformanceId)) return false
    if (memberFilterStatus !== 'all' && String(a.status) !== String(memberFilterStatus)) return false
    if (memberFilterPaid === 'paid' && !a.paid) return false
    if (memberFilterPaid === 'unpaid' && a.paid) return false
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white">
          <div className="px-5 py-5">
            <div className="text-sm font-semibold text-gray-900">The AmProProject</div>
            <div className="text-xs text-gray-600">Admin</div>
          </div>

          <div className="flex-1 px-3 pb-4">
            <nav className="grid gap-1">
              {sidebarItems.map((item) => {
                const Icon = item.icon
                const isActive = active === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActive(item.key)}
                    className={
                      'flex items-center gap-3 rounded-3xl px-3 py-2 text-sm font-semibold transition-colors ' +
                      (isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50')
                    }
                  >
                    <Icon className={isActive ? 'h-4 w-4 text-blue-700' : 'h-4 w-4 text-gray-500'} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="px-5 pb-5">
            <Link href="/ampro" className="text-sm font-semibold text-gray-900">
              ← Terug
            </Link>
          </div>
        </div>
      </div>

      <div className="md:pl-64">
        <main className="p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            <div className="md:hidden mb-4 rounded-2xl border border-gray-200 bg-white p-2">
              <div className="flex gap-2 overflow-x-auto">
                {sidebarItems.map((item) => {
                  const isActive = active === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActive(item.key)}
                      className={
                        'whitespace-nowrap rounded-3xl px-3 py-2 text-sm font-semibold ' +
                        (isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700')
                      }
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <Modal
              isOpen={programmaModalOpen}
              onClose={() => setProgrammaModalOpen(false)}
              ariaLabel={editingProgrammaId ? 'Programma bewerken' : 'Nieuw programma'}
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-xl font-bold text-gray-900">{editingProgrammaId ? 'Programma bewerken' : 'Nieuw programma'}</h2>
              <p className="mt-1 text-sm text-gray-600">Vul de velden in.</p>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Type programma
                  <select
                    value={newProgramType}
                    onChange={(e) => setNewProgramType(e.target.value as any)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="performance">Performance</option>
                    <option value="workshop">Workshop</option>
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Locatie
                  <select
                    value={newLocationId}
                    onChange={(e) => setNewLocationId(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">Geen locatie</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Titel
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Titel"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Beschrijving
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Beschrijving (optioneel)"
                    className="min-h-28 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Prijs (€)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      placeholder="0.00"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>

                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Betaal URL (optioneel)
                    <input
                      type="text"
                      value={newAdminPaymentUrl}
                      onChange={(e) => setNewAdminPaymentUrl(e.target.value)}
                      placeholder="https://voorbeeld.nl/betaal/123"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Regio
                    <input
                      value={newRegion}
                      onChange={(e) => setNewRegion(e.target.value)}
                      placeholder="Regio"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>

                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Deadline
                    <input
                      value={newApplicationDeadline}
                      onChange={(e) => setNewApplicationDeadline(e.target.value)}
                      placeholder="dd/mm/jjjj"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Formulier (voor inschrijving)
                  <select
                    value={newFormId}
                    onChange={(e) => setNewFormId(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">Geen formulier</option>
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Repetitie start
                    <input
                      value={newRehearsalStart}
                      onChange={(e) => setNewRehearsalStart(e.target.value)}
                      placeholder="dd/mm/jjjj"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Repetitie einde
                    <input
                      value={newRehearsalEnd}
                      onChange={(e) => setNewRehearsalEnd(e.target.value)}
                      placeholder="dd/mm/jjjj"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Data (meerdere toegestaan)
                  <textarea
                    value={newPerformanceDates}
                    onChange={(e) => setNewPerformanceDates(e.target.value)}
                    placeholder="dd/mm/jjjj (1 per lijn of komma gescheiden)"
                    className="min-h-24 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={newIsPublic}
                      onChange={(e) => setNewIsPublic(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Publiek zichtbaar
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={newApplicationsOpen}
                      onChange={(e) => setNewApplicationsOpen(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Inschrijvingen open
                  </label>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setProgrammaModalOpen(false)}
                    className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={saveProgramma}
                    disabled={saving}
                    className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                      saving ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {saving ? 'Opslaan…' : editingProgrammaId ? 'Opslaan' : 'Aanmaken'}
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={formModalOpen}
              onClose={() => {
                setFormModalOpen(false)
                setEditingFormId(null)
              }}
              ariaLabel={editingFormId ? 'Formulier bewerken' : 'Nieuwe form'}
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-xl font-bold text-gray-900">{editingFormId ? 'Formulier bewerken' : 'Nieuwe form'}</h2>
              <p className="mt-1 text-sm text-gray-600">Maak een inschrijfformulier voor een programma.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Naam
                  <input
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder="Naam"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <div className="rounded-3xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">Velden</div>
                    <button
                      type="button"
                      onClick={() => setNewFormFields((prev) => [...prev, makeEmptyFieldDraft()])}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      Veld toevoegen
                    </button>
                  </div>

                  {newFormFields.length === 0 ? (
                    <div className="mt-3 text-sm text-gray-600">Nog geen velden. Klik op “Veld toevoegen”.</div>
                  ) : null}

                  <div className="mt-4 grid gap-3">
                    {newFormFields.map((field, idx) => {
                      const showPlaceholder = field.type === 'text' || field.type === 'textarea' || field.type === 'date'
                      const isSelect = field.type === 'select'

                      return (
                        <div key={field.id} className="rounded-3xl border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">Veld {idx + 1}</div>
                            <button
                              type="button"
                              onClick={() => setNewFormFields((prev) => prev.filter((f) => f.id !== field.id))}
                              className="text-sm font-semibold text-red-700 hover:text-red-800"
                            >
                              Verwijder
                            </button>
                          </div>

                          <div className="mt-3 grid gap-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Label
                                <input
                                  value={field.label}
                                  onChange={(e) => {
                                    const nextLabel = e.target.value
                                    setNewFormFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, label: nextLabel } : f)))
                                  }}
                                  placeholder="bv. Ervaring"
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>

                              <div className="grid gap-1 text-sm font-medium text-gray-700">
                                Key
                                <div className="h-11 rounded-2xl border border-gray-200 bg-gray-50 px-3 text-sm flex items-center text-gray-600">
                                  Automatisch
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Type
                                <select
                                  value={field.type}
                                  onChange={(e) => {
                                    const nextType = e.target.value as AmproFormField['type']
                                    setNewFormFields((prev) =>
                                      prev.map((f) => {
                                        if (f.id !== field.id) return f
                                        return {
                                          ...f,
                                          type: nextType,
                                          placeholder: nextType === 'text' || nextType === 'textarea' || nextType === 'date' ? f.placeholder : '',
                                          options:
                                            nextType === 'select'
                                              ? (f.options?.length ? f.options : [{ id: makeId(), label: '', value: '' }])
                                              : [],
                                        }
                                      }),
                                    )
                                  }}
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                >
                                  <option value="text">Tekst</option>
                                  <option value="textarea">Tekstvak (groot)</option>
                                  <option value="date">Datum</option>
                                  <option value="select">Keuzelijst</option>
                                  <option value="checkbox">Checkbox</option>
                                </select>
                              </label>

                              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 mt-7">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(e) =>
                                    setNewFormFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, required: e.target.checked } : f)))
                                  }
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                                Verplicht
                              </label>
                            </div>

                            {showPlaceholder ? (
                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Placeholder (optioneel)
                                <input
                                  value={field.placeholder}
                                  onChange={(e) =>
                                    setNewFormFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, placeholder: e.target.value } : f)))
                                  }
                                  placeholder="Tekst in het veld…"
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>
                            ) : null}

                            {isSelect ? (
                              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-gray-900">Opties</div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setNewFormFields((prev) =>
                                        prev.map((f) =>
                                          f.id === field.id
                                            ? { ...f, options: [...(f.options || []), { id: makeId(), label: '', value: '' }] }
                                            : f,
                                        ),
                                      )
                                    }
                                    className="text-sm font-semibold rounded-3xl text-blue-700 hover:text-blue-800"
                                  >
                                    + optie
                                  </button>
                                </div>

                                <div className="mt-3 grid gap-2">
                                  {(field.options || []).map((opt) => (
                                    <div key={opt.id} className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-2 items-end">
                                      <label className="grid gap-1 text-sm font-medium text-gray-700">
                                        Label
                                        <input
                                          value={opt.label}
                                          onChange={(e) => {
                                            const v = e.target.value
                                            setNewFormFields((prev) =>
                                              prev.map((f) => {
                                                if (f.id !== field.id) return f
                                                return {
                                                  ...f,
                                                  options: (f.options || []).map((o) => (o.id === opt.id ? { ...o, label: v } : o)),
                                                }
                                              }),
                                            )
                                          }}
                                          className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-sm font-medium text-gray-700">
                                        Value
                                        <input
                                          value={opt.value}
                                          onChange={(e) => {
                                            const v = e.target.value
                                            setNewFormFields((prev) =>
                                              prev.map((f) => {
                                                if (f.id !== field.id) return f
                                                return {
                                                  ...f,
                                                  options: (f.options || []).map((o) => (o.id === opt.id ? { ...o, value: v } : o)),
                                                }
                                              }),
                                            )
                                          }}
                                          placeholder="(optioneel)"
                                          className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setNewFormFields((prev) =>
                                            prev.map((f) => {
                                              if (f.id !== field.id) return f
                                              return { ...f, options: (f.options || []).filter((o) => o.id !== opt.id) }
                                            }),
                                          )
                                        }
                                        className="h-11 rounded-3xl px-3 text-sm font-semibold bg-white border border-gray-200 text-gray-900 hover:bg-gray-50"
                                      >
                                        Verwijder
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 text-xs text-gray-600">Laat “Value” leeg om automatisch af te leiden uit het label.</div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormModalOpen(false)
                      setEditingFormId(null)
                    }}
                    className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={createForm}
                    disabled={savingForm}
                    className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                      savingForm ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {savingForm ? 'Opslaan…' : editingFormId ? 'Opslaan' : 'Aanmaken'}
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={inviteManageOpen}
              onClose={() => {
                if (inviteManageLoading) return
                setInviteManageOpen(false)
              }}
              ariaLabel="Groepslink beheren"
              contentStyle={{ maxWidth: 720 }}
            >
              <h2 className="text-xl font-bold text-gray-900">Groepslink beheren</h2>
              <p className="mt-1 text-sm text-gray-600">
                Programma: <span className="font-semibold">{inviteManageProgram?.title || ''}</span>
              </p>

              <div className="mt-6 grid gap-3">
                {inviteManageStatus ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      inviteManageStatus.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <div className="font-semibold">
                      Status: {inviteManageStatus.ok ? 'Actief' : inviteManageStatus.revoked ? 'Gedeactiveerd' : inviteManageStatus.expired ? 'Verlopen' : inviteManageStatus.maxed ? 'Vol' : 'Niet actief'}
                    </div>
                    <div className="mt-1 text-xs">
                      Gebruikt: {inviteManageStatus.uses_count}
                      {inviteManageStatus.max_uses != null ? ` / ${inviteManageStatus.max_uses}` : ''}
                      {inviteManageStatus.expires_at ? ` • Verloopt: ${new Date(inviteManageStatus.expires_at).toLocaleString()}` : ''}
                    </div>
                  </div>
                ) : null}

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Link
                  <input
                    value={inviteManageUrl || (inviteManageLoading ? 'Laden…' : '')}
                    readOnly
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Max aantal gebruikers (optioneel)
                    <input
                      value={inviteConfigMaxUses}
                      onChange={(e) => setInviteConfigMaxUses(e.target.value)}
                      inputMode="numeric"
                      placeholder="(onbeperkt)"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                      disabled={inviteManageLoading}
                    />
                  </label>

                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Vervaldatum (optioneel)
                    <input
                      type="datetime-local"
                      value={inviteConfigExpiresAt}
                      onChange={(e) => setInviteConfigExpiresAt(e.target.value)}
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                      disabled={inviteManageLoading}
                    />
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteManageOpen(false)}
                    disabled={inviteManageLoading}
                    className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 disabled:opacity-50"
                  >
                    Sluiten
                  </button>

                  <button
                    type="button"
                    onClick={deleteInviteLinks}
                    disabled={inviteManageLoading || !inviteManageProgram?.id}
                    className="h-11 rounded-3xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Verwijder links
                  </button>

                  <button
                    type="button"
                    onClick={revokeInviteLinks}
                    disabled={inviteManageLoading || !inviteManageProgram?.id}
                    className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Deactiveer
                  </button>

                  <button
                    type="button"
                    onClick={rotateInviteWithSettings}
                    disabled={inviteManageLoading || !inviteManageProgram?.id}
                    className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Nieuwe link (met limiet)
                  </button>

                  <button
                    type="button"
                    onClick={copyInviteUrl}
                    disabled={inviteManageLoading || !inviteManageUrl || (inviteManageStatus ? !inviteManageStatus.ok : false)}
                    className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                      inviteManageLoading || !inviteManageUrl || (inviteManageStatus ? !inviteManageStatus.ok : false)
                        ? 'bg-blue-100 text-blue-400'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    Kopieer link
                  </button>
                </div>

                {inviteManageToken ? (
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-600">
                    <div>Token: {inviteManageStatus?.ok ? 'actief' : 'niet actief'}</div>
                    <button
                      type="button"
                      onClick={() => refreshInviteStatus(inviteManageToken)}
                      disabled={inviteManageLoading}
                      className="font-semibold text-gray-900 hover:text-blue-600 disabled:opacity-50"
                    >
                      Ververs status
                    </button>
                  </div>
                ) : null}
              </div>
            </Modal>

            <Modal
              isOpen={noteModalOpen}
              onClose={() => setNoteModalOpen(false)}
              ariaLabel="Nieuwe note"
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-xl font-bold text-gray-900">Nieuwe note</h2>
              <p className="mt-1 text-sm text-gray-600">Note wordt zichtbaar voor geaccepteerde users.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Programma
                  <select
                    value={newUpdatePerformanceId}
                    onChange={(e) => setNewUpdatePerformanceId(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">Kies een programma</option>
                    {performances.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Titel
                  <input
                    value={newUpdateTitle}
                    onChange={(e) => setNewUpdateTitle(e.target.value)}
                    placeholder="Titel"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Inhoud
                  <textarea
                    value={newUpdateBody}
                    onChange={(e) => setNewUpdateBody(e.target.value)}
                    placeholder="Inhoud"
                    className="min-h-32 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNoteModalOpen(false)}
                    className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={createUpdate}
                    disabled={savingUpdate}
                    className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                      savingUpdate ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {savingUpdate ? 'Opslaan…' : 'Plaatsen'}
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={locationModalOpen}
              onClose={() => setLocationModalOpen(false)}
              ariaLabel={editingLocationId ? 'Locatie bewerken' : 'Nieuwe locatie'}
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-xl font-bold text-gray-900">{editingLocationId ? 'Locatie bewerken' : 'Nieuwe locatie'}</h2>
              <p className="mt-1 text-sm text-gray-600">Voeg een locatie toe die je kan koppelen aan programma’s.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Naam
                  <input
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="Naam"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Adres
                  <textarea
                    value={newLocationAddress}
                    onChange={(e) => setNewLocationAddress(e.target.value)}
                    placeholder="Adres (optioneel)"
                    className="min-h-24 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLocationModalOpen(false)}
                    className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={saveLocation}
                    disabled={savingLocation}
                    className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                      savingLocation ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {savingLocation ? 'Opslaan…' : editingLocationId ? 'Opslaan' : 'Aanmaken'}
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={memberDetailOpen}
              onClose={() => setMemberDetailOpen(false)}
              ariaLabel="Member gegevens"
              contentStyle={{ maxWidth: 760 }}
            >
              {memberDetailApp
                ? (() => {
                    const userId = String(memberDetailApp.user_id || '')
                    const profile = profilesByUserId[userId]
                    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userId
                    const perfTitle = performanceTitleById[String(memberDetailApp.performance_id)] || String(memberDetailApp.performance_id)
                    const snapshot = (memberDetailApp as any)?.snapshot_json || {}
                    const answers = (memberDetailApp as any)?.answers_json || {}

                    const formId = formIdByProgramId[String(memberDetailApp.performance_id)]
                    const formRow = formId ? (forms || []).find((f: any) => String(f?.id) === String(formId)) : null
                    const formFields = parseAmproFormFields((formRow as any)?.fields_json)

                    const formattedSnapshotRows: Array<{ label: string; value: string }> = [
                      { label: 'Voornaam', value: String(snapshot.first_name || '') },
                      { label: 'Achternaam', value: String(snapshot.last_name || '') },
                      { label: 'Geboortedatum', value: String(snapshot.birth_date || '') },
                      { label: 'Email', value: String(snapshot.email || '') },
                      { label: 'Telefoon', value: String(snapshot.phone || '') },
                      { label: 'Straat', value: String(snapshot.street || '') },
                      { label: 'Huisnummer', value: String(snapshot.house_number || '') },
                      { label: 'Toevoeging', value: String(snapshot.house_number_addition || '') },
                      { label: 'Postcode', value: String(snapshot.postal_code || '') },
                      { label: 'Gemeente', value: String(snapshot.city || '') },
                    ].map((r) => ({ label: r.label, value: r.value.trim() }))

                    function formatAnswer(field: AmproFormField, raw: any): string {
                      if (field.type === 'checkbox') return raw ? 'Ja' : 'Nee'
                      if (raw == null) return ''
                      const v = typeof raw === 'string' ? raw : String(raw)
                      if (field.type === 'select') {
                        const opt = field.options?.find((o) => String(o.value) === String(v))
                        return opt?.label ? `${opt.label}` : v
                      }
                      return v
                    }

                    return (
                      <div className="space-y-6">
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">User gegevens</h2>
                        </div>

                        <div>
                          <div className="text-sm font-semibold text-gray-900">{name}</div>
                          <div className="mt-1 text-sm text-gray-600">Voorstelling: {perfTitle}</div>
                          <div className="mt-1 text-xs text-gray-500">Status: {String(memberDetailApp.status || '')}</div>
                          <div className="mt-2 flex items-center gap-3">
                            {((memberDetailApp as any)?.paid) ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800">Betaald</span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Onbetaald</span>
                            )}

                            <button
                              type="button"
                              onClick={toggleMemberPaid}
                              disabled={savingPaid}
                              className={`h-8 rounded-3xl px-3 text-sm font-semibold transition-colors ${
                                savingPaid ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              {savingPaid ? 'Verwerken…' : ((memberDetailApp as any)?.paid ? 'Markeer onbetaald' : 'Markeer betaald')}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-gray-200 bg-white p-4">
                          <div className="text-sm font-semibold text-gray-900">User gegevens</div>
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {formattedSnapshotRows.map((r) => (
                              <div key={r.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                <div className="text-xs font-semibold text-gray-600">{r.label}</div>
                                <div className="mt-1 text-sm font-semibold text-gray-900 wrap-break-word">{r.value || '-'}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-gray-200 bg-white p-4">
                          <div className="text-sm font-semibold text-gray-900">Form gegevens</div>
                          <div className="mt-1 text-sm text-gray-600">{formRow?.name || 'Geen form gekoppeld'}</div>

                          {formFields.length ? (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {formFields.map((f) => (
                                <div key={f.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                  <div className="text-xs font-semibold text-gray-600">{f.label}</div>
                                  <div className="mt-1 text-sm font-semibold text-gray-900 wrap-break-word">
                                    {formatAnswer(f, (answers as any)[f.key]) || '-'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-gray-600">Geen form velden gevonden.</div>
                          )}
                        </div>
                      </div>
                    )
                  })()
                : null}
            </Modal>

            <Modal
              isOpen={memberDeleteOpen}
              onClose={() => setMemberDeleteOpen(false)}
              ariaLabel="Member verwijderen"
              contentStyle={{ maxWidth: 640 }}
            >
              {memberDeleteApp
                ? (() => {
                    const userId = String(memberDeleteApp.user_id || '')
                    const profile = profilesByUserId[userId]
                    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userId
                    const perfTitle = performanceTitleById[String(memberDeleteApp.performance_id)] || String(memberDeleteApp.performance_id)
                    const canDelete = memberDeleteConfirm.trim().toUpperCase() === 'DELETE'

                    return (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">Member verwijderen</h2>
                          <p className="mt-1 text-sm text-gray-600">Deze actie kan je niet ongedaan maken.</p>
                        </div>

                        <p className="text-sm text-gray-700">
                          Je staat op het punt om de inschrijving te verwijderen voor <span className="font-semibold">{name}</span> ({perfTitle}).
                        </p>
                        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                          <div className="text-sm font-semibold text-gray-900">Typ DELETE om te bevestigen</div>
                          <input
                            value={memberDeleteConfirm}
                            onChange={(e) => setMemberDeleteConfirm(e.target.value)}
                            className="mt-2 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                            placeholder="DELETE"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setMemberDeleteOpen(false)}
                            className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900"
                          >
                            Annuleren
                          </button>
                          <button
                            type="button"
                            disabled={!canDelete}
                            onClick={deleteMemberApplication}
                            className="h-11 rounded-3xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Verwijderen
                          </button>
                        </div>
                      </div>
                    )
                  })()
                : null}
            </Modal>

            {active === 'programmas' ? (
              <>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Programma’s</h1>
                    <p className="mt-1 text-sm text-gray-600">Beheer programma’s (performances & workshops).</p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateProgrammaModal}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Nieuw programma
                  </button>
                </div>

                <div className="mt-6">
                  <SearchFilterBar
                    value={programmaSearch}
                    onChange={setProgrammaSearch}
                    placeholder="Zoek programma’s…"
                  />

                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="text-md font-bold text-gray-900">Alle programma’s</div>
                    <div className="mt-4 grid gap-2">
                      {filteredProgrammas.map((p) => {
                        const type = String(p?.program_type || '').toLowerCase()
                        const typeLabel = type === 'workshop' ? 'Workshop' : 'Voorstelling'
                        const locationName = p?.location_id ? locationNameById[String(p.location_id)] : ''

                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-4 rounded-3xl border border-gray-200 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">{p.title}</div>
                                <span className="shrink-0 inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                                  {typeLabel}
                                </span>
                              </div>

                              <div className="mt-1 text-xs text-gray-600">
                                {locationName ? `Location: ${locationName}` : null}
                                {locationName && (p.region || p.performance_dates?.length || p.rehearsal_period_start || p.rehearsal_period_end || p.application_deadline)
                                  ? ' • '
                                  : null}
                                {p.region ? `Regio: ${p.region}` : null}
                                {p.region && (p.performance_dates?.length || p.rehearsal_period_start || p.rehearsal_period_end) ? ' • ' : null}
                                {Array.isArray(p.performance_dates) && p.performance_dates.length
                                  ? `Data: ${p.performance_dates.map((d: string) => formatDateOnlyFromISODate(d)).join(', ')}`
                                  : null}
                                {Array.isArray(p.performance_dates) && p.performance_dates.length && (p.rehearsal_period_start || p.rehearsal_period_end)
                                  ? ' • '
                                  : null}
                                {p.rehearsal_period_start || p.rehearsal_period_end
                                  ? `Rehearsals: ${p.rehearsal_period_start ? formatDateOnlyFromISODate(p.rehearsal_period_start) : ''}${
                                      p.rehearsal_period_start && p.rehearsal_period_end ? ' – ' : ''
                                    }${p.rehearsal_period_end ? formatDateOnlyFromISODate(p.rehearsal_period_end) : ''}`
                                  : null}
                                {(p.rehearsal_period_start || p.rehearsal_period_end) && p.application_deadline ? ' • ' : null}
                                {p.application_deadline ? `Deadline: ${formatDateOnlyFromISODate(p.application_deadline)}` : null}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <ActionIcon
                                title="Kopieer groepslink"
                                icon={Link2}
                                variant="muted"
                                className="hover:text-blue-600"
                                onClick={() => openInviteManager(String(p.id), String(p.title || 'Programma'))}
                                aria-label="Kopieer groepslink"
                              />
                              <ActionIcon
                                title="Bewerk"
                                icon={Edit2}
                                variant="primary"
                                onClick={() => openEditProgrammaModal(p)}
                                aria-label="Bewerk"
                              />
                              <ActionIcon
                                title="Weergeven"
                                icon={Eye}
                                variant="muted"
                                className="hover:text-blue-600"
                                onClick={() => router.push(`/ampro/programmas/${encodeURIComponent(p.id)}`)}
                                aria-label="Weergeven"
                              />
                              <ActionIcon
                                title="Verwijderen"
                                icon={Trash2}
                                variant="danger"
                                onClick={() => deleteProgram(String(p.id))}
                                aria-label="Verwijderen"
                              />
                            </div>
                          </div>
                        )
                      })}

                      {filteredProgrammas.length === 0 ? (
                        <div className="text-sm text-gray-600">Geen programma’s gevonden.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {active === 'forms' ? (
              <>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
                    <p className="mt-1 text-sm text-gray-600">Maak en beheer inschrijfformulieren.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFormId(null)
                      setNewFormName('')
                      setNewFormFields([makeEmptyFieldDraft()])
                      setFormModalOpen(true)
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Nieuwe form
                  </button>
                </div>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="text-md font-semibold text-gray-900">Gemaakte forms</div>
                  <div className="mt-4 grid gap-2">
                    {forms.map((f) => {
                      const count = Array.isArray((f as any)?.fields_json) ? ((f as any).fields_json as any[]).length : 0
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-4 rounded-3xl border border-gray-200 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{f.name}</div>
                            <div className="mt-1 text-xs text-gray-600">Velden: {count}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <ActionIcon
                              title="Bewerk"
                              icon={Edit2}
                              variant="primary"
                              onClick={() => {
                                // open modal in edit mode
                                setEditingFormId(String(f.id))
                                setNewFormName(String(f.name || ''))
                                const rawFields = Array.isArray((f as any)?.fields_json) ? ((f as any).fields_json as any[]) : []
                                const mapped: FormFieldDraft[] = rawFields.map((rf) => ({
                                  id: makeId(),
                                  label: String(rf.label || ''),
                                  type: (rf.type as any) || 'text',
                                  required: Boolean(rf.required),
                                  placeholder: String(rf.placeholder || '') || '',
                                  options: Array.isArray(rf.options)
                                    ? rf.options.map((o: any) => ({ id: makeId(), label: String(o.label || ''), value: String(o.value || '') }))
                                    : [{ id: makeId(), label: '', value: '' }],
                                }))
                                setNewFormFields(mapped.length ? mapped : [makeEmptyFieldDraft()])
                                setFormModalOpen(true)
                              }}
                              aria-label="Bewerk"
                            />
                            <ActionIcon
                              title="Verwijderen"
                              icon={Trash2}
                              variant="danger"
                              onClick={async () => {
                                try {
                                  if (!confirm(`Weet je zeker dat je het formulier "${String(f.name || '')}" wilt verwijderen?`)) return
                                  const { error } = await supabase.from('ampro_forms').delete().eq('id', f.id)
                                  if (error) throw error
                                  await refresh()
                                  showSuccess('Form verwijderd')
                                } catch (e: any) {
                                  showError(e?.message || 'Kon form niet verwijderen')
                                }
                              }}
                              aria-label="Verwijderen"
                            />
                          </div>
                        </div>
                      )
                    })}

                    {forms.length === 0 ? <div className="text-sm text-gray-600">Nog geen forms.</div> : null}
                  </div>
                </div>
              </>
            ) : null}

            {active === 'notes' ? (
              <>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
                    <p className="mt-1 text-sm text-gray-600">Toon informatie aan ingeschreven (accepted) users.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNoteModalOpen(true)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Nieuwe note
                  </button>
                </div>

                <div className="mt-6 grid gap-4">
                  {performances
                    .filter((p) => (updatesByProgramId[String(p.id)] || []).length > 0)
                    .map((p) => {
                      const notes = updatesByProgramId[String(p.id)] || []
                      return (
                        <div key={p.id} className="rounded-2xl border border-gray-200 bg-white p-6">
                          <div className="text-sm font-semibold text-gray-900">{p.title}</div>
                          <div className="mt-4 grid gap-2">
                            {notes.map((u: any) => (
                              <div key={u.id} className="rounded-3xl border border-gray-200 p-4">
                                <div className="mt-1 text-md font-semibold text-gray-900">{u.title}</div>
                                <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{u.body}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}

                  {unknownProgramUpdates.length ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6">
                      <div className="text-sm font-semibold text-gray-900">Onbekend programma</div>
                      <div className="mt-4 grid gap-2">
                        {unknownProgramUpdates.map((u: any) => (
                          <div key={u.id} className="rounded-3xl border border-gray-200 p-4">
                            <div className="text-xs text-gray-500">{String(u.performance_id || '')}</div>
                            <div className="mt-1 text-md font-semibold text-gray-900">{u.title}</div>
                            <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{u.body}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {updates.length === 0 ? <div className="text-sm text-gray-600">Nog geen notes.</div> : null}
                </div>
              </>
            ) : null}

            {active === 'availability' ? (
              <>
                <h1 className="text-2xl font-bold text-gray-900">Beschikbaarheid</h1>
                <p className="mt-1 text-sm text-gray-600">Vraag beschikbaarheid op per programma en bekijk antwoorden.</p>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="grid gap-3">
                      <label className="grid gap-1 text-sm font-medium text-gray-700">
                        Programma
                        <select
                          value={availabilityPerformanceId}
                          onChange={(e) => setAvailabilityPerformanceId(e.target.value)}
                          className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                        >
                          {performances.map((p: any) => (
                            <option key={String(p.id)} value={String(p.id)}>
                              {String(p.title || p.id)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={availabilityVisible}
                          onChange={(e) => setAvailabilityVisible(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        Zichtbaar voor users
                      </label>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                          <input
                            type="checkbox"
                            checked={availabilityLocked}
                            onChange={(e) => setAvailabilityLocked(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          Vergrendel (user kan niet meer aanpassen)
                        </label>

                        <label className="grid gap-1 text-sm font-medium text-gray-700">
                          Vergrendel na datum (optioneel)
                          <input
                            value={availabilityLockAt}
                            onChange={(e) => setAvailabilityLockAt(e.target.value)}
                            placeholder="dd/mm/jjjj"
                            className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                          />
                        </label>
                      </div>

                      <label className="grid gap-1 text-sm font-medium text-gray-700">
                        Data (1 per lijn of komma)
                        <textarea
                          value={availabilityDatesText}
                          onChange={(e) => setAvailabilityDatesText(e.target.value)}
                          placeholder="dd/mm/jjjj"
                          className="min-h-24 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>

                      <div className="rounded-3xl border border-gray-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-gray-900">Users (accepted)</div>
                          <div>
                            {acceptedUserIdsForSelectedPerformance.length > 0 ? (
                              (() => {
                                const allSelected = acceptedUserIdsForSelectedPerformance.every((id) => availabilitySelectedUserIds.includes(String(id)));
                                return (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (allSelected) setAvailabilitySelectedUserIds([])
                                      else setAvailabilitySelectedUserIds(Array.from(new Set(acceptedUserIdsForSelectedPerformance.map(String))))
                                    }}
                                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                                  >
                                    {allSelected ? 'Deselecteer alles' : 'Selecteer alles'}
                                  </button>
                                )
                              })()
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {acceptedUserIdsForSelectedPerformance.map((uid) => {
                            const profile = profilesByUserId[String(uid)]
                            const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || String(uid)
                            const checked = availabilitySelectedUserIds.includes(String(uid))
                            return (
                              <label key={uid} className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const on = e.target.checked
                                    setAvailabilitySelectedUserIds((prev) => {
                                      const set = new Set(prev.map(String))
                                      if (on) set.add(String(uid))
                                      else set.delete(String(uid))
                                      return Array.from(set)
                                    })
                                  }}
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                                <span className="truncate">{name}</span>
                              </label>
                            )
                          })}
                          {acceptedUserIdsForSelectedPerformance.length === 0 ? (
                            <div className="text-sm text-gray-600">Nog geen accepted users in roster voor dit programma.</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={saveAvailabilityConfig}
                          disabled={savingAvailability}
                          className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                            savingAvailability ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {savingAvailability ? 'Opslaan…' : 'Opslaan'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="text-sm font-semibold text-gray-900">Overzicht</div>
                    <div className="mt-4 grid gap-3">
                      {availabilityRequestId ? (
                        availabilityOverview.map((d) => (
                          <div key={d.day} className="rounded-3xl border border-gray-200 p-4">
                            <div className="text-sm font-semibold text-gray-900">{formatDateOnlyFromISODate(String(d.day))}</div>
                            <div className="mt-3 grid gap-2">
                              {d.rows.map((r) => {
                                const profile = profilesByUserId[String(r.user_id)]
                                const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || String(r.user_id)
                                return (
                                  <div key={String(r.user_id)} className="rounded-2xl border border-gray-200 px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
                                      <div className="text-xs font-semibold text-gray-700">{availabilityStatusLabel(r.status)}</div>
                                    </div>
                                    {r.comment ? <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{r.comment}</div> : null}
                                  </div>
                                )
                              })}
                              {d.rows.length === 0 ? (
                                <div className="text-sm text-gray-600">Geen users gekoppeld aan deze datum.</div>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-600">Nog geen beschikbaarheidsvraag ingesteld.</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {active === 'locations' ? (
              <>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Locaties</h1>
                    <p className="mt-1 text-sm text-gray-600">Beheer locaties en koppel ze aan programma’s.</p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateLocationModal}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Nieuwe locatie
                  </button>
                </div>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="text-sm font-semibold text-gray-900">Alle locaties</div>
                  <div className="mt-4 grid gap-2">
                    {locations.map((l) => (
                      <div key={l.id} className="flex items-start justify-between gap-4 rounded-3xl border border-gray-200 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900">{l.name}</div>
                          {l.address ? <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{l.address}</div> : null}
                        </div>
                        <div className="shrink-0">
                          <ActionIcon
                            title="Bewerk"
                            icon={Edit2}
                            variant="primary"
                            onClick={() => openEditLocationModal(l)}
                            aria-label="Bewerk"
                          />
                        </div>
                      </div>
                    ))}

                    {locations.length === 0 ? <div className="text-sm text-gray-600">Nog geen locaties.</div> : null}
                  </div>
                </div>
              </>
            ) : null}

            {active === 'applications' ? (
              <>
                <h1 className="text-2xl font-bold text-gray-900">Applicaties</h1>
                <p className="mt-1 text-sm text-gray-600">Accepteer of wijs inschrijvingen af.</p>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="grid gap-2">
                    {(() => {
                      if (!applications || applications.length === 0) return <div className="text-sm text-gray-600">Nog geen inschrijvingen.</div>

                      const appsByProgram: Record<string, any[]> = {}
                      for (const a of applications) {
                        const pid = String(a.performance_id || '')
                        if (!appsByProgram[pid]) appsByProgram[pid] = []
                        appsByProgram[pid].push(a)
                      }

                      return Object.keys(appsByProgram).map((pid) => {
                        const group = appsByProgram[pid]
                        const title = performanceTitleById[pid] || pid
                        const expanded = Boolean(appsExpandedByProgram[pid] ?? true)

                        return (
                          <div key={pid} className="rounded-3xl border border-gray-200 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-gray-900">{title}</div>
                                <div className="text-xs text-gray-600">{group.length} inschrijving(en)</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setAppsExpandedByProgram((prev) => ({ ...prev, [pid]: !expanded }))}
                                  className="rounded-full p-1 text-gray-600 hover:text-gray-900"
                                  aria-expanded={expanded}
                                >
                                  {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </button>
                                {(() => {
                                  const hasChanges = group.some((a) => {
                                    const staged = stagedStatuses[String(a.id)]
                                    return staged !== undefined && String(staged) !== String(a.status)
                                  })
                                  const saving = Boolean(savingGroup[pid])
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => saveGroupStatuses(pid)}
                                      disabled={!hasChanges || saving}
                                      className={`inline-flex h-9 items-center gap-2 rounded-3xl px-3 text-sm font-semibold transition-colors ${
                                        hasChanges ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-600'
                                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                      {saving ? 'Opslaan…' : 'Opslaan'}
                                    </button>
                                  )
                                })()}
                              </div>
                            </div>

                            {expanded ? (
                              <div className="mt-3 grid gap-2">
                                {group.map((a) => {
                                  const userId = String(a.user_id)
                                  const profile = profilesByUserId[userId]
                                  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userId

                                  return (
                                    <div key={a.id} className="grid gap-2 rounded-3xl border border-gray-200 p-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
                                          <div className="text-xs text-gray-600">Programma: {title}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="text-xs font-semibold text-gray-700">{String(stagedStatuses[String(a.id)] ?? a.status)}</div>
                                          <ActionIcon
                                            title="Bekijk gegevens"
                                            icon={Eye}
                                            variant="muted"
                                            className="hover:text-blue-600"
                                            onClick={() => openMemberDetail(a)}
                                            aria-label="Bekijk gegevens"
                                          />
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {(() => {
                                          const current = String(stagedStatuses[String(a.id)] ?? a.status)
                                          return (
                                            <>
                                              <button
                                                onClick={() => stageStatus(a.id, 'accepted')}
                                                className={`h-10 rounded-3xl px-3 text-xs font-semibold transition-colors ${
                                                  current === 'accepted'
                                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                                    : 'border border-gray-200 bg-white text-gray-900'
                                                }`}
                                              >
                                                Accept
                                              </button>
                                              <button
                                                onClick={() => stageStatus(a.id, 'maybe')}
                                                className={`h-10 rounded-3xl px-3 text-xs font-semibold transition-colors ${
                                                  current === 'maybe'
                                                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                                                    : 'border border-gray-200 bg-white text-gray-900'
                                                }`}
                                              >
                                                Twijfel
                                              </button>
                                              <button
                                                onClick={() => stageStatus(a.id, 'rejected')}
                                                className={`h-10 rounded-3xl px-3 text-xs font-semibold transition-colors ${
                                                  current === 'rejected'
                                                    ? 'bg-red-600 text-white hover:bg-red-700'
                                                    : 'border border-gray-200 bg-white text-gray-900'
                                                }`}
                                              >
                                                Reject
                                              </button>
                                            </>
                                          )
                                        })()}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              </>
            ) : null}

            {active === 'members' ? (
              <>
                <h1 className="text-2xl font-bold text-gray-900">Members</h1>
                <p className="mt-1 text-sm text-gray-600">Overzicht van alle inschrijvingen per voorstelling.</p>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Voorstelling</div>
                      <Select value={memberFilterPerformanceId} onChange={(e) => setMemberFilterPerformanceId(e.target.value)}>
                        <option value="">Alle voorstellingen</option>
                        {performances.map((p) => (
                          <option key={p.id} value={p.id}>{String(p.title || p.id)}</option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Status</div>
                      <Select value={memberFilterStatus} onChange={(e) => setMemberFilterStatus(e.target.value as any)}>
                        <option value="all">Alle statussen</option>
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                        <option value="maybe">Maybe</option>
                      </Select>
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Betaalstatus</div>
                      <Select value={memberFilterPaid} onChange={(e) => setMemberFilterPaid(e.target.value as any)}>
                        <option value="all">Alle</option>
                        <option value="paid">Betaald</option>
                        <option value="unpaid">Onbetaald</option>
                      </Select>
                    </div>

                    <div>
                      <div className="text-xs text-transparent mb-1">&nbsp;</div>
                      <button
                        type="button"
                        onClick={() => {
                          setMemberFilterPerformanceId('')
                          setMemberFilterStatus('all')
                          setMemberFilterPaid('all')
                        }}
                        className="h-11 w-full rounded-3xl bg-gray-50 border border-gray-200 px-4 text-sm text-gray-700"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold text-gray-600">
                          <th className="py-2 pr-4">Danser</th>
                          <th className="py-2 pr-4">Voorstelling</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Betaalstatus</th>
                          <th className="py-2 pr-4"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredMembers.map((a) => {
                          const userId = String(a.user_id)
                          const profile = profilesByUserId[userId]
                          const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userId
                          const perfTitle = performanceTitleById[String(a.performance_id)] || String(a.performance_id)

                          return (
                            <tr key={a.id} className="text-gray-800">
                              <td className="py-3 pr-4 font-semibold text-gray-900">{name}</td>
                              <td className="py-3 pr-4">{perfTitle}</td>
                              <td className="py-3 pr-4">{String(a.status)}</td>
                              <td className="py-3 pr-4">
                                {a.paid ? (
                                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800">Betaald</span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Onbetaald</span>
                                )}
                              </td>
                              <td className="py-3 pr-4">
                                <div className="flex items-center justify-end gap-2">
                                  <ActionIcon
                                    icon={Eye}
                                    variant="muted"
                                    className="hover:text-blue-600"
                                    title="Bekijk gegevens"
                                    onClick={() => openMemberDetail(a)}
                                  />
                                  <ActionIcon
                                    icon={Trash2}
                                    variant="danger"
                                    title="Verwijderen"
                                    onClick={() => openMemberDelete(a)}
                                  />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {filteredMembers.length === 0 ? (
                          <tr>
                            <td className="py-4 text-gray-600" colSpan={5}>
                              Nog geen members.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}
