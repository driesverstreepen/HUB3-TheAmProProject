'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ContentContainer from '@/components/ContentContainer'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useNotification } from '@/contexts/NotificationContext'
import { Building2, MapPin, ChevronRight } from 'lucide-react'

type FavoriteStudio = {
  id: string
  naam: string
  stad?: string | null
  location?: string | null
  beschrijving?: string | null
  logo_url?: string | null
}

export default function FavorietenPage() {
  const router = useRouter()
  const { showError } = useNotification()
  const [loading, setLoading] = useState(true)
  const [studios, setStudios] = useState<FavoriteStudio[]>([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/favorites/studios', { method: 'GET', credentials: 'include' })
        const json = await res.json().catch(() => ({} as any))

        if (!res.ok) {
          if (res.status === 401) {
            router.push('/auth/login')
            return
          }
          throw new Error(json?.error || `Failed loading favorites (${res.status})`)
        }

        if (!cancelled) {
          setStudios(Array.isArray(json?.studios) ? json.studios : [])
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Fout bij laden')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router, showError])

  return (
    <ContentContainer className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Favorieten</h1>
        <p className="text-slate-600 mt-1">Jouw favoriete studio&apos;s en programma&apos;s</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : studios.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <div className="t-bodySm text-slate-600">Je hebt nog geen favoriete studio’s.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {studios.map((studio) => (
            <button
              key={studio.id}
              onClick={() => router.push(`/studio/public/${studio.id}`)}
              className="text-left bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-200 overflow-hidden group cursor-pointer relative"
            >
              <div className="p-6">
                <div className="absolute top-4 right-4 text-slate-400 group-hover:text-blue-600 transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center overflow-hidden group-hover:bg-blue-600 transition-colors shrink-0">
                    {studio.logo_url ? (
                      <img src={studio.logo_url} alt={`${studio.naam} logo`} className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors truncate">{studio.naam}</h3>
                    {(studio.location || studio.stad) && (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <MapPin className="w-4 h-4" />
                        <span className="truncate">{studio.location || studio.stad}</span>
                      </div>
                    )}
                  </div>
                </div>

                {studio.beschrijving ? (
                  <p className="text-slate-600 mb-2 line-clamp-2">{studio.beschrijving}</p>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </ContentContainer>
  )
}
