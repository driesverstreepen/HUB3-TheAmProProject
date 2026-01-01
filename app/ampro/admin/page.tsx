'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, MessageSquare, ClipboardList, Users, Plus, MapPin, Edit2, Eye, FileText, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isAmproAdmin, parseAmproFormFields, type AmproFormField } from '@/lib/ampro'
import { useNotification } from '@/contexts/NotificationContext'
import { formatDateOnlyFromISODate } from '@/lib/formatting'
import SearchFilterBar from '@/components/SearchFilterBar'
import Modal from '@/components/Modal'
import ActionIcon from '@/components/ActionIcon'

type AdminSection = 'programmas' | 'forms' | 'notes' | 'applications' | 'members' | 'locations'

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
  const [updates, setUpdates] = useState<any[]>([])
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, { first_name?: string | null; last_name?: string | null }>>({})

  const [memberDetailOpen, setMemberDetailOpen] = useState(false)
  const [memberDetailApp, setMemberDetailApp] = useState<any | null>(null)
  const [memberDeleteOpen, setMemberDeleteOpen] = useState(false)
  const [memberDeleteApp, setMemberDeleteApp] = useState<any | null>(null)
  const [memberDeleteConfirm, setMemberDeleteConfirm] = useState('')

  const [programmaSearch, setProgrammaSearch] = useState('')
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
  const [saving, setSaving] = useState(false)

  const [newFormName, setNewFormName] = useState('')
  const [newFormFields, setNewFormFields] = useState<FormFieldDraft[]>([])
  const [savingForm, setSavingForm] = useState(false)

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
          .select('id,performance_id,user_id,status,submitted_at,answers_json,snapshot_json')
          .order('submitted_at', { ascending: false })
          .limit(200)
        if (appsResp.error) throw appsResp.error

        const updatesResp = await supabase
          .from('ampro_updates')
          .select('id,performance_id,title,body,visibility,created_at,updated_at')
          .order('created_at', { ascending: false })
          .limit(200)
        if (updatesResp.error) throw updatesResp.error

        const userIds = Array.from(
          new Set((appsResp.data || []).map((a: any) => String(a.user_id)).filter(Boolean)),
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
        'id,title,description,program_type,is_public,applications_open,application_deadline,created_at,rehearsal_period_start,rehearsal_period_end,performance_dates,region,location_id',
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
      .select('id,performance_id,user_id,status,submitted_at,answers_json,snapshot_json')
      .order('submitted_at', { ascending: false })
      .limit(200)
    if (!appsResp.error) setApplications(appsResp.data || [])

    const updatesResp = await supabase
      .from('ampro_updates')
      .select('id,performance_id,title,body,visibility,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!updatesResp.error) setUpdates(updatesResp.data || [])

    const userIds = Array.from(new Set((appsResp.data || []).map((a: any) => String(a.user_id)).filter(Boolean)))
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

      const { error } = await supabase
        .from('ampro_forms')
        .insert({ name: newFormName.trim(), fields_json: built })
      if (error) throw error

      setNewFormName('')
      setNewFormFields([])
      setFormModalOpen(false)
      await refresh()
      showSuccess('Form aangemaakt')
    } catch (e: any) {
      showError(e?.message || 'Kon form niet aanmaken')
    } finally {
      setSavingForm(false)
    }
  }

  async function setStatus(appId: string, status: 'pending' | 'accepted' | 'rejected' | 'maybe') {
    try {
      const { error } = await supabase.from('ampro_applications').update({ status }).eq('id', appId)
      if (error) throw error
      await refresh()

      showSuccess('Status aangepast')
    } catch (e: any) {
      showError(e?.message || 'Status aanpassen mislukt')
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-slate-200 bg-white">
          <div className="px-5 py-5">
            <div className="text-sm font-semibold text-slate-900">The AmProProject</div>
            <div className="text-xs text-slate-600">Admin</div>
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
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ' +
                      (isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50')
                    }
                  >
                    <Icon className={isActive ? 'h-4 w-4 text-blue-700' : 'h-4 w-4 text-slate-500'} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="px-5 pb-5">
            <Link href="/ampro" className="text-sm font-semibold text-slate-900">
              ← Terug
            </Link>
          </div>
        </div>
      </div>

      <div className="md:pl-64">
        <main className="p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            <div className="md:hidden mb-4 rounded-xl border border-slate-200 bg-white p-2">
              <div className="flex gap-2 overflow-x-auto">
                {sidebarItems.map((item) => {
                  const isActive = active === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActive(item.key)}
                      className={
                        'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ' +
                        (isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700')
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
              <h2 className="text-xl font-bold text-slate-900">{editingProgrammaId ? 'Programma bewerken' : 'Nieuw programma'}</h2>
              <p className="mt-1 text-sm text-slate-600">Vul de velden in.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Type programma
                  <select
                    value={newProgramType}
                    onChange={(e) => setNewProgramType(e.target.value as any)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="performance">Performance</option>
                    <option value="workshop">Workshop</option>
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Locatie
                  <select
                    value={newLocationId}
                    onChange={(e) => setNewLocationId(e.target.value)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">Geen locatie</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Titel
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Titel"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Beschrijving
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Beschrijving (optioneel)"
                    className="min-h-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Regio
                    <input
                      value={newRegion}
                      onChange={(e) => setNewRegion(e.target.value)}
                      placeholder="Regio"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    />
                  </label>

                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Deadline
                    <input
                      value={newApplicationDeadline}
                      onChange={(e) => setNewApplicationDeadline(e.target.value)}
                      placeholder="dd/mm/jjjj"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Formulier (voor inschrijving)
                  <select
                    value={newFormId}
                    onChange={(e) => setNewFormId(e.target.value)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
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
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Repetitie start
                    <input
                      value={newRehearsalStart}
                      onChange={(e) => setNewRehearsalStart(e.target.value)}
                      placeholder="dd/mm/jjjj"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Repetitie einde
                    <input
                      value={newRehearsalEnd}
                      onChange={(e) => setNewRehearsalEnd(e.target.value)}
                      placeholder="dd/mm/jjjj"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Data (meerdere toegestaan)
                  <textarea
                    value={newPerformanceDates}
                    onChange={(e) => setNewPerformanceDates(e.target.value)}
                    placeholder="dd/mm/jjjj (1 per lijn of komma gescheiden)"
                    className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={newIsPublic}
                      onChange={(e) => setNewIsPublic(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Publiek zichtbaar
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={newApplicationsOpen}
                      onChange={(e) => setNewApplicationsOpen(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Inschrijvingen open
                  </label>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setProgrammaModalOpen(false)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={saveProgramma}
                    disabled={saving}
                    className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
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
              onClose={() => setFormModalOpen(false)}
              ariaLabel="Nieuwe form"
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-xl font-bold text-slate-900">Nieuwe form</h2>
              <p className="mt-1 text-sm text-slate-600">Maak een inschrijfformulier voor een programma.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Naam
                  <input
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder="Naam"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  />
                </label>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Velden</div>
                    <button
                      type="button"
                      onClick={() => setNewFormFields((prev) => [...prev, makeEmptyFieldDraft()])}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      Veld toevoegen
                    </button>
                  </div>

                  {newFormFields.length === 0 ? (
                    <div className="mt-3 text-sm text-slate-600">Nog geen velden. Klik op “Veld toevoegen”.</div>
                  ) : null}

                  <div className="mt-4 grid gap-3">
                    {newFormFields.map((field, idx) => {
                      const showPlaceholder = field.type === 'text' || field.type === 'textarea' || field.type === 'date'
                      const isSelect = field.type === 'select'

                      return (
                        <div key={field.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-900">Veld {idx + 1}</div>
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
                              <label className="grid gap-1 text-sm font-medium text-slate-700">
                                Label
                                <input
                                  value={field.label}
                                  onChange={(e) => {
                                    const nextLabel = e.target.value
                                    setNewFormFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, label: nextLabel } : f)))
                                  }}
                                  placeholder="bv. Ervaring"
                                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                                />
                              </label>

                              <div className="grid gap-1 text-sm font-medium text-slate-700">
                                Key
                                <div className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm flex items-center text-slate-600">
                                  Automatisch
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <label className="grid gap-1 text-sm font-medium text-slate-700">
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
                                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                                >
                                  <option value="text">Tekst</option>
                                  <option value="textarea">Tekstvak (groot)</option>
                                  <option value="date">Datum</option>
                                  <option value="select">Keuzelijst</option>
                                  <option value="checkbox">Checkbox</option>
                                </select>
                              </label>

                              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 mt-7">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(e) =>
                                    setNewFormFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, required: e.target.checked } : f)))
                                  }
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                Verplicht
                              </label>
                            </div>

                            {showPlaceholder ? (
                              <label className="grid gap-1 text-sm font-medium text-slate-700">
                                Placeholder (optioneel)
                                <input
                                  value={field.placeholder}
                                  onChange={(e) =>
                                    setNewFormFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, placeholder: e.target.value } : f)))
                                  }
                                  placeholder="Tekst in het veld…"
                                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                                />
                              </label>
                            ) : null}

                            {isSelect ? (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-slate-900">Opties</div>
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
                                    className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                                  >
                                    + optie
                                  </button>
                                </div>

                                <div className="mt-3 grid gap-2">
                                  {(field.options || []).map((opt) => (
                                    <div key={opt.id} className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-2 items-end">
                                      <label className="grid gap-1 text-sm font-medium text-slate-700">
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
                                          className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-sm font-medium text-slate-700">
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
                                          className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
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
                                        className="h-11 rounded-lg px-3 text-sm font-semibold bg-white border border-slate-200 text-slate-900 hover:bg-slate-50"
                                      >
                                        Verwijder
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 text-xs text-slate-600">Laat “Value” leeg om automatisch af te leiden uit het label.</div>
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
                    onClick={() => setFormModalOpen(false)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={createForm}
                    disabled={savingForm}
                    className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                      savingForm ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {savingForm ? 'Opslaan…' : 'Aanmaken'}
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={noteModalOpen}
              onClose={() => setNoteModalOpen(false)}
              ariaLabel="Nieuwe note"
              contentStyle={{ maxWidth: 760 }}
            >
              <h2 className="text-xl font-bold text-slate-900">Nieuwe note</h2>
              <p className="mt-1 text-sm text-slate-600">Note wordt zichtbaar voor geaccepteerde users.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Programma
                  <select
                    value={newUpdatePerformanceId}
                    onChange={(e) => setNewUpdatePerformanceId(e.target.value)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">Kies een programma</option>
                    {performances.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Titel
                  <input
                    value={newUpdateTitle}
                    onChange={(e) => setNewUpdateTitle(e.target.value)}
                    placeholder="Titel"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Inhoud
                  <textarea
                    value={newUpdateBody}
                    onChange={(e) => setNewUpdateBody(e.target.value)}
                    placeholder="Inhoud"
                    className="min-h-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNoteModalOpen(false)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={createUpdate}
                    disabled={savingUpdate}
                    className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
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
              <h2 className="text-xl font-bold text-slate-900">{editingLocationId ? 'Locatie bewerken' : 'Nieuwe locatie'}</h2>
              <p className="mt-1 text-sm text-slate-600">Voeg een locatie toe die je kan koppelen aan programma’s.</p>

              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Naam
                  <input
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="Naam"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Adres
                  <textarea
                    value={newLocationAddress}
                    onChange={(e) => setNewLocationAddress(e.target.value)}
                    placeholder="Adres (optioneel)"
                    className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLocationModalOpen(false)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={saveLocation}
                    disabled={savingLocation}
                    className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
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
                          <h2 className="text-xl font-bold text-slate-900">User gegevens</h2>
                        </div>

                        <div>
                          <div className="text-sm font-semibold text-slate-900">{name}</div>
                          <div className="mt-1 text-sm text-slate-600">Voorstelling: {perfTitle}</div>
                          <div className="mt-1 text-xs text-slate-500">Status: {String(memberDetailApp.status || '')}</div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="text-sm font-semibold text-slate-900">User gegevens</div>
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {formattedSnapshotRows.map((r) => (
                              <div key={r.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="text-xs font-semibold text-slate-600">{r.label}</div>
                                <div className="mt-1 text-sm font-semibold text-slate-900 break-words">{r.value || '-'}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="text-sm font-semibold text-slate-900">Form gegevens</div>
                          <div className="mt-1 text-sm text-slate-600">{formRow?.name || 'Geen form gekoppeld'}</div>

                          {formFields.length ? (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {formFields.map((f) => (
                                <div key={f.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <div className="text-xs font-semibold text-slate-600">{f.label}</div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900 break-words">
                                    {formatAnswer(f, (answers as any)[f.key]) || '-'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-slate-600">Geen form velden gevonden.</div>
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
                          <h2 className="text-xl font-bold text-slate-900">Member verwijderen</h2>
                          <p className="mt-1 text-sm text-slate-600">Deze actie kan je niet ongedaan maken.</p>
                        </div>

                        <p className="text-sm text-slate-700">
                          Je staat op het punt om de inschrijving te verwijderen voor <span className="font-semibold">{name}</span> ({perfTitle}).
                        </p>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm font-semibold text-slate-900">Typ DELETE om te bevestigen</div>
                          <input
                            value={memberDeleteConfirm}
                            onChange={(e) => setMemberDeleteConfirm(e.target.value)}
                            className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                            placeholder="DELETE"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setMemberDeleteOpen(false)}
                            className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900"
                          >
                            Annuleren
                          </button>
                          <button
                            type="button"
                            disabled={!canDelete}
                            onClick={deleteMemberApplication}
                            className="h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <h1 className="text-2xl font-bold text-slate-900">Programma’s</h1>
                    <p className="mt-1 text-sm text-slate-600">Beheer programma’s (performances & workshops).</p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateProgrammaModal}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
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

                  <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <div className="text-sm font-semibold text-slate-900">Alle programma’s</div>
                    <div className="mt-4 grid gap-2">
                      {filteredProgrammas.map((p) => {
                        const type = String(p?.program_type || '').toLowerCase()
                        const typeLabel = type === 'workshop' ? 'Workshop' : 'Voorstelling'
                        const locationName = p?.location_id ? locationNameById[String(p.location_id)] : ''

                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="text-sm font-semibold text-slate-900 truncate">{p.title}</div>
                                <span className="shrink-0 inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                                  {typeLabel}
                                </span>
                              </div>

                              <div className="mt-1 text-xs text-slate-600">
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
                                title="Bewerk"
                                icon={Edit2}
                                variant="primary"
                                onClick={() => openEditProgrammaModal(p)}
                                aria-label="Bewerk"
                              />
                              <ActionIcon
                                title="Weergeven"
                                icon={Eye}
                                onClick={() => router.push(`/ampro/programmas/${encodeURIComponent(p.id)}`)}
                                aria-label="Weergeven"
                              />
                            </div>
                          </div>
                        )
                      })}

                      {filteredProgrammas.length === 0 ? (
                        <div className="text-sm text-slate-600">Geen programma’s gevonden.</div>
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
                    <h1 className="text-2xl font-bold text-slate-900">Forms</h1>
                    <p className="mt-1 text-sm text-slate-600">Maak en beheer inschrijfformulieren.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFormName('')
                      setNewFormFields([makeEmptyFieldDraft()])
                      setFormModalOpen(true)
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Nieuwe form
                  </button>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="text-sm font-semibold text-slate-900">Gemaakte forms</div>
                  <div className="mt-4 grid gap-2">
                    {forms.map((f) => {
                      const count = Array.isArray((f as any)?.fields_json) ? ((f as any).fields_json as any[]).length : 0
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">{f.name}</div>
                            <div className="mt-1 text-xs text-slate-600">Velden: {count}</div>
                          </div>
                          <div className="text-xs text-slate-500 shrink-0">{String(f.id)}</div>
                        </div>
                      )
                    })}

                    {forms.length === 0 ? <div className="text-sm text-slate-600">Nog geen forms.</div> : null}
                  </div>
                </div>
              </>
            ) : null}

            {active === 'notes' ? (
              <>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Notes</h1>
                    <p className="mt-1 text-sm text-slate-600">Toon informatie aan ingeschreven (accepted) users.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNoteModalOpen(true)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
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
                        <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                          <div className="text-sm font-semibold text-slate-900">{p.title}</div>
                          <div className="mt-4 grid gap-2">
                            {notes.map((u: any) => (
                              <div key={u.id} className="rounded-xl border border-slate-200 p-4">
                                <div className="mt-1 text-sm font-semibold text-slate-900">{u.title}</div>
                                <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{u.body}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}

                  {unknownProgramUpdates.length ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6">
                      <div className="text-sm font-semibold text-slate-900">Onbekend programma</div>
                      <div className="mt-4 grid gap-2">
                        {unknownProgramUpdates.map((u: any) => (
                          <div key={u.id} className="rounded-xl border border-slate-200 p-4">
                            <div className="text-xs text-slate-500">{String(u.performance_id || '')}</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">{u.title}</div>
                            <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{u.body}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {updates.length === 0 ? <div className="text-sm text-slate-600">Nog geen notes.</div> : null}
                </div>
              </>
            ) : null}

            {active === 'locations' ? (
              <>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Locaties</h1>
                    <p className="mt-1 text-sm text-slate-600">Beheer locaties en koppel ze aan programma’s.</p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateLocationModal}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Nieuwe locatie
                  </button>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="text-sm font-semibold text-slate-900">Alle locaties</div>
                  <div className="mt-4 grid gap-2">
                    {locations.map((l) => (
                      <div key={l.id} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">{l.name}</div>
                          {l.address ? <div className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{l.address}</div> : null}
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

                    {locations.length === 0 ? <div className="text-sm text-slate-600">Nog geen locaties.</div> : null}
                  </div>
                </div>
              </>
            ) : null}

            {active === 'applications' ? (
              <>
                <h1 className="text-2xl font-bold text-slate-900">Applicaties</h1>
                <p className="mt-1 text-sm text-slate-600">Accepteer of wijs inschrijvingen af.</p>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="grid gap-2">
                    {applications.map((a) => {
                      const userId = String(a.user_id)
                      const profile = profilesByUserId[userId]
                      const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userId

                      return (
                        <div key={a.id} className="grid gap-2 rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900 truncate">{name}</div>
                              <div className="text-xs text-slate-600">
                                Programma: {performanceTitleById[String(a.performance_id)] || String(a.performance_id)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-semibold text-slate-700">{String(a.status)}</div>
                              <ActionIcon
                                title="Bekijk gegevens"
                                icon={Eye}
                                variant="primary"
                                onClick={() => openMemberDetail(a)}
                                aria-label="Bekijk gegevens"
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setStatus(a.id, 'accepted')}
                              className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => setStatus(a.id, 'maybe')}
                              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900"
                            >
                              Twijfel
                            </button>
                            <button
                              onClick={() => setStatus(a.id, 'rejected')}
                              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {applications.length === 0 ? <div className="text-sm text-slate-600">Nog geen inschrijvingen.</div> : null}
                  </div>
                </div>
              </>
            ) : null}

            {active === 'members' ? (
              <>
                <h1 className="text-2xl font-bold text-slate-900">Members</h1>
                <p className="mt-1 text-sm text-slate-600">Overzicht van alle inschrijvingen per voorstelling.</p>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold text-slate-600">
                          <th className="py-2 pr-4">Danser</th>
                          <th className="py-2 pr-4">Voorstelling</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {applications.map((a) => {
                          const userId = String(a.user_id)
                          const profile = profilesByUserId[userId]
                          const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userId
                          const perfTitle = performanceTitleById[String(a.performance_id)] || String(a.performance_id)

                          return (
                            <tr key={a.id} className="text-slate-800">
                              <td className="py-3 pr-4 font-semibold text-slate-900">{name}</td>
                              <td className="py-3 pr-4">{perfTitle}</td>
                              <td className="py-3 pr-4">{String(a.status)}</td>
                              <td className="py-3 pr-4">
                                <div className="flex items-center justify-end gap-2">
                                  <ActionIcon
                                    icon={Eye}
                                    variant="primary"
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
                        {applications.length === 0 ? (
                          <tr>
                            <td className="py-4 text-slate-600" colSpan={4}>
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
