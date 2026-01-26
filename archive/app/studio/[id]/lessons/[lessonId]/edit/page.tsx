"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft } from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'

export default function EditLessonPage() {
  const params = useParams()
  const router = useRouter()
  const studioId = params.id as string
  const lessonId = params.lessonId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState<number | undefined>(undefined)
  const [description, setDescription] = useState('')
  const { theme } = useTheme()

  useEffect(() => {
    loadLesson()
  }, [lessonId])

  const loadLesson = async () => {
    setLoading(true)
    try {
      const { data: lesson, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .single()
      if (error) throw error
      if (lesson) {
        setTitle(lesson.title || '')
        setDate(lesson.date || '')
        setTime(lesson.time || '')
        setDuration(lesson.duration_minutes || undefined)
        setDescription(lesson.description || '')
      }
    } catch (e) {
      console.error('Failed loading lesson', e)
      alert('Fout bij het laden van les')
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const updates: any = {
        id: lessonId,
        title,
        date,
        time,
        duration_minutes: duration,
        description,
      }
      const { error } = await supabase.from('lessons').upsert(updates, { onConflict: 'id' })
      if (error) throw error
      router.push(`/studio/${studioId}/lessons`)
    } catch (e) {
      console.error('Failed saving lesson', e)
      alert('Fout bij het opslaan van les')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FeatureGate flagKey="studio.lessons" mode="page">
      <div className="max-w-3xl mx-auto bg-white rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => router.push(`/studio/${studioId}/lessons`)} className="text-slate-600">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-semibold">Bewerk Les</h1>
          </div>

          {loading ? (
            <div className="text-slate-600">Laden…</div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Titel</label>
                <input className="w-full border rounded px-2 py-1" value={title} onChange={e => setTitle(e.target.value)} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Datum</label>
                  <input type="date" className="w-full border rounded px-2 py-1" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Tijd</label>
                  <input type="time" className="w-full border rounded px-2 py-1" value={time} onChange={e => setTime(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Duur (min)</label>
                  <input type="number" className="w-full border rounded px-2 py-1" value={duration ?? ''} onChange={e => setDuration(e.target.value ? Number(e.target.value) : undefined)} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Beschrijving (optioneel)</label>
                <textarea className="w-full border rounded px-2 py-1" value={description} onChange={e => setDescription(e.target.value)} />
              </div>

              <div className="flex justify-end gap-3">
                <button className="px-4 py-2 rounded bg-gray-100" onClick={() => router.push(`/studio/${studioId}/lessons`)}>Annuleer</button>
                <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
              </div>
            </div>
          )}
      </div>
    </FeatureGate>
  )
}
