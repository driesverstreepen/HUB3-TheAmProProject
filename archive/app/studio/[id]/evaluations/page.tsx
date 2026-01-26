'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Star, Edit2, Eye, EyeOff, Calendar, Download, Settings, ChevronDown, ChevronRight, Search } from 'lucide-react'
import Modal from '@/components/Modal'
import FormSelect from '@/components/FormSelect'
import { FeatureGate } from '@/components/FeatureGate'
import { useNotification } from '@/contexts/NotificationContext'

const formatOneDecimalComma = (n?: number | null) => {
  if (n == null || Number.isNaN(n)) return ''
  try {
    return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
  } catch (e) {
    return (n.toFixed(1)).replace('.', ',')
  }
}

const csvEscape = (v: any) => {
  if (v == null) return '""'
  const s = String(v).replace(/"/g, '""')
  return `"${s}"`
}

interface Evaluation {
  id: string
  user_id: string
  program_id: string
  teacher_id: string
  score: number
  comment: string
  criteria: Record<string, number> | null
  visibility_status: 'hidden' | 'visible_immediate' | 'visible_on_date'
  visible_from: string | null
  created_at: string
  updated_at: string
  // denormalized display fields
  program_title?: string | null
  teacher_name?: string | null
  student_name?: string | null
  student_email?: string | null
  score_max?: number | null
}

type EvaluationMethod = 'score' | 'percent' | 'rating' | 'feedback'

interface EvaluationSettings {
  enabled: boolean
  default_visibility: string
  editable_after_publish_days: number
  allow_teachers_edit: boolean
  method?: EvaluationMethod
  categories?: string[]
  rating_scale?: string[]
  periods?: string[]
  default_visible_from?: string | null
}

type ProgramSettingsRow = {
  program_id: string
  program_title: string
  settings: EvaluationSettings
}

export default function StudioEvaluationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { showSuccess, showError } = useNotification()
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [studioSettings, setStudioSettings] = useState<EvaluationSettings>({
    enabled: false,
    default_visibility: 'hidden',
    editable_after_publish_days: 7,
    allow_teachers_edit: true,
    method: 'score',
    categories: [],
    rating_scale: ['voldoende','goed','zeer goed','uitstekend'],
    periods: []
  })
  const [programRows, setProgramRows] = useState<ProgramSettingsRow[]>([])
  const [programSettingsById, setProgramSettingsById] = useState<Record<string, EvaluationSettings>>({})
  const [selectedProgramId, setSelectedProgramId] = useState<string>('')
  const selectedProgramSettings = selectedProgramId ? programSettingsById[selectedProgramId] : undefined
  const [programSettingsDraft, setProgramSettingsDraft] = useState<EvaluationSettings | null>(null)
  const [featureEnabled, setFeatureEnabled] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null)
  const [studioId, setStudioId] = useState<string>('')
  const [expandedPrograms, setExpandedPrograms] = useState<Record<string, boolean>>({})
  // Local text states to avoid splitting while typing commas
  const [categoriesText, setCategoriesText] = useState('')
  const [ratingScaleText, setRatingScaleText] = useState('')
  const [periodsText, setPeriodsText] = useState('')
  
  const [editFormData, setEditFormData] = useState<{
    score: number
    comment: string
    criteria: Record<string, number>
    visibility_status: 'hidden' | 'visible_immediate' | 'visible_on_date'
    visible_from: string
  }>({
    score: 5,
    comment: '',
    criteria: {},
    visibility_status: 'hidden',
    visible_from: ''
  })

  useEffect(() => {
    params.then(p => {
      setStudioId(p.id)
    })
  }, [params])

  useEffect(() => {
    if (studioId) {
      loadData()
    }
  }, [studioId])

  // Keep local text fields in sync when selected program settings change
  useEffect(() => {
    const src = programSettingsDraft || selectedProgramSettings
    if (!src) return
    setCategoriesText((src.categories || []).join(', '))
    setRatingScaleText((src.rating_scale || []).join(', '))
    setPeriodsText((src.periods || []).join(', '))
  }, [programSettingsDraft, selectedProgramSettings?.categories, selectedProgramSettings?.rating_scale, selectedProgramSettings?.periods])

  const loadData = async () => {
    setLoading(true)
    
    const token = (await supabase.auth.getSession()).data.session?.access_token
    
    // Check studio feature flag
    const { data: studioRow } = await supabase
      .from('studios')
      .select('features')
      .eq('id', studioId)
      .maybeSingle()
    setFeatureEnabled(!!studioRow?.features?.evaluations)

    // Load studio + per-program settings
    const settingsRes = await fetch(`/api/studio/${studioId}/evaluation-settings?includePrograms=true`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    if (settingsRes.ok) {
      const settingsData = await settingsRes.json()
      const studio = (settingsData?.studio || settingsData) as EvaluationSettings
      const programs = Array.isArray(settingsData?.programs) ? (settingsData.programs as ProgramSettingsRow[]) : []
      setStudioSettings(studio)
      setProgramRows(programs)
      const byId: Record<string, EvaluationSettings> = {}
      programs.forEach((p) => {
        byId[p.program_id] = p.settings
      })
      setProgramSettingsById(byId)
      if (!selectedProgramId && programs.length > 0) {
        setSelectedProgramId(programs[0].program_id)
      }
    }

    // Load evaluations
    const evaluationsRes = await fetch(`/api/studio/${studioId}/evaluations`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (evaluationsRes.ok) {
      const evaluationsData = await evaluationsRes.json()
      setEvaluations(evaluationsData)
    }

    setLoading(false)
  }

  const saveSettings = async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) {
      showError('Je bent niet ingelogd.')
      return
    }

    // Save studio master toggle (and keep defaults in sync, even if not used)
    try {
      await fetch(`/api/studio/${studioId}/evaluation-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(studioSettings)
      })
    } catch {
      // ignore: studio defaults are not critical for per-program save
    }

    if (!selectedProgramId || !programSettingsDraft) return

    // Build arrays from local text controls
    const nextProgramSettings: EvaluationSettings = {
      ...programSettingsDraft,
      categories: categoriesText.split(',').map(s => s.trim()).filter(Boolean),
      rating_scale: ratingScaleText.split(',').map(s => s.trim()).filter(Boolean),
      periods: periodsText.split(',').map(s => s.trim()).filter(Boolean),
    }

    try {
      const response = await fetch(`/api/studio/${studioId}/evaluation-settings?programId=${encodeURIComponent(selectedProgramId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(nextProgramSettings)
      })

      if (!response.ok) {
        const msg = (await response.json().catch(() => null))?.error
        showError(msg || 'Opslaan mislukt.')
        return
      }

      showSuccess('Evaluatie-instellingen opgeslagen.')
      setShowSettingsModal(false)
      setProgramSettingsDraft(null)
      loadData()
    } catch {
      showError('Opslaan mislukt.')
    }
  }

  const applySettingsToAllPrograms = async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) {
      showError('Je bent niet ingelogd.')
      return
    }
    if (!programSettingsDraft) return

    const confirmed = window.confirm('Wil je deze instellingen toepassen op alle programma\'s? Dit overschrijft de huidige programma-instellingen.')
    if (!confirmed) return

    // Save studio master toggle (and keep defaults in sync, even if not used)
    try {
      await fetch(`/api/studio/${studioId}/evaluation-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(studioSettings)
      })
    } catch {
      // ignore: studio defaults are not critical for bulk per-program save
    }

    const nextProgramSettings: EvaluationSettings = {
      ...programSettingsDraft,
      categories: categoriesText.split(',').map(s => s.trim()).filter(Boolean),
      rating_scale: ratingScaleText.split(',').map(s => s.trim()).filter(Boolean),
      periods: periodsText.split(',').map(s => s.trim()).filter(Boolean),
    }

    try {
      const response = await fetch(`/api/studio/${studioId}/evaluation-settings?applyToAll=true`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(nextProgramSettings)
      })

      if (!response.ok) {
        const msg = (await response.json().catch(() => null))?.error
        showError(msg || 'Opslaan mislukt.')
        return
      }

      showSuccess('Evaluatie-instellingen toegepast op alle programma\'s.')
      setShowSettingsModal(false)
      setProgramSettingsDraft(null)
      loadData()
    } catch {
      showError('Opslaan mislukt.')
    }
  }

  const getMethodForProgram = (programId: string): EvaluationMethod => {
    const m = (programSettingsById?.[programId]?.method || 'score') as any
    if (m === 'percent' || m === 'score' || m === 'rating' || m === 'feedback') return m
    return 'score'
  }

  const openEditModal = (evaluation: Evaluation) => {
    setSelectedEvaluation(evaluation)
    setEditFormData({
      score: evaluation.score,
      comment: evaluation.comment,
      criteria: evaluation.criteria || {},
      visibility_status: evaluation.visibility_status,
      visible_from: evaluation.visible_from || ''
    })
    setShowEditModal(true)
  }

  const getScaleForProgram = (programId: string): { method: EvaluationMethod; min: number; max: number; step: number; label: string } => {
    const method = getMethodForProgram(programId)
    if (method === 'percent') return { method, min: 0, max: 100, step: 1, label: 'Score (%)' }
    return { method, min: 1, max: 10, step: 1, label: 'Overall Score (1-10)' }
  }

  const saveEvaluation = async () => {
    if (!selectedEvaluation) return

    const token = (await supabase.auth.getSession()).data.session?.access_token
    
    const method = getMethodForProgram(selectedEvaluation.program_id)
    const scoreMax = method === 'percent' ? 100 : (method === 'score' ? 10 : null)

    const response = await fetch(`/api/studio/${studioId}/evaluations/${selectedEvaluation.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...editFormData,
          score_max: scoreMax,
        })
      }
    )

    if (response.ok) {
      setShowEditModal(false)
      loadData()
    }
  }

  const exportEvaluations = () => {
    const headers = ['Datum', 'Student', 'Programma', 'Teacher', 'Score', 'Period', 'Visible On', 'Comment']
    const csvRows = [headers.map(csvEscape).join(',')]

    for (const e of filteredEvaluations) {
      const score = e.score == null ? '' : formatOneDecimalComma(e.score)
      const visibleOn = e.visible_from ? new Date(e.visible_from).toLocaleDateString('nl-NL') : ''
      csvRows.push([
        csvEscape(new Date(e.created_at).toLocaleString('nl-NL')),
        csvEscape(e.student_name || e.student_email || ''),
        csvEscape(e.program_title || ''),
        csvEscape(e.teacher_name || ''),
        csvEscape(score),
        csvEscape((e as any).period ?? ''),
        csvEscape(visibleOn),
        csvEscape(e.comment ?? ''),
      ].join(','))
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evaluaties-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getVisibilityIcon = (status: string) => {
    if (status === 'hidden') return <EyeOff className="w-4 h-4 text-gray-400" />
    if (status === 'visible_immediate') return <Eye className="w-4 h-4 text-green-500" />
    return <Calendar className="w-4 h-4 text-blue-500" />
  }

  const filteredEvaluations = evaluations.filter(e => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true

    const programName = (e.program_title || '').toLowerCase()
    const studentName = (e.student_name || '').toLowerCase()
    const studentEmail = (e.student_email || '').toLowerCase()

    return programName.includes(q) || studentName.includes(q) || studentEmail.includes(q)
  })

  const groupedByProgram = filteredEvaluations.reduce((acc: Record<string, { title: string, items: Evaluation[] }>, ev) => {
    const pid = ev.program_id
    const title = ev.program_title || 'Onbekend programma'
    if (!acc[pid]) acc[pid] = { title, items: [] }
    acc[pid].items.push(ev)
    return acc
  }, {})

  const toggleProgramExpanded = (programId: string) => {
    setExpandedPrograms(prev => ({ ...prev, [programId]: !prev[programId] }))
  }

  const setProgramVisibility = async (programId: string, visibility: 'hidden' | 'visible_immediate') => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/studio/${studioId}/evaluations/program-visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ program_id: programId, visibility })
    })
    if (res.ok) {
      await loadData()
    }
  }

  const toggleEvaluationVisibility = async (evaluation: Evaluation) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return

    const nextVisibility: 'hidden' | 'visible_immediate' =
      evaluation.visibility_status === 'hidden' ? 'visible_immediate' : 'hidden'

    const response = await fetch(`/api/studio/${studioId}/evaluations/${evaluation.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        score: evaluation.score,
        comment: evaluation.comment,
        criteria: evaluation.criteria || {},
        visibility_status: nextVisibility,
        visible_from: evaluation.visible_from || ''
      })
    })

    if (response.ok) {
      await loadData()
    }
  }

  if (loading) {
    return (
      <div>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <FeatureGate flagKey="studio.evaluations" mode="page" title="Evaluaties (coming soon)">
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Evaluaties</h1>
          <p className="text-slate-600">Bekijk en beheer alle evaluaties van jouw studio</p>
        </div>

        <div className="flex gap-2 sm:gap-3">
          <FeatureGate flagKey="studio.evaluations.export" defaultEnabled={true}>
            <button
              onClick={exportEvaluations}
              aria-label="Exporteren"
              title="Exporteren"
              className="inline-flex items-center justify-center p-2 sm:px-4 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exporteren</span>
            </button>
          </FeatureGate>
          <button
            onClick={() => {
              setShowSettingsModal(true)
              if (selectedProgramId && programSettingsById[selectedProgramId]) {
                setProgramSettingsDraft({ ...programSettingsById[selectedProgramId] })
              }
            }}
            aria-label="Instellingen"
            title="Instellingen"
            className="inline-flex items-center justify-center p-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Instellingen</span>
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {!featureEnabled && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            Evaluaties zijn uitgeschakeld voor deze studio. Ga naar Settings → Features om Evaluaties in te schakelen.
          </p>
        </div>
      )}
      {!studioSettings.enabled && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">
            ⚠️ Evaluaties zijn momenteel uitgeschakeld. Klik op "Instellingen" om deze functie in te schakelen.
          </p>
        </div>
      )}

      {/* Search (same styling as Members page) */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Zoek op programma of leerling..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Evaluations List grouped by program */}
      {featureEnabled && (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Evaluaties per Programma</h2>
        </div>

        <div className="divide-y divide-gray-200">
          {Object.entries(groupedByProgram).map(([pid, group]) => {
            const expanded = !!expandedPrograms[pid]
            const anyVisible = group.items.some(i => i.visibility_status === 'visible_immediate')
            return (
              <div key={pid}>
                <div className="flex items-center justify-between p-4 hover:bg-gray-50">
                  <button onClick={() => toggleProgramExpanded(pid)} className="flex items-center gap-2 text-left">
                    {expanded ? <ChevronDown className="w-4 h-4 text-gray-600"/> : <ChevronRight className="w-4 h-4 text-gray-600"/>}
                    <span className="font-semibold text-gray-900">{group.title}</span>
                    <span className="ml-2 text-xs text-gray-500">({group.items.length})</span>
                  </button>
                  <button
                    title={anyVisible ? 'Zet alles verborgen' : 'Maak alles zichtbaar'}
                    onClick={() => setProgramVisibility(pid, anyVisible ? 'hidden' : 'visible_immediate')}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    {anyVisible ? <EyeOff className="w-4 h-4 text-gray-600"/> : <Eye className="w-4 h-4 text-green-600"/>}
                    <span className="hidden sm:inline">{anyVisible ? 'Verbergen' : 'Zichtbaar maken'}</span>
                  </button>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {group.items.map(evaluation => (
                      <div key={evaluation.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">{evaluation.student_name || evaluation.student_email || 'Onbekende leerling'}</span>
                          <span className="flex items-center gap-1 text-xs text-gray-600">
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                            {(() => {
                              const method = getMethodForProgram(evaluation.program_id)
                              if (method === 'feedback' || method === 'rating') return '—'
                              const s = typeof evaluation.score === 'number' ? evaluation.score : undefined
                              if (s == null) return '—'
                              if (method === 'percent') return `${Math.round(s)}%`
                              return `${formatOneDecimalComma(s)}/10`
                            })()}
                          </span>
                          <span className="hidden sm:inline-flex">{getVisibilityIcon(evaluation.visibility_status)}</span>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2">
                          <button
                            type="button"
                            title={evaluation.visibility_status === 'hidden' ? 'Zichtbaar maken' : 'Verbergen'}
                            aria-label={evaluation.visibility_status === 'hidden' ? 'Zichtbaar maken' : 'Verbergen'}
                            onClick={() => toggleEvaluationVisibility(evaluation)}
                            className="inline-flex items-center justify-center p-2 sm:px-3 sm:py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                          >
                            {evaluation.visibility_status === 'hidden' ? (
                              <Eye className="w-4 h-4 text-green-600" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-gray-600" />
                            )}
                            <span className="hidden sm:inline ml-2">{evaluation.visibility_status === 'hidden' ? 'Zichtbaar maken' : 'Verbergen'}</span>
                          </button>
                          <button
                            onClick={() => openEditModal(evaluation)}
                            className="inline-flex items-center justify-center p-2 sm:px-3 sm:py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-sm"
                            aria-label="Bewerken"
                            title="Bewerken"
                          >
                            <Edit2 className="w-4 h-4" />
                            <span className="hidden sm:inline ml-2">Bewerken</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {Object.keys(groupedByProgram).length === 0 && (
            <div className="p-12 text-center">
              <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Geen evaluaties gevonden</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)}>
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Evaluatie Instellingen</h2>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-900">Evaluaties Inschakelen</label>
                  <p className="text-sm text-gray-500">Sta leraren toe om evaluaties te geven</p>
                </div>
                <input
                  type="checkbox"
                  checked={studioSettings.enabled}
                  onChange={(e) => setStudioSettings({ ...studioSettings, enabled: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-900 mb-2">Programma</label>
                <FormSelect
                  value={selectedProgramId}
                  onChange={(e) => {
                    const pid = e.target.value
                    setSelectedProgramId(pid)
                    const base = programSettingsById[pid]
                    setProgramSettingsDraft(base ? { ...base } : null)
                  }}
                >
                  {programRows.map((p) => (
                    <option key={p.program_id} value={p.program_id}>{p.program_title}</option>
                  ))}
                </FormSelect>
                <p className="text-sm text-gray-500 mt-1">Instellingen gelden per programma.</p>
              </div>

              {programSettingsDraft && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium text-gray-900">Evaluaties voor dit programma</label>
                      <p className="text-sm text-gray-500">Toestaan of blokkeren per programma</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={programSettingsDraft.enabled}
                      onChange={(e) => setProgramSettingsDraft({ ...programSettingsDraft, enabled: e.target.checked })}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium text-gray-900">Leraren Mogen Bewerken</label>
                      <p className="text-sm text-gray-500">Na publicatie nog aanpassingen toestaan</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={programSettingsDraft.allow_teachers_edit}
                      onChange={(e) => setProgramSettingsDraft({ ...programSettingsDraft, allow_teachers_edit: e.target.checked })}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-900 mb-2">Standaard Zichtbaarheid</label>
                    <FormSelect
                      value={programSettingsDraft.default_visibility}
                      onChange={(e) => setProgramSettingsDraft({ ...programSettingsDraft, default_visibility: e.target.value })}
                    >
                      <option value="hidden">Verborgen</option>
                      <option value="visible_immediate">Direct Zichtbaar</option>
                      <option value="visible_on_date">Op Datum</option>
                    </FormSelect>
                    {programSettingsDraft.default_visibility === 'visible_on_date' && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">Zichtbaar vanaf datum</label>
                        <input
                          type="date"
                          value={(programSettingsDraft as any).default_visible_from || ''}
                          onChange={(e) => setProgramSettingsDraft({ ...programSettingsDraft, default_visible_from: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block font-medium text-gray-900 mb-2">Evaluatie Methode</label>
                    <FormSelect
                      value={programSettingsDraft.method}
                      onChange={(e) => setProgramSettingsDraft({ ...programSettingsDraft, method: e.target.value as any })}
                    >
                      <option value="score">Score (1-10)</option>
                      <option value="percent">% (punten op 100)</option>
                      <option value="rating">Beoordelingen (schaal)</option>
                      <option value="feedback">Enkel feedback</option>
                    </FormSelect>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-900 mb-2">Categorieën (komma-gescheiden)</label>
                    <input
                      type="text"
                      value={categoriesText}
                      onChange={(e) => setCategoriesText(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {programSettingsDraft.method === 'rating' && (
                    <div>
                      <label className="block font-medium text-gray-900 mb-2">Beoordelingsschaal (komma-gescheiden)</label>
                      <input
                        type="text"
                        value={ratingScaleText}
                        onChange={(e) => setRatingScaleText(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block font-medium text-gray-900 mb-2">Periodes (komma-gescheiden)</label>
                    <input
                      type="text"
                      value={periodsText}
                      onChange={(e) => setPeriodsText(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-900 mb-2">Bewerkbaar Na Publicatie (dagen)</label>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={programSettingsDraft.editable_after_publish_days}
                      onChange={(e) => setProgramSettingsDraft({ ...programSettingsDraft, editable_after_publish_days: parseInt(e.target.value) })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveSettings}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Opslaan
              </button>
              <button
                type="button"
                onClick={applySettingsToAllPrograms}
                className="flex-1 border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Pas toe op alle programma's
              </button>
              {/* Remove close button; use X or outside click */}
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedEvaluation && (
        <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)}>
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Evaluatie Bewerken</h2>
            <p className="text-gray-600 mb-6">Voor: {selectedEvaluation?.student_name || selectedEvaluation?.student_email || 'Onbekende leerling'}</p>

            {(() => {
              const scale = getScaleForProgram(selectedEvaluation.program_id)
              if (scale.method === 'feedback' || scale.method === 'rating') return null
              return (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{scale.label}</label>
                  <input
                    type="number"
                    min={scale.min}
                    max={scale.max}
                    step={scale.step}
                    value={editFormData.score}
                    onChange={(e) => setEditFormData({ ...editFormData, score: parseFloat(e.target.value) as any })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )
            })()}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Commentaar
              </label>
              <textarea
                value={editFormData.comment}
                onChange={(e) => setEditFormData({ ...editFormData, comment: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

              <div className="mb-6">
              <label className="block text-sm font-medium text-slate-900 mb-2 dark:text-slate-100">
                Zichtbaarheid
              </label>
              <FormSelect
                value={editFormData.visibility_status}
                onChange={(e) => setEditFormData({ 
                  ...editFormData, 
                  visibility_status: e.target.value as any 
                })}
                className="mb-3"
              >
                <option value="hidden">Verborgen</option>
                <option value="visible_immediate">Direct Zichtbaar</option>
                <option value="visible_on_date">Zichtbaar vanaf datum</option>
              </FormSelect>

              {editFormData.visibility_status === 'visible_on_date' && (
                <input
                  type="date"
                  value={editFormData.visible_from}
                  onChange={(e) => setEditFormData({ ...editFormData, visible_from: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={saveEvaluation}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Opslaan
              </button>
              {/* Remove close button; use X or outside click */}
            </div>
          </div>
        </Modal>
      )}
    </div>
    </FeatureGate>
  )
}
