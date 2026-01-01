'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Star, Users, Plus, Edit2, Eye, EyeOff, Calendar } from 'lucide-react'
import Modal from '@/components/Modal'
import Select from '@/components/Select'

interface Program {
  id: string
  name: string
}

interface User {
  id: string
  full_name: string
  email: string
}

interface Evaluation {
  id: string
  user_id: string
  user_full_name: string
  score: number
  comment: string
  criteria: Record<string, number> | null
  visibility_status: 'hidden' | 'visible_immediate' | 'visible_on_date'
  visible_from: string | null
  created_at: string
  updated_at: string
}

export default function TeacherEvaluationsPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedProgram, setSelectedProgram] = useState<string>('')
  const [users, setUsers] = useState<User[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [existingEvaluation, setExistingEvaluation] = useState<Evaluation | null>(null)
  
  const [formData, setFormData] = useState<{
    score: number
    comment: string
    criteria: Record<string, number>
    visibility_status: 'hidden' | 'visible_immediate' | 'visible_on_date'
    visible_from: string
  }>({
    score: 5,
    comment: '',
    criteria: {
      technique: 5,
      creativity: 5,
      dedication: 5,
      progress: 5
    },
    visibility_status: 'hidden',
    visible_from: ''
  })



  useEffect(() => {
    loadPrograms()
  }, [])

  useEffect(() => {
    if (selectedProgram) {
      loadUsersAndEvaluations()
    }
  }, [selectedProgram])

  const loadPrograms = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Determine current studio and check feature flag
    const { data: studioRole } = await supabase
      .from('user_roles')
      .select('studio_id')
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .limit(1)
      .maybeSingle()

    if (!studioRole) {
      setLoading(false)
      return
    }

    const { data: studioRow } = await supabase
      .from('studios')
      .select('features')
      .eq('id', studioRole.studio_id)
      .maybeSingle()

    if (!studioRow || !studioRow.features?.evaluations) {
      // Feature disabled: stop and show empty state
      setPrograms([])
      setUsers([])
      setEvaluations([])
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('programs')
      .select('id, name, teacher_id')
      .eq('teacher_id', user.id)
      .eq('deleted', false)

    if (data) {
      setPrograms(data)
      if (data.length > 0) {
        setSelectedProgram(data[0].id)
      }
    }
    setLoading(false)
  }

  const loadUsersAndEvaluations = async () => {
    setLoading(true)
    
    // Load enrolled users
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select(`
        user_id,
        users (
          id,
          full_name,
          email
        )
      `)
      .eq('program_id', selectedProgram)
      .eq('deleted', false)

    if (enrollments) {
      const uniqueUsers = Array.from(
        new Map(
          enrollments
            .filter((e: any) => e.users)
            .map((e: any) => [e.users.id, e.users])
        ).values()
      )
      setUsers(uniqueUsers as User[])
    }

    // Load evaluations for this program
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: studio } = await supabase
      .from('user_roles')
      .select('studio_id')
      .eq('user_id', user.id)
      .single()

    if (!studio) return

    const token = (await supabase.auth.getSession()).data.session?.access_token
    const response = await fetch(
      `/api/studio/${studio.studio_id}/evaluations?programId=${selectedProgram}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    )

    if (response.ok) {
      const data = await response.json()
      setEvaluations(data)
    }

    setLoading(false)
  }

  const openEvaluationModal = (user: User) => {
    const existing = evaluations.find(e => e.user_id === user.id)
    
    if (existing) {
      setExistingEvaluation(existing)
      setFormData({
        score: existing.score,
        comment: existing.comment,
        criteria: existing.criteria || {
          technique: 5,
          creativity: 5,
          dedication: 5,
          progress: 5
        },
        visibility_status: existing.visibility_status,
        visible_from: existing.visible_from || ''
      })
    } else {
      setExistingEvaluation(null)
      setFormData({
        score: 5,
        comment: '',
        criteria: {
          technique: 5,
          creativity: 5,
          dedication: 5,
          progress: 5
        },
        visibility_status: 'hidden',
        visible_from: ''
      })
    }
    
    setSelectedUser(user)
    setShowModal(true)
  }

  const saveEvaluation = async () => {
    if (!selectedUser) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: studio } = await supabase
      .from('user_roles')
      .select('studio_id')
      .eq('user_id', user.id)
      .single()

    if (!studio) return

    const token = (await supabase.auth.getSession()).data.session?.access_token
    
    const payload = {
      user_id: selectedUser.id,
      program_id: selectedProgram,
      ...formData
    }

    const url = existingEvaluation
      ? `/api/studio/${studio.studio_id}/evaluations/${existingEvaluation.id}`
      : `/api/studio/${studio.studio_id}/evaluations`

    const method = existingEvaluation ? 'PUT' : 'POST'

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })

    if (response.ok) {
      setShowModal(false)
      loadUsersAndEvaluations()
    }
  }

  const getVisibilityIcon = (status: string) => {
    if (status === 'hidden') return <EyeOff className="w-4 h-4 text-gray-400" />
    if (status === 'visible_immediate') return <Eye className="w-4 h-4 text-green-500" />
    return <Calendar className="w-4 h-4 text-blue-500" />
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Evaluaties</h1>
        <p className="text-gray-600">Geef feedback aan jouw leerlingen per les of groep</p>
      </div>

      {/* Program Selector */}
      <div className="mb-6 bg-white rounded-2xl shadow-lg p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Selecteer Programma
        </label>
        <Select
          value={selectedProgram}
          onChange={(e) => setSelectedProgram(e.target.value)}
          className="w-full"
        >
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Users List */}
      {selectedProgram && (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">
                Leerlingen ({users.length})
              </h2>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {users.map((user) => {
              const evaluation = evaluations.find(e => e.user_id === user.id)
              
              return (
                <div
                  key={user.id}
                  className="p-6 hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{user.full_name}</h3>
                    <p className="text-sm text-gray-500">{user.email}</p>
                    
                    {evaluation && (
                      <div className="mt-2 flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="text-sm font-medium text-gray-700">
                            {evaluation.score}/10
                          </span>
                        </div>
                        {getVisibilityIcon(evaluation.visibility_status)}
                        <span className="text-xs text-gray-500">
                          Laatst bewerkt: {new Date(evaluation.updated_at).toLocaleDateString('nl-NL')}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => openEvaluationModal(user)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {evaluation ? (
                      <>
                        <Edit2 className="w-4 h-4" />
                        Bewerken
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Evaluatie Toevoegen
                      </>
                    )}
                  </button>
                </div>
              )
            })}

            {users.length === 0 && (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Geen leerlingen ingeschreven voor dit programma</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Evaluation Modal */}
      {showModal && selectedUser && (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {existingEvaluation ? 'Evaluatie Bewerken' : 'Nieuwe Evaluatie'}
            </h2>
            <p className="text-gray-600 mb-6">Voor: {selectedUser.full_name}</p>

            {/* Overall Score */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Overall Score (1-10)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.score}
                onChange={(e) => setFormData({ ...formData, score: parseInt(e.target.value) })}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Criteria */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Criteria (1-10)
              </label>
              <div className="space-y-3">
                {Object.entries(formData.criteria).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-4">
                    <label className="w-32 text-sm text-gray-700 capitalize">
                      {key === 'technique' && 'Techniek'}
                      {key === 'creativity' && 'Creativiteit'}
                      {key === 'dedication' && 'Inzet'}
                      {key === 'progress' && 'Vooruitgang'}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={value}
                      onChange={(e) => setFormData({
                        ...formData,
                        criteria: { ...formData.criteria, [key]: parseInt(e.target.value) }
                      })}
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Commentaar
              </label>
              <textarea
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Geef uitgebreide feedback..."
              />
            </div>

            {/* Visibility */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Zichtbaarheid
              </label>
              <Select
                value={formData.visibility_status}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  visibility_status: e.target.value as any 
                })}
                className="w-full mb-3"
              >
                <option value="hidden">Verborgen</option>
                <option value="visible_immediate">Direct Zichtbaar</option>
                <option value="visible_on_date">Zichtbaar vanaf datum</option>
              </Select>

              {formData.visibility_status === 'visible_on_date' && (
                <input
                  type="date"
                  value={formData.visible_from}
                  onChange={(e) => setFormData({ ...formData, visible_from: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={saveEvaluation}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Opslaan
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {/* Removed bottom close action; modal can be closed via X or backdrop */}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
