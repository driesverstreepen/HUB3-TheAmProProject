"use client"

import { useEffect, useState, useMemo } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import { Calendar, ArrowRight, Building2 } from 'lucide-react'
import SearchFilterBar from '@/components/SearchFilterBar'
import ProgramCard from '@/components/ProgramCard'
import ProgramListItem from '@/components/ProgramListItem'
import { useRouter } from 'next/navigation'
import { Program, Studio } from '@/types/database'
import Select from '@/components/Select'
import HubTopNav from '@/components/hub/HubTopNav'
import HubMobileTopNav from '@/components/hub/HubMobileTopNav'
import { useDevice } from '@/contexts/DeviceContext'
import { HubBottomNav } from '@/components/hub/HubBottomNav'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingState } from '@/components/ui/LoadingState'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

type SortOption = 'newest' | 'oldest' | 'date-asc' | 'price-asc' | 'price-desc'

type Facets = {
  cities: string[]
  danceStyles: string[]
  levels: string[]
}

export default function HubWorkshopsPage() {
  const { isMobile } = useDevice()
  const { isEnabled } = useFeatureFlags()
  const showBottomNav = isEnabled('ui.bottom-nav', true)
  const [workshops, setWorkshops] = useState<(Program & { studio?: Studio })[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [danceStyleFilter, setDanceStyleFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [sort, setSort] = useState<SortOption>('newest')
  const [facets, setFacets] = useState<Facets>({ cities: [], danceStyles: [], levels: [] })
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const router = useRouter()
  const { theme } = useTheme()

  const effectivePageSize = isMobile ? 9 : pageSize

  useEffect(() => {
    loadUser()
    fetchFacets()
  }, [])

  useEffect(() => {
    fetchWorkshops()
  }, [page, pageSize, isMobile, search, cityFilter, danceStyleFilter, levelFilter, sort])

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const fetchFacets = async () => {
    try {
      const params = new URLSearchParams()
      params.set('page', '1')
      params.set('pageSize', '1')
      params.set('includeFacets', '1')

      const res = await fetch(`/api/hub/workshops?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load workshop facets')
      const f = json?.facets as Facets | undefined
      if (f && typeof f === 'object') setFacets(f)
    } catch (err) {
      console.error('Failed to load workshop facets:', err)
    }
  }

  const fetchWorkshops = async () => {
    const append = isMobile && page > 1
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(effectivePageSize))
      if (search.trim()) params.set('search', search.trim())
      if (cityFilter) params.set('city', cityFilter)
      if (danceStyleFilter) params.set('danceStyle', danceStyleFilter)
      if (levelFilter) params.set('level', levelFilter)
      if (sort) params.set('sort', sort)

      const res = await fetch(`/api/hub/workshops?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load workshops')

      const next = ((json?.workshops as any[]) || []) as any[]
      if (append) {
        setWorkshops((prev) => {
          const seen = new Set(prev.map((p: any) => p?.id).filter(Boolean))
          const merged = [...prev]
          next.forEach((p: any) => {
            if (p?.id && !seen.has(p.id)) merged.push(p)
          })
          return merged as any
        })
      } else {
        setWorkshops(next as any)
      }
      setTotal((json?.total as number) ?? 0)
    } catch (err) {
      console.error('Failed to load workshops:', err)
      if (!isMobile || page <= 1) {
        setWorkshops([])
        setTotal(0)
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const openProgram = (id: string) => router.push(`/program/${id}`)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])
  const canLoadMoreMobile = isMobile && workshops.length < total

  return (
    <FeatureGate flagKey="hub.workshops" mode="page" title="Workshops HUB komt binnenkort">
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-gray-50'}`}>
      {isMobile ? <HubMobileTopNav /> : <HubTopNav />}
      
      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
        style={{ paddingBottom: showBottomNav ? 'calc(3rem + env(safe-area-inset-bottom) + 12px)' : undefined }}
      >
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Workshop HUB</h1>
        <p className="text-slate-600">Ontdek openbare workshops van alle studio's</p>
      </div>

      {/* Controls: unified search + filters */}
      <SearchFilterBar
        value={search}
        onChange={(v) => { setPage(1); setWorkshops([]); setSearch(v) }}
        placeholder="Zoek workshops..."
        viewMode={viewMode}
        setViewMode={setViewMode}
        collapsibleMobile
        mobileTitle="Filters"
        pageSize={isMobile ? undefined : pageSize}
        setPageSize={isMobile ? undefined : (n) => { setPage(1); setWorkshops([]); setPageSize(n) }}
        rightControls={(
          <>
            <Select value={cityFilter} onChange={(e) => { setPage(1); setWorkshops([]); setCityFilter(e.target.value) }} className="w-full md:w-44">
              <option value="">Alle steden</option>
              {facets.cities.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>

            <Select value={danceStyleFilter} onChange={(e) => { setPage(1); setWorkshops([]); setDanceStyleFilter(e.target.value) }} className="w-full md:w-56">
              <option value="">Alle dansstijlen</option>
              {facets.danceStyles.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>

            <Select value={levelFilter} onChange={(e) => { setPage(1); setWorkshops([]); setLevelFilter(e.target.value) }} className="w-full md:w-44">
              <option value="">Alle niveaus</option>
              {facets.levels.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>

            <Select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} className="w-full md:w-44">
              <option value="newest">Nieuwste</option>
              <option value="date-asc">Datum (eerstvolgende)</option>
              <option value="oldest">Oudste</option>
              <option value="price-asc">Prijs oplopend</option>
              <option value="price-desc">Prijs aflopend</option>
            </Select>
          </>
        )}
      />

      {loading ? (
        <LoadingState label="Workshops laden..." />
      ) : workshops.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-slate-200">
          <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Geen workshops gevonden</h3>
          <p className="text-slate-600 mb-6">Er zijn momenteel geen openbare workshops beschikbaar voor deze filter.</p>
          {!user && (
            <button
              onClick={() => router.push('/auth/registreer?path=studio_creation')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Calendar className="w-5 h-5" />
              Maak je eigen studio
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {workshops.map((p) => (
                <div key={p.id} className="h-full">
                  <ProgramCard program={p as any} showCapacity={true} onOpen={() => openProgram(p.id)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {workshops.map((p) => (
                <ProgramListItem
                  key={p.id}
                  program={p as any}
                  onOpen={() => openProgram(p.id)}
                  showLocation={!isMobile}
                  showTags
                />
              ))}
            </div>
          )}

          {isMobile ? (
            canLoadMoreMobile ? (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={loadingMore}
                  className="px-5 py-3 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Laden...' : 'Toon meer'}
                </button>
              </div>
            ) : null
          ) : (
            <div className="mt-8 flex items-center justify-between">
              <div className="text-sm text-slate-600">Pagina {page} van {totalPages} — {total} workshops</div>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Vorige</button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Volgende</button>
              </div>
            </div>
          )}
        </>
      )}
      </div>
      {isMobile && showBottomNav ? <HubBottomNav /> : null}
    </div>
    </FeatureGate>
  )
}
