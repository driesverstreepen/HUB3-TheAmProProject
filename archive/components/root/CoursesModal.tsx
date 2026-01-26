"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ProgramCard from '@/components/ProgramCard'
import ProgramListItem from '@/components/ProgramListItem'
import { Calendar, Users, BookMarked, Grid, List } from 'lucide-react'
import { ProgramLevel } from '@/types/database'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface TeacherProgram {
  id: string;
  teacher_id: string;
  program_id: string;
  program: {
    id: string;
    title: string;
    description: string;
    program_type: 'group' | 'workshop';
    dance_style: string;
    level: ProgramLevel | undefined;
    price?: number;
    min_age?: number;
    max_age?: number;
    capacity?: number;
    accepts_payment?: boolean;
    show_capacity_to_users?: boolean;
    is_public: boolean;
    created_at: string;
    updated_at: string;
    studio_id: string;
    studio: {
      naam: string;
      location: string;
    };
    program_locations?: {
      location_id: string;
      locations: {
        id: string;
        name: string;
        city?: string;
        adres?: string;
      };
    }[];
    group_details?: any[];
    workshop_details?: any[];
  };
}

type TabType = 'group' | 'workshop';

interface CoursesModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenProgramDetail?: Function
}

export default function CoursesModal({ isOpen, onClose, onOpenProgramDetail }: CoursesModalProps) {
  const [loading, setLoading] = useState(false)
  const [programs, setPrograms] = useState<TeacherProgram[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('group')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    if (isOpen) {
      loadMyPrograms()
    }
  }, [isOpen])

  const loadMyPrograms = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get programs assigned to this teacher with all necessary joins
      const { data: teacherPrograms, error: tpError } = await supabase
        .from('teacher_programs')
        .select(`
          id,
          teacher_id,
          program_id,
          program:programs(
            id,
            title,
            description,
            program_type,
            dance_style,
            level,
            price,
            min_age,
            max_age,
            capacity,
            accepts_payment,
            show_capacity_to_users,
            is_public,
            created_at,
            updated_at,
            studio_id,
            studio:studios!inner(naam, location),
            group_details(*),
            workshop_details(*)
          )
        `)
        .eq('teacher_id', user.id)

      if (tpError) throw tpError

      if (!teacherPrograms || teacherPrograms.length === 0) {
        setPrograms([])
        setLoading(false)
        return
      }

      // Get locations for all programs - use a simpler query
      const programIds = teacherPrograms.map(tp => tp.program_id)
      let locationsMap: Record<string, any[]> = {}

      try {
        const { data: programLocations, error: locationsError } = await supabase
          .from('program_locations')
          .select(`
            program_id,
            locations!inner(id, name, city, adres)
          `)
          .in('program_id', programIds)

        if (locationsError) {
          console.error('Locations query error:', locationsError)
        } else {
          // Create a map of program_id -> locations
          programLocations?.forEach((pl: any) => {
            if (!locationsMap[pl.program_id]) {
              locationsMap[pl.program_id] = []
            }
            locationsMap[pl.program_id].push(pl.locations)
          })
        }
      } catch (error) {
        console.error('Failed to load locations:', error)
        // Continue without locations if this fails
      }

      // Normalize the data structure to match ProgramCard expectations
      const normalizedPrograms = (teacherPrograms as any[]).map((tp: any) => {
        const program = tp.program || {};
        const locations = locationsMap[program.id] || []
        const rawGroup = program.group_details ? (Array.isArray(program.group_details) ? program.group_details : [program.group_details]) : [];
        const normalizedGroup = rawGroup.map((d: any) => ({
          weekday: d.weekday,
          start_time: d.start_time,
          end_time: d.end_time,
          season_start: d.season_start ?? undefined,
          season_end: d.season_end ?? undefined,
        }));

        const rawWorkshop = program.workshop_details ? (Array.isArray(program.workshop_details) ? program.workshop_details : [program.workshop_details]) : [];
        const normalizedWorkshop = rawWorkshop.map((d: any) => ({
          date: d.date ?? d.start_datetime,
          start_time: d.start_time ?? (d.start_datetime ? d.start_datetime : null),
          end_time: d.end_time ?? d.end_datetime,
        }));

        return {
          ...tp,
          program: {
            ...program,
            locations,
            group_details: normalizedGroup,
            workshop_details: normalizedWorkshop,
          }
        };
      });

      setPrograms(normalizedPrograms as TeacherProgram[])
    } catch (error) {
      console.error('Error loading programs:', error)
    } finally {
      setLoading(false)
    }
  }

  const getFilteredPrograms = () => {
    return programs.filter(p => p.program.program_type === activeTab)
  }

  const filteredPrograms = getFilteredPrograms()
  const groupCount = programs.filter(p => p.program.program_type === 'group').length
  const workshopCount = programs.filter(p => p.program.program_type === 'workshop').length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="max-w-6xl"
      ariaLabel="Mijn Cursussen"
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Mijn Programma's</h2>
        <p className="text-slate-600">
          Bekijk en beheer je toegewezen cursussen
        </p>
      </div>

        {/* Tabs and View Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('group')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                activeTab === 'group'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              Groepscursussen ({groupCount})
            </button>
            <button
              onClick={() => setActiveTab('workshop')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                activeTab === 'workshop'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Workshops ({workshopCount})
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setView('grid')}
              className={`p-2 rounded-lg ${
                view === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded-lg ${
                view === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size={32} label="Laden" />
            <span className="ml-2 text-slate-600">Cursussen laden…</span>
          </div>
        ) : filteredPrograms.length === 0 ? (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-12 text-center">
            <BookMarked className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Nog geen cursussen toegewezen
            </h3>
            <p className="text-slate-600">
              Je studio admin kan cursussen aan je toewijzen via de programma instellingen.
            </p>
          </div>
        ) : (
          <div className={`grid gap-4 max-h-96 overflow-y-auto ${
            view === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'
          }`}>
            {filteredPrograms.map((teacherProgram) => (
              view === 'grid' ? (
                <div key={teacherProgram.id} className="relative">
                  <ProgramCard
                    program={teacherProgram.program}
                    showCapacity={true}
                    onOpen={() => onOpenProgramDetail ? onOpenProgramDetail(teacherProgram.program.id) : window.open(`/teacher/courses/${teacherProgram.program.id}`, '_blank')}
                  />
                </div>
              ) : (
                <ProgramListItem
                  key={teacherProgram.id}
                  program={teacherProgram.program}
                  onOpen={() => onOpenProgramDetail ? onOpenProgramDetail(teacherProgram.program.id) : window.open(`/teacher/courses/${teacherProgram.program.id}`, '_blank')}
                />
              )
            ))}
          </div>
        )}
    </Modal>
  )
}