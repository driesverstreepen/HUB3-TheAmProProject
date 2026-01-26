"use client"

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import AttendanceMatrix from '@/components/AttendanceMatrix'
import ProgramListItem from '@/components/ProgramListItem'
import Tag from '@/components/ui/Tag'
import { formatDateOnly, formatTimeStr } from '@/lib/formatting'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears'

export default function Page() {
  const params = useParams()
  const studioId = params?.id as string
  const { selectedYearId: activeYearId, missingTable: schoolYearsMissing } = useStudioSchoolYears(studioId)
  const [programs, setPrograms] = useState<any[]>([])
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null)
  const [selectedProgramTitle, setSelectedProgramTitle] = useState<string>('')
  const [selectedProgram, setSelectedProgram] = useState<any | null>(null)
  const [featureEnabled, setFeatureEnabled] = useState(true)

  useEffect(() => {
    if (!studioId) return
    if (!schoolYearsMissing && !activeYearId) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // Check if attendance feature is enabled
        const { data: studioData } = await supabase
          .from('studios')
          .select('features, attendance_enabled')
          .eq('id', studioId)
          .maybeSingle()
        
        const attendanceFeature = studioData?.features?.attendance ?? studioData?.attendance_enabled ?? false
        if (mounted) setFeatureEnabled(!!attendanceFeature)
        
        if (!attendanceFeature) {
          if (mounted) setLoading(false)
          return
        }
        let programsQuery = supabase
          .from('programs')
          .select(`
            id,
            title,
            program_type,
            dance_style,
            level,
            min_age,
            max_age,
            price,
            group_details(*),
            workshop_details(*),
            program_locations(location_id, locations(*))
          `)
          .eq('studio_id', studioId)
        if (activeYearId) programsQuery = programsQuery.eq('school_year_id', activeYearId)

        const { data: progs, error } = await programsQuery.order('title', { ascending: true })

        if (error) throw error
        if (!mounted) return
        // transform program_locations into locations array for ProgramListItem
        const enriched = (progs || []).map((p: any) => {
          return {
            ...p,
            group_details: Array.isArray(p.group_details) && p.group_details.length > 0 ? p.group_details[0] : p.group_details || null,
            workshop_details: Array.isArray(p.workshop_details) && p.workshop_details.length > 0 ? p.workshop_details[0] : p.workshop_details || null,
            locations: p.program_locations?.map((pl: any) => pl.locations).filter(Boolean) || [],
          }
        })

        setPrograms(enriched || [])
        // Fetch member counts per program (inschrijvingen)
        try {
          const programIds = (progs || []).map((p: any) => p.id)
          if (programIds.length > 0) {
            let enrollmentsQuery = supabase
              .from('inschrijvingen')
              .select('program_id')
              .in('program_id', programIds)
            if (activeYearId) enrollmentsQuery = enrollmentsQuery.eq('school_year_id', activeYearId)

            const { data: membersData, error: membersError } = await enrollmentsQuery

            if (!membersError && membersData) {
              const counts: Record<string, number> = {}
              for (const enr of membersData) {
                counts[enr.program_id] = (counts[enr.program_id] || 0) + 1
              }
              if (mounted) setMemberCounts(counts)
            }
          }
        } catch (e) {
          console.warn('Failed to load enrollment counts', e)
        }
      } catch (e: any) {
        console.error('Failed loading programs for attendance index', e)
        if (!mounted) return
        setError(e?.message || 'Fout bij laden')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => { mounted = false }
  }, [studioId, activeYearId, schoolYearsMissing])

  return (
    <FeatureGate flagKey="studio.attendance" mode="page">
      <div>
      {!featureEnabled && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            Aanwezigheden zijn uitgeschakeld voor deze studio. Ga naar Settings → Features om Aanwezigheden in te schakelen.
          </p>
        </div>
      )}
      
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Aanwezigheden</h1>
        <p className="text-sm text-slate-600">Selecteer een programma om de aanwezigheid per les te bekijken.</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-600">
          <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
          <span>Laden…</span>
        </div>
      )}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && featureEnabled && (
        <div className="space-y-3">
          {programs.map((p) => (
            <ProgramListItem
              key={p.id}
              program={p}
              onOpen={() => {
                setSelectedProgramId(p.id)
                setSelectedProgramTitle(p.title)
                setSelectedProgram(p)
              }}
              status={memberCounts[p.id] ? `${memberCounts[p.id]} ingeschreven` : undefined}
              enrolledCount={memberCounts[p.id] ?? 0}
              showLocation={false}
              showTags={true}
            />
          ))}
          {programs.length === 0 && (
            <div className="text-sm text-slate-600">Geen programma's gevonden voor deze studio.</div>
          )}
        </div>
      )}

      {selectedProgramId && (
        <Modal
          isOpen={true}
          onClose={() => {
            setSelectedProgramId(null)
            setSelectedProgramTitle('')
            setSelectedProgram(null)
          }}
          contentClassName="bg-white rounded-2xl max-w-6xl elev-2"
        >
          <div className="p-1 sm:p-6">
            <h2 className="text-xl font-bold mb-2">Aanwezigheden: {selectedProgramTitle}</h2>

            {/* Tags and schedule */}
            {selectedProgram && (
              <div className="mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedProgram.dance_style && <Tag>{selectedProgram.dance_style}</Tag>}
                  {selectedProgram.level && <Tag>{selectedProgram.level}</Tag>}
                  {selectedProgram.min_age !== null && selectedProgram.min_age !== undefined && selectedProgram.max_age !== null && selectedProgram.max_age !== undefined && (
                    <Tag>{`${selectedProgram.min_age}-${selectedProgram.max_age} jaar`}</Tag>
                  )}
                  {selectedProgram.min_age !== null && selectedProgram.min_age !== undefined && (selectedProgram.max_age === null || selectedProgram.max_age === undefined) && (
                    <Tag>{`${selectedProgram.min_age}+ jaar`}</Tag>
                  )}
                </div>

                {/* weekday and hours for group */}
                {selectedProgram.group_details && (
                  <div className="mt-2 text-sm text-slate-700">
                    {(() => {
                      const wd = selectedProgram.group_details.weekday || selectedProgram.group_details.day || null
                      // DB weekday is 0=Zondag .. 6=Zaterdag. Map to UI 1=Maandag .. 7=Zondag for display.
                      const mappedWd = (wd === 0 || String(wd) === '0') ? 7 : wd
                      const weekdayNames: Record<string, string> = { '1': 'Maandag', '2': 'Dinsdag', '3': 'Woensdag', '4': 'Donderdag', '5': 'Vrijdag', '6': 'Zaterdag', '7': 'Zondag' }
                      const name = mappedWd ? (weekdayNames[String(mappedWd)] || String(mappedWd)) : null
                      const st = selectedProgram.group_details.start_time || null
                      const et = selectedProgram.group_details.end_time || null
                      return (
                        <>
                          {name ? <span className="font-medium mr-2">{name}</span> : null}
                          {st || et ? <span>{st ? formatTimeStr(st) : ''}{st && et ? ` — ${formatTimeStr(et)}` : ''}</span> : null}
                        </>
                      )
                    })()}
                  </div>
                )}

                {selectedProgram.workshop_details && selectedProgram.workshop_details.start_datetime && (
                  <div className="mt-2 text-sm text-slate-700">{selectedProgram.workshop_details.start_datetime ? formatDateOnly(selectedProgram.workshop_details.start_datetime) : null}</div>
                )}
              </div>
            )}

            <AttendanceMatrix programId={selectedProgramId} />
          </div>
        </Modal>
      )}
      </div>
    </FeatureGate>
  )
}

