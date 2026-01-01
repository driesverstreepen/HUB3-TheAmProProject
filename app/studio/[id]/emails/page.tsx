"use client"

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { RichTextEditor } from '@/components/RichTextEditor'
import { Send, FileText, History, Copy, Edit3, Trash2 } from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears'

interface StudioEmail {
  id: string
  studio_id: string
  created_by: string
  subject: string
  body: string
  status: 'draft' | 'template' | 'sent'
  recipient_groups: string[]
  recipient_emails?: string[]
  sent_at: string | null
  created_at: string
  updated_at: string
}

const groupOptions = [
  { key: 'admins', label: 'Gekoppelde admins' },
  { key: 'teachers', label: 'Gekoppelde teachers' },
  { key: 'users', label: 'Ingeschreven users' },
]

export default function StudioEmailsPage() {
  const params = useParams<{ id: string }>()
  const studioId = params?.id
  const { selectedYearId: activeYearId, missingTable: schoolYearsMissing } = useStudioSchoolYears(studioId || '')

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  // no explicit loading UI; data boxes show empty-state quickly
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState<'draft'|'template'|null>(null)

  const [availableAdmins, setAvailableAdmins] = useState<Array<{id: string; email: string; first_name?: string; last_name?: string}>>([])
  const [availableTeachers, setAvailableTeachers] = useState<Array<{id: string; email: string; first_name?: string; last_name?: string}>>([])
  const [availableUsers, setAvailableUsers] = useState<Array<{id: string; email: string; first_name?: string; last_name?: string}>>([])
  const [toEmails, setToEmails] = useState<string[]>([])
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [bccEmails, setBccEmails] = useState<string[]>([])

  const [sendMode, setSendMode] = useState<'to'|'cc'|'bcc'>('to')
  const [featureEnabled, setFeatureEnabled] = useState<boolean>(true)

  

  const [drafts, setDrafts] = useState<StudioEmail[]>([])
  const [templates, setTemplates] = useState<StudioEmail[]>([])
  const [history, setHistory] = useState<StudioEmail[]>([])

  const canSend = useMemo(
    () => subject.trim().length > 0 && body.trim().length > 0 && (
      selectedGroups.length > 0 || toEmails.length > 0 || ccEmails.length > 0 || bccEmails.length > 0
    ),
    [subject, body, selectedGroups, toEmails, ccEmails, bccEmails]
  )

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!studioId) return
      if (!schoolYearsMissing && !activeYearId) return
      
      // Feature check
      try {
        const { data: studioRow } = await supabase
          .from('studios')
          .select('features')
          .eq('id', studioId)
          .maybeSingle()
        setFeatureEnabled(!!studioRow?.features?.emails)
      } catch {}

      try {
        const { data: draftsData } = await supabase
          .from('studio_emails')
          .select('*')
          .eq('studio_id', studioId)
          .eq('status', 'draft')
          .order('updated_at', { ascending: false })

        const { data: templatesData } = await supabase
          .from('studio_emails')
          .select('*')
          .eq('studio_id', studioId)
          .eq('status', 'template')
          .order('updated_at', { ascending: false })

        const { data: historyData } = await supabase
          .from('studio_emails')
          .select('*')
          .eq('studio_id', studioId)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })

        if (!mounted) return
        setDrafts(draftsData || [])
        setTemplates(templatesData || [])
        setHistory(historyData || [])
      } finally { /* noop */ }
    }
    load()
    // load available recipient lists for per-address selection
    const loadRecipients = async () => {
      try {
        if (!studioId) return
        if (!schoolYearsMissing && !activeYearId) return
        // Admins (user_roles -> user_profiles)
        const { data: adminMembers } = await supabase
          .from('studio_members')
          .select('user_id, role')
          .eq('studio_id', studioId)

        const adminIds = (adminMembers || [])
          .filter((r: any) => r && (r.role === 'owner' || r.role === 'admin'))
          .map((r: any) => r.user_id)
        if (adminIds.length) {
          const { data: adminProfiles } = await supabase
            .from('user_profiles')
            .select('user_id, email, first_name, last_name')
            .in('user_id', adminIds)
          setAvailableAdmins((adminProfiles || []).map((p: any) => ({ id: p.user_id, email: p.email, first_name: p.first_name, last_name: p.last_name })))
        }

        // Teachers (teacher_programs -> user_profiles)
        const { data: trows } = await supabase
          .from('teacher_programs')
          .select('teacher_id')
          .eq('studio_id', studioId)
        const teacherIds = Array.from(new Set((trows || []).map((r: any) => r.teacher_id)))
        if (teacherIds.length) {
          const { data: teacherProfiles } = await supabase
            .from('user_profiles')
            .select('user_id, email, first_name, last_name')
            .in('user_id', teacherIds)
          setAvailableTeachers((teacherProfiles || []).map((p: any) => ({ id: p.user_id, email: p.email, first_name: p.first_name, last_name: p.last_name })))
        }

        // Users (enrollments -> user_profiles)
        let programsQuery = supabase
          .from('programs')
          .select('id')
          .eq('studio_id', studioId)
        if (activeYearId) programsQuery = programsQuery.eq('school_year_id', activeYearId)

        const { data: programs } = await programsQuery
        const programIds = (programs || []).map((p: any) => p.id)
        if (programIds.length) {
          const { data: enrollments } = await supabase
            .from('inschrijvingen')
            .select('user_id')
            .in('program_id', programIds)
          const userIds = Array.from(new Set((enrollments || []).map((e: any) => e.user_id)))
          if (userIds.length) {
            const { data: userProfiles } = await supabase
              .from('user_profiles')
              .select('user_id, email, first_name, last_name')
              .in('user_id', userIds)
            setAvailableUsers((userProfiles || []).map((p: any) => ({ id: p.user_id, email: p.email, first_name: p.first_name, last_name: p.last_name })))
          }
        }
      } catch (err) {
        console.error('Error loading recipients lists', err)
      }
    }
    loadRecipients()
    return () => { mounted = false }
  }, [studioId, activeYearId, schoolYearsMissing])

  const resetEditor = () => {
    setSubject('')
    setBody('')
    setSelectedGroups([])
    setToEmails([])
    setCcEmails([])
    setBccEmails([])
  }

  const loadEmailIntoEditor = (email: StudioEmail) => {
    setSubject(email.subject || '')
    setBody(email.body || '')
    setSelectedGroups(email.recipient_groups || [])
    const rec = (email as any).recipient_emails || []
    setToEmails(rec)
    setCcEmails([])
    setBccEmails([])
  }

  const toggleGroup = (key: string) => {
    setSelectedGroups((prev) => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const isInCurrentList = (email: string) => {
    if (sendMode === 'to') return toEmails.includes(email)
    if (sendMode === 'cc') return ccEmails.includes(email)
    return bccEmails.includes(email)
  }

  const toggleInCurrentList = (email: string) => {
    if (sendMode === 'to') {
      setToEmails(prev => prev.includes(email) ? prev.filter(x => x !== email) : [...prev, email])
      return
    }
    if (sendMode === 'cc') {
      setCcEmails(prev => prev.includes(email) ? prev.filter(x => x !== email) : [...prev, email])
      return
    }
    setBccEmails(prev => prev.includes(email) ? prev.filter(x => x !== email) : [...prev, email])
  }

  const toggleSelectAllForCurrent = (ids: string[]) => {
    if (sendMode === 'to') {
      setToEmails(prev => ids.every(e => prev.includes(e)) ? prev.filter(x => !ids.includes(x)) : Array.from(new Set([...prev, ...ids])))
      return
    }
    if (sendMode === 'cc') {
      setCcEmails(prev => ids.every(e => prev.includes(e)) ? prev.filter(x => !ids.includes(x)) : Array.from(new Set([...prev, ...ids])))
      return
    }
    setBccEmails(prev => ids.every(e => prev.includes(e)) ? prev.filter(x => !ids.includes(x)) : Array.from(new Set([...prev, ...ids])))
  }

  const save = async (status: 'draft'|'template') => {
    if (!studioId) return
    setSaving(status)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const combined = Array.from(new Set([...toEmails, ...ccEmails, ...bccEmails]))
      await supabase.from('studio_emails').insert({
        studio_id: studioId,
        created_by: user.id,
        subject,
        body,
        status,
        recipient_groups: selectedGroups,
        recipient_emails: combined,
      })
      // reload lists
      const { data: list } = await supabase
        .from('studio_emails')
        .select('*')
        .eq('studio_id', studioId)
        .eq('status', status)
        .order('updated_at', { ascending: false })
      if (status === 'draft') setDrafts(list || [])
      if (status === 'template') setTemplates(list || [])
    } finally {
      setSaving(null)
    }
  }

  const send = async () => {
    if (!studioId || !canSend) return
    setSending(true)
    try {
      const payload: any = {
        subject,
        body,
        recipient_groups: selectedGroups,
        recipients: {
          to: toEmails,
          cc: ccEmails,
          bcc: bccEmails,
        }
      }
      const res = await fetch(`/api/studio/${studioId}/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        console.error('Send failed', await res.text())
      }
      // reload history and reset editor
      const { data: hist } = await supabase
        .from('studio_emails')
        .select('*')
        .eq('studio_id', studioId)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
      setHistory(hist || [])
      resetEditor()
    } finally {
      setSending(false)
    }
  }

  const remove = async (id: string) => {
    await supabase.from('studio_emails').delete().eq('id', id)
    setDrafts((d) => d.filter(x => x.id !== id))
    setTemplates((t) => t.filter(x => x.id !== id))
  }

  return (
    <FeatureGate flagKey="studio.emails" mode="page">
      <div className="max-w-6xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-4">E-mails</h1>

      {!featureEnabled && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            E-mails zijn uitgeschakeld voor deze studio. Ga naar Settings → Features om E-mails in te schakelen.
          </p>
        </div>
      )}

      {/* Compose */}
      {featureEnabled && (
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Opstellen</h2>

        <div className="mb-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">Onderwerp</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Onderwerp van de e-mail"
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div className="mb-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">Groepen</label>
          <div className="flex flex-wrap gap-2">
            {groupOptions.map((g) => (
              <button
                key={g.key}
                onClick={() => toggleGroup(g.key)}
                className={`px-3 py-1.5 rounded-full text-sm border ${selectedGroups.includes(g.key) ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recipient selection per individual when groups selected */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">Verzendmodus</label>
          <div className="flex items-center gap-3 mb-2">
            <label className="inline-flex items-center gap-2"><input type="radio" name="sendMode" value="to" checked={sendMode==='to'} onChange={() => setSendMode('to')} /> To</label>
            <label className="inline-flex items-center gap-2"><input type="radio" name="sendMode" value="cc" checked={sendMode==='cc'} onChange={() => setSendMode('cc')} /> CC</label>
            <label className="inline-flex items-center gap-2"><input type="radio" name="sendMode" value="bcc" checked={sendMode==='bcc'} onChange={() => setSendMode('bcc')} /> BCC</label>
          </div>

          {selectedGroups.includes('admins') && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">Gekoppelde admins</div>
                <button type="button" onClick={() => {
                  const ids = availableAdmins.map(a => a.email)
                  toggleSelectAllForCurrent(ids)
                }} className="text-xs text-blue-600">Selecteer alles</button>
              </div>
              <div className="max-h-40 overflow-auto border rounded p-2 bg-white">
                {availableAdmins.length === 0 ? <div className="text-xs text-slate-500">Geen admins gevonden.</div> : (
                  availableAdmins.map(a => (
                    <label key={a.id} className="flex items-center gap-2 text-sm py-1">
                      <input type="checkbox" checked={isInCurrentList(a.email)} onChange={() => toggleInCurrentList(a.email)} />
                      <span className="truncate">
                        <span className="font-medium">{[a.first_name, a.last_name].filter(Boolean).join(' ') || a.email}</span>
                        <span className="text-xs text-slate-500 ml-2">({a.email})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {selectedGroups.includes('teachers') && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">Gekoppelde teachers</div>
                <button type="button" onClick={() => {
                  const ids = availableTeachers.map(a => a.email)
                  toggleSelectAllForCurrent(ids)
                }} className="text-xs text-blue-600">Selecteer alles</button>
              </div>
              <div className="max-h-40 overflow-auto border rounded p-2 bg-white">
                {availableTeachers.length === 0 ? <div className="text-xs text-slate-500">Geen teachers gevonden.</div> : (
                  availableTeachers.map(a => (
                    <label key={a.id} className="flex items-center gap-2 text-sm py-1">
                      <input type="checkbox" checked={isInCurrentList(a.email)} onChange={() => toggleInCurrentList(a.email)} />
                      <span className="truncate">
                        <span className="font-medium">{[a.first_name, a.last_name].filter(Boolean).join(' ') || a.email}</span>
                        <span className="text-xs text-slate-500 ml-2">({a.email})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {selectedGroups.includes('users') && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">Ingeschreven users</div>
                <button type="button" onClick={() => {
                  const ids = availableUsers.map(a => a.email)
                  toggleSelectAllForCurrent(ids)
                }} className="text-xs text-blue-600">Selecteer alles</button>
              </div>
              <div className="max-h-40 overflow-auto border rounded p-2 bg-white">
                {availableUsers.length === 0 ? <div className="text-xs text-slate-500">Geen users gevonden.</div> : (
                  availableUsers.map(a => (
                    <label key={a.id} className="flex items-center gap-2 text-sm py-1">
                      <input type="checkbox" checked={isInCurrentList(a.email)} onChange={() => toggleInCurrentList(a.email)} />
                      <span className="truncate">
                        <span className="font-medium">{[a.first_name, a.last_name].filter(Boolean).join(' ') || a.email}</span>
                        <span className="text-xs text-slate-500 ml-2">({a.email})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mb-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">Doelgroepen</label>
          <div className="flex flex-wrap gap-2">
            {groupOptions.map((g) => (
              <button
                key={g.key}
                onClick={() => toggleGroup(g.key)}
                className={`px-3 py-1.5 rounded-full text-sm border ${selectedGroups.includes(g.key) ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">Inhoud</label>
          <RichTextEditor value={body} onChange={setBody} />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => save('draft')}
            disabled={saving !== null}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 hover:bg-slate-50"
          >
            {saving === 'draft' ? <LoadingSpinner size={16} label="Opslaan" indicatorClassName="border-b-slate-600" /> : null}
            <span>Opslaan als concept</span>
          </button>
          <button
            onClick={() => save('template')}
            disabled={saving !== null}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 hover:bg-slate-50"
          >
            {saving === 'template' ? <LoadingSpinner size={16} label="Opslaan" indicatorClassName="border-b-slate-600" /> : <FileText className="w-4 h-4"/>}
            <span>Opslaan als template</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={send}
            disabled={!canSend || sending}
            className={`btn-prominent ${canSend ? 'bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700' : 'bg-slate-300'} transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 w-auto`}
          >
            {sending ? <LoadingSpinner size={16} label="Versturen" indicatorClassName="border-b-white" /> : <Send className="w-4 h-4"/>}
            <span>Versturen</span>
          </button>
        </div>
      </div>
      )}

      {/* Drafts & Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-base font-semibold mb-2">Concepten</h3>
          {drafts.length === 0 ? (
            <p className="text-sm text-slate-500">Geen concepten.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {drafts.map(d => (
                <li key={d.id} className="py-2 flex items-center gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{d.subject}</div>
                    <div className="text-xs text-slate-500">{new Date(d.updated_at).toLocaleString()}</div>
                  </div>
                  <div className="flex-1"/>
                  <button onClick={() => loadEmailIntoEditor(d)} className="p-1 rounded hover:bg-slate-100" title="Bewerken"><Edit3 className="w-4 h-4"/></button>
                  <button onClick={() => remove(d.id)} className="p-1 rounded hover:bg-slate-100" title="Verwijderen"><Trash2 className="w-4 h-4 text-red-600"/></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-base font-semibold mb-2">Templates</h3>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-500">Geen templates.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {templates.map(t => (
                <li key={t.id} className="py-2 flex items-center gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.subject}</div>
                    <div className="text-xs text-slate-500">{new Date(t.updated_at).toLocaleString()}</div>
                  </div>
                  <div className="flex-1"/>
                  <button onClick={() => loadEmailIntoEditor(t)} className="p-1 rounded hover:bg-slate-100" title="Gebruik template"><Copy className="w-4 h-4"/></button>
                  <button onClick={() => remove(t.id)} className="p-1 rounded hover:bg-slate-100" title="Verwijderen"><Trash2 className="w-4 h-4 text-red-600"/></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <History className="w-4 h-4"/>
          <h3 className="text-base font-semibold">Verzendgeschiedenis</h3>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen verzonden e-mails.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.map(h => (
              <li key={h.id} className="py-2">
                <div className="flex items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{h.subject}</div>
                    <div className="text-xs text-slate-500">Verzonden op {h.sent_at ? new Date(h.sent_at).toLocaleString() : new Date(h.created_at).toLocaleString()} — naar: {(h.recipient_groups || []).join(', ')}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </FeatureGate>
  )
}
