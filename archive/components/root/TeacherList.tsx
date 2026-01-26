"use client"

import React, { useMemo, useState } from 'react'
import FormSelect from '@/components/FormSelect'
import SearchFilterBar from './SearchFilterBar'
import TeacherCard from './TeacherCard'
// icons handled by SearchFilterBar

type ProfileRow = {
  id: string
  user_id: string
  first_name?: string | null
  last_name?: string | null
  headline?: string | null
  photo_url?: string | null
  dance_style?: string | null
  city?: string | null
}

export default function TeacherList({
  initialProfiles,
  // parent-controlled search so we can wire server queries from parent
  searchTerm,
  setSearchTerm,
  availableDanceStyles = [],
  availableCities = [],
  danceStyleFilter,
  setDanceStyleFilter,
  cityFilter,
  setCityFilter,
  sort,
  setSort,
  pageSize,
  setPageSize,
  onFilterChange,
}: {
  initialProfiles: ProfileRow[]
  searchTerm?: string
  setSearchTerm?: React.Dispatch<React.SetStateAction<string>>
  availableDanceStyles?: { id: number; name: string; slug: string }[]
  availableCities?: string[]
  danceStyleFilter?: string
  setDanceStyleFilter?: React.Dispatch<React.SetStateAction<string>>
  cityFilter?: string
  setCityFilter?: React.Dispatch<React.SetStateAction<string>>
  sort?: string
  setSort?: React.Dispatch<React.SetStateAction<string>>
  pageSize?: number
  setPageSize?: React.Dispatch<React.SetStateAction<number>>
  onFilterChange?: () => void
}) {
  const [internalSearch, setInternalSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const effectiveSearch = typeof searchTerm === 'string' ? searchTerm : internalSearch
  const setEffectiveSearch = (v: string) => {
    if (setSearchTerm) setSearchTerm(v)
    else setInternalSearch(v)
  }

  const filtered = useMemo(() => {
    // When search is parent-controlled, assume server already filtered.
    if (setSearchTerm) return initialProfiles
    const term = (effectiveSearch || '').trim().toLowerCase()
    if (!term) return initialProfiles
    return initialProfiles.filter((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase()
      const headline = (p.headline || '').toLowerCase()
      return name.includes(term) || headline.includes(term)
    })
  }, [initialProfiles, effectiveSearch, setSearchTerm])

  return (
    <div>
      <SearchFilterBar
        value={effectiveSearch}
        onChange={(v) => { setEffectiveSearch(v); onFilterChange?.() }}
        placeholder="Zoek docenten..."
        viewMode={viewMode}
        setViewMode={(m) => setViewMode(m)}
        pageSize={pageSize}
        setPageSize={(n) => { setPageSize?.(n); onFilterChange?.(); }}
        collapsibleMobile
        mobileTitle="Filters"
        rightControls={(
          <>
            <FormSelect value={danceStyleFilter || ''} onChange={(e) => { setDanceStyleFilter?.(e.target.value); onFilterChange?.(); }} className="rounded border-slate-200 md:w-40">
              <option value="">Alle stijlen</option>
              {availableDanceStyles.map(s => (
                <option key={`${s.id}:${s.slug}`} value={String(s.id)}>{s.name}</option>
              ))}
            </FormSelect>

            <FormSelect value={cityFilter || ''} onChange={(e) => { setCityFilter?.(e.target.value); onFilterChange?.(); }} className="rounded border-slate-200 md:w-40">
              <option value="">Alle steden</option>
              {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
            </FormSelect>

            <FormSelect value={sort || 'newest'} onChange={(e) => { setSort?.(e.target.value); onFilterChange?.(); }} className="rounded border-slate-200 md:w-40">
              <option value="newest">Nieuwste</option>
              <option value="oldest">Oudste</option>
              <option value="name-asc">Naam A→Z</option>
              <option value="name-desc">Naam Z→A</option>
            </FormSelect>
          </>
        )}
      />

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-slate-200">
          <p className="text-slate-600">Geen docenten gevonden</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'flex flex-col gap-3'}>
          {filtered.map(p => (
            <TeacherCard key={p.id} profile={p as any} />
          ))}
        </div>
      )}
    </div>
  )
}
