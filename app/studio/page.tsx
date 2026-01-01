'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Studio } from '@/types/database'
import Link from 'next/link'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingState } from '@/components/ui/LoadingState'

export default function StudiosPage() {
  const [studios, setStudios] = useState<Studio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStudios()
  }, [])

  const fetchStudios = async () => {
    try {
      const { data, error } = await supabase
        .from('studios')
        .select('*')
        .order('naam', { ascending: true })

      if (error) throw error

      setStudios(data || [])
    } catch (error) {
      console.error('Error fetching studios:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState label="Laden…" className="py-0" spinnerSize={48} />
      </div>
    )
  }

  return (
    <FeatureGate flagKey="welcome.studios" mode="page" title="Studios komen binnenkort">
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Studios</h1>
          <p className="mt-2 text-gray-600">
            Ontdek alle beschikbare studios en hun programma&apos;s
          </p>
        </div>

        {studios.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              Er zijn nog geen studios beschikbaar.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {studios.map((studio) => (
              <Link
                key={studio.id}
                href={`/studio/${studio.id}`}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  {studio.naam}
                </h2>
                <div className="space-y-1 text-sm text-gray-500">
                  {studio.location && <p>📍 {studio.location}</p>}
                  {studio.phone_number && <p>📞 {studio.phone_number}</p>}
                  {studio.contact_email && <p>✉️ {studio.contact_email}</p>}
                </div>
                <div className="mt-4">
                  <span className="text-blue-600 font-medium">
                    Bekijk programma&apos;s →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
        </div>
      </div>
    </FeatureGate>
  )
}
