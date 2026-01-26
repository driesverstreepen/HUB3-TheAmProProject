"use client"

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import ProgramCard from '@/components/ProgramCard'
import ProgramListLayout from '@/components/ProgramListLayout'
import ProgramListItem from '@/components/ProgramListItem'
import { Calendar, MapPin, Users, Clock, BookMarked, Grid, List } from 'lucide-react'
import { formatTimeFromDate } from '@/lib/formatting'
import UserSidebar from '@/components/user/UserSidebar'
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

export default function TeacherCoursesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<TeacherProgram[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('group')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const { theme } = useTheme()

  useEffect(() => {
    loadMyPrograms()
  }, [])

  const loadMyPrograms = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

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

        const wdRaw = program.workshop_details ? (Array.isArray(program.workshop_details) ? program.workshop_details[0] : program.workshop_details) : null;
        const normalizedWorkshop = wdRaw ? [{
          date: wdRaw.date || (wdRaw.start_datetime ? String(wdRaw.start_datetime).slice(0,10) : undefined),
          start_time: wdRaw.start_time || (wdRaw.start_datetime ? formatTimeFromDate(wdRaw.start_datetime) : undefined),
          end_time: wdRaw.end_time || (wdRaw.end_datetime ? formatTimeFromDate(wdRaw.end_datetime) : undefined),
        }] : [];

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

  if (loading) {
    return (
      <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
        <UserSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size={48} className="mb-4" />
            <p className="text-slate-600">Cursussen laden…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
      <UserSidebar />
      <div className="flex-1 p-8">
        <ProgramListLayout
          title="Mijn Programma's"
          titleIcon={<BookMarked className="w-8 h-8 text-blue-600" />}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          groupCount={groupCount}
          workshopCount={workshopCount}
          emptyState={{
            icon: <BookMarked className="w-16 h-16 text-slate-300 mx-auto mb-4" />,
            title: "Nog geen cursussen toegewezen",
            description: "Je studio admin kan cursussen aan je toewijzen via de programma instellingen."
          }}
          view={view}
          onViewChange={setView}
        >
          {/* view toggle moved to ProgramListLayout header for consistent placement */}
          {filteredPrograms.map((teacherProgram) => (
            view === 'grid' ? (
              <div key={teacherProgram.id} className="relative">
                <ProgramCard
                  program={teacherProgram.program}
                  showCapacity={true}
                  onOpen={() => router.push(`/teacher/courses/${teacherProgram.program.id}`)}
                />
              </div>
            ) : (
              <ProgramListItem key={teacherProgram.id} program={teacherProgram.program} onOpen={() => router.push(`/teacher/courses/${teacherProgram.program.id}`)} />
            )
          ))}
        </ProgramListLayout>
      </div>
    </div>
  )
}
