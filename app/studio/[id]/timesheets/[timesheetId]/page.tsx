"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Plus, Trash2, Check, DollarSign, MessageSquare, Edit, X } from 'lucide-react'
import ActionIcon from '@/components/ActionIcon'
import Modal from '@/components/Modal'
import { useNotification } from '@/contexts/NotificationContext'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingState } from '@/components/ui/LoadingState'

interface TimesheetEntry {
  id: string
  lesson_id: string | null
  program_id: string | null
  date: string
  duration_minutes: number
  lesson_fee: number
  transport_fee: number
  is_manual: boolean
  notes: string | null
  program?: {
    title: string
  }
}

interface Timesheet {
  id: string
  teacher_id: string
  month: number
  year: number
  status: 'draft' | 'confirmed'
  notes: string | null
  teacher: {
    first_name: string | null
    last_name: string | null
    email: string
  }
}

interface Comment {
  id: string
  user_id: string
  comment: string
  created_at: string
  user: {
    first_name: string | null
    last_name: string | null
    email: string
  }
}

const monthNames = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
]

export default function TimesheetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const studioId = params?.id as string
  const timesheetId = params?.timesheetId as string
  const { showSuccess, showError } = useNotification()

  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pendingChanges, setPendingChanges] = useState(new Set<string>())
  const [editingEntry, setEditingEntry] = useState<string | null>(null)

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean
    title: string
    body?: string
    onConfirm: null | (() => void | Promise<void>)
  }>({ open: false, title: '', body: '', onConfirm: null })
  const [confirmBusy, setConfirmBusy] = useState(false)

  // New manual entry state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEntry, setNewEntry] = useState({
    date: '',
    duration_minutes: 60,
    lesson_fee: 0,
    transport_fee: 0,
    notes: ''
  })

  useEffect(() => {
    if (timesheetId) {
      loadTimesheetData()
    }
  }, [timesheetId])

  async function loadTimesheetData() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`/api/studio/${studioId}/timesheets/${timesheetId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load timesheet')
      }

      setTimesheet(json?.timesheet || null)
      setEntries(json?.entries || [])
      setComments(json?.comments || [])
    } catch (error) {
      console.error('Error loading timesheet:', error)
      showError('Fout bij laden van timesheet')
    } finally {
      setLoading(false)
    }
  }

  function updateEntry(entryId: string, field: keyof TimesheetEntry, value: any) {
    setEntries(prev =>
      prev.map(entry =>
        entry.id === entryId ? { ...entry, [field]: value } : entry
      )
    )
    setPendingChanges(prev => new Set(prev).add(entryId))
  }

  function openConfirmModal(title: string, body: string, onConfirm: () => void | Promise<void>) {
    setConfirmModal({ open: true, title, body, onConfirm })
  }

  async function saveEntry(entryId: string) {
    const entry = entries.find(e => e.id === entryId)
    if (!entry) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`/api/studio/${studioId}/timesheets/${timesheetId}/entries/${entryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: entry.date,
          duration_minutes: entry.duration_minutes,
          lesson_fee: entry.lesson_fee,
          transport_fee: entry.transport_fee,
          notes: entry.notes
        })
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to save entry')
      }

      if (json?.entry) {
        setEntries(prev => prev.map(e => e.id === entryId ? json.entry : e))
      }

      setPendingChanges(prev => {
        const newSet = new Set(prev)
        newSet.delete(entryId)
        return newSet
      })
      setEditingEntry(null)
    } catch (error) {
      console.error('Error saving entry:', error)
      showError('Fout bij opslaan')
    }
  }

  async function deleteEntry(entryId: string) {
    openConfirmModal('Entry verwijderen', 'Weet je zeker dat je deze entry wilt verwijderen?', async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = (session as any)?.access_token
        if (!token) throw new Error('Not authenticated')

        const res = await fetch(`/api/studio/${studioId}/timesheets/${timesheetId}/entries/${entryId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        const json = await res.json().catch(() => ({} as any))
        if (!res.ok) {
          throw new Error(json?.error || 'Failed to delete entry')
        }

        setEntries(prev => prev.filter(e => e.id !== entryId))
        showSuccess('Entry verwijderd')
      } catch (error) {
        console.error('Error deleting entry:', error)
        showError('Fout bij verwijderen')
      }
    })
  }

  async function addManualEntry() {
    if (!newEntry.date) {
      showError('Datum is verplicht')
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`/api/studio/${studioId}/timesheets/${timesheetId}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: newEntry.date,
          duration_minutes: newEntry.duration_minutes,
          lesson_fee: newEntry.lesson_fee,
          transport_fee: newEntry.transport_fee,
          notes: newEntry.notes
        })
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to create entry')
      }

      const created = json?.entry
      if (!created) throw new Error('Failed to create entry')

      setEntries(prev => [...prev, created].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      ))
      setShowAddModal(false)
      setNewEntry({
        date: '',
        duration_minutes: 60,
        lesson_fee: 0,
        transport_fee: 0,
        notes: ''
      })
      showSuccess('Entry toegevoegd')
    } catch (error) {
      console.error('Error adding entry:', error)
      showError('Fout bij toevoegen')
    }
  }

  async function confirmTimesheet() {
    openConfirmModal('Timesheet bevestigen', 'Weet je zeker dat je deze timesheet wilt bevestigen?', async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = (session as any)?.access_token
        if (!token) throw new Error('Not authenticated')

        const res = await fetch(`/api/studio/${studioId}/timesheets/${timesheetId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'confirmed' })
        })

        const json = await res.json().catch(() => ({} as any))
        if (!res.ok) {
          throw new Error(json?.error || 'Failed to confirm timesheet')
        }

        await loadTimesheetData()
        showSuccess('Timesheet bevestigd! Je kunt nu een payroll aanmaken.')
      } catch (error) {
        console.error('Error confirming timesheet:', error)
        showError('Fout bij bevestigen')
      }
    })
  }

  async function reopenTimesheet() {
    openConfirmModal('Timesheet aanpassen', 'Weet je zeker dat je deze timesheet weer wilt aanpassen? De timesheet wordt weer een concept.', async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = (session as any)?.access_token
        if (!token) throw new Error('Not authenticated')

        const res = await fetch(`/api/studio/${studioId}/timesheets/${timesheetId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'draft' })
        })

        const json = await res.json().catch(() => ({} as any))
        if (!res.ok) {
          throw new Error(json?.error || 'Failed to reopen timesheet')
        }

        await loadTimesheetData()
        showSuccess('Timesheet kan weer aangepast worden.')
      } catch (error) {
        console.error('Error reopening timesheet:', error)
        showError('Fout bij aanpassen')
      }
    })
  }

  async function deleteTimesheet() {
    openConfirmModal('Timesheet verwijderen', 'Weet je zeker dat je deze timesheet wilt verwijderen? Dit kan niet ongedaan worden gemaakt.', async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = (session as any)?.access_token
        if (!token) throw new Error('Not authenticated')

        const res = await fetch(`/api/studio/${studioId}/timesheets/${timesheetId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        const json = await res.json().catch(() => ({} as any))
        if (!res.ok) {
          throw new Error(json?.error || 'Failed to delete timesheet')
        }

        showSuccess('Timesheet verwijderd')
        router.push(`/studio/${studioId}/finance`)
      } catch (error) {
        console.error('Error deleting timesheet:', error)
        showError('Fout bij verwijderen')
      }
    })
  }

  async function createPayroll() {
    if (!timesheet || timesheet.status !== 'confirmed') {
      showError('Timesheet moet eerst bevestigd worden')
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = (session as any)?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`/api/studio/${studioId}/payrolls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ timesheet_id: timesheetId }),
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to create payroll')
      }

      const payrollId = json?.payroll?.id
      if (!payrollId) throw new Error('Failed to create payroll')

      router.push(`/studio/${studioId}/payrolls/${payrollId}`)
    } catch (error) {
      console.error('Error creating payroll:', error)
      showError('Fout bij aanmaken payroll')
    }
  }

  function getTeacherName() {
    if (!timesheet) return ''
    const teacher = timesheet.teacher
    if (teacher.first_name && teacher.last_name) {
      return `${teacher.first_name} ${teacher.last_name}`
    }
    return teacher.email
  }

  const totalHours = entries.reduce((sum, e) => sum + e.duration_minutes, 0) / 60
  const totalLessonFees = entries.reduce((sum, e) => sum + Number(e.lesson_fee), 0)
  const totalTransportFees = entries.reduce((sum, e) => sum + Number(e.transport_fee), 0)

  // In-app confirm modal (replaces browser confirm dialogs)
  const ConfirmModal = (
    <Modal
      isOpen={confirmModal.open}
      onClose={() => {
        if (confirmBusy) return
        setConfirmModal({ open: false, title: '', body: '', onConfirm: null })
      }}
      ariaLabel={confirmModal.title || 'Bevestigen'}
    >
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">{confirmModal.title}</h3>
        {!!confirmModal.body && (
          <p className="text-sm text-slate-600 mb-4">{confirmModal.body}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={confirmBusy}
            onClick={async () => {
              if (!confirmModal.onConfirm) {
                setConfirmModal({ open: false, title: '', body: '', onConfirm: null })
                return
              }
              setConfirmBusy(true)
              try {
                await confirmModal.onConfirm()
              } finally {
                setConfirmBusy(false)
                setConfirmModal({ open: false, title: '', body: '', onConfirm: null })
              }
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60"
          >
            Ok
          </button>
        </div>
      </div>
    </Modal>
  )

  return (
    <FeatureGate flagKey="studio.finance" mode="page">
      {loading ? (
        <div className="max-w-7xl mx-auto">
          {ConfirmModal}
          <LoadingState label="Laden…" />
        </div>
      ) : !timesheet ? (
        <div className="max-w-7xl mx-auto">
          {ConfirmModal}
          <p className="text-red-600">Timesheet niet gevonden</p>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto">
          {ConfirmModal}
          {/* Header */}
          <button
            onClick={() => router.push(`/studio/${studioId}/finance`)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar overzicht
          </button>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">{getTeacherName()}</h1>
                <div className="flex flex-wrap items-center gap-3 text-slate-600">
                  <Calendar className="w-4 h-4" />
                  <span>{monthNames[timesheet.month - 1]} {timesheet.year}</span>
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  timesheet.status === 'confirmed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {timesheet.status === 'confirmed' ? 'Bevestigd' : 'Concept'}
              </span>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6 pt-6 border-t border-slate-200">
              <div>
                <div className="text-sm text-slate-600">Aantal Lessen</div>
                <div className="text-2xl font-bold text-slate-900">{entries.length}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Totaal Uren</div>
                <div className="text-2xl font-bold text-slate-900">{totalHours.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Lesvergoeding</div>
                <div className="text-2xl font-bold text-green-700">€{totalLessonFees.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Vervoersvergoeding</div>
                <div className="text-2xl font-bold text-blue-700">€{totalTransportFees.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Totaal Bedrag</div>
                <div className="text-2xl font-bold text-purple-700">€{(totalLessonFees + totalTransportFees).toFixed(2)}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 mt-6">
              {timesheet.status === 'draft' && (
                <>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Manuele Entry Toevoegen
                  </button>
                  <button
                    onClick={confirmTimesheet}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                  >
                    <Check className="w-4 h-4" />
                    Timesheet Bevestigen
                  </button>
                  <div className="w-full sm:w-auto sm:ml-auto flex justify-end">
                    <ActionIcon
                      onClick={deleteTimesheet}
                      title="Verwijderen"
                      aria-label="Verwijderen"
                      icon={Trash2}
                      variant="danger"
                      className="p-2"
                    />
                  </div>
                </>
              )}
              {timesheet.status === 'confirmed' && (
                <>
                  <button
                    onClick={createPayroll}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                  >
                    <DollarSign className="w-4 h-4" />
                    Payroll Aanmaken
                  </button>
                  <div className="w-full sm:w-auto sm:ml-auto flex justify-end gap-2">
                    <ActionIcon
                      onClick={reopenTimesheet}
                      title="Aanpassen"
                      aria-label="Aanpassen"
                      icon={Edit}
                      className="p-2"
                    />
                    <ActionIcon
                      onClick={deleteTimesheet}
                      title="Verwijderen"
                      aria-label="Verwijderen"
                      icon={Trash2}
                      variant="danger"
                      className="p-2"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Entries List */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Lessen</h2>
            
            {entries.length === 0 ? (
              <p className="text-slate-600 text-center py-8">Geen lessen gevonden voor deze periode</p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-4 rounded-lg border ${
                      entry.is_manual ? 'border-blue-200 bg-blue-50' : 'border-slate-200'
                    }`}
                  >
                    {editingEntry === entry.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="text-xs text-slate-600">Datum</label>
                            <input
                              type="date"
                              value={entry.date}
                              onChange={(e) => updateEntry(entry.id, 'date', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              disabled={timesheet.status === 'confirmed'}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-600">Duur (min)</label>
                            <input
                              type="number"
                              value={entry.duration_minutes}
                              onChange={(e) => updateEntry(entry.id, 'duration_minutes', Number(e.target.value))}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              disabled={timesheet.status === 'confirmed'}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-600">Lesvergoeding</label>
                            <input
                              type="number"
                              step="0.01"
                              value={entry.lesson_fee}
                              onChange={(e) => updateEntry(entry.id, 'lesson_fee', Number(e.target.value))}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              disabled={timesheet.status === 'confirmed'}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-600">Vervoersvergoeding</label>
                            <input
                              type="number"
                              step="0.01"
                              value={entry.transport_fee}
                              onChange={(e) => updateEntry(entry.id, 'transport_fee', Number(e.target.value))}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              disabled={timesheet.status === 'confirmed'}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Notities</label>
                          <input
                            type="text"
                            value={entry.notes || ''}
                            onChange={(e) => updateEntry(entry.id, 'notes', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                            placeholder="Optioneel..."
                            disabled={timesheet.status === 'confirmed'}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEntry(entry.id)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            Opslaan
                          </button>
                          <button
                            onClick={() => setEditingEntry(null)}
                            className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300"
                          >
                            Annuleren
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-slate-900">
                              {new Date(entry.date).toLocaleDateString('nl-NL')}
                            </span>
                            {entry.program?.title && (
                              <span className="text-sm text-slate-600">
                                {entry.program.title}
                              </span>
                            )}
                            {entry.is_manual && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                Manueel
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600 mt-1">
                            <span>{entry.duration_minutes} min</span>
                            <span>€{Number(entry.lesson_fee).toFixed(2)} les</span>
                            <span>€{Number(entry.transport_fee).toFixed(2)} vervoer</span>
                            {entry.notes && (
                              <span className="italic text-slate-500">"{entry.notes}"</span>
                            )}
                          </div>
                        </div>
                        {timesheet.status === 'draft' && (
                          <div className="flex gap-2">
                            <ActionIcon title="Bewerk entry" onClick={() => setEditingEntry(entry.id)}>
                              <Edit className="w-4 h-4" />
                            </ActionIcon>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Opmerkingen van Docent
            </h2>
            
            {comments.length === 0 ? (
              <p className="text-slate-600 text-center py-4">Nog geen opmerkingen</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-medium text-slate-900">
                        {comment.user.first_name && comment.user.last_name
                          ? `${comment.user.first_name} ${comment.user.last_name}`
                          : comment.user.email}
                      </span>
                      <span className="text-sm text-slate-500">
                        {new Date(comment.created_at).toLocaleDateString('nl-NL')}
                      </span>
                    </div>
                    <p className="text-slate-700">{comment.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

      {/* Add Manual Entry Modal */}
      {showAddModal && (
        <div onClick={() => setShowAddModal(false)} className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 flex items-start justify-between">
              <h2 className="text-xl font-bold text-slate-900">Manuele Entry Toevoegen</h2>
              <button onClick={() => setShowAddModal(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Datum *
                </label>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Duur (minuten)
                </label>
                <input
                  type="number"
                  value={newEntry.duration_minutes}
                  onChange={(e) => setNewEntry({ ...newEntry, duration_minutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Lesvergoeding (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newEntry.lesson_fee}
                  onChange={(e) => setNewEntry({ ...newEntry, lesson_fee: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Vervoersvergoeding (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newEntry.transport_fee}
                  onChange={(e) => setNewEntry({ ...newEntry, transport_fee: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notities
                </label>
                <textarea
                  value={newEntry.notes}
                  onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  rows={3}
                  placeholder="Optioneel..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={addManualEntry}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Toevoegen
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </FeatureGate>
  )
}
