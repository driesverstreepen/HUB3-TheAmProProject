'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import { Building2, MapPin, ArrowRight, ChevronRight } from 'lucide-react'
import SearchFilterBar from '@/components/SearchFilterBar'
import { useRouter } from 'next/navigation'
import HubTopNav from '@/components/hub/HubTopNav'
import HubMobileTopNav from '@/components/hub/HubMobileTopNav'
import { useDevice } from '@/contexts/DeviceContext'
import { HubBottomNav } from '@/components/hub/HubBottomNav'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingState } from '@/components/ui/LoadingState'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

interface Studio {
  id: string
  naam: string
  beschrijving: string | null
  adres: string | null
  stad: string | null
  postcode: string | null
  location?: string | null
  website: string | null
  phone_number: string | null
  contact_email: string | null
  is_public: boolean
  logo_url?: string | null
}

export default function StudiosPage() {
  const { isMobile } = useDevice()
  const { isEnabled } = useFeatureFlags()
  const showBottomNav = isEnabled('ui.bottom-nav', true)
  const [studios, setStudios] = useState<Studio[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [viewMode] = useState<'grid' | 'list'>('list')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const router = useRouter()
  const { theme } = useTheme()

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
      const res = await fetch('/api/hub/public-studios')
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load public studios')
      setStudios((json?.studios as Studio[]) || [])
    } catch (err) {
      console.error('Failed to load studios:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <FeatureGate flagKey="hub.studios" mode="page" title="Studio HUB komt binnenkort">
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-slate-50'}`}>
        {isMobile ? <HubMobileTopNav /> : <HubTopNav />}

  <div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12"
      style={{ paddingBottom: showBottomNav ? 'calc(3rem + env(safe-area-inset-bottom) + 12px)' : undefined }}
      >
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Studio HUB</h1>
          <p className="text-slate-600">Ontdek beschikbare studios en programma's</p>
        </div>

        {/* Controls: unified search + view */}
        <SearchFilterBar
          value={query}
          onChange={(v) => { setPage(1); setQuery(v) }}
          placeholder="Zoek op naam of stad"
          viewMode={viewMode}
          pageSize={isMobile ? undefined : pageSize}
          setPageSize={isMobile ? undefined : (n) => { setPage(1); setPageSize(n) }}
        />

        {loading ? (
          <LoadingState label="Studios laden..." />
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
          (() => {
            // Apply filtering
            const q = query.trim().toLowerCase();
            let list = studios.filter(s => {
              if (!q) return true;
              return (s.naam || '').toLowerCase().includes(q) || (s.stad || '').toLowerCase().includes(q);
            });

            const effectivePageSize = isMobile ? 9 : pageSize
            const totalCount = list.length
            const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
            const sliceStart = isMobile ? 0 : (page - 1) * pageSize
            const sliceEnd = isMobile ? page * effectivePageSize : sliceStart + pageSize
            const visible = list.slice(sliceStart, sliceEnd)
            const canLoadMoreMobile = isMobile && visible.length < totalCount

            if (viewMode === 'list') {
              return (
                <>
                  <div className="space-y-4">
                    {visible.map(studio => (
                    <div key={studio.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-200 overflow-hidden group cursor-pointer p-4 flex items-center gap-4" onClick={() => router.push(`/studio/public/${studio.id}`)}>
                      <div className="w-20 h-20 bg-blue-100 rounded-xl flex items-center justify-center overflow-hidden group-hover:bg-blue-600 transition-colors shrink-0">
                        {studio.logo_url ? <img src={studio.logo_url} alt={`${studio.naam} logo`} className="w-full h-full object-contain" /> : <Building2 className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">{studio.naam}</h3>
                        {(studio.location || studio.stad) && (
                          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                            <MapPin className="w-4 h-4" />
                            <span>{studio.location || studio.stad}</span>
                          </div>
                        )}
                        {studio.beschrijving && <p className="text-slate-600 text-sm line-clamp-2 mb-2">{studio.beschrijving}</p>}
                      </div>

                      <div className="shrink-0 ml-4 self-center text-slate-400 group-hover:text-blue-600 transition-colors">
                        <ChevronRight className="w-5 h-5" />
                      </div>
                    </div>
                    ))}
                  </div>

                  {isMobile ? (
                    canLoadMoreMobile ? (
                      <div className="mt-8 flex justify-center">
                        <button
                          onClick={() => setPage((p) => p + 1)}
                          className="px-5 py-3 rounded-lg bg-white border border-slate-200 hover:bg-slate-50"
                        >
                          Toon meer
                        </button>
                      </div>
                    ) : null
                  ) : (
                    <div className="mt-8 flex items-center justify-between">
                      <div className="text-sm text-slate-600">Pagina {page} van {totalPages} — {totalCount} studios</div>
                      <div className="flex items-center gap-2">
                        <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Vorige</button>
                        <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Volgende</button>
                      </div>
                    </div>
                  )}
                </>
              )
            }

            // grid
            return (
              <>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {visible.map((studio) => (
                    <div
                      key={studio.id}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-200 overflow-hidden group cursor-pointer relative"
                      onClick={() => router.push(`/studio/public/${studio.id}`)}
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
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">{studio.naam}</h3>
                            {(studio.location || studio.stad) && (
                              <div className="flex items-center gap-2 text-sm text-slate-500">
                                <MapPin className="w-4 h-4" />
                                <span className="truncate">{studio.location || studio.stad}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {studio.beschrijving && <p className="text-slate-600 mb-2 line-clamp-2">{studio.beschrijving}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                {isMobile ? (
                  canLoadMoreMobile ? (
                    <div className="mt-8 flex justify-center">
                      <button
                        onClick={() => setPage((p) => p + 1)}
                        className="px-5 py-3 rounded-lg bg-white border border-slate-200 hover:bg-slate-50"
                      >
                        Toon meer
                      </button>
                    </div>
                  ) : null
                ) : (
                  <div className="mt-8 flex items-center justify-between">
                    <div className="text-sm text-slate-600">Pagina {page} van {totalPages} — {totalCount} studios</div>
                    <div className="flex items-center gap-2">
                      <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Vorige</button>
                      <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Volgende</button>
                    </div>
                  </div>
                )}
              </>
            )
          })()
  )}
      </div>
      {isMobile && showBottomNav ? <HubBottomNav /> : null}
      </div>
    </FeatureGate>
  )
}