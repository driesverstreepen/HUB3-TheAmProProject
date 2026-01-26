'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, MessageSquare, ClipboardList, Users, Plus, MapPin, Edit2, Eye, FileText, Trash2, Calendar, ChevronDown, ChevronUp, Link2, GripVertical, Menu, LogOut } from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { isAmproAdmin, parseAmproFormFields, type AmproFormField } from '@/lib/ampro'
import { useNotification } from '@/contexts/NotificationContext'
import { formatDateOnlyFromISODate } from '@/lib/formatting'
import SearchFilterBar from '@/components/SearchFilterBar'
import Select from '@/components/Select'
import Modal from '@/components/Modal'
import ActionIcon from '@/components/ActionIcon'
import { RichTextEditor } from '@/components/RichTextEditor'
import SafeRichText from '@/components/SafeRichText'
import { MobileSidebar, type MobileSidebarSection } from '@/components/ui/MobileSidebar'

type AdminSection = 'programmas' | 'forms' | 'notes' | 'corrections' | 'applications' | 'members' | 'locations' | 'availability'

function parseFlexibleDateToISODate(input: string): string | null {
  const v = (input || '').trim()
  if (!v) return null

  // Accept yyyy-mm-dd too (handy for copy/paste).
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00Z`)
    if (!Number.isFinite(d.getTime())) throw new Error(`Invalid date: ${v}`)
    return v
  }

  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (!m) throw new Error(`Use dd/mm/yyyy (e.g. 31/12/2025). Received: ${v}`)

  const dd = Number(m[1])
  const mm = Number(m[2])
  const yyyy = Number(m[3])
  if (!dd || !mm || !yyyy) throw new Error(`Invalid date: ${v}`)
  if (mm < 1 || mm > 12) throw new Error(`Invalid month in date: ${v}`)
  if (dd < 1 || dd > 31) throw new Error(`Invalid day in date: ${v}`)

  const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  if (date.getUTCFullYear() !== yyyy || date.getUTCMonth() + 1 !== mm || date.getUTCDate() !== dd) {
    throw new Error(`Invalid date: ${v}`)
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
  text: string
  options: FormOptionDraft[]
}

function makeEmptyFieldDraft(): FormFieldDraft {
  return {
    id: makeId(),
    label: '',
    type: 'text',
    required: false,
    placeholder: '',
    text: '',
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
  if (s === 'yes') return 'Available'
  if (s === 'no') return 'Not available'
  if (s === 'maybe') return 'Maybe'
  return 'No response'
}

function SortableCardItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-70' : undefined}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          title="Drag to reorder"
          aria-label="Drag"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

export default function AmproAdminPage() {
  const router = useRouter()
  const { showSuccess, showError } = useNotification()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [checking, setChecking] = useState(true)
  const [active, setActive] = useState<AdminSection>('programmas')
  const [adminMobileMenuOpen, setAdminMobileMenuOpen] = useState(false)
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
  const [corrections, setCorrections] = useState<any[]>([])
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, { first_name?: string | null; last_name?: string | null }>>({})

  async function handleAdminLogout() {
    const ok = window.confirm('Log out?')
    if (!ok) return
    await supabase.auth.signOut()
    router.push('/ampro')
  }

  function clipNotificationMessage(value: string, maxLen = 140) {
    const raw = String(value || '').trim()
    const v = raw
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!v) return ''
    if (v.length <= maxLen) return v
    return `${v.slice(0, Math.max(0, maxLen - 1))}…`
  }

  async function broadcastAmproNotification(input: { kind: 'note' | 'correction' | 'availability'; performanceId: string; title: string; message: string }) {
    try {
      const resp = await fetch('/api/ampro/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: input.kind, performance_id: input.performanceId, title: input.title, message: input.message }),
      })

      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}))
        console.warn('AMPRO broadcast failed', resp.status, json)
      }
    } catch (e) {
      console.warn('AMPRO broadcast failed', e)
    }
  }

  const [inviteManageOpen, setInviteManageOpen] = useState(false)
  const [inviteManageProgram, setInviteManageProgram] = useState<{ id: string; title: string } | null>(null)
  const [inviteManageUrl, setInviteManageUrl] = useState('')
  const [inviteManageToken, setInviteManageToken] = useState<string | null>(null)
  const [inviteManageLoading, setInviteManageLoading] = useState(false)
  const [inviteConfigMaxUses, setInviteConfigMaxUses] = useState<string>('')
  const [inviteConfigExpiresAt, setInviteConfigExpiresAt] = useState<string>('')
  const [inviteConfigDirty, setInviteConfigDirty] = useState(false)
  const [inviteDeleteArmed, setInviteDeleteArmed] = useState(false)
  const [inviteDeleteConfirmText, setInviteDeleteConfirmText] = useState('')
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

  async function refreshInviteStatus(token: string, opts?: { syncConfig?: boolean }) {
    const t = String(token || '').trim()
    if (!t) return
    try {
      const resp = await fetch(`/api/ampro/program-invites/lookup?token=${encodeURIComponent(t)}`)
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Failed to load status')

      setInviteManageStatus({
        ok: Boolean(json?.status?.ok),
        revoked: Boolean(json?.status?.revoked),
        expired: Boolean(json?.status?.expired),
        maxed: Boolean(json?.status?.maxed),
        uses_count: Number(json?.invite?.uses_count || 0),
        max_uses: json?.invite?.max_uses != null ? Number(json.invite.max_uses) : null,
        expires_at: json?.invite?.expires_at ? String(json.invite.expires_at) : null,
      })

      const shouldSyncConfig = Boolean(opts?.syncConfig) || !inviteConfigDirty
      if (shouldSyncConfig) {
        // Keep the config inputs in sync with current invite values (best-effort).
        const maxUses = json?.invite?.max_uses
        setInviteConfigMaxUses(maxUses != null && String(maxUses) !== 'null' ? String(maxUses) : '')
        const exp = json?.invite?.expires_at ? String(json.invite.expires_at) : ''
        // datetime-local expects YYYY-MM-DDTHH:mm; use UTC representation for consistency.
        setInviteConfigExpiresAt(exp ? new Date(exp).toISOString().slice(0, 16) : '')
        setInviteConfigDirty(false)
      }
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
      setInviteConfigDirty(false)
      setInviteDeleteArmed(false)
      setInviteDeleteConfirmText('')
      setInviteManageOpen(true)
      setInviteManageLoading(true)

      const resp = await fetch('/api/ampro/program-invites/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performance_id: performanceId }),
      })

      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Failed to generate link')

      const url = String(json?.url || '')
      if (!url) throw new Error('No link received')

      setInviteManageUrl(url)
      setInviteManageToken(json?.token ? String(json.token) : null)
      if (json?.token) {
        await refreshInviteStatus(String(json.token), { syncConfig: true })
      }
      showSuccess(json?.reused ? 'Existing link loaded' : 'New link created')
    } catch (e: any) {
      showError(e?.message || 'Failed to generate link')
    }
    finally {
      setInviteManageLoading(false)
    }
  }

  async function saveInviteSettings() {
    const pid = String(inviteManageProgram?.id || '')
    const token = String(inviteManageToken || '').trim()
    if (!pid || !token) return

    let maxUses: number | null = null
    if (inviteConfigMaxUses.trim()) {
      const n = Number(inviteConfigMaxUses)
      if (!Number.isFinite(n) || n < 1) {
        showError('Max uses must be empty or >= 1')
        return
      }
      maxUses = n
    }

    let expiresAt: string | null = null
    if (inviteConfigExpiresAt.trim()) {
      const d = new Date(inviteConfigExpiresAt)
      if (!Number.isFinite(d.getTime())) {
        showError('Invalid expiration date')
        return
      }
      expiresAt = d.toISOString()
    }

    try {
      setInviteManageLoading(true)
      const resp = await fetch('/api/ampro/program-invites/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          performance_id: pid,
          token,
          max_uses: maxUses,
          expires_at: expiresAt,
        }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Save failed')

      await refreshInviteStatus(token, { syncConfig: true })
      showSuccess('Settings saved')
    } catch (e: any) {
      showError(e?.message || 'Save failed')
    } finally {
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
        showError('Invalid expiration date')
        return
      }
      expiresAt = d.toISOString()
    }

    if (!window.confirm('Create a new link with these settings? The current link will be deactivated.')) return

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
      if (!resp.ok) throw new Error(json?.error || 'Failed to create new link')

      const url = String(json?.url || '')
      if (!url) throw new Error('No link received')

      setInviteManageUrl(url)
      setInviteManageToken(json?.token ? String(json.token) : null)
      if (json?.token) await refreshInviteStatus(String(json.token))
      showSuccess('New link created')
    } catch (e: any) {
      showError(e?.message || 'Failed to create new link')
    } finally {
      setInviteManageLoading(false)
    }
  }

  async function copyInviteUrl() {
    if (!inviteManageUrl) return
    try {
      await navigator.clipboard.writeText(inviteManageUrl)
      showSuccess('Link copied')
    } catch {
      window.prompt('Copy this link:', inviteManageUrl)
    }
  }

  async function revokeInviteLinks() {
    const pid = String(inviteManageProgram?.id || '')
    if (!pid) return
    if (!window.confirm('Deactivate group link? The current link will no longer work.')) return

    try {
      setInviteManageLoading(true)
      const tokenBefore = inviteManageToken
      const resp = await fetch('/api/ampro/program-invites/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performance_id: pid }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Deactivation failed')

      // Keep the last URL visible for audit/reference, but status will flip to inactive.
      if (tokenBefore) await refreshInviteStatus(String(tokenBefore))
      setInviteDeleteArmed(false)
      setInviteDeleteConfirmText('')
      showSuccess(`Link deactivated (${Number(json?.revoked_count || 0)})`)
    } catch (e: any) {
      showError(e?.message || 'Deactivation failed')
    } finally {
      setInviteManageLoading(false)
    }
  }

  async function deleteInviteLinks() {
    const pid = String(inviteManageProgram?.id || '')
    if (!pid) return

    // Step 1: arm delete (no modal/prompt)
    if (!inviteDeleteArmed) {
      setInviteDeleteArmed(true)
      setInviteDeleteConfirmText('')
      return
    }

    // Step 2: require explicit text confirmation
    if (inviteDeleteConfirmText.trim() !== 'DELETE') {
      showError('Type DELETE to confirm')
      return
    }

    try {
      setInviteManageLoading(true)
      const resp = await fetch('/api/ampro/program-invites/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performance_id: pid, confirm: 'DELETE' }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Delete failed')

      setInviteManageUrl('')
      setInviteManageToken(null)
      setInviteManageStatus(null)
      setInviteDeleteArmed(false)
      setInviteDeleteConfirmText('')
      showSuccess(`Links deleted (${Number(json?.deleted_count || 0)})`)
    } catch (e: any) {
      showError(e?.message || 'Delete failed')
    } finally {
      setInviteManageLoading(false)
    }
  }

  const [availabilityPerformanceId, setAvailabilityPerformanceId] = useState('')
  const [availabilityRequestId, setAvailabilityRequestId] = useState<string | null>(null)
  const [availabilityVisible, setAvailabilityVisible] = useState(false)
  const availabilityWasVisibleRef = useRef(false)
  const [availabilityLocked, setAvailabilityLocked] = useState(false)
  const [availabilityLockAt, setAvailabilityLockAt] = useState('')
  const [availabilityDatesText, setAvailabilityDatesText] = useState('')
  const [availabilityLocationByDay, setAvailabilityLocationByDay] = useState<Record<string, string>>({})
  const [availabilityStartTimeByDay, setAvailabilityStartTimeByDay] = useState<Record<string, string>>({})
  const [availabilityEndTimeByDay, setAvailabilityEndTimeByDay] = useState<Record<string, string>>({})
  const [availabilitySelectedUserIds, setAvailabilitySelectedUserIds] = useState<string[]>([])
  const [availabilityOverview, setAvailabilityOverview] = useState<
    Array<{
      day: string
      location_id: string | null
      start_time: string | null
      end_time: string | null
      rows: Array<{ user_id: string; status: string | null; comment: string | null }>
    }>
  >([])
  const [savingAvailability, setSavingAvailability] = useState(false)

  function normalizeTimeForInput(v: any): string {
    if (!v) return ''
    const s = String(v)
    // Postgres `time` may return HH:MM:SS; input[type=time] prefers HH:MM
    if (s.length >= 5 && /^\d{2}:\d{2}/.test(s)) return s.slice(0, 5)
    return ''
  }

  function normalizeTimeForDb(v: any): string | null {
    const s = String(v || '').trim()
    if (!s) return null
    const hhmm = s.slice(0, 5)
    return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : null
  }

  function formatTimeWindow(start: string | null, end: string | null): string {
    const s = normalizeTimeForInput(start)
    const e = normalizeTimeForInput(end)
    if (s && e) return `${s}–${e}`
    if (s) return s
    if (e) return e
    return ''
  }

  const parsedAvailabilityDays = useMemo(() => {
    try {
      const days = Array.from(new Set(parseFlexibleDateListToISODateArray(availabilityDatesText))).sort()
      return { days, error: '' }
    } catch (e: any) {
      return { days: [] as string[], error: String(e?.message || 'Invalid date') }
    }
  }, [availabilityDatesText])

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
      availabilityWasVisibleRef.current = false
      setAvailabilityLocked(false)
      setAvailabilityLockAt('')
      setAvailabilityDatesText('')
      setAvailabilityLocationByDay({})
      setAvailabilityStartTimeByDay({})
      setAvailabilityEndTimeByDay({})
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
        availabilityWasVisibleRef.current = false
        setAvailabilityLocked(false)
        setAvailabilityLockAt('')
        setAvailabilityDatesText('')
        setAvailabilityLocationByDay({})
        setAvailabilityStartTimeByDay({})
        setAvailabilityEndTimeByDay({})
        setAvailabilitySelectedUserIds(acceptedUserIdsForSelectedPerformance)
        setAvailabilityOverview([])
        return
      }

      const requestId = String((reqResp.data as any).id)
      setAvailabilityRequestId(requestId)
      const isVisible = Boolean((reqResp.data as any).is_visible)
      setAvailabilityVisible(isVisible)
      availabilityWasVisibleRef.current = isVisible
      setAvailabilityLocked(Boolean((reqResp.data as any).responses_locked))
      setAvailabilityLockAt(
        (reqResp.data as any)?.responses_lock_at ? formatDateOnlyFromISODate(String((reqResp.data as any).responses_lock_at)) : '',
      )

      const datesResp = await supabase
        .from('ampro_availability_request_dates')
        .select('id,day,location_id,start_time,end_time')
        .eq('request_id', requestId)
        .order('day', { ascending: true })

      if (datesResp.error) throw datesResp.error
      const dates = (datesResp.data as any[]) || []
      setAvailabilityDatesText(dates.map((d) => formatDateOnlyFromISODate(String(d.day))).join('\n'))
      setAvailabilityLocationByDay(() => {
        const map: Record<string, string> = {}
        for (const d of dates) {
          const day = String((d as any)?.day || '')
          const loc = (d as any)?.location_id
          if (day && loc) map[day] = String(loc)
        }
        return map
      })

      setAvailabilityStartTimeByDay(() => {
        const map: Record<string, string> = {}
        for (const d of dates) {
          const day = String((d as any)?.day || '')
          const t = normalizeTimeForInput((d as any)?.start_time)
          if (day && t) map[day] = t
        }
        return map
      })

      setAvailabilityEndTimeByDay(() => {
        const map: Record<string, string> = {}
        for (const d of dates) {
          const day = String((d as any)?.day || '')
          const t = normalizeTimeForInput((d as any)?.end_time)
          if (day && t) map[day] = t
        }
        return map
      })

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
        const locationId = (d as any)?.location_id ? String((d as any).location_id) : null
        const startTime = (d as any)?.start_time ? String((d as any).start_time) : null
        const endTime = (d as any)?.end_time ? String((d as any).end_time) : null
        const usersForDate = assigned
          .filter((a) => String(a.request_date_id) === String(d.id))
          .map((a) => {
            const uid = String(a.user_id)
            const key = `${String(d.id)}:${uid}`
            const rr = responseMap[key]
            return { user_id: uid, status: rr?.status ?? null, comment: rr?.comment ?? null }
          })

        return { day, location_id: locationId, start_time: startTime, end_time: endTime, rows: usersForDate }
      })

      setAvailabilityOverview(overview)
    } catch (e: any) {
      showError(e?.message || 'Failed to load availability')
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
      if (!availabilityPerformanceId) throw new Error('Select a program')
      setSavingAvailability(true)

      const shouldBroadcast = Boolean(availabilityVisible) && !availabilityWasVisibleRef.current

      const desiredDays = Array.from(new Set(parseFlexibleDateListToISODateArray(availabilityDatesText))).sort()
      if (!desiredDays.length) throw new Error('Add at least 1 date')

      const desiredLocationByDay: Record<string, string> = {}
      for (const day of desiredDays) {
        const loc = String((availabilityLocationByDay || {})[day] || '').trim()
        if (loc) desiredLocationByDay[day] = loc
      }

      const desiredStartTimeByDay: Record<string, string> = {}
      const desiredEndTimeByDay: Record<string, string> = {}
      for (const day of desiredDays) {
        const start = normalizeTimeForDb((availabilityStartTimeByDay || {})[day])
        const end = normalizeTimeForDb((availabilityEndTimeByDay || {})[day])
        if (start) desiredStartTimeByDay[day] = start
        if (end) desiredEndTimeByDay[day] = end
      }

      const selectedUserIds = Array.from(new Set((availabilitySelectedUserIds || []).map(String).filter(Boolean)))
      if (!selectedUserIds.length) throw new Error('Select at least 1 user')

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
      if (!requestId) throw new Error('Failed to save request')
      setAvailabilityRequestId(requestId)

      const existingDatesResp = await supabase
        .from('ampro_availability_request_dates')
        .select('id,day,location_id,start_time,end_time')
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
          .insert(
            toAddDays.map((day) => ({
              request_id: requestId,
              day,
              location_id: desiredLocationByDay[day] || null,
              start_time: desiredStartTimeByDay[day] || null,
              end_time: desiredEndTimeByDay[day] || null,
            })),
          )
        if (insDates.error) throw insDates.error
      }

      // Update per-day fields for existing dates (best-effort)
      for (const d of existingDates) {
        const day = String((d as any)?.day || '')
        if (!day) continue
        if (!desiredDays.includes(day)) continue
        const id = String((d as any)?.id || '')
        if (!id) continue

        const desiredLoc = desiredLocationByDay[day] || null
        const currentLoc = (d as any)?.location_id ? String((d as any).location_id) : null

        const desiredStart = desiredStartTimeByDay[day] || null
        const desiredEnd = desiredEndTimeByDay[day] || null
        const currentStart = normalizeTimeForDb((d as any)?.start_time)
        const currentEnd = normalizeTimeForDb((d as any)?.end_time)

        const locSame = String(desiredLoc || '') === String(currentLoc || '')
        const startSame = String(desiredStart || '') === String(currentStart || '')
        const endSame = String(desiredEnd || '') === String(currentEnd || '')
        if (locSame && startSame && endSame) continue

        const upLoc = await supabase
          .from('ampro_availability_request_dates')
          .update({ location_id: desiredLoc, start_time: desiredStart, end_time: desiredEnd })
          .eq('id', id)
        if (upLoc.error) throw upLoc.error
      }

      // Reload dates to get all ids
      const allDatesResp = await supabase
        .from('ampro_availability_request_dates')
        .select('id,day,location_id,start_time,end_time')
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

      if (shouldBroadcast) {
        await broadcastAmproNotification({
          kind: 'availability',
          performanceId: String(availabilityPerformanceId),
          title: 'New availability request',
          message: 'A new availability request is available in your AmPro project.',
        })
      }

      availabilityWasVisibleRef.current = Boolean(availabilityVisible)

      showSuccess('Availability saved')
      await loadAvailability(availabilityPerformanceId)
    } catch (e: any) {
      showError(e?.message || 'Save failed')
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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false)
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

  const [memberRoleNameDraft, setMemberRoleNameDraft] = useState('')
  const [savingMemberRoleName, setSavingMemberRoleName] = useState(false)

  const [editingMemberSnapshot, setEditingMemberSnapshot] = useState(false)
  const [savingMemberSnapshot, setSavingMemberSnapshot] = useState(false)
  const [memberSnapshotDraft, setMemberSnapshotDraft] = useState<Record<string, string>>({})

  const [newFormName, setNewFormName] = useState('')
  const [newFormFields, setNewFormFields] = useState<FormFieldDraft[]>([])
  const [savingForm, setSavingForm] = useState(false)
  const [editingFormId, setEditingFormId] = useState<string | null>(null)
  const [collapsedFormFieldById, setCollapsedFormFieldById] = useState<Record<string, boolean>>({})

  function toggleFormFieldCollapsed(id: string) {
    const key = String(id || '')
    if (!key) return
    setCollapsedFormFieldById((prev) => ({ ...prev, [key]: !Boolean(prev[key]) }))
  }

  function handleFormFieldsDragEnd(event: DragEndEvent) {
    const activeId = String(event.active?.id || '')
    const overId = String(event.over?.id || '')
    if (!activeId || !overId || activeId === overId) return

    setNewFormFields((prev) => {
      const oldIndex = prev.findIndex((x) => String(x?.id || '') === activeId)
      const newIndex = prev.findIndex((x) => String(x?.id || '') === overId)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const [newLocationName, setNewLocationName] = useState('')
  const [newLocationAddress, setNewLocationAddress] = useState('')
  const [savingLocation, setSavingLocation] = useState(false)
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null)

  const [newUpdatePerformanceId, setNewUpdatePerformanceId] = useState('')
  const [newUpdateTitle, setNewUpdateTitle] = useState('')
  const [newUpdateBody, setNewUpdateBody] = useState('')
  const [savingUpdate, setSavingUpdate] = useState(false)
  const [savingNotesOrderByProgramId, setSavingNotesOrderByProgramId] = useState<Record<string, boolean>>({})
  const [savingCorrectionsOrderByProgramId, setSavingCorrectionsOrderByProgramId] = useState<Record<string, boolean>>({})

  const [newCorrectionPerformanceId, setNewCorrectionPerformanceId] = useState('')
  const [newCorrectionDate, setNewCorrectionDate] = useState('')
  const [newCorrectionTitle, setNewCorrectionTitle] = useState('')
  const [newCorrectionBody, setNewCorrectionBody] = useState('')
  const [newCorrectionVisibleToAccepted, setNewCorrectionVisibleToAccepted] = useState(true)
  const [savingCorrection, setSavingCorrection] = useState(false)
  const [editingCorrectionId, setEditingCorrectionId] = useState<string | null>(null)

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
            'id,title,description,program_type,is_public,applications_open,application_deadline,created_at,rehearsal_period_start,rehearsal_period_end,performance_dates,region,location_id,price,admin_payment_url',
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
          .from('ampro_notes')
          .select('id,performance_id,title,body,visibility,sort_order,created_at,updated_at')
          .order('performance_id', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
          .limit(500)
        if (updatesResp.error) throw updatesResp.error

        const correctionsResp = await supabase
          .from('ampro_corrections')
          .select('id,performance_id,title,correction_date,body,visible_to_accepted,sort_order,created_at')
          .order('performance_id', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('correction_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(500)
        if (correctionsResp.error) throw correctionsResp.error

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
          setCorrections(correctionsResp.data || [])
          setProfilesByUserId(profilesMap)
          if (!newUpdatePerformanceId && (perfResp.data || []).length) {
            setNewUpdatePerformanceId(String((perfResp.data as any[])[0]?.id || ''))
          }
          if (!newCorrectionPerformanceId && (perfResp.data || []).length) {
            setNewCorrectionPerformanceId(String((perfResp.data as any[])[0]?.id || ''))
          }
          if (!newCorrectionDate) {
            setNewCorrectionDate(new Date().toISOString().slice(0, 10))
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
      .from('ampro_notes')
      .select('id,performance_id,title,body,visibility,sort_order,created_at,updated_at')
      .order('performance_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(500)
    if (!updatesResp.error) setUpdates(updatesResp.data || [])

    const correctionsResp = await supabase
      .from('ampro_corrections')
      .select('id,performance_id,title,correction_date,body,visible_to_accepted,sort_order,created_at')
      .order('performance_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('correction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (!correctionsResp.error) setCorrections(correctionsResp.data || [])

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
    setEditingMemberSnapshot(false)

    try {
      const perfId = String((app as any)?.performance_id || '')
      const userId = String((app as any)?.user_id || '')
      const rosterRow = (roster || []).find((r: any) => String(r?.performance_id || '') === perfId && String(r?.user_id || '') === userId)
      const current = rosterRow?.role_name ? String(rosterRow.role_name) : ''
      setMemberRoleNameDraft(current)
    } catch {
      setMemberRoleNameDraft('')
    }

    const snapshot = (app as any)?.snapshot_json
    const base = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {}
    setMemberSnapshotDraft({
      first_name: String((base as any)?.first_name ?? ''),
      last_name: String((base as any)?.last_name ?? ''),
      birth_date: String((base as any)?.birth_date ?? ''),
      email: String((base as any)?.email ?? ''),
      phone: String((base as any)?.phone ?? ''),
      street: String((base as any)?.street ?? ''),
      house_number: String((base as any)?.house_number ?? ''),
      house_number_addition: String((base as any)?.house_number_addition ?? ''),
      postal_code: String((base as any)?.postal_code ?? ''),
      city: String((base as any)?.city ?? ''),
      instagram_username: String((base as any)?.instagram_username ?? ''),
      tshirt_size: String((base as any)?.tshirt_size ?? ''),
    })
    setMemberDetailOpen(true)
  }

  async function saveMemberRoleName() {
    if (!memberDetailApp?.performance_id || !memberDetailApp?.user_id) return
    try {
      setSavingMemberRoleName(true)
      const performanceId = String(memberDetailApp.performance_id || '')
      const userId = String(memberDetailApp.user_id || '')
      const next = memberRoleNameDraft.trim() || 'Dancer'

      const up = await supabase.from('ampro_roster').upsert({ performance_id: performanceId, user_id: userId, role_name: next } as any)
      if (up.error) throw up.error
      showSuccess('Role name updated')
      await refresh()
    } catch (e: any) {
      showError(e?.message || 'Failed to update role name')
    } finally {
      setSavingMemberRoleName(false)
    }
  }

  async function saveMemberSnapshot() {
    if (!memberDetailApp?.id) return
    try {
      setSavingMemberSnapshot(true)
      const existing = (memberDetailApp as any)?.snapshot_json
      const next: any = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {}

      const setOrDelete = (key: string, value: string) => {
        const v = String(value ?? '').trim()
        if (!v) {
          delete next[key]
        } else {
          next[key] = v
        }
      }

      setOrDelete('first_name', memberSnapshotDraft.first_name)
      setOrDelete('last_name', memberSnapshotDraft.last_name)
      setOrDelete('birth_date', memberSnapshotDraft.birth_date)
      setOrDelete('email', memberSnapshotDraft.email)
      setOrDelete('phone', memberSnapshotDraft.phone)
      setOrDelete('street', memberSnapshotDraft.street)
      setOrDelete('house_number', memberSnapshotDraft.house_number)
      setOrDelete('house_number_addition', memberSnapshotDraft.house_number_addition)
      setOrDelete('postal_code', memberSnapshotDraft.postal_code)
      setOrDelete('city', memberSnapshotDraft.city)
      setOrDelete('instagram_username', memberSnapshotDraft.instagram_username)
      setOrDelete('tshirt_size', memberSnapshotDraft.tshirt_size)

      const { error } = await supabase.from('ampro_applications').update({ snapshot_json: next }).eq('id', memberDetailApp.id)
      if (error) throw error

      setMemberDetailApp((prev: any) => (prev ? { ...prev, snapshot_json: next } : prev))
      setEditingMemberSnapshot(false)
      showSuccess('User details updated')
      await refresh()
    } catch (e: any) {
      showError(e?.message || 'Failed to update user details')
    } finally {
      setSavingMemberSnapshot(false)
    }
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
      showSuccess('Member deleted')
      setMemberDeleteOpen(false)
      setMemberDeleteApp(null)
      await refresh()
    } catch (e: any) {
      showError(e?.message || 'Delete failed')
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
      showSuccess('Payment status updated')
      setMemberDetailOpen(false)
      setMemberDetailApp(null)
      await refresh()
    } catch (e: any) {
      showError(e?.message || 'Failed to update payment status')
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
      if (!newTitle.trim()) throw new Error('Title is required')

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
        if (!programmaId) throw new Error('Failed to create program (no id)')
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

      showSuccess(id ? 'Program updated' : 'Program created')
    } catch (e: any) {
      showError(e?.message || (editingProgrammaId ? 'Failed to update program' : 'Failed to create program'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteProgram(programId: string) {
    try {
      if (!programId) return
      if (!confirm('Are you sure you want to delete this program?')) return
      const { error } = await supabase.from('ampro_programmas').delete().eq('id', programId)
      if (error) throw error
      await refresh()
      showSuccess('Program deleted')
    } catch (e: any) {
      showError(e?.message || 'Failed to delete program')
    }
  }

  async function createForm() {
    try {
      setSavingForm(true)
      if (!newFormName.trim()) throw new Error('Name is required')

      if (!newFormFields.length) throw new Error('Add at least 1 field')

      const keySet = new Set<string>()
      const built: AmproFormField[] = newFormFields.map((f, idx) => {
        const type = f.type
        const label = (f.label || '').trim()

        if (type === 'title') {
          if (!label) throw new Error('Title field must have a label')
          const key = uniqueKey(label, keySet, 'title')
          return { key, label, type: 'title' } as AmproFormField
        }

        if (type === 'info') {
          const infoKeyBase = label || `info_${idx + 1}`
          const key = uniqueKey(infoKeyBase, keySet, 'info')
          return {
            key,
            label: label || 'Info',
            type: 'info',
            text: (f.text || '').trim() || undefined,
          } as AmproFormField
        }

        if (!label) throw new Error('Each field must have a label')
        const key = uniqueKey(label, keySet)

        if (type === 'select') {
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

          if (!options.length) throw new Error(`Select field "${label}" must have at least 1 option`)

          return {
            key,
            label,
            type: 'select',
            required: Boolean(f.required),
            options,
          }
        }

        if (type === 'checkbox') {
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
          type: type as any,
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
            .upsert({ performance_id: performanceId, user_id: userId, role_name: inferredRole || 'Dancer' } as any)
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

          const upsertRoster = await supabase
            .from('ampro_roster')
            .upsert({ performance_id: performanceId, user_id: userId, role_name: inferredRole || 'Dancer' } as any)
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
      showSuccess('Statuses saved')
    } catch (e: any) {
      showError(e?.message || 'Failed to save statuses')
    } finally {
      setSavingGroup((s) => ({ ...s, [performanceId]: false }))
    }
  }

  async function createUpdate() {
    try {
      setSavingUpdate(true)
      if (!newUpdatePerformanceId) throw new Error('Select a program')
      if (!newUpdateTitle.trim()) throw new Error('Title is required')
      if (!newUpdateBody.trim()) throw new Error('Content is required')

      if (editingNoteId) {
        const { error } = await supabase
          .from('ampro_notes')
          .update({
            performance_id: newUpdatePerformanceId,
            title: newUpdateTitle.trim(),
            body: newUpdateBody.trim(),
            visibility: 'accepted_only',
          })
          .eq('id', editingNoteId)

        if (error) throw error

        setEditingNoteId(null)
        setNewUpdateTitle('')
        setNewUpdateBody('')
        setNoteModalOpen(false)
        await refresh()
        showSuccess('Note updated')
        return
      }

      const existing = (updates || []).filter((u: any) => String(u?.performance_id || '') === String(newUpdatePerformanceId))
      const maxSort = Math.max(0, ...existing.map((u: any) => (Number.isFinite(Number(u?.sort_order)) ? Number(u.sort_order) : 0)))

      const { error } = await supabase
        .from('ampro_notes')
        .insert({
          performance_id: newUpdatePerformanceId,
          title: newUpdateTitle.trim(),
          body: newUpdateBody.trim(),
          visibility: 'accepted_only',
          sort_order: maxSort + 1,
        })

      if (error) throw error

      await broadcastAmproNotification({
        kind: 'note',
        performanceId: String(newUpdatePerformanceId),
        title: String(newUpdateTitle.trim() || 'New note'),
        message: clipNotificationMessage(newUpdateBody.trim()) || 'A new note is available in your AmPro project.',
      })

      setNewUpdateTitle('')
      setNewUpdateBody('')
      setEditingNoteId(null)
      setNoteModalOpen(false)
      await refresh()
      showSuccess('Note posted')
    } catch (e: any) {
      showError(e?.message || 'Failed to post note')
    } finally {
      setSavingUpdate(false)
    }
  }

  function openCreateNoteModal() {
    setEditingNoteId(null)
    setNewUpdateTitle('')
    setNewUpdateBody('')
    setNoteModalOpen(true)
  }

  function openEditNoteModal(u: any) {
    setEditingNoteId(String(u?.id || ''))
    setNewUpdatePerformanceId(String(u?.performance_id || ''))
    setNewUpdateTitle(String(u?.title || ''))
    setNewUpdateBody(String(u?.body || ''))
    setNoteModalOpen(true)
  }

  async function deleteNote(u: any) {
    try {
      const id = String(u?.id || '')
      if (!id) return
      const label = String(u?.title || '').trim() || 'note'
      if (!confirm(`Are you sure you want to delete this note ("${label}")?`)) return

      const { error } = await supabase.from('ampro_notes').delete().eq('id', id)
      if (error) throw error
      await refresh()
      showSuccess('Note deleted')
    } catch (e: any) {
      showError(e?.message || 'Failed to delete note')
    }
  }

  async function saveCorrection() {
    try {
      setSavingCorrection(true)
      if (!newCorrectionPerformanceId) throw new Error('Select a program')
      if (!newCorrectionDate.trim()) throw new Error('Date is required')
      if (!newCorrectionBody.trim()) throw new Error('Correction is required')

      const payload = {
        performance_id: newCorrectionPerformanceId,
        title: newCorrectionTitle.trim() || null,
        correction_date: newCorrectionDate.trim(),
        body: newCorrectionBody.trim(),
        visible_to_accepted: Boolean(newCorrectionVisibleToAccepted),
        sort_order: 0,
      }

      if (!editingCorrectionId) {
        const existing = (corrections || []).filter((c: any) => String(c?.performance_id || '') === String(newCorrectionPerformanceId))
        const maxSort = Math.max(0, ...existing.map((c: any) => (Number.isFinite(Number(c?.sort_order)) ? Number(c.sort_order) : 0)))
        ;(payload as any).sort_order = maxSort + 1
      }

      const resp = editingCorrectionId
        ? await supabase.from('ampro_corrections').update(payload).eq('id', editingCorrectionId)
        : await supabase.from('ampro_corrections').insert(payload)

      if (resp.error) throw resp.error

      if (!editingCorrectionId && Boolean((payload as any).visible_to_accepted)) {
        await broadcastAmproNotification({
          kind: 'correction',
          performanceId: String(newCorrectionPerformanceId),
          title: String(newCorrectionTitle.trim() || 'New correction'),
          message: clipNotificationMessage(newCorrectionBody.trim()) || 'A new correction is available in your AmPro project.',
        })
      }

      setNewCorrectionBody('')
      setNewCorrectionTitle('')
      setCorrectionModalOpen(false)
      setEditingCorrectionId(null)
      await refresh()
      showSuccess(editingCorrectionId ? 'Correction updated' : 'Correction added')
    } catch (e: any) {
      showError(e?.message || (editingCorrectionId ? 'Failed to update correction' : 'Failed to add correction'))
    } finally {
      setSavingCorrection(false)
    }
  }

  function openCreateCorrectionModal() {
    setEditingCorrectionId(null)
    if (!newCorrectionDate) setNewCorrectionDate(new Date().toISOString().slice(0, 10))
    setNewCorrectionTitle('')
    setNewCorrectionBody('')
    setNewCorrectionVisibleToAccepted(true)
    setCorrectionModalOpen(true)
  }

  function openEditCorrectionModal(c: any) {
    setEditingCorrectionId(String(c?.id || ''))
    setNewCorrectionPerformanceId(String(c?.performance_id || ''))
    setNewCorrectionTitle(String(c?.title || ''))
    setNewCorrectionDate(String(c?.correction_date || new Date().toISOString().slice(0, 10)))
    setNewCorrectionBody(String(c?.body || ''))
    setNewCorrectionVisibleToAccepted(Boolean(c?.visible_to_accepted))
    setCorrectionModalOpen(true)
  }

  async function deleteCorrection(c: any) {
    try {
      const id = String(c?.id || '')
      if (!id) return
      const label = c?.correction_date ? formatDateOnlyFromISODate(String(c.correction_date)) : '—'
      if (!confirm(`Are you sure you want to delete this correction (${label})?`)) return

      const { error } = await supabase.from('ampro_corrections').delete().eq('id', id)
      if (error) throw error
      await refresh()
      showSuccess('Correction deleted')
    } catch (e: any) {
      showError(e?.message || 'Failed to delete correction')
    }
  }

  async function toggleCorrectionVisibility(c: any) {
    try {
      const id = String(c?.id || '')
      if (!id) return
      const next = !Boolean(c?.visible_to_accepted)
      const { error } = await supabase.from('ampro_corrections').update({ visible_to_accepted: next }).eq('id', id)
      if (error) throw error

      if (next) {
        const pid = String(c?.performance_id || '')
        if (pid) {
          await broadcastAmproNotification({
            kind: 'correction',
            performanceId: pid,
            title: String(c?.title || 'New correction'),
            message: clipNotificationMessage(String(c?.body || '')) || 'A new correction is available in your AmPro project.',
          })
        }
      }

      await refresh()
      showSuccess(next ? 'Correction set visible' : 'Correction hidden')
    } catch (e: any) {
      showError(e?.message || 'Failed to update visibility')
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
      showSuccess(editingLocationId ? 'Location updated' : 'Location created')
    } catch (e: any) {
      showError(e?.message || (editingLocationId ? 'Failed to update location' : 'Failed to create location'))
    } finally {
      setSavingLocation(false)
    }
  }

  async function deleteLocation(l: any) {
    const id = String(l?.id || '')
    if (!id) return

    const label = String(l?.name || id)
    const ok = window.confirm(
      `Are you sure you want to delete location "${label}"?\n\nPrograms or availability dates that use this location will lose that link.`,
    )
    if (!ok) return

    try {
      setDeletingLocationId(id)

      // Best-effort: unlink from referencing rows first (in case FK isn't ON DELETE SET NULL).
      try {
        const upPrograms = await supabase.from('ampro_programmas').update({ location_id: null }).eq('location_id', id)
        if (upPrograms.error) throw upPrograms.error
      } catch {
        // ignore
      }

      try {
        const upDates = await supabase.from('ampro_availability_request_dates').update({ location_id: null }).eq('location_id', id)
        if (upDates.error) throw upDates.error
      } catch {
        // ignore
      }

      const del = await supabase.from('ampro_locations').delete().eq('id', id)
      if (del.error) throw del.error

      showSuccess('Location deleted')
      await refresh()
    } catch (e: any) {
      showError(e?.message || 'Failed to delete location')
    } finally {
      setDeletingLocationId(null)
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
    { key: 'programmas', label: 'Programs', icon: BookOpen },
    { key: 'forms', label: 'Forms', icon: FileText },
    { key: 'locations', label: 'Locations', icon: MapPin },
    { key: 'availability', label: 'Availability', icon: Calendar },
    { key: 'notes', label: 'Notes', icon: MessageSquare },
    { key: 'corrections', label: 'Corrections', icon: Edit2 },
    { key: 'applications', label: 'Applications', icon: ClipboardList },
    { key: 'members', label: 'Members', icon: Users },
  ]

  const activeAdminLabel = sidebarItems.find((x) => x.key === active)?.label || 'Admin'

  const adminMobileSections: MobileSidebarSection[] = [
    {
      title: 'Admin menu',
      items: sidebarItems.map((item) => ({
        label: item.label,
        icon: item.icon,
        onClick: () => {
          setActive(item.key)
          setAdminMobileMenuOpen(false)
        },
      })),
    },
    {
      title: 'Navigation',
      items: [
        {
          label: 'Back to AmPro',
          onClick: () => {
            router.push('/ampro')
            setAdminMobileMenuOpen(false)
          },
        },
        {
          label: 'Log out',
          onClick: async () => {
            setAdminMobileMenuOpen(false)
            await handleAdminLogout()
          },
          icon: LogOut,
          tone: 'danger',
        },
      ],
    },
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

  function replaceGroupInArray(prev: any[], performanceId: string, newGroup: any[]) {
    const pid = String(performanceId || '')
    const firstIndex = prev.findIndex((x: any) => String(x?.performance_id || '') === pid)
    const remaining = prev.filter((x: any) => String(x?.performance_id || '') !== pid)
    if (firstIndex < 0) return [...remaining, ...newGroup]
    const head = prev.slice(0, firstIndex).filter((x: any) => String(x?.performance_id || '') !== pid)
    const tail = prev.slice(firstIndex).filter((x: any) => String(x?.performance_id || '') !== pid)
    return [...head, ...newGroup, ...tail]
  }

  async function persistSortOrder(table: 'ampro_notes' | 'ampro_corrections', rows: any[], performanceId: string) {
    const pid = String(performanceId || '')
    if (!pid) return

    const savingSetter = table === 'ampro_notes' ? setSavingNotesOrderByProgramId : setSavingCorrectionsOrderByProgramId
    try {
      savingSetter((s) => ({ ...s, [pid]: true }))

      for (const r of rows) {
        const id = String(r?.id || '')
        if (!id) continue
        const sortOrder = Number.isFinite(Number(r?.sort_order)) ? Number(r.sort_order) : 0
        const { error } = await supabase.from(table).update({ sort_order: sortOrder }).eq('id', id)
        if (error) throw error
      }
    } finally {
      savingSetter((s) => ({ ...s, [pid]: false }))
    }
  }

  async function handleNotesDragEnd(performanceId: string, items: any[], event: DragEndEvent) {
    const pid = String(performanceId || '')
    const activeId = String(event.active?.id || '')
    const overId = String(event.over?.id || '')
    if (!pid || !activeId || !overId || activeId === overId) return

    const oldIndex = items.findIndex((x: any) => String(x?.id || '') === activeId)
    const newIndex = items.findIndex((x: any) => String(x?.id || '') === overId)
    if (oldIndex < 0 || newIndex < 0) return

    const moved = arrayMove(items, oldIndex, newIndex).map((x: any, idx: number) => ({ ...x, sort_order: idx + 1 }))
    setUpdates((prev) => replaceGroupInArray(prev, pid, moved))

    try {
      await persistSortOrder('ampro_notes', moved, pid)
      showSuccess('Notes order saved')
    } catch (e: any) {
      showError(e?.message || 'Failed to save notes order')
    }
  }

  async function handleCorrectionsDragEnd(performanceId: string, items: any[], event: DragEndEvent) {
    const pid = String(performanceId || '')
    const activeId = String(event.active?.id || '')
    const overId = String(event.over?.id || '')
    if (!pid || !activeId || !overId || activeId === overId) return

    const oldIndex = items.findIndex((x: any) => String(x?.id || '') === activeId)
    const newIndex = items.findIndex((x: any) => String(x?.id || '') === overId)
    if (oldIndex < 0 || newIndex < 0) return

    const moved = arrayMove(items, oldIndex, newIndex).map((x: any, idx: number) => ({ ...x, sort_order: idx + 1 }))
    setCorrections((prev) => replaceGroupInArray(prev, pid, moved))

    try {
      await persistSortOrder('ampro_corrections', moved, pid)
      showSuccess('Corrections order saved')
    } catch (e: any) {
      showError(e?.message || 'Failed to save corrections order')
    }
  }

  const correctionsByProgramId = corrections.reduce((acc: Record<string, any[]>, c: any) => {
    const id = String(c?.performance_id || '')
    if (!id) return acc
    if (!acc[id]) acc[id] = []
    acc[id].push(c)
    return acc
  }, {})

  const unknownProgramCorrections = corrections.filter((c: any) => {
    const pid = String(c?.performance_id || '')
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

  const groupedMembers = (() => {
    const byUser = new Map<
      string,
      {
        userId: string
        name: string
        rows: any[]
      }
    >()

    for (const a of filteredMembers) {
      const userId = String(a?.user_id || '')
      if (!userId) continue
      const profile = profilesByUserId[userId]
      const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userId

      const existing = byUser.get(userId)
      if (existing) {
        existing.rows.push(a)
      } else {
        byUser.set(userId, { userId, name, rows: [a] })
      }
    }

    return Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()

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
                      (isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50')
                    }
                  >
                    <Icon className={isActive ? 'h-4 w-4 text-blue-600' : 'h-4 w-4 text-gray-700'} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="px-5 pb-5">
            <Link href="/ampro" className="text-sm font-semibold text-gray-900">
              ← Back
            </Link>
          </div>
        </div>
      </div>

      <div className="md:pl-64">
        <nav className="md:hidden bg-white border-b border-gray-200 sticky top-0 z-40 overflow-hidden">
          <div className="px-4">
            <div className="flex justify-between items-center h-12">
              <button
                onClick={() => setAdminMobileMenuOpen(true)}
                className="p-2 rounded-md text-slate-700 hover:bg-slate-100"
                aria-label="Open admin menu"
              >
                <Menu className="w-6 h-6" />
              </button>

              <div className="text-sm font-semibold text-gray-900 truncate">{activeAdminLabel}</div>

              <div className="w-10" />
            </div>
          </div>

          <MobileSidebar
            open={adminMobileMenuOpen}
            onClose={() => setAdminMobileMenuOpen(false)}
            onOpen={() => setAdminMobileMenuOpen(true)}
            sections={adminMobileSections}
            header={
              <div>
                <div className="font-semibold text-slate-900">The AmProProject</div>
                <div className="text-xs text-slate-500">Admin</div>
              </div>
            }
          />
        </nav>

        <main className="p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            <Modal
              isOpen={programmaModalOpen}
              onClose={() => setProgrammaModalOpen(false)}
              ariaLabel={editingProgrammaId ? 'Edit program' : 'New program'}
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-xl font-bold text-gray-900">{editingProgrammaId ? 'Edit program' : 'New program'}</h2>
              <p className="mt-1 text-sm text-gray-600">Fill in the fields.</p>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Program type
                  <select
                    value={newProgramType}
                    onChange={(e) => setNewProgramType(e.target.value as any)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="performance">Performance project</option>
                    <option value="workshop">Workshop</option>
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Location
                  <select
                    value={newLocationId}
                    onChange={(e) => setNewLocationId(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">No location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Title
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Title"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Description
                  <RichTextEditor value={newDescription} onChange={setNewDescription} placeholder="Description (optional)" />
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
                    Payment URL (optional)
                    <input
                      type="text"
                      value={newAdminPaymentUrl}
                      onChange={(e) => setNewAdminPaymentUrl(e.target.value)}
                      placeholder="https://example.com/pay/123"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Region
                    <input
                      value={newRegion}
                      onChange={(e) => setNewRegion(e.target.value)}
                      placeholder="Region"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>

                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Deadline
                    <input
                      value={newApplicationDeadline}
                      onChange={(e) => setNewApplicationDeadline(e.target.value)}
                      placeholder="dd/mm/yyyy"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Form (for application)
                  <select
                    value={newFormId}
                    onChange={(e) => setNewFormId(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">No form</option>
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Rehearsal start
                    <input
                      value={newRehearsalStart}
                      onChange={(e) => setNewRehearsalStart(e.target.value)}
                      placeholder="dd/mm/yyyy"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Rehearsal end
                    <input
                      value={newRehearsalEnd}
                      onChange={(e) => setNewRehearsalEnd(e.target.value)}
                      placeholder="dd/mm/yyyy"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Performance dates
                  <textarea
                    value={newPerformanceDates}
                    onChange={(e) => setNewPerformanceDates(e.target.value)}
                    placeholder="dd/mm/yyyy (one per line or comma-separated)"
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
                      Publicly visible
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={newApplicationsOpen}
                      onChange={(e) => setNewApplicationsOpen(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                      Applications open
                  </label>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={saveProgramma}
                    disabled={saving}
                    className={`h-11 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                      saving ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {saving ? 'Saving…' : editingProgrammaId ? 'Save' : 'Create'}
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={formModalOpen}
              onClose={() => {
                setFormModalOpen(false)
                setEditingFormId(null)
                setCollapsedFormFieldById({})
              }}
              ariaLabel={editingFormId ? 'Edit form' : 'New form'}
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-xl font-bold text-gray-900">{editingFormId ? 'Edit form' : 'New form'}</h2>
              <p className="mt-1 text-sm text-gray-600">Create an application form for a program.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Name
                  <input
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder="Name"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <div className="rounded-3xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">Fields</div>
                    <button
                      type="button"
                      onClick={() => setNewFormFields((prev) => [...prev, makeEmptyFieldDraft()])}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-8 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      Add field
                    </button>
                  </div>

                  {newFormFields.length === 0 ? (
                    <div className="mt-3 text-sm text-gray-600">No fields yet. Click “Add field”.</div>
                  ) : null}

                  <div className="mt-4">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFormFieldsDragEnd}>
                      <SortableContext items={newFormFields.map((f) => String(f.id))} strategy={verticalListSortingStrategy}>
                        <div className="grid gap-3">
                          {newFormFields.map((field, idx) => {
                            const showPlaceholder = field.type === 'text' || field.type === 'textarea' || field.type === 'date'
                            const isSelect = field.type === 'select'
                            const isInfo = field.type === 'info'
                            const isTitle = field.type === 'title'
                            const isAnswerField = !isInfo && !isTitle
                            const isCollapsed = Boolean(collapsedFormFieldById[String(field.id)])

                            const labelPreview = (field.label || '').trim()
                            const title = labelPreview ? labelPreview : `Field ${idx + 1}`
                            const metaParts = [
                              isTitle ? 'Title' : isInfo ? 'Info' : `Type: ${field.type}`,
                              isAnswerField && field.required ? 'Required' : null,
                            ].filter(Boolean)

                            return (
                              <SortableCardItem key={field.id} id={String(field.id)}>
                                <div className="rounded-3xl border border-gray-200 p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <button
                                      type="button"
                                      onClick={() => toggleFormFieldCollapsed(field.id)}
                                      className="text-left min-w-0"
                                      aria-expanded={!isCollapsed}
                                    >
                                      <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                        <span className="truncate">{title}</span>
                                      </div>
                                      {metaParts.length ? (
                                        <div className="mt-1 text-xs text-gray-500">{metaParts.join(' · ')}</div>
                                      ) : null}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setNewFormFields((prev) => prev.filter((f) => f.id !== field.id))}
                                      className="text-sm font-semibold text-red-700 hover:text-red-800 shrink-0"
                                    >
                                      Remove
                                    </button>
                                  </div>

                                  {!isCollapsed ? (
                                    <div className="mt-3 grid gap-3">
                                      <div className="grid grid-cols-1 gap-3">
                                        <label className="grid gap-1 text-sm font-medium text-gray-700">
                                          {isInfo ? 'Title (optional)' : isTitle ? 'Title' : 'Label'}
                                          <input
                                            value={field.label}
                                            onChange={(e) => {
                                              const nextLabel = e.target.value
                                              setNewFormFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, label: nextLabel } : f)))
                                            }}
                                            placeholder={isInfo ? 'e.g. Important' : isTitle ? 'e.g. Personal info' : 'e.g. Experience'}
                                            className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                          />
                                        </label>
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
                                                    placeholder:
                                                      nextType === 'text' || nextType === 'textarea' || nextType === 'date' ? f.placeholder : '',
                                                    text: nextType === 'info' ? f.text : '',
                                                    options:
                                                      nextType === 'select'
                                                        ? (f.options?.length ? f.options : [{ id: makeId(), label: '', value: '' }])
                                                        : [],
                                                    required: nextType === 'info' || nextType === 'title' ? false : f.required,
                                                  }
                                                }),
                                              )
                                            }}
                                            className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                          >
                                            <option value="text">Text</option>
                                            <option value="textarea">Textarea (large)</option>
                                            <option value="date">Date</option>
                                            <option value="select">Select</option>
                                            <option value="checkbox">Checkbox</option>
                                            <option value="title">Title (section)</option>
                                            <option value="info">Info text (no input)</option>
                                          </select>
                                        </label>

                                        {isAnswerField ? (
                                          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 mt-7">
                                            <input
                                              type="checkbox"
                                              checked={field.required}
                                              onChange={(e) =>
                                                setNewFormFields((prev) =>
                                                  prev.map((f) => (f.id === field.id ? { ...f, required: e.target.checked } : f)),
                                                )
                                              }
                                              className="h-4 w-4 rounded border-gray-300"
                                            />
                                              Required
                                          </label>
                                        ) : (
                                            <div className="mt-7 text-xs text-gray-500">No input field</div>
                                        )}
                                      </div>

                                      {isInfo ? (
                                        <label className="grid gap-1 text-sm font-medium text-gray-700">
                                          Info text
                                          <textarea
                                            value={field.text}
                                            onChange={(e) =>
                                              setNewFormFields((prev) =>
                                                prev.map((f) => (f.id === field.id ? { ...f, text: e.target.value } : f)),
                                              )
                                            }
                                            placeholder="Text shown on the form…"
                                            className="min-h-24 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                                          />
                                        </label>
                                      ) : null}

                                      {showPlaceholder ? (
                                        <label className="grid gap-1 text-sm font-medium text-gray-700">
                                          Placeholder (optional)
                                          <input
                                            value={field.placeholder}
                                            onChange={(e) =>
                                              setNewFormFields((prev) =>
                                                prev.map((f) => (f.id === field.id ? { ...f, placeholder: e.target.value } : f)),
                                              )
                                            }
                                            placeholder="Text in the field…"
                                            className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                          />
                                        </label>
                                      ) : null}

                                      {isSelect ? (
                                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-semibold text-gray-900">Options</div>
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
                                              + option
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
                                                    placeholder="(optional)"
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
                                                  Remove
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                          <div className="mt-2 text-xs text-gray-600">Leave “Value” empty to auto-derive it from the label.</div>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </SortableCardItem>
                            )
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={createForm}
                    disabled={savingForm}
                    className={`h-11 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                      savingForm ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {savingForm ? 'Saving…' : editingFormId ? 'Save' : 'Create'}
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
              ariaLabel="Manage group link"
              contentStyle={{ maxWidth: 720 }}
            >
              <h2 className="text-xl font-bold text-gray-900">Manage group link</h2>
              <p className="mt-1 text-sm text-gray-600">
                Program: <span className="font-semibold">{inviteManageProgram?.title || ''}</span>
              </p>

              <div className="mt-6 grid gap-3">
                {inviteManageStatus ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      inviteManageStatus.ok
                        ? 'border-green-200 bg-green-50 text-green-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <div className="font-semibold">
                      Status:{' '}
                      {inviteManageStatus.ok
                        ? 'Active'
                        : inviteManageStatus.revoked
                          ? 'Deactivated'
                          : inviteManageStatus.expired
                            ? 'Expired'
                            : inviteManageStatus.maxed
                              ? 'Full'
                              : 'Inactive'}
                    </div>
                    <div className="mt-1 text-xs">
                      Used: {inviteManageStatus.uses_count}
                      {inviteManageStatus.max_uses != null ? ` / ${inviteManageStatus.max_uses}` : ''}
                      {inviteManageStatus.expires_at ? ` • Expires: ${new Date(inviteManageStatus.expires_at).toLocaleString()}` : ''}
                    </div>
                  </div>
                ) : null}

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Link
                  <input
                    value={inviteManageUrl || (inviteManageLoading ? 'Loading…' : '')}
                    readOnly
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Max users (optional)
                    <input
                      value={inviteConfigMaxUses}
                      onChange={(e) => {
                        setInviteConfigMaxUses(e.target.value)
                        setInviteConfigDirty(true)
                      }}
                      inputMode="numeric"
                      placeholder="(unlimited)"
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                      disabled={inviteManageLoading}
                    />
                  </label>

                  <label className="grid gap-1 text-sm font-medium text-gray-700">
                    Expiration date (optional)
                    <input
                      type="datetime-local"
                      value={inviteConfigExpiresAt}
                      onChange={(e) => {
                        setInviteConfigExpiresAt(e.target.value)
                        setInviteConfigDirty(true)
                      }}
                      className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                      disabled={inviteManageLoading}
                    />
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={deleteInviteLinks}
                    disabled={inviteManageLoading || !inviteManageProgram?.id}
                    className="h-11 rounded-3xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {inviteDeleteArmed ? 'Confirm delete' : 'Delete links'}
                  </button>

                  <button
                    type="button"
                    onClick={revokeInviteLinks}
                    disabled={inviteManageLoading || !inviteManageProgram?.id}
                    className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Deactivate
                  </button>

                  <button
                    type="button"
                    onClick={saveInviteSettings}
                    disabled={
                      inviteManageLoading ||
                      !inviteManageProgram?.id ||
                      !inviteManageToken ||
                      (inviteManageStatus ? Boolean(inviteManageStatus.revoked) : false)
                    }
                    className={`h-11 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                      inviteManageLoading ||
                      !inviteManageProgram?.id ||
                      !inviteManageToken ||
                      (inviteManageStatus ? Boolean(inviteManageStatus.revoked) : false)
                        ? 'bg-blue-100 text-blue-400'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {inviteManageLoading ? 'Saving…' : 'Save'}
                  </button>

                  <button
                    type="button"
                    onClick={rotateInviteWithSettings}
                    disabled={inviteManageLoading || !inviteManageProgram?.id}
                    className="h-11 rounded-3xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    New link (with limit)
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
                    Copy link
                  </button>
                </div>

                {inviteDeleteArmed ? (
                  <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 p-4">
                    <div className="text-sm font-semibold text-red-900">Warning: this deletes all group links for this program.</div>
                    <div className="mt-1 text-xs text-red-800">Existing links in your group chat will stop working.</div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        value={inviteDeleteConfirmText}
                        onChange={(e) => setInviteDeleteConfirmText(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        className="h-11 rounded-2xl border border-red-200 bg-white px-3 text-sm"
                        disabled={inviteManageLoading}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setInviteDeleteArmed(false)
                          setInviteDeleteConfirmText('')
                        }}
                        disabled={inviteManageLoading}
                        className="h-11 rounded-3xl border border-gray-200 bg-white px-8 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {inviteManageToken ? (
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-600">
                    <div>Token: {inviteManageStatus?.ok ? 'active' : 'inactive'}</div>
                    <button
                      type="button"
                      onClick={() => refreshInviteStatus(inviteManageToken)}
                      disabled={inviteManageLoading}
                      className="font-semibold text-gray-900 hover:text-blue-600 disabled:opacity-50"
                    >
                      Refresh status
                    </button>
                  </div>
                ) : null}
              </div>
            </Modal>

            <Modal
              isOpen={correctionModalOpen}
              onClose={() => setCorrectionModalOpen(false)}
              ariaLabel="New correction"
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-2xl font-bold text-gray-900">{editingCorrectionId ? 'Edit correction' : 'New correction'}</h2>
              <p className="mt-1 text-sm text-gray-600">You can choose whether this is visible to accepted users.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Program
                  <select
                    value={newCorrectionPerformanceId}
                    onChange={(e) => setNewCorrectionPerformanceId(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">Select a program</option>
                    {performances.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Date
                  <input
                    type="date"
                    value={newCorrectionDate}
                    onChange={(e) => setNewCorrectionDate(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Title (optional)
                  <input
                    type="text"
                    value={newCorrectionTitle}
                    onChange={(e) => setNewCorrectionTitle(e.target.value)}
                    placeholder="e.g. Arm position in bar 3"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={newCorrectionVisibleToAccepted}
                    onChange={(e) => setNewCorrectionVisibleToAccepted(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Visible to accepted users
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Correction
                  <RichTextEditor value={newCorrectionBody} onChange={setNewCorrectionBody} placeholder="Correction description…" />
                </label>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={saveCorrection}
                    disabled={savingCorrection}
                    className={`h-11 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                      savingCorrection ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {savingCorrection ? 'Saving…' : editingCorrectionId ? 'Update' : 'Post'}
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={noteModalOpen}
              onClose={() => {
                setNoteModalOpen(false)
                setEditingNoteId(null)
              }}
              ariaLabel={editingNoteId ? 'Edit note' : 'New note'}
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-2xl font-bold text-gray-900">{editingNoteId ? 'Edit note' : 'New note'}</h2>
              <p className="mt-1 text-sm text-gray-600">This note will be visible to accepted users.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Program
                  <select
                    value={newUpdatePerformanceId}
                    onChange={(e) => setNewUpdatePerformanceId(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">Select a program</option>
                    {performances.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Title
                  <input
                    value={newUpdateTitle}
                    onChange={(e) => setNewUpdateTitle(e.target.value)}
                    placeholder="Title"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Content
                  <RichTextEditor value={newUpdateBody} onChange={setNewUpdateBody} placeholder="Content" />
                </label>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={createUpdate}
                    disabled={savingUpdate}
                    className={`h-11 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                      savingUpdate ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {savingUpdate ? 'Saving…' : editingNoteId ? 'Update' : 'Post'}
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={locationModalOpen}
              onClose={() => setLocationModalOpen(false)}
              ariaLabel={editingLocationId ? 'Edit location' : 'New location'}
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-2xl font-bold text-gray-900">{editingLocationId ? 'Edit location' : 'New location'}</h2>
              <p className="mt-1 text-sm text-gray-600">Add a location you can link to programs.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Name
                  <input
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="Name"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Address
                  <textarea
                    value={newLocationAddress}
                    onChange={(e) => setNewLocationAddress(e.target.value)}
                    placeholder="Address (optional)"
                    className="min-h-24 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={saveLocation}
                    disabled={savingLocation}
                    className={`h-11 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                      savingLocation ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {savingLocation ? 'Saving…' : editingLocationId ? 'Save' : 'Create'}
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={memberDetailOpen}
              onClose={() => {
                setMemberDetailOpen(false)
                setEditingMemberSnapshot(false)
                setMemberDetailApp(null)
              }}
              ariaLabel="Member details"
              contentStyle={{ maxWidth: 760 }}
            >
              {memberDetailApp
                ? (() => {
                    const userId = String(memberDetailApp.user_id || '')
                    const profile = profilesByUserId[userId]
                    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userId
                    const perfTitle = performanceTitleById[String(memberDetailApp.performance_id)] || String(memberDetailApp.performance_id)
                    const rosterRoleName =
                      (roster || []).find(
                        (r: any) =>
                          String(r?.performance_id || '') === String(memberDetailApp.performance_id || '') &&
                          String(r?.user_id || '') === String(memberDetailApp.user_id || ''),
                      )?.role_name || null
                    const snapshot = (memberDetailApp as any)?.snapshot_json || {}
                    const answers = (memberDetailApp as any)?.answers_json || {}

                    const formId = formIdByProgramId[String(memberDetailApp.performance_id)]
                    const formRow = formId ? (forms || []).find((f: any) => String(f?.id) === String(formId)) : null
                    const formFields = parseAmproFormFields((formRow as any)?.fields_json)
                    const answerFields = formFields.filter(
                      (f) => f.type === 'text' || f.type === 'textarea' || f.type === 'date' || f.type === 'select' || f.type === 'checkbox',
                    )

                    const formattedSnapshotRows: Array<{ label: string; value: string }> = [
                      { label: 'First name', value: String(snapshot.first_name || '') },
                      { label: 'Last name', value: String(snapshot.last_name || '') },
                      { label: 'Birth date', value: String(snapshot.birth_date || '') },
                      { label: 'Email', value: String(snapshot.email || '') },
                      { label: 'Phone', value: String(snapshot.phone || '') },
                      { label: 'Instagram', value: String(snapshot.instagram_username || '') },
                      { label: 'T-shirt size', value: String(snapshot.tshirt_size || '') },
                      { label: 'Street', value: String(snapshot.street || '') },
                      { label: 'House number', value: String(snapshot.house_number || '') },
                      { label: 'Addition', value: String(snapshot.house_number_addition || '') },
                      { label: 'Postal code', value: String(snapshot.postal_code || '') },
                      { label: 'City', value: String(snapshot.city || '') },
                    ].map((r) => ({ label: r.label, value: r.value.trim() }))

                    function formatAnswer(field: AmproFormField, raw: any): string {
                      if (field.type === 'checkbox') return raw ? 'Yes' : 'No'
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
                          <h2 className="text-2xl font-bold text-gray-900">User details</h2>
                        </div>

                        <div>
                          <div className="text-sm font-semibold text-gray-900">{name}</div>
                          <div className="mt-1 text-sm text-gray-600">Performance: {perfTitle}</div>
                          <div className="mt-1 text-xs text-gray-500">Status: {String(memberDetailApp.status || '')}</div>
                          {rosterRoleName ? <div className="mt-1 text-xs text-gray-500">Role: {String(rosterRoleName)}</div> : null}
                          <div className="mt-2 flex items-center gap-3">
                            {((memberDetailApp as any)?.paid) ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800">Paid</span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Unpaid</span>
                            )}

                            <button
                              type="button"
                              onClick={toggleMemberPaid}
                              disabled={savingPaid}
                              className={`h-8 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                                savingPaid ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              {savingPaid ? 'Processing…' : ((memberDetailApp as any)?.paid ? 'Mark as unpaid' : 'Mark as paid')}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-gray-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">Roster role</div>
                            <button
                              type="button"
                              onClick={saveMemberRoleName}
                              disabled={savingMemberRoleName}
                              className={`h-9 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                                savingMemberRoleName ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              {savingMemberRoleName ? 'Saving…' : 'Save role'}
                            </button>
                          </div>
                          <div className="mt-3 grid gap-1">
                            <label className="grid gap-1 text-sm font-medium text-gray-700">
                              Role name
                              <input
                                value={memberRoleNameDraft}
                                onChange={(e) => setMemberRoleNameDraft(e.target.value)}
                                placeholder="Dancer"
                                className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                              />
                            </label>
                            <div className="text-xs text-gray-500">Leave empty to default to "Dancer".</div>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-gray-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">User details</div>
                            <div className="flex items-center gap-2">
                              {editingMemberSnapshot ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setEditingMemberSnapshot(false)}
                                    disabled={savingMemberSnapshot}
                                    className="h-9 rounded-3xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={saveMemberSnapshot}
                                    disabled={savingMemberSnapshot}
                                    className={`h-9 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                                      savingMemberSnapshot ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                  >
                                    {savingMemberSnapshot ? 'Saving…' : 'Save'}
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingMemberSnapshot(true)}
                                  className="h-9 rounded-3xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </div>

                          {editingMemberSnapshot ? (
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                First name
                                <input
                                  value={memberSnapshotDraft.first_name || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, first_name: e.target.value }))}
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Last name
                                <input
                                  value={memberSnapshotDraft.last_name || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, last_name: e.target.value }))}
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>

                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Birth date
                                <input
                                  value={memberSnapshotDraft.birth_date || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, birth_date: e.target.value }))}
                                  placeholder="YYYY-MM-DD"
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Email
                                <input
                                  value={memberSnapshotDraft.email || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, email: e.target.value }))}
                                  inputMode="email"
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>

                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Phone
                                <input
                                  value={memberSnapshotDraft.phone || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, phone: e.target.value }))}
                                  inputMode="tel"
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>
                              <div />

                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Instagram
                                <input
                                  value={memberSnapshotDraft.instagram_username || ''}
                                  onChange={(e) =>
                                    setMemberSnapshotDraft((prev) => ({ ...prev, instagram_username: e.target.value }))
                                  }
                                  placeholder="e.g. janedoe"
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>

                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                T-shirt size
                                <select
                                  value={memberSnapshotDraft.tshirt_size || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, tshirt_size: e.target.value }))}
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                >
                                  <option value="">(select)</option>
                                  <option value="XS">XS</option>
                                  <option value="S">S</option>
                                  <option value="M">M</option>
                                  <option value="L">L</option>
                                  <option value="XL">XL</option>
                                  <option value="XXL">XXL</option>
                                </select>
                              </label>

                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Street
                                <input
                                  value={memberSnapshotDraft.street || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, street: e.target.value }))}
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                House number
                                <input
                                  value={memberSnapshotDraft.house_number || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, house_number: e.target.value }))}
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>

                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Addition
                                <input
                                  value={memberSnapshotDraft.house_number_addition || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, house_number_addition: e.target.value }))}
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>
                              <div />

                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                Postal code
                                <input
                                  value={memberSnapshotDraft.postal_code || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, postal_code: e.target.value }))}
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-medium text-gray-700">
                                City
                                <input
                                  value={memberSnapshotDraft.city || ''}
                                  onChange={(e) => setMemberSnapshotDraft((prev) => ({ ...prev, city: e.target.value }))}
                                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                                />
                              </label>

                              <div className="sm:col-span-2 text-xs text-gray-500">
                                This edits <span className="font-semibold">snapshot_json</span> on the application (useful for invite applications without filled-in data).
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {formattedSnapshotRows.map((r) => (
                                <div key={r.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                  <div className="text-xs font-semibold text-gray-600">{r.label}</div>
                                  <div className="mt-1 text-sm font-semibold text-gray-900 wrap-break-word">{r.value || '-'}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-3xl border border-gray-200 bg-white p-4">
                          <div className="text-sm font-semibold text-gray-900">Form details</div>
                          <div className="mt-1 text-sm text-gray-600">{formRow?.name || 'No form linked'}</div>

                          {answerFields.length ? (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {answerFields.map((f) => (
                                <div key={f.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                  <div className="text-xs font-semibold text-gray-600">{f.label}</div>
                                  <div className="mt-1 text-sm font-semibold text-gray-900 wrap-break-word">
                                    {formatAnswer(f, (answers as any)[f.key]) || '-'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-gray-600">No form fields found.</div>
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
              ariaLabel="Delete member"
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
                          <h2 className="text-xl font-bold text-gray-900">Delete member</h2>
                          <p className="mt-1 text-sm text-gray-600">This action cannot be undone.</p>
                        </div>

                        <p className="text-sm text-gray-700">
                          You are about to delete the application for <span className="font-semibold">{name}</span> ({perfTitle}).
                        </p>
                        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                          <div className="text-sm font-semibold text-gray-900">Type DELETE to confirm</div>
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
                            disabled={!canDelete}
                            onClick={deleteMemberApplication}
                            className="h-11 rounded-3xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete
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
                    <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
                    <p className="mt-1 text-sm text-gray-600">Manage programs (performances & workshops).</p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateProgrammaModal}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-8 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </button>
                </div>

                <div className="mt-6">
                  <SearchFilterBar
                    value={programmaSearch}
                    onChange={setProgrammaSearch}
                    placeholder="Search programs…"
                  />

                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="grid gap-2">
                      {filteredProgrammas.map((p) => {
                        const type = String(p?.program_type || '').toLowerCase()
                        const typeLabel = type === 'workshop' ? 'Workshop' : 'Performance'
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
                                {p.region ? `Region: ${p.region}` : null}
                                {p.region && (p.performance_dates?.length || p.rehearsal_period_start || p.rehearsal_period_end) ? ' • ' : null}
                                {Array.isArray(p.performance_dates) && p.performance_dates.length
                                  ? `Dates: ${p.performance_dates.map((d: string) => formatDateOnlyFromISODate(d)).join(', ')}`
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
                                title="Group link"
                                icon={Link2}
                                variant="muted"
                                className="hover:text-blue-600"
                                onClick={() => openInviteManager(String(p.id), String(p.title || 'Program'))}
                                aria-label="Group link"
                              />
                              <ActionIcon
                                title="Edit"
                                icon={Edit2}
                                variant="primary"
                                onClick={() => openEditProgrammaModal(p)}
                                aria-label="Edit"
                              />
                              <ActionIcon
                                title="View"
                                icon={Eye}
                                variant="muted"
                                className="hover:text-blue-600"
                                onClick={() => router.push(`/ampro/programmas/${encodeURIComponent(p.id)}`)}
                                aria-label="View"
                              />
                              <ActionIcon
                                title="Delete"
                                icon={Trash2}
                                variant="danger"
                                onClick={() => deleteProgram(String(p.id))}
                                aria-label="Delete"
                              />
                            </div>
                          </div>
                        )
                      })}

                      {filteredProgrammas.length === 0 ? (
                        <div className="text-sm text-gray-600">No programs found.</div>
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
                    <p className="mt-1 text-sm text-gray-600">Create and manage application forms.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFormId(null)
                      setNewFormName('')
                      setNewFormFields([makeEmptyFieldDraft()])
                      setCollapsedFormFieldById({})
                      setFormModalOpen(true)
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-8 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </button>
                </div>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="text-md font-semibold text-gray-900">Created forms</div>
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
                              title="Edit"
                              icon={Edit2}
                              variant="primary"
                              onClick={() => {
                                // open modal in edit mode
                                setEditingFormId(String(f.id))
                                setNewFormName(String(f.name || ''))
                                setCollapsedFormFieldById({})
                                const rawFields = Array.isArray((f as any)?.fields_json) ? ((f as any).fields_json as any[]) : []
                                const mapped: FormFieldDraft[] = rawFields.map((rf) => ({
                                  id: makeId(),
                                  label: String(rf.label || ''),
                                  type: (rf.type as any) || 'text',
                                  required: Boolean(rf.required),
                                  placeholder: String(rf.placeholder || '') || '',
                                  text: String(rf.text || '') || '',
                                  options: Array.isArray(rf.options)
                                    ? rf.options.map((o: any) => ({ id: makeId(), label: String(o.label || ''), value: String(o.value || '') }))
                                    : [{ id: makeId(), label: '', value: '' }],
                                }))
                                setNewFormFields(mapped.length ? mapped : [makeEmptyFieldDraft()])
                                setFormModalOpen(true)
                              }}
                              aria-label="Edit"
                            />
                            <ActionIcon
                              title="Delete"
                              icon={Trash2}
                              variant="danger"
                              onClick={async () => {
                                try {
                                  if (!confirm(`Are you sure you want to delete the form "${String(f.name || '')}"?`)) return
                                  const { error } = await supabase.from('ampro_forms').delete().eq('id', f.id)
                                  if (error) throw error
                                  await refresh()
                                  showSuccess('Form deleted')
                                } catch (e: any) {
                                  showError(e?.message || 'Failed to delete form')
                                }
                              }}
                              aria-label="Delete"
                            />
                          </div>
                        </div>
                      )
                    })}

                    {forms.length === 0 ? <div className="text-sm text-gray-600">No forms yet.</div> : null}
                  </div>
                </div>
              </>
            ) : null}

            {active === 'notes' ? (
              <>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
                    <p className="mt-1 text-sm text-gray-600">Show information to accepted users.</p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateNoteModal}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-8 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </button>
                </div>

                <div className="mt-6 grid gap-4">
                  {performances
                    .filter((p) => (updatesByProgramId[String(p.id)] || []).length > 0)
                    .map((p) => {
                      const pid = String(p.id)
                      const notes = (updatesByProgramId[pid] || []).slice().sort((a: any, b: any) => {
                        const ao = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : 0
                        const bo = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 0
                        if (ao !== bo) return ao - bo
                        return String(b?.created_at || '').localeCompare(String(a?.created_at || ''))
                      })
                      const savingOrder = Boolean(savingNotesOrderByProgramId[pid])
                      return (
                        <div key={p.id} className="rounded-2xl border border-gray-200 bg-white p-6">
                          <div className="text-sm font-semibold text-gray-900">{p.title}</div>
                          {savingOrder ? <div className="mt-1 text-xs text-gray-500">Saving order…</div> : null}
                          <div className="mt-4 grid gap-2">
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={(e) => handleNotesDragEnd(pid, notes, e)}
                            >
                              <SortableContext items={notes.map((n: any) => String(n.id))} strategy={verticalListSortingStrategy}>
                                {notes.map((u: any) => (
                                  <SortableCardItem key={u.id} id={String(u.id)}>
                                    <div className="rounded-3xl border border-gray-200 p-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="mt-1 text-md font-semibold text-gray-900">{u.title}</div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <ActionIcon
                                            title="Edit"
                                            icon={Edit2}
                                            variant="primary"
                                            onClick={() => openEditNoteModal(u)}
                                            aria-label="Edit"
                                          />
                                          <ActionIcon
                                            title="Delete"
                                            icon={Trash2}
                                            variant="danger"
                                            onClick={() => deleteNote(u)}
                                            aria-label="Delete"
                                          />
                                        </div>
                                      </div>
                                      <SafeRichText
                                        value={u.body}
                                        className="mt-2 prose prose-sm max-w-none text-gray-700"
                                        maxLines={4}
                                      />
                                    </div>
                                  </SortableCardItem>
                                ))}
                              </SortableContext>
                            </DndContext>
                          </div>
                        </div>
                      )
                    })}

                  {unknownProgramUpdates.length ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6">
                      <div className="text-sm font-semibold text-gray-900">Unknown program</div>
                      <div className="mt-4 grid gap-2">
                        {unknownProgramUpdates.map((u: any) => (
                          <div key={u.id} className="rounded-3xl border border-gray-200 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs text-gray-500">{String(u.performance_id || '')}</div>
                                <div className="mt-1 text-md font-semibold text-gray-900">{u.title}</div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <ActionIcon
                                  title="Edit"
                                  icon={Edit2}
                                  variant="primary"
                                  onClick={() => openEditNoteModal(u)}
                                  aria-label="Edit"
                                />
                                <ActionIcon title="Delete" icon={Trash2} variant="danger" onClick={() => deleteNote(u)} aria-label="Delete" />
                              </div>
                            </div>
                            <SafeRichText
                              value={u.body}
                              className="mt-2 prose prose-sm max-w-none text-gray-700"
                              maxLines={4}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {updates.length === 0 ? <div className="text-sm text-gray-600">No notes yet.</div> : null}
                </div>
              </>
            ) : null}

            {active === 'corrections' ? (
              <>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Corrections</h1>
                    <p className="mt-1 text-sm text-gray-600">Add corrections per program (with date) and choose visibility.</p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateCorrectionModal}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-8 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </button>
                </div>

                <div className="mt-6 grid gap-4">
                  {performances
                    .filter((p) => (correctionsByProgramId[String(p.id)] || []).length > 0)
                    .map((p) => {
                      const pid = String(p.id)
                      const rows = (correctionsByProgramId[pid] || []).slice().sort((a: any, b: any) => {
                        const ao = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : 0
                        const bo = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 0
                        if (ao !== bo) return ao - bo
                        const ad = String(a?.correction_date || '')
                        const bd = String(b?.correction_date || '')
                        if (ad !== bd) return bd.localeCompare(ad)
                        return String(b?.created_at || '').localeCompare(String(a?.created_at || ''))
                      })
                      const savingOrder = Boolean(savingCorrectionsOrderByProgramId[pid])
                      return (
                        <div key={p.id} className="rounded-2xl border border-gray-200 bg-white p-6">
                          <div className="text-sm font-semibold text-gray-900">{p.title}</div>
                          {savingOrder ? <div className="mt-1 text-xs text-gray-500">Saving order…</div> : null}
                          <div className="mt-4 grid gap-2">
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={(e) => handleCorrectionsDragEnd(pid, rows, e)}
                            >
                              <SortableContext items={rows.map((r: any) => String(r.id))} strategy={verticalListSortingStrategy}>
                                {rows.map((c: any) => (
                                  <SortableCardItem key={c.id} id={String(c.id)}>
                                    <div className="rounded-3xl border border-gray-200 p-4">
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-gray-900">{String(c.title || 'Correction')}</div>
                                          <div className="mt-0.5 text-xs text-gray-500">
                                            {c.correction_date ? formatDateOnlyFromISODate(String(c.correction_date)) : '—'}
                                          </div>
                                          <div
                                            className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                              c.visible_to_accepted ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                            }`}
                                          >
                                            {c.visible_to_accepted ? 'Visible' : 'Hidden'}
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                          <ActionIcon
                                            title={c.visible_to_accepted ? 'Hide from users' : 'Make visible to users'}
                                            icon={Eye}
                                            variant={c.visible_to_accepted ? 'danger' : 'primary'}
                                            onClick={() => toggleCorrectionVisibility(c)}
                                            aria-label={c.visible_to_accepted ? 'Hide' : 'Show'}
                                          />
                                          <ActionIcon
                                            title="Edit"
                                            icon={Edit2}
                                            variant="primary"
                                            onClick={() => openEditCorrectionModal(c)}
                                            aria-label="Edit"
                                          />
                                          <ActionIcon
                                            title="Delete"
                                            icon={Trash2}
                                            variant="danger"
                                            onClick={() => deleteCorrection(c)}
                                            aria-label="Delete"
                                          />
                                        </div>
                                      </div>
                                      <SafeRichText
                                        value={String(c.body || '')}
                                        className="mt-2 prose prose-sm max-w-none text-gray-700"
                                        maxLines={4}
                                      />
                                    </div>
                                  </SortableCardItem>
                                ))}
                              </SortableContext>
                            </DndContext>
                          </div>
                        </div>
                      )
                    })}

                  {unknownProgramCorrections.length ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6">
                      <div className="text-sm font-semibold text-gray-900">Unknown program</div>
                      <div className="mt-4 grid gap-2">
                        {unknownProgramCorrections.map((c: any) => (
                          <div key={c.id} className="rounded-3xl border border-gray-200 p-4">
                            <div className="text-xs text-gray-500">{String(c.performance_id || '')}</div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">{String(c.title || 'Correction')}</div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {c.correction_date ? formatDateOnlyFromISODate(String(c.correction_date)) : '—'}
                            </div>
                            <SafeRichText
                              value={String(c.body || '')}
                              className="mt-2 prose prose-sm max-w-none text-gray-700"
                              maxLines={4}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {corrections.length === 0 ? <div className="text-sm text-gray-600">No corrections yet.</div> : null}
                </div>
              </>
            ) : null}

            {active === 'availability' ? (
              <>
                <h1 className="text-2xl font-bold text-gray-900">Availability</h1>
                <p className="mt-1 text-sm text-gray-600">Request availability per program and review responses.</p>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="grid gap-3">
                      <label className="grid gap-1 text-sm font-medium text-gray-700">
                        Program
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
                        Visible to users
                      </label>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                          <input
                            type="checkbox"
                            checked={availabilityLocked}
                            onChange={(e) => setAvailabilityLocked(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          Lock (user can no longer edit)
                        </label>

                        <label className="grid gap-1 text-sm font-medium text-gray-700">
                          Lock after date (optional)
                          <input
                            value={availabilityLockAt}
                            onChange={(e) => setAvailabilityLockAt(e.target.value)}
                            placeholder="dd/mm/yyyy"
                            className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                          />
                        </label>
                      </div>

                      <label className="grid gap-1 text-sm font-medium text-gray-700">
                        Dates (one per line or comma-separated)
                        <textarea
                          value={availabilityDatesText}
                          onChange={(e) => setAvailabilityDatesText(e.target.value)}
                          placeholder="dd/mm/yyyy"
                          className="min-h-24 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>

                      <div className="rounded-3xl border border-gray-200 bg-white p-4">
                        <div className="text-sm font-semibold text-gray-900">Location & time per date (optional)</div>
                        <div className="mt-1 text-xs text-gray-600">Optionally set a location and/or time window per date.</div>

                        {parsedAvailabilityDays.error ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            {parsedAvailabilityDays.error}
                          </div>
                        ) : null}

                        <div className="mt-3 grid gap-2">
                          {parsedAvailabilityDays.days.map((day) => {
                            const locValue = availabilityLocationByDay[day] || ''
                            const start = availabilityStartTimeByDay[day] || ''
                            const end = availabilityEndTimeByDay[day] || ''
                            return (
                              <div key={day} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                                <div className="text-sm font-medium text-gray-700">{formatDateOnlyFromISODate(day)}</div>

                                <select
                                  value={locValue}
                                  onChange={(e) => {
                                    const next = String(e.target.value || '')
                                    setAvailabilityLocationByDay((prev) => {
                                      const out = { ...(prev || {}) }
                                      if (!next) delete out[day]
                                      else out[day] = next
                                      return out
                                    })
                                  }}
                                  className="h-9 rounded-xl border border-gray-200 bg-white px-2 text-sm"
                                >
                                  <option value="">— location —</option>
                                  {locations.map((l: any) => (
                                    <option key={String(l.id)} value={String(l.id)}>
                                      {String(l.name || l.id)}
                                    </option>
                                  ))}
                                </select>

                                <input
                                  type="time"
                                  value={start}
                                  onChange={(e) => {
                                    const next = String(e.target.value || '')
                                    setAvailabilityStartTimeByDay((prev) => {
                                      const out = { ...(prev || {}) }
                                      if (!next) delete out[day]
                                      else out[day] = next
                                      return out
                                    })
                                  }}
                                  className="h-9 rounded-xl border border-gray-200 bg-white px-2 text-sm"
                                />

                                <input
                                  type="time"
                                  value={end}
                                  onChange={(e) => {
                                    const next = String(e.target.value || '')
                                    setAvailabilityEndTimeByDay((prev) => {
                                      const out = { ...(prev || {}) }
                                      if (!next) delete out[day]
                                      else out[day] = next
                                      return out
                                    })
                                  }}
                                  className="h-9 rounded-xl border border-gray-200 bg-white px-2 text-sm"
                                />
                              </div>
                            )
                          })}

                          {parsedAvailabilityDays.days.length === 0 && !parsedAvailabilityDays.error ? (
                            <div className="text-sm text-gray-600">Add at least 1 date first.</div>
                          ) : null}
                        </div>
                      </div>

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
                                    {allSelected ? 'Deselect all' : 'Select all'}
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
                            <div className="text-sm text-gray-600">No accepted users in roster for this program yet.</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={saveAvailabilityConfig}
                          disabled={savingAvailability}
                          className={`h-11 rounded-3xl px-8 text-sm font-semibold transition-colors ${
                            savingAvailability ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {savingAvailability ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="text-sm font-semibold text-gray-900">Overview</div>
                    <div className="mt-4 grid gap-3">
                      {availabilityRequestId ? (
                        availabilityOverview.map((d) => {
                          const total = d.rows.length
                          const availableCount = d.rows.filter((r) => String(r?.status || '').toLowerCase() === 'yes').length

                          return (
                            <div key={d.day} className="rounded-3xl border border-gray-200 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-gray-900">{formatDateOnlyFromISODate(String(d.day))}</div>
                                  {formatTimeWindow(d.start_time, d.end_time) ? (
                                    <div className="mt-0.5 text-xs text-gray-600">
                                      Time: <span className="font-semibold text-gray-900">{formatTimeWindow(d.start_time, d.end_time)}</span>
                                    </div>
                                  ) : null}
                                  {d.location_id ? (
                                    <div className="mt-0.5 text-xs text-gray-600">
                                      Location: <span className="font-semibold text-gray-900">{locationNameById[String(d.location_id)] || String(d.location_id)}</span>
                                    </div>
                                  ) : null}
                                  <div className="mt-0.5 text-xs text-gray-600">
                                    Available: <span className="font-semibold text-gray-900">{availableCount}</span>
                                    {total ? ` / ${total}` : ''}
                                  </div>
                                </div>
                              </div>

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
                                  <div className="text-sm text-gray-600">No users linked to this date.</div>
                                ) : null}
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="text-sm text-gray-600">No availability request configured yet.</div>
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
                    <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
                    <p className="mt-1 text-sm text-gray-600">Manage locations and link them to programs.</p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateLocationModal}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-3xl bg-blue-600 px-8 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </button>
                </div>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="text-sm font-semibold text-gray-900">All locations</div>
                  <div className="mt-4 grid gap-2">
                    {locations.map((l) => (
                      <div key={l.id} className="flex items-start justify-between gap-4 rounded-3xl border border-gray-200 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900">{l.name}</div>
                          {l.address ? <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{l.address}</div> : null}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <ActionIcon
                            title="Edit"
                            icon={Edit2}
                            variant="primary"
                            onClick={() => openEditLocationModal(l)}
                            aria-label="Edit"
                          />
                          <ActionIcon
                            title="Delete"
                            icon={Trash2}
                            variant="danger"
                            disabled={Boolean(deletingLocationId) && String(deletingLocationId) === String(l.id)}
                            onClick={() => deleteLocation(l)}
                            aria-label="Delete"
                          />
                        </div>
                      </div>
                    ))}

                    {locations.length === 0 ? <div className="text-sm text-gray-600">No locations yet.</div> : null}
                  </div>
                </div>
              </>
            ) : null}

            {active === 'applications' ? (
              <>
                <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
                <p className="mt-1 text-sm text-gray-600">Accept or reject applications.</p>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="grid gap-2">
                    {(() => {
                      if (!applications || applications.length === 0) return <div className="text-sm text-gray-600">No applications yet.</div>

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
                                <div className="text-xs text-gray-600">{group.length} application(s)</div>
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
                                      {saving ? 'Saving…' : 'Save'}
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
                                          <div className="text-xs text-gray-600">Program: {title}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="text-xs font-semibold text-gray-700">{String(stagedStatuses[String(a.id)] ?? a.status)}</div>
                                          <ActionIcon
                                            title="View details"
                                            icon={Eye}
                                            variant="muted"
                                            className="hover:text-blue-600"
                                            onClick={() => openMemberDetail(a)}
                                            aria-label="View details"
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
                                                Maybe
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
                <p className="mt-1 text-sm text-gray-600">Overview of all applications per performance.</p>

                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Performance</div>
                      <Select value={memberFilterPerformanceId} onChange={(e) => setMemberFilterPerformanceId(e.target.value)}>
                        <option value="">All performances</option>
                        {performances.map((p) => (
                          <option key={p.id} value={p.id}>{String(p.title || p.id)}</option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Status</div>
                      <Select value={memberFilterStatus} onChange={(e) => setMemberFilterStatus(e.target.value as any)}>
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                        <option value="maybe">Maybe</option>
                      </Select>
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Payment status</div>
                      <Select value={memberFilterPaid} onChange={(e) => setMemberFilterPaid(e.target.value as any)}>
                        <option value="all">All</option>
                        <option value="paid">Paid</option>
                        <option value="unpaid">Unpaid</option>
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
                          <th className="py-2 pr-4">Dancer</th>
                          <th className="py-2 pr-4">Applications</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {groupedMembers.map((g) => (
                          <tr key={g.userId} className="text-gray-800 align-top">
                            <td className="py-3 pr-4 font-semibold text-gray-900 whitespace-nowrap">{g.name}</td>
                            <td className="py-3 pr-4">
                              <div className="grid gap-2">
                                {g.rows
                                  .slice()
                                  .sort((a: any, b: any) => String(a.performance_id || '').localeCompare(String(b.performance_id || '')))
                                  .map((a: any) => {
                                    const perfTitle = performanceTitleById[String(a.performance_id)] || String(a.performance_id)
                                    const status = String(a.status || '')
                                    const paid = Boolean(a.paid)
                                    return (
                                      <div key={String(a.id)} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-gray-900 truncate">{perfTitle}</div>
                                          <div className="mt-0.5 text-xs text-gray-600">
                                            Status: <span className="font-semibold text-gray-800">{status}</span>
                                            {' • '}
                                            {paid ? (
                                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">Paid</span>
                                            ) : (
                                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Unpaid</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-2">
                                          <ActionIcon
                                            icon={Eye}
                                            variant="muted"
                                            className="hover:text-blue-600"
                                            title="View details"
                                            onClick={() => openMemberDetail(a)}
                                          />
                                          <ActionIcon icon={Trash2} variant="danger" title="Delete" onClick={() => openMemberDelete(a)} />
                                        </div>
                                      </div>
                                    )
                                  })}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {groupedMembers.length === 0 ? (
                          <tr>
                            <td className="py-4 text-gray-600" colSpan={2}>
                              No members yet.
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
