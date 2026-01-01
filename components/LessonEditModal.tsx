"use client"

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import Select from '@/components/Select'
import { Check } from 'lucide-react'
import { useNotification } from '@/contexts/NotificationContext'
import type { UserProfile, Location, Lesson } from '@/types/database'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Props {
  studioId: string
  lessonId: string
  onClose: () => void
  onSaved?: (updated: any) => void
}

export default function LessonEditModal({ studioId, lessonId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showSuccess, showError } = useNotification()

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState<number | null>(null)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [programId, setProgramId] = useState<string | null>(null)

  const [locations, setLocations] = useState<Location[]>([])
  const [teachers, setTeachers] = useState<UserProfile[]>([])

  useEffect(() => {
    if (!lessonId) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: lessonData, error: lessonErr } = await supabase
          .from('lessons')
          .select('id, title, date, time, duration_minutes, location_id, teacher_id, program_id')
          .eq('id', lessonId)
          .maybeSingle()

        if (lessonErr) throw lessonErr
        if (lessonData) {
          setTitle(lessonData.title || '')
          setDate(lessonData.date || '')
          setTime(lessonData.time || '')
          setDuration(lessonData.duration_minutes ?? null)
          setLocationId(lessonData.location_id || null)
          setTeacherId(lessonData.teacher_id || null)
          setProgramId((lessonData as any).program_id || null)
        }

        // load locations for this studio
        const { data: locs, error: locErr } = await supabase
          .from('locations')
          .select('id, name')
          .eq('studio_id', studioId)
          .order('name')

  if (locErr) console.warn('Failed to load locations', locErr)
  setLocations((locs || []) as any)

        // Load both program-assigned teachers and all studio teachers, then
        // show the union so studio admins can pick any studio teacher while
        // still surfacing the program's assigned teachers first.
        let programAssignedIds: string[] = []
        if (lessonData?.program_id) {
          const { data: tps, error: tpErr } = await supabase
            .from('teacher_programs')
            .select('teacher_id')
            .eq('program_id', lessonData.program_id)
            .eq('studio_id', studioId)

          if (tpErr) console.warn('Failed to load teacher_programs', tpErr)
          programAssignedIds = (tps || []).map((t: any) => t.teacher_id).filter(Boolean)
        }

        // Load all studio teachers via the studio_teachers junction table
        const { data: links, error: linksErr } = await supabase
          .from('studio_teachers')
          .select('user_id')
          .eq('studio_id', studioId)

        if (linksErr) console.warn('Failed to load studio_teachers links', linksErr)
        const studioTeacherIds = (links || []).map((r: any) => r.user_id).filter(Boolean)

        // union of ids (program-assigned first)
        const unionIds = Array.from(new Set([...(programAssignedIds || []), ...(studioTeacherIds || [])]))

        let foundProfiles: any[] = []
        if (unionIds.length > 0) {
          const { data: profiles, error: profErr } = await supabase
            .from('user_profiles')
            .select('user_id, first_name, last_name, email')
            .in('user_id', unionIds)

          if (profErr) console.warn('Failed to load teacher profiles', profErr)
          foundProfiles = profiles || []
        }

        // Order profiles so program-assigned teachers appear first
        if (programAssignedIds.length > 0 && foundProfiles.length > 0) {
          const assignedSet = new Set(programAssignedIds)
          foundProfiles.sort((a: any, b: any) => (assignedSet.has(b.user_id) ? 1 : 0) - (assignedSet.has(a.user_id) ? 1 : 0))
          // above sort puts assigned ones at the end; reverse to have them first
          foundProfiles = foundProfiles.reverse()
        }

        setTeachers(foundProfiles as any)
      } catch (e: any) {
        console.error('Failed loading lesson details', e)
        // show centralized toast for load errors
        setError(null)
        showError(e?.message || 'Fout bij laden')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [lessonId, studioId])

  const handleSave = async () => {
    if (!lessonId) return
    setSaving(true)
    setError(null)
    try {
      const updates: Record<string, any> = {
        title,
        updated_at: new Date().toISOString(),
      }
      // only include optional fields explicitly (allow null to clear)
      updates.date = date || null
      updates.time = time || null
      updates.duration_minutes = duration ?? null
      updates.location_id = locationId ?? null
      updates.teacher_id = teacherId ?? null

      const { error: updateErr } = await supabase
        .from('lessons')
        .update(updates)
        .eq('id', lessonId)

      if (updateErr) throw updateErr

      if (onSaved) onSaved({ id: lessonId, ...updates })
      onClose()
      showSuccess('Les succesvol opgeslagen')
    } catch (e: any) {
      console.error('Failed saving lesson', e)
      // show centralized toast for save errors
      showError(e?.message || 'Fout bij opslaan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={!!lessonId} onClose={onClose} ariaLabel="Bewerk les">
      <div className="space-y-6">
        <div className="pb-4 border-b border-gray-100 mb-4">
          <h3 className="t-h3 font-semibold">Bewerk les</h3>
          <p className="mt-2 t-bodySm">Pas details aan voor deze les. Je kunt locatie en aangewezen docent instellen.</p>
        </div>

  {/* errors are shown via centralized toasts */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block t-label font-medium">Titel</label>
            <input
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bijv. Cursus niveau A"
            />
          </div>

          <div>
            <label className="block t-label font-medium">Duur (min)</label>
            <input
              type="number"
              min={0}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={duration ?? ''}
              onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : null)}
            />
          </div>

          <div>
            <label className="block t-label font-medium">Datum</label>
            <input
              type="date"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={date || ''}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block t-label font-medium">Tijd</label>
            <input
              type="time"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={time || ''}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <div className="md:col-span-1">
            <label className="block t-label font-medium">Locatie</label>
            <Select
              className="mt-1 block w-full"
              value={locationId || ''}
              onChange={(e) => setLocationId(e.target.value || null)}
            >
              <option value="">-- Geen geselecteerd --</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
            <p className="mt-1 t-caption">Als je geen locatie selecteert blijft de huidige locatie behouden.</p>
          </div>

          <div className="md:col-span-1">
            <label className="block t-label font-medium">Aangewezen docent</label>
            <Select
              className="mt-1 block w-full"
              value={teacherId || ''}
              onChange={(e) => setTeacherId(e.target.value || null)}
            >
              <option value="">-- Geen geselecteerd --</option>
              {teachers.map((t) => (
                <option key={t.user_id} value={t.user_id}>{`${t.first_name || ''} ${t.last_name || ''}`.trim() || t.email}</option>
              ))}
            </Select>
            <p className="mt-1 t-caption">Alleen studio-docenten verschijnen in deze lijst.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          {/* Removed bottom close button; users can use the X or backdrop */}
          <button onClick={handleSave} disabled={saving || loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-650 disabled:opacity-60 t-button t-noColor">
            {saving ? (<><LoadingSpinner size={16} label="Opslaan" indicatorClassName="border-b-white" /> Opslaan…</>) : (<><Check className="inline"/> Opslaan</>)}
          </button>
        </div>
      </div>
    </Modal>
  )
}

