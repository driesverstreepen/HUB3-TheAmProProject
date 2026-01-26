"use client"

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateOnly } from '@/lib/formatting'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

type Lesson = { id: string; date: string; time?: string; title?: string }
type Student = { enrollment_id: string; user_id: string; name: string }

export default function AttendanceMatrix({ programId }: { programId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [enrollmentsCount, setEnrollmentsCount] = useState<number | null>(null)
  const [attendance, setAttendance] = useState<Record<string, Record<string, any>>>({})

  useEffect(() => {
    if (!programId) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = (session as any)?.access_token
        if (!token) throw new Error('Not authenticated')

        const res = await fetch(`/api/programs/${programId}/attendance-matrix`, { headers: { Authorization: `Bearer ${token}` } })
        let json: any = null
        try {
          json = await res.json()
        } catch (e) {
          // ignore json parse errors
        }
        if (!res.ok) {
          const serverMsg = json?.error || json?.details || json?.message || `Failed to load (${res.status})`
          throw new Error(String(serverMsg))
        }
        if (!mounted) return
        setLessons(json.lessons || [])
        setStudents(json.students || [])
        setAttendance(json.attendance || {})
        if (typeof json.enrollments_count === 'number') setEnrollmentsCount(json.enrollments_count)
      } catch (e: any) {
        console.error('Failed loading attendance matrix', e)
        if (!mounted) return
        // show server-provided message if present
        setError(e?.message || 'Fout bij laden')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => { mounted = false }
  }, [programId])

  if (loading) {
    return (
      <div className="p-4 flex items-center gap-2 text-slate-600">
        <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
        <span>Laden…</span>
      </div>
    )
  }
  if (error) return <div className="p-4 text-red-600">{error}</div>
  // render matrix: columns = lessons, rows = students
  if ((students || []).length === 0) {
    return (
      <div className="p-4 text-slate-700">
        Geen ingeschreven deelnemers voor dit programma.
        {enrollmentsCount !== null && (
          <div className="text-sm text-slate-500">Enrolled (fetched): {enrollmentsCount}</div>
        )}
      </div>
    )
  }
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-medium text-slate-900">Aanwezigheden</h3>
        <div className="text-sm text-slate-700">{students.length} deelnemers — {lessons.length} lessen</div>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <table className="inline-table table-fixed">
          <thead className="bg-slate-50">
            <tr>
              <th style={{ backgroundColor: '#ffffff' }} className="p-2 sticky left-0 bg-white dark:bg-slate-800 text-slate-900 dark:text-surface z-20 border-r border-slate-200 dark:border-slate-700">Deelnemer</th>
              {lessons.map((l) => (
                <th key={l.id} className="p-2 text-center">
                  <div className="text-sm font-medium text-slate-900">{formatDateOnly(l.date)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.enrollment_id} className="border-t">
                <td style={{ backgroundColor: '#ffffff' }} className="p-2 sticky left-0 bg-white dark:bg-slate-800 font-medium text-sm text-slate-900 dark:text-surface z-20 border-r border-slate-200 dark:border-slate-700">{s.name}</td>
                {lessons.map((l) => {
                  const cell = (attendance && attendance[l.id] && (attendance[l.id][String(s.enrollment_id)] || attendance[l.id][String(s.user_id)])) || null
                  const status = cell ? cell.status : null
                  let cls = 'text-sm'
                  let label = '-'
                  if (status === 'present') { cls += ' text-green-600'; label = 'Aanwezig' }
                  else if (status === 'absent') { cls += ' text-red-600'; label = 'Afwezig' }
                  else if (status === 'late') { cls += ' text-amber-600'; label = 'Te laat' }
                  else if (status === 'excused') { cls += ' text-slate-500'; label = 'Vrijgesteld' }

                  return (
                    <td key={l.id} className="p-2 text-center">
                      <div className={cls}>{label}</div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-sm text-slate-600">
        <strong>Legenda:</strong> <span className="text-green-600">Aanwezig</span>{' '}
        <span className="text-red-600">Afwezig</span>{' '}
        <span className="text-amber-600">Te laat</span>
      </div>
    </div>
  )
}
