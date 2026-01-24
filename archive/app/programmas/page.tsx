'use client'

import { useEffect, useState } from 'react'
import { useNotification } from '@/contexts/NotificationContext'
import { supabase } from '@/lib/supabase'
import { Program, Studio } from '@/types/database'
import { useRouter } from 'next/navigation'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingState } from '@/components/ui/LoadingState'

export default function ProgrammasPage() {
  const [programs, setPrograms] = useState<(Program & { studio?: Studio })[]>([])
  const [loading, setLoading] = useState(true)
  const [roleMap, setRoleMap] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'all' | 'group' | 'workshop'>('all')
  const router = useRouter()
  const { showModal } = useNotification()

  useEffect(() => {
    fetchPrograms()
  }, [filter])

  const fetchPrograms = async () => {
    try {
      let query = supabase.from('programs').select('*, studio:studios(*)').eq('is_public', true).order('created_at', { ascending: true })

      if (filter !== 'all') {
        query = query.eq('program_type', filter)
      }

      const { data, error } = await query

      if (error) throw error

      setPrograms(data || [])

      // If a user is signed in, fetch their roles for the studios present in the
      // fetched program list so we can decide whether to show capacity despite the toggle.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && data && Array.isArray(data) && data.length > 0) {
          const studioIds = Array.from(new Set((data as any).map((p: any) => p.studio?.id).filter(Boolean)));
          if (studioIds.length > 0) {
            const { data: roles } = await supabase
              .from('user_roles')
              .select('studio_id, role')
              .in('studio_id', studioIds)
              .eq('user_id', user.id);

            const map: Record<string, string> = {};
            (roles || []).forEach((r: any) => {
              if (r && r.studio_id && r.role) map[r.studio_id] = r.role;
            });
            setRoleMap(map);
          }
        }
      } catch (err) {
        console.debug('Could not build role map for programs list', err);
      }
    } catch (error) {
      console.error('Error fetching programs:', error)
    } finally {
      setLoading(false)
    }
  }

  // Navigates to program detail so user can add the program to the cart from the
  // canonical detail page (consistent flow across the app).
  const openProgramDetail = (programId: string) => {
    router.push(`/program/${programId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState label="Laden…" className="py-0" spinnerSize={48} />
      </div>
    )
  }

  return (
    <FeatureGate flagKey="welcome.programmas" mode="page" title="Programma's komen binnenkort">
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">
            Alle Programma&apos;s
          </h1>
          <p className="mt-2 text-gray-600">
            Ontdek cursussen en workshops van alle studios
          </p>
        </div>

        {/* Filter */}
        <div className="mb-8 flex space-x-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-md font-medium ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Alles
          </button>
          <button
            onClick={() => setFilter('group')}
            className={`px-4 py-2 rounded-md font-medium ${
              filter === 'group'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Cursussen
          </button>
          <button
            onClick={() => setFilter('workshop')}
            className={`px-4 py-2 rounded-md font-medium ${
              filter === 'workshop'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Workshops
          </button>
        </div>

        {/* Programs Grid */}
        {programs.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-md">
            <p className="text-gray-500">
              Er zijn geen programma&apos;s beschikbaar met dit filter.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => (
              <div
                key={program.id}
                className="bg-white rounded-lg shadow-md p-6 flex flex-col"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {program.title}
                    </h3>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                        program.program_type === 'group'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {program.program_type === 'group' ? 'Cursus' : 'Workshop'}
                    </span>
                  </div>
                  {program.price && (
                    <div className="text-right ml-4">
                      <p className="text-2xl font-bold text-gray-900">€{program.price}</p>
                    </div>
                  )}
                </div>

                {program.studio && (
                  <p className="text-sm text-gray-500 mb-3">📍 {program.studio.naam}</p>
                )}

                {program.description && (
                  <p className="text-gray-600 mb-4 grow">{program.description}</p>
                )}

                <div className="space-y-2 text-sm text-gray-500 mb-4">
                  {/* Only show capacity to visitors if the program allows it (default true) AND studio allows capacity visibility */}
                  {program.capacity && (((program.show_capacity_to_users ?? true) || (program.studio && roleMap[program.studio.id] === 'teacher') || (program.studio && roleMap[program.studio.id] === 'studio_admin')) && (program.studio?.features?.capacity_visibility !== false)) && (
                    <p>
                      <span className="font-semibold">Max. deelnemers:</span> {program.capacity}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => openProgramDetail(program.id)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 py-2 px-4 rounded-md hover:bg-slate-100 transition-colors font-medium"
                >
                  Meer info
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </FeatureGate>
  )
}
