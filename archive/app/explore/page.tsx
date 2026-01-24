'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Building2, MapPin, ArrowRight } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useRouter } from 'next/navigation'

interface Studio {
  id: string
  naam: string
  beschrijving: string | null
  adres: string | null
  stad: string | null
  postcode: string | null
  website: string | null
  phone_number: string | null
  contact_email: string | null
  is_public: boolean
}

export default function ExplorePage() {
  const [studios, setStudios] = useState<Studio[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    loadUser()
    loadStudios()
  }, [])

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const loadStudios = async () => {
    try {
      const { data, error } = await supabase
        .from('studios')
        .select('id, naam, beschrijving, adres, stad, postcode, website, phone_number, contact_email, is_public')
        .eq('is_public', true)
        .order('naam')

      if (error) throw error
      setStudios(data || [])
    } catch (err) {
      console.error('Failed to load studios:', err)
    } finally {
      setLoading(false)
    }
  }



  return (
    <div className="max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Studio HUB</h1>
        <p className="text-slate-600">Ontdek beschikbare studios en programma's</p>
      </div>

        {loading ? (
          <div className="text-center py-12">
            <LoadingSpinner size={48} label="Laden" />
            <p className="mt-4 text-slate-600">Studios laden…</p>
          </div>
        ) : studios.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-slate-200">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">Nog geen studio's gevonden</h3>
            <p className="text-slate-600 mb-6">Er zijn momenteel geen studio's beschikbaar om te ontdekken.</p>
            {!user && (
              <button
                onClick={() => router.push('/auth/registreer?path=studio_creation')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <Building2 className="w-5 h-5" />
                Maak je eigen studio
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {studios.map((studio) => (
              <div
                key={studio.id}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-200 overflow-hidden group cursor-pointer"
                onClick={() => router.push(`/studio/public/${studio.id}`)}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                      <Building2 className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {studio.naam}
                  </h3>
                  
                  {studio.beschrijving && (
                    <p className="text-slate-600 mb-4 line-clamp-2">
                      {studio.beschrijving}
                    </p>
                  )}
                  
                  <div className="space-y-2">
                    {studio.stad && (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <MapPin className="w-4 h-4" />
                        <span>{studio.stad}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg font-medium transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
                      Bekijk Studio
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
  )
}
