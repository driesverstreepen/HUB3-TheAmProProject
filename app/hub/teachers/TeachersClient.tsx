"use client"

import { useEffect, useState, useMemo } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import DANCE_STYLES from '@/lib/danceStyles'
import { Users } from 'lucide-react'
import TeacherList from '@/components/TeacherList'
import { useDevice } from '@/contexts/DeviceContext'
import { LoadingState } from '@/components/ui/LoadingState'

type ProfileRow = {
  id: string
  user_id: string
  first_name?: string | null
  last_name?: string | null
  headline?: string | null
  photo_url?: string | null
}

export default function TeachersClient() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [danceStyleFilter, setDanceStyleFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [sort, setSort] = useState<'newest'|'oldest'|'name-asc'|'name-desc'>('newest')

  const { theme } = useTheme()
  const { isMobile } = useDevice()

  const effectivePageSize = isMobile ? 9 : pageSize

  const [availableDanceStyles, setAvailableDanceStyles] = useState<{ id: number; name: string; slug: string }[]>([])
  const [availableCities, setAvailableCities] = useState<string[]>([])

  useEffect(() => {
    fetchProfiles()
  }, [page, pageSize, isMobile, search, danceStyleFilter, cityFilter, sort])

  useEffect(() => {
    // Load canonical dance styles from API; fall back to deriving from profiles
    const loadFacets = async () => {
      try {
        const res = await fetch('/api/dance-styles')
        if (res.ok) {
          const json = await res.json()
          // Accept array of {id,name,slug} or {dance_styles: [...]}
          let styles: { id: number; name: string; slug: string }[] = []
          if (Array.isArray(json)) styles = json.map((s: any) => ({ id: s.id, name: s.name, slug: s.slug })).filter((s: any) => s.name)
          else if (Array.isArray(json.dance_styles)) styles = json.dance_styles.map((s: any) => ({ id: s.id, name: s.name, slug: s.slug })).filter((s: any) => s.name)
          if (styles.length > 0) setAvailableDanceStyles(styles.sort((a,b) => a.name.localeCompare(b.name)))
        } else {
          throw new Error('non-ok')
        }
      } catch (err) {
        // fallback: derive from profiles
  console.warn('Could not load /api/dance-styles, falling back to DB-derived list', err)
        try {
          const { data } = await supabase.from('public_teacher_profiles').select('dance_style, city')
          if (data) {
            // dance_style may be array or string
            const stylesSet = new Set<string>()
            data.forEach((r: any) => {
              if (!r) return
              if (Array.isArray(r.dance_style)) r.dance_style.forEach((s: string) => s && stylesSet.add(String(s).trim()))
              else if (typeof r.dance_style === 'string') r.dance_style.split(',').map((s: string) => s.trim()).filter(Boolean).forEach((s: string) => stylesSet.add(s))
            })
            const styles = Array.from(stylesSet).sort()
            // Fallback: map names to objects with no id (client will still support name-based fallback filtering)
            setAvailableDanceStyles(styles.length ? styles.map((n) => ({ id: -1, name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') })) : DANCE_STYLES.map((n: string, idx: number) => ({ id: -1 - idx, name: n, slug: n })))

            const cities = Array.from(new Set(data.map((r: any) => (r.city || '').trim()).filter(Boolean))).sort()
            setAvailableCities(cities)
          }
        } catch (err2) {
          console.error('Failed to load filter facets (fallback):', err2)
          setAvailableDanceStyles(DANCE_STYLES.map((n: string, idx: number) => ({ id: -1 - idx, name: n, slug: n })))
        }
      }
    }
    loadFacets()
  }, [])

  const fetchProfiles = async () => {
    const append = isMobile && page > 1
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const start = (page - 1) * effectivePageSize
      const end = start + effectivePageSize - 1

      let query = supabase
        .from('public_teacher_profiles')
        .select('*', { count: 'exact' })
        .eq('is_public', true)

      // apply filters
      // If danceStyleFilter is a numeric id that corresponds to canonical styles, filter via the junction table.
      if (danceStyleFilter) {
        const parsed = Number(danceStyleFilter)
        if (!Number.isNaN(parsed) && parsed > 0) {
          // fetch matching teacher_profile_ids from junction
          const { data: links, error: linksErr } = await supabase.from('teacher_dance_styles').select('teacher_profile_id').eq('dance_style_id', parsed)
          if (linksErr) throw linksErr
          const ids = (links || []).map((l: any) => l.teacher_profile_id)
          // if there are no matching ids, return empty
          if (ids.length === 0) {
            setProfiles([])
            setTotal(0)
            setLoading(false)
            return
          }
          query = query.in('id', ids)
        } else {
          // fallback: pre-normalization stores text[] on the profile; support filtering by name
          query = query.contains('dance_style', [danceStyleFilter])
        }
      }
      if (cityFilter) query = query.eq('city', cityFilter)

      // search
      if (search.trim()) {
        const term = `%${search.trim()}%`
        query = query.or(`first_name.ilike.${term},last_name.ilike.${term},headline.ilike.${term}`)
      }

      // sorting
      switch (sort) {
        case 'newest':
          query = query.order('created_at', { ascending: false })
          break
        case 'oldest':
          query = query.order('created_at', { ascending: true })
          break
        case 'name-asc':
          query = query.order('first_name', { ascending: true })
          break
        case 'name-desc':
          query = query.order('first_name', { ascending: false })
          break
      }

      const { data, error, count } = await query.range(start, end)
      if (error) throw error

      const next = ((data as any) || []) as any[]
      if (append) {
        setProfiles((prev) => {
          const seen = new Set(prev.map((p: any) => p?.id).filter(Boolean))
          const merged = [...prev]
          next.forEach((p: any) => {
            if (p?.id && !seen.has(p.id)) merged.push(p)
          })
          return merged as any
        })
      } else {
        setProfiles(next as any)
      }
      setTotal(count ?? 0)
    } catch (err) {
      console.error('Failed to load teacher profiles:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])
  const canLoadMoreMobile = isMobile && profiles.length < total

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Teacher HUB</h1>
          <p className="text-slate-600">Ontdek getalenteerde teachers</p>
        </div>

          {loading ? (
            <LoadingState label="Docenten laden..." />
          ) : profiles.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-slate-200">
              <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Geen docenten gevonden</h3>
              <p className="text-slate-600 mb-6">Er zijn momenteel geen publieke docentprofielen.</p>
            </div>
          ) : (
            <>
              <TeacherList
                initialProfiles={profiles}
                searchTerm={search}
                setSearchTerm={(v) => { setPage(1); setProfiles([]); setSearch(v) }}
                availableDanceStyles={availableDanceStyles}
                availableCities={availableCities}
                danceStyleFilter={danceStyleFilter}
                setDanceStyleFilter={(v) => { setPage(1); setProfiles([]); setDanceStyleFilter(v) }}
                cityFilter={cityFilter}
                setCityFilter={(v) => { setPage(1); setProfiles([]); setCityFilter(v) }}
                sort={sort}
                setSort={(v) => { setPage(1); setProfiles([]); setSort(v as any) }}
                pageSize={isMobile ? undefined : pageSize}
                setPageSize={isMobile ? undefined : (n) => { setPage(1); setProfiles([]); setPageSize(n) }}
                onFilterChange={() => { setPage(1); if (isMobile) setProfiles([]) }}
              />

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
                  <div className="text-sm text-slate-600">Pagina {page} van {totalPages} — {total} docenten</div>
                  <div className="flex items-center gap-2">
                    <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Vorige</button>
                    <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Volgende</button>
                  </div>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  )
}
