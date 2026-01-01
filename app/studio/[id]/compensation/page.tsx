"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useNotification } from '@/contexts/NotificationContext'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import { DollarSign, Users } from 'lucide-react'
import FormSelect from '@/components/FormSelect'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingState } from '@/components/ui/LoadingState'

interface Teacher {
  user_id: string
  first_name: string | null
  last_name: string | null
  email: string
}

interface Compensation {
  id: string
  teacher_id: string
  lesson_fee: number
  transport_fee: number
  payment_method: 'factuur' | 'vrijwilligersvergoeding' | 'verenigingswerk' | 'akv'
  active: boolean
  notes: string | null
}

const paymentMethods = [
  { value: 'factuur', label: 'Factuur' },
  { value: 'vrijwilligersvergoeding', label: 'Vrijwilligersvergoeding' },
  { value: 'verenigingswerk', label: 'Verenigingswerk' },
  { value: 'akv', label: 'AKV' }
]

export default function CompensationSettingsPage() {
  const params = useParams()
  const studioId = params?.id as string

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [compensations, setCompensations] = useState<Record<string, Compensation>>({})
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const { theme } = useTheme()
  const { showError } = useNotification()
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (studioId) {
      loadTeachers()
    }
  }, [studioId])

  async function loadTeachers() {
    try {
      // Get unique teacher IDs
      const { data: teacherPrograms, error: tpError } = await supabase
        .from('teacher_programs')
        .select('teacher_id')
        .eq('studio_id', studioId)

      if (tpError) {
        console.error('Error loading teacher programs:', tpError)
        throw tpError
      }

      const teacherIds = Array.from(new Set((teacherPrograms || []).map(tp => tp.teacher_id)))

      if (teacherIds.length === 0) {
        setTeachers([])
        setLoading(false)
        return
      }

      // Get teacher profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', teacherIds)

      if (profilesError) {
        console.error('Error loading teacher profiles:', profilesError)
        throw profilesError
      }

      setTeachers(profiles || [])

      // Load compensations for all teachers
      const { data: comps, error: compsError } = await supabase
        .from('teacher_compensation')
        .select('*')
        .eq('studio_id', studioId)
        .in('teacher_id', teacherIds)

      if (compsError) {
        console.error('Error loading compensations:', compsError)
        throw compsError
      }

      const compsMap: Record<string, Compensation> = {}
      comps?.forEach(comp => {
        compsMap[comp.teacher_id] = comp
      })
      setCompensations(compsMap)
    } catch (error: any) {
      console.error('Error loading teachers:', error?.message || error)
    } finally {
      setLoading(false)
    }
  }

  function getCompensation(teacherId: string): Compensation {
    return compensations[teacherId] || {
      id: '',
      teacher_id: teacherId,
      lesson_fee: 0,
      transport_fee: 0,
      payment_method: 'factuur',
      active: true,
      notes: null
    }
  }

  function updateCompensation(teacherId: string, field: keyof Compensation, value: any) {
    setCompensations(prev => ({
      ...prev,
      [teacherId]: {
        ...getCompensation(teacherId),
        [field]: value
      }
    }))
    setPendingChanges(prev => new Set(prev).add(teacherId))
  }

  async function saveCompensation(teacherId: string) {
    setSaving(teacherId)
    try {
      const comp = getCompensation(teacherId)

      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/studio/${studioId}/teacher-compensation`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          teacher_id: teacherId,
          lesson_fee: comp.lesson_fee,
          transport_fee: comp.transport_fee,
          payment_method: comp.payment_method,
          active: comp.active,
          notes: comp.notes
        })
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) throw new Error(json?.error || 'Fout bij opslaan')

      const saved = (json as any)?.compensation
      if (saved) {
        setCompensations(prev => ({
          ...prev,
          [teacherId]: saved
        }))
      }

      setPendingChanges(prev => {
        const newSet = new Set(prev)
        newSet.delete(teacherId)
        return newSet
      })
    } catch (error) {
      console.error('Error saving compensation:', error)
      showError('Fout bij opslaan')
    } finally {
      setSaving(null)
    }
  }

  function getTeacherName(teacher: Teacher) {
    if (teacher.first_name && teacher.last_name) {
      return `${teacher.first_name} ${teacher.last_name}`
    }
    return teacher.email
  }

  return (
    <FeatureGate flagKey="studio.finance" mode="page">
      {loading ? (
        <div className="max-w-7xl mx-auto">
          <LoadingState label="Laden…" />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Vergoedingsinstellingen</h1>
            <p className="text-slate-600">
              Stel vergoedingen en betalingsmethodes in per docent
            </p>
          </div>

          {/* Teachers List */}
          {teachers.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
              <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Nog geen docenten
              </h3>
              <p className="text-slate-600">
                Link eerst docenten aan programma's om vergoedingen in te stellen
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {teachers.map((teacher) => {
                const comp = getCompensation(teacher.user_id)
                const hasChanges = pendingChanges.has(teacher.user_id)
                const isSaving = saving === teacher.user_id

                return (
                  <div
                    key={teacher.user_id}
                    className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {getTeacherName(teacher)}
                        </h3>
                        <p className="text-sm text-slate-600">{teacher.email}</p>
                      </div>
                      {hasChanges && (
                        <button
                          onClick={() => saveCompensation(teacher.user_id)}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                        >
                          {isSaving ? 'Opslaan...' : 'Opslaan'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Lesvergoeding per uur (€)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={comp.lesson_fee}
                          onChange={(e) => updateCompensation(teacher.user_id, 'lesson_fee', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Vervoersvergoeding per les (€)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={comp.transport_fee}
                          onChange={(e) => updateCompensation(teacher.user_id, 'transport_fee', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Betalingswijze
                        </label>
                        <FormSelect value={comp.payment_method} onChange={(e) => updateCompensation(teacher.user_id, 'payment_method', e.target.value)} className="w-full" variant="sm">
                          {paymentMethods.map(method => (
                            <option key={method.value} value={method.value}>
                              {method.label}
                            </option>
                          ))}
                        </FormSelect>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Status
                        </label>
                        <label className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={comp.active}
                            onChange={(e) => updateCompensation(teacher.user_id, 'active', e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">Actief</span>
                        </label>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Notities (optioneel)
                      </label>
                      <textarea
                        value={comp.notes || ''}
                        onChange={(e) => updateCompensation(teacher.user_id, 'notes', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={2}
                        placeholder="Bijv. speciale afspraken..."
                      />
                    </div>

                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </FeatureGate>
  )
}
