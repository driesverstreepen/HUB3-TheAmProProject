"use client"

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
// (removed unused empty import from lucide-react to avoid TSX/parse issues)
import { useNotification } from '@/contexts/NotificationContext'
import { supabase } from '@/lib/supabase'
import Select from '@/components/Select'
import LessonCard from '@/components/LessonCard'
import ApprovedReplacementCard from '@/components/ApprovedReplacementCard'
import { FeatureGate } from '@/components/FeatureGate'
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears'

export default function ReplacementsAdminPage() {
  const params = useParams()
  const studioId = params.id as string
  const { selectedYearId: activeYearId, missingTable: schoolYearsMissing } = useStudioSchoolYears(studioId)
  const [requests, setRequests] = useState<any[]>([])
  const [approved, setApproved] = useState<any[]>([])
  const [programTitles, setProgramTitles] = useState<Record<string, string>>({})
  const [locationNames, setLocationNames] = useState<Record<string, string>>({})
  const [teacherOptionsByProgram, setTeacherOptionsByProgram] = useState<Record<string, Array<any>>>({})
  const [selectedForRequest, setSelectedForRequest] = useState<Record<string, string>>({})
  const [editingTeacherForRequest, setEditingTeacherForRequest] = useState<Record<string, boolean>>({})
  const [teacherProfileCache, setTeacherProfileCache] = useState<Record<string, any>>({})
  const [isStudioAdmin, setIsStudioAdmin] = useState(false)
  const { showSuccess, showError } = useNotification()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studioId) return
    if (!schoolYearsMissing && !activeYearId) return
    load()
    // detect if current user is studio_admin for this studio
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const userId = (user as any)?.id
        if (userId) {
          const { data: memberRow } = await supabase
            .from('studio_members')
            .select('role')
            .eq('user_id', userId)
            .eq('studio_id', studioId)
            .maybeSingle()
          const role = (memberRow as any)?.role
          if (role === 'owner' || role === 'admin') setIsStudioAdmin(true)
        }
      } catch (e) {
        console.warn('Could not determine role', e)
      }
    })()
  }, [studioId, activeYearId, schoolYearsMissing])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      // include bearer token so server-side API can authenticate via Supabase
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      if (!token) throw new Error('Not authenticated')

      const yearParam = activeYearId ? `&schoolYearId=${encodeURIComponent(activeYearId)}` : ''
      const res = await fetch(`/api/studio/${studioId}/replacement-requests?status=pending${yearParam}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        if (res.status === 401) throw new Error('Niet ingelogd. Log opnieuw in en probeer opnieuw.')
        if (res.status === 403) throw new Error('Je hebt geen toegang tot vervangingsaanvragen voor deze studio.')
        throw new Error(`Failed to load (${res.status})`)
      }
      const json = await res.json()
      const pendingRows = json.data || []

      // fetch approved requests as well for the overview
      let approvedRows: any[] = []

      try {
        const res2 = await fetch(`/api/studio/${studioId}/replacement-requests?status=approved${yearParam}`, { headers: { Authorization: `Bearer ${token}` } })
        if (res2.ok) {
          const j2 = await res2.json()
          approvedRows = j2.data || []
        }
      } catch (e) {
        console.warn('Failed to load approved requests', e)
      }

      // Determine which program IDs belong to the active school year (if enabled)
      const allRows = [...pendingRows, ...approvedRows]
      const allProgramIds = Array.from(
        new Set(allRows.map((r: any) => (r.program_id || (r.lessons && r.lessons.program_id) || null)).filter(Boolean))
      )

      let allowedProgramIds: Set<string> | null = null
      let programsForMap: any[] = []
      if (allProgramIds.length > 0) {
        try {
          const { data: progs } = await supabase
            .from('programs')
            .select('id, title, school_year_id')
            .in('id', allProgramIds)
          programsForMap = progs || []
          if (activeYearId) {
            allowedProgramIds = new Set(
              (programsForMap || [])
                .filter((p: any) => String(p.school_year_id || '') === String(activeYearId))
                .map((p: any) => String(p.id))
            )
          }
        } catch (e) {
          console.warn('Failed to load programs for replacements school year filter', e)
        }
      }

      const filterByYear = (rows: any[]) => {
        if (!allowedProgramIds) return rows
        return (rows || []).filter((r: any) => {
          const pid = r.program_id || (r.lessons && r.lessons.program_id) || null
          return pid && allowedProgramIds!.has(String(pid))
        })
      }

      const rows = filterByYear(pendingRows)
      const approvedFiltered = filterByYear(approvedRows)
      setRequests(rows)
      setApproved(approvedFiltered)

      // collect location_ids from approved lessons and fetch human-readable names
      try {
        const locIds = Array.from(new Set(approvedFiltered.map((a: any) => a.lessons && (a.lessons.location_id || a.lessons.location_id)).filter(Boolean)))
        if (locIds.length > 0) {
          const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)
          const map: Record<string, string> = {}
          ;(locs || []).forEach((l: any) => { if (l && l.id) map[String(l.id)] = l.name })
          setLocationNames(map)
        }
      } catch (e) {
        console.warn('Failed to load location names for approved requests', e)
      }

      // Fetch program titles and teacher options for these requests
      const progIds = Array.from(new Set(rows.map((r: any) => (r.program_id || (r.lessons && r.lessons.program_id) || null)).filter(Boolean)))
      if (progIds.length > 0) {
        try {
          const progs = programsForMap.length
            ? programsForMap.filter((p: any) => progIds.includes(String(p.id)))
            : (await supabase.from('programs').select('id, title').in('id', progIds)).data
          const titles: Record<string, string> = {} as Record<string, string>
          (progs || []).forEach((p: any) => { titles[String(p.id)] = p.title })
          setProgramTitles(titles)

          // fetch teacher_programs for these programs
          const { data: tps } = await supabase.from('teacher_programs').select('teacher_id, program_id').in('program_id', progIds)
          const teacherIds = Array.from(new Set((tps || []).map((t:any) => t.teacher_id))).filter(Boolean)

          // Also fetch studio-teacher links from the `studio_teachers` junction table so we include all studio teachers
          const { data: studioLinks } = await supabase.from('studio_teachers').select('user_id').eq('studio_id', studioId)
          const studioTeacherIds = Array.from(new Set((studioLinks || []).map((r:any) => r.user_id))).filter(Boolean)

          const allTeacherIds = Array.from(new Set([...(teacherIds || []), ...(studioTeacherIds || [])])).filter(Boolean)

          // Build a clear set of teacher IDs to display in dropdowns.
          // We want: all teachers linked to the program (teacher_programs) + all studio-level teachers (user_roles),
          // but exclude the currently signed-in user so studio-admins don't assign themselves.
          const { data: { user: me } } = await supabase.auth.getUser()
          const currentUserId = (me as any)?.id

          const teacherIdsFromTps = Array.from(new Set((tps || []).map((t:any) => t.teacher_id))).filter(Boolean)
          const studioTeacherIdsList = Array.from(new Set((studioTeacherIds || []).map((r:any) => String(r)))).filter(Boolean)

          const displaySet = new Set<string>([...teacherIdsFromTps.map(String), ...studioTeacherIdsList.map(String)])
          if (currentUserId) displaySet.delete(String(currentUserId))
          const displayTeacherIds = Array.from(displaySet)

          // Fetch profiles for the display set (so dropdowns can show names). We'll fetch chosen_internal_teacher_id profiles later if needed.
          let profiles: any[] = []
          if (displayTeacherIds.length > 0) {
            const { data: profs } = await supabase.from('user_profiles').select('user_id, first_name, last_name, email').in('user_id', displayTeacherIds)
            profiles = profs || []
          }

          // Build a map for quick lookups
          const profilesMap: Record<string, any> = {}
          ;(profiles || []).forEach((p: any) => { if (p && p.user_id) profilesMap[String(p.user_id)] = p })

          const byProg: Record<string, any[]> = {} as Record<string, any[]>;
          // Start with program-linked teachers (may have undefined profile if not fetched)
          (tps || []).forEach((t: any) => {
            if (!byProg[t.program_id]) byProg[t.program_id] = []
            byProg[t.program_id].push({ teacher_id: t.teacher_id, profile: profilesMap[String(t.teacher_id)] })
          })

          // Ensure every program has studio-level teachers available as well (avoid duplicates)
          Object.keys(byProg).forEach((pid) => {
            const existingIdsArr = byProg[pid].map((o:any) => String(o.teacher_id));
            const existingIds = new Set(existingIdsArr);
            ;(studioTeacherIdsList || []).forEach((stId: any) => {
              if (String(stId) === String(currentUserId)) return
              if (!existingIds.has(String(stId))) {
                byProg[pid].push({ teacher_id: stId, profile: profilesMap[String(stId)] })
              }
            })
          })

          // Also ensure that programs with no teacher_programs still get studio teachers as options
          progIds.forEach((pid: any) => {
            if (!byProg[pid]) {
              byProg[pid] = []
              ;(studioTeacherIdsList || []).forEach((stId: any) => {
                if (String(stId) === String(currentUserId)) return
                byProg[pid].push({ teacher_id: stId, profile: profilesMap[String(stId)] })
              })
            }
          })

          setTeacherOptionsByProgram(byProg)

          // populate a quick lookup cache of profiles by user_id for display fallbacks
          const cache: Record<string, any> = { ...profilesMap }
          setTeacherProfileCache(cache)

          // Also fetch any chosen_internal_teacher_id present on the requests that we didn't already load
          const chosenIds = Array.from(new Set(rows.map((rr: any) => rr.chosen_internal_teacher_id).filter(Boolean)))
          const missingChosen = chosenIds.filter((id: any) => !cache[String(id)])
          if (missingChosen.length > 0) {
            try {
              const { data: extra } = await supabase.from('user_profiles').select('user_id, first_name, last_name, email').in('user_id', missingChosen)
              ;(extra || []).forEach((p: any) => { if (p && p.user_id) cache[String(p.user_id)] = p })
              setTeacherProfileCache({ ...cache })
            } catch (e) {
              console.warn('Failed to load chosen teacher profiles', e)
            }
          }
        } catch (e) {
          console.warn('Failed to load program/teacher data', e)
        }
      }
    } catch (e: any) {
      console.error('Failed loading requests', e)
      setError(e?.message || 'Fout bij laden')
    } finally {
      setLoading(false)
    }
  }

  const doAction = async (id: string, action: 'approve' | 'decline' | 'cancel', opts?: { chosen_internal_teacher_id?: string }) => {
    setActionLoading(s => ({ ...s, [id]: true }))
    setError(null)
    try {
      if (action === 'approve' || action === 'decline') {
        const body: any = { action }
        if (opts?.chosen_internal_teacher_id) body.chosen_internal_teacher_id = opts.chosen_internal_teacher_id
        // include bearer token like load() does so server-side can authenticate reliably
        const { data: { session } } = await supabase.auth.getSession()
        const token = (session as any)?.access_token
        const res = await fetch(`/api/studio/${studioId}/replacement-requests/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(body)
        })
        if (!res.ok) throw new Error(`Actie mislukt (${res.status})`)
        const json = await res.json()
        // update local state
        setRequests(prev => prev.filter(r => String(r.id) !== String(id)))
        // show toast
        try {
          const req = requests.find(q => String(q.id) === String(id))
          let teacherName = ''
          if (opts?.chosen_internal_teacher_id && req) {
            const progId = req.program_id || (req.lessons && req.lessons.program_id)
            const optsList = progId ? (teacherOptionsByProgram[progId] || []) : []
            const sel = optsList.find((o:any) => String(o.teacher_id) === String(opts.chosen_internal_teacher_id))
            if (sel) teacherName = (sel.profile && (sel.profile.first_name || sel.profile.last_name)) ? `${sel.profile.first_name || ''} ${sel.profile.last_name || ''}`.trim() : sel.profile?.email || sel.teacher_id
          }
          if (action === 'approve') showSuccess(`Aanvraag goedgekeurd${teacherName ? ` — docent: ${teacherName}` : ''}`)
          else if (action === 'decline') showSuccess('Aanvraag afgewezen')
        } catch (e) {
          // ignore toast lookup errors
        }
        return json
      }

      if (action === 'cancel') {
  const { data: { session } } = await supabase.auth.getSession()
  const token = (session as any)?.access_token
  const res = await fetch(`/api/studio/${studioId}/replacement-requests/${id}`, { method: 'DELETE', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  if (!res.ok) throw new Error(`Verwijderen mislukt (${res.status})`)
  setRequests(prev => prev.filter(r => String(r.id) !== String(id)))
  showSuccess('Aanvraag verwijderd')
  return { success: true }
      }
    } catch (e: any) {
      console.error('Action failed', e)
      setError(e?.message || 'Actie mislukt')
      showError(e?.message || 'Actie mislukt')
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }))
    }
  }

  return (
    <FeatureGate flagKey="studio.replacements" mode="page">
      <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Vervangingen</h1>
          <p className="text-sm text-slate-600">Beheer openstaande en afgeronde vervangingen voor deze studio</p>
        </div>
        <div>
          {/* Ververs knop verwijderd — refresh via page reload or realtime notificaties */}
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: pending requests */}
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Openstaande aanvragen</h2>
          <div className="space-y-3">
            {requests.length === 0 ? (
              <div className="text-sm text-slate-600">Geen openstaande aanvragen.</div>
            ) : (
              requests.map((r: any) => {
                const requester = r.requested_by_profile && (Array.isArray(r.requested_by_profile) ? r.requested_by_profile[0] : r.requested_by_profile) || null
                const progId = r.program_id || (r.lessons && r.lessons.program_id)
                const opts = progId ? teacherOptionsByProgram[progId] || [] : []
                const currentTeacher = (r.lessons && (r.lessons as any).teacher_profile) ? (r.lessons as any).teacher_profile : null
                const chosenTeacher = opts.find((o:any) => String(o.teacher_id) === String(r.chosen_internal_teacher_id))
                const cachedProfile = r.chosen_internal_teacher_id ? teacherProfileCache[String(r.chosen_internal_teacher_id)] : null
                const chosenTeacherName = chosenTeacher ? ((chosenTeacher.profile && (chosenTeacher.profile.first_name || chosenTeacher.profile.last_name)) ? `${chosenTeacher.profile.first_name || ''} ${chosenTeacher.profile.last_name || ''}`.trim() : chosenTeacher.profile?.email || chosenTeacher.teacher_id) : (cachedProfile ? (`${cachedProfile.first_name || ''} ${cachedProfile.last_name || ''}`.trim() || cachedProfile.email) : null)
                return (
                  <div key={r.id} className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{r.lessons?.title || '—'}</div>
                        <div className="text-sm text-slate-600">Aangevraagd door: {requester ? `${requester.first_name || ''} ${requester.last_name || ''}`.trim() || requester.email : r.requested_by}</div>
                        <div className="text-sm text-slate-600">Programma: {programTitles[String(r.program_id || (r.lessons && r.lessons.program_id))] || '—'}</div>
                        {r.notes ? <div className="text-sm text-slate-600 mt-1">Opmerking: {r.notes}</div> : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-xs text-slate-500">{new Date(r.requested_at).toLocaleString('nl-NL')}</div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const progId = r.program_id || (r.lessons && r.lessons.program_id)
                            const opts = progId ? teacherOptionsByProgram[progId] || [] : []
                            const currentTeacher = (r.lessons && (r.lessons as any).teacher_profile) ? (r.lessons as any).teacher_profile : null
                            if (currentTeacher) {
                              const editing = !!editingTeacherForRequest[r.id]
                              return (
                                <div className="flex items-center gap-2">
                                  {!editing ? (
                                    <div className="text-sm text-slate-700">Interne docent: {(currentTeacher.first_name || currentTeacher.last_name) ? `${currentTeacher.first_name || ''} ${currentTeacher.last_name || ''}`.trim() : currentTeacher.email}</div>
                                  ) : (
                                    <Select className="w-44" value={selectedForRequest[r.id] || r.chosen_internal_teacher_id || (currentTeacher.user_id || currentTeacher.userId || '')} onChange={(e) => setSelectedForRequest(s => ({ ...s, [r.id]: e.target.value }))}>
                                      <option value="">— kies interne docent —</option>
                                      {opts.map((o:any) => (
                                        <option key={o.teacher_id} value={o.teacher_id}>{(o.profile && (o.profile.first_name || o.profile.last_name)) ? `${o.profile.first_name || ''} ${o.profile.last_name || ''}`.trim() : o.profile?.email || o.teacher_id}</option>
                                      ))}
                                    </Select>
                                  )}
                                  {isStudioAdmin && (
                                    <button type="button" onClick={() => setEditingTeacherForRequest(s => ({ ...s, [r.id]: !s[r.id] }))} className="text-sm text-blue-600 underline">
                                      {editing ? 'Annuleer' : 'Wijzig docent'}
                                    </button>
                                  )}
                                </div>
                              )
                            }
                            if (opts.length > 0) {
                              return (
                                <Select className="w-44" value={selectedForRequest[r.id] || r.chosen_internal_teacher_id || ''} onChange={(e) => setSelectedForRequest(s => ({ ...s, [r.id]: e.target.value }))}>
                                  <option value="">— kies interne docent —</option>
                                  {opts.map((o:any) => (
                                    <option key={o.teacher_id} value={o.teacher_id}>{(o.profile && (o.profile.first_name || o.profile.last_name)) ? `${o.profile.first_name || ''} ${o.profile.last_name || ''}`.trim() : o.profile?.email || o.teacher_id}</option>
                                  ))}
                                </Select>
                              )
                            }
                            return null
                          })()}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="px-3 py-1 bg-green-100 text-slate-800 rounded-md text-sm border border-green-200 hover:bg-green-200"
                            onClick={() => {
                              const chosen = selectedForRequest[r.id] || r.chosen_internal_teacher_id || (r.lessons && ((r.lessons as any).teacher_id ?? (r.lessons as any).teacher_profile?.user_id))
                              doAction(r.id, 'approve', chosen ? { chosen_internal_teacher_id: String(chosen) } : undefined)
                            }}
                            disabled={!!actionLoading[r.id]}
                          >
                            Goedkeuren
                          </button>
                          <button className="px-3 py-1 bg-red-100 text-red-800 rounded-md text-sm border border-red-200 hover:bg-red-200" onClick={() => doAction(r.id, 'decline')} disabled={!!actionLoading[r.id]}>Afwijzen</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right column: approved replacements */}
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Goedgekeurde vervangingen</h2>
          {approved.length === 0 ? (
            <div className="text-sm text-slate-600">Geen goedgekeurde vervangingen.</div>
          ) : (
            <div className="space-y-3">
              {approved.map((a: any) => {
                const requester = a.requested_by_profile && (Array.isArray(a.requested_by_profile) ? a.requested_by_profile[0] : a.requested_by_profile) || null
                const chosenProfile = a.chosen_internal_teacher_profile || null
                const lesson = a.lessons || null

                // map lesson fields to ApprovedReplacementCard expectations
                const title = lesson?.naam || lesson?.title || a.lesson_title || undefined
                const date = lesson?.datum || lesson?.date || undefined
                const time = lesson?.tijd || lesson?.time || undefined
                // Prefer a human-friendly location name if available
                const locationName = lesson?.location_name || lesson?.locatie || (lesson?.location_id ? locationNames[String(lesson.location_id)] : undefined) || undefined
                const programTitle = programTitles[String(a.program_id || (lesson && lesson.program_id))] || undefined

                const requesterName = requester ? `${requester.first_name || ''} ${requester.last_name || ''}`.trim() || requester.email : undefined
                const chosenTeacherName = chosenProfile ? `${chosenProfile.first_name || ''} ${chosenProfile.last_name || ''}`.trim() || chosenProfile.email : undefined

                return (
                  <div key={a.id} className="p-0">
                    <ApprovedReplacementCard
                      title={title}
                      date={date}
                      time={time}
                      locationName={locationName}
                      programTitle={programTitle}
                      requester={requesterName}
                      chosenTeacher={chosenTeacherName}
                      acceptedAt={a.admin_decision_at}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      </div>
    </FeatureGate>
  )
}
