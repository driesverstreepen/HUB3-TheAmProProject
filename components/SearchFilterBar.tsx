"use client"

import React from 'react'
import { Search, X, Grid as GridIcon, List as ListIcon, ChevronDown, ChevronUp } from 'lucide-react'
import FormSelect from './FormSelect'

interface Props {
  value?: string
  onChange?: (v: string) => void
  placeholder?: string
  rightControls?: React.ReactNode
  viewMode?: 'grid' | 'list'
  setViewMode?: (v: 'grid' | 'list') => void
  pageSize?: number
  setPageSize?: (n: number) => void
  collapsibleMobile?: boolean
  mobileTitle?: string
  defaultCollapsedMobile?: boolean
}

export default function SearchFilterBar({
  value = '',
  onChange,
  placeholder = 'Zoek...',
  rightControls,
  viewMode = 'grid',
  setViewMode,
  pageSize,
  setPageSize,
  collapsibleMobile = false,
  mobileTitle = 'Filters',
  defaultCollapsedMobile = true,
}: Props) {
  const [collapsedMobile, setCollapsedMobile] = React.useState(defaultCollapsedMobile)

  return (
    <div className="bg-white no-shadow rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-10 pr-10 h-10 text-sm border border-slate-200 dark:border-slate-700/60 rounded-lg bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            {value && (
              <button
                onClick={() => onChange?.('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label="Wis zoekterm"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {(setViewMode || (typeof pageSize === 'number' && setPageSize)) && (
            <div className="flex items-center gap-2 shrink-0">
              {setViewMode ? (
                <>
                  <label className="sr-only">Weergave</label>
                  <button
                    aria-label="Grid view"
                    title="Grid"
                    onClick={() => setViewMode('grid')}
                    className={`h-10 w-10 shrink-0 aspect-square inline-flex items-center justify-center rounded-lg ${
                      viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <GridIcon size={16} />
                  </button>
                  <button
                    aria-label="List view"
                    title="List"
                    onClick={() => setViewMode('list')}
                    className={`h-10 w-10 shrink-0 aspect-square inline-flex items-center justify-center rounded-lg ${
                      viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <ListIcon size={16} />
                  </button>
                </>
              ) : null}

              {typeof pageSize === 'number' && setPageSize ? (
                <FormSelect
                  value={String(pageSize)}
                  onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                  className="rounded border-slate-200 dark:border-slate-700/60"
                >
                  <option value="12">12 / pagina</option>
                  <option value="24">24 / pagina</option>
                  <option value="48">48 / pagina</option>
                </FormSelect>
              ) : null}
            </div>
          )}
        </div>

        {rightControls ? (
          <>
            {collapsibleMobile ? (
              <button
                type="button"
                onClick={() => setCollapsedMobile((v) => !v)}
                className="md:hidden w-full flex items-center justify-between text-left"
                aria-expanded={!collapsedMobile}
                aria-label={collapsedMobile ? `Toon ${mobileTitle.toLowerCase()}` : `Verberg ${mobileTitle.toLowerCase()}`}
              >
                <span className="text-sm font-semibold text-slate-900">{mobileTitle}</span>
                {collapsedMobile ? (
                  <ChevronDown size={18} className="text-slate-500" />
                ) : (
                  <ChevronUp size={18} className="text-slate-500" />
                )}
              </button>
            ) : null}

            <div className={`${collapsibleMobile && collapsedMobile ? 'hidden' : 'flex'} md:flex flex-col sm:flex-row gap-3`}>
              {rightControls}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
