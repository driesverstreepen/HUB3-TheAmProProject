"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useNotification } from '@/contexts/NotificationContext'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, FileText, MessageSquare } from 'lucide-react'
import UserTopNav from '@/components/user/UserTopNav'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface TimesheetEntry {
  id: string
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
  month: number
  year: number
  status: 'draft' | 'confirmed'
  studio: {
    naam: string
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

export default function TeacherTimesheetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const timesheetId = params?.timesheetId as string
  const { showError } = useNotification()

  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const { theme } = useTheme()

  useEffect(() => {
    if (timesheetId) {
      loadTimesheet()
      loadEntries()
      loadComments()
    }
  }, [timesheetId])

  async function loadTimesheet() {
    try {
      const { data, error } = await supabase
        .from('timesheets')
        .select(`
          *,
          studio:studio_id (naam)
        `)
        .eq('id', timesheetId)
        .single()

      if (error) throw error
      setTimesheet(data)
    } catch (error) {
      console.error('Error loading timesheet:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadEntries() {
    try {
      const { data, error } = await supabase
        .from('timesheet_entries')
        .select(`
          *,
          program:program_id (title)
        `)
        .eq('timesheet_id', timesheetId)
        .order('date', { ascending: true })

      if (error) throw error
      setEntries(data || [])
    } catch (error) {
      console.error('Error loading entries:', error)
    }
  }

  async function loadComments() {
    try {
      const { data, error } = await supabase
        .from('timesheet_comments')
        .select('*')
        .eq('timesheet_id', timesheetId)
        .order('created_at', { ascending: true })

      if (error) throw error

      // Get user profiles for all comments
      if (data && data.length > 0) {
        const userIds = Array.from(new Set(data.map(c => c.user_id)))
        
        const { data: users } = await supabase
          .from('user_profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', userIds)

        const userMap = (users || []).reduce((acc, user) => {
          acc[user.user_id] = user
          return acc
        }, {} as Record<string, any>)

        const commentsWithUsers = data.map(comment => ({
          ...comment,
          user: userMap[comment.user_id] || { first_name: null, last_name: null, email: '' }
        }))

        setComments(commentsWithUsers)
      } else {
        setComments([])
      }
    } catch (error) {
      console.error('Error loading comments:', error)
    }
  }

  async function submitComment() {
    if (!newComment.trim()) return

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('timesheet_comments')
        .insert({
          timesheet_id: timesheetId,
          user_id: user.id,
          comment: newComment.trim()
        })

      if (error) throw error

      setNewComment('')
      await loadComments()
    } catch (error) {
      console.error('Error submitting comment:', error)
      showError('Fout bij opslaan opmerking')
    } finally {
      setSubmitting(false)
    }
  }

  const totalHours = entries.reduce((sum, e) => sum + e.duration_minutes, 0) / 60
  const totalLessonFees = entries.reduce((sum, e) => sum + Number(e.lesson_fee), 0)
  const totalTransportFees = entries.reduce((sum, e) => sum + Number(e.transport_fee), 0)

  if (loading) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
        <UserTopNav />
        <main className="p-4 sm:p-8">
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <LoadingSpinner size={48} className="mb-4" label="Laden" />
              <p className="text-slate-600">Laden…</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!timesheet) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
        <UserTopNav />
        <main className="p-4 sm:p-8">
          <div className="max-w-7xl mx-auto">
            <p className="text-red-600">Timesheet niet gevonden</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-black' : 'bg-slate-50'}`}>
      <UserTopNav />
      <main className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => router.push('/dashboard?teacherFinanceModal=1&tab=timesheets')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar overzicht
          </button>

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">
                  {timesheet.studio.naam}
                </h1>
                <div className="flex items-center gap-3 text-slate-600">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-200">
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
            </div>

            {timesheet.status === 'draft' && (
              <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-800">
                  <strong>Let op:</strong> Deze timesheet is nog niet bevestigd door je studio admin. De gegevens kunnen nog wijzigen.
                </p>
              </div>
            )}
          </div>

          {/* Entries List */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Lessen
            </h2>
            
            {entries.length === 0 ? (
              <p className="text-slate-600 text-center py-8">Geen lessen gevonden voor deze periode</p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-4 rounded-lg border ${
                      entry.is_manual ? 'border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-900">
                            {new Date(entry.date).toLocaleDateString('nl-NL', { 
                              weekday: 'long', 
                              day: 'numeric', 
                              month: 'long' 
                            })}
                          </span>
                          {entry.program?.title && (
                            <span className="text-sm text-slate-600">
                              {entry.program.title}
                            </span>
                          )}
                          {entry.is_manual && (
                            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200 px-2 py-0.5 rounded">
                              Manueel toegevoegd
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-slate-600 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                          <span>{entry.duration_minutes} minuten</span>
                          <span>€{Number(entry.lesson_fee).toFixed(2)} lesvergoeding</span>
                          <span>€{Number(entry.transport_fee).toFixed(2)} vervoersvergoeding</span>
                        </div>
                        {entry.notes && (
                          <div className="mt-2 text-sm text-slate-500 italic">
                            Notitie: {entry.notes}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-700">
                          €{(Number(entry.lesson_fee) + Number(entry.transport_fee)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Total */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <span className="text-lg font-semibold text-slate-900">Totaal Te Ontvangen</span>
              <span className="text-2xl font-bold text-green-700">
                €{(totalLessonFees + totalTransportFees).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Comments Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Opmerkingen
            </h2>
            
            {/* Add Comment */}
            <div className="mb-6">
              <div className="flex gap-3">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Voeg een opmerking toe voor je studio admin..."
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                />
                <button
                  onClick={submitComment}
                  disabled={!newComment.trim() || submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed h-fit"
                >
                  Opslaan
                </button>
              </div>
            </div>

            {/* Comments List */}
            {comments.length === 0 ? (
              <p className="text-slate-600 text-center py-4">Nog geen opmerkingen</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-medium text-slate-900">
                        {comment.user.first_name && comment.user.last_name
                          ? `${comment.user.first_name} ${comment.user.last_name}`
                          : comment.user.email}
                      </span>
                      <span className="text-sm text-slate-500">
                        {new Date(comment.created_at).toLocaleDateString('nl-NL', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-slate-700">{comment.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
