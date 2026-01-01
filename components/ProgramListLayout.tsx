import { ReactNode } from 'react'
import { Grid, List } from 'lucide-react'

interface ProgramListLayoutProps {
  title: string
  titleIcon?: ReactNode
  activeTab: 'group' | 'workshop'
  onTabChange: (tab: 'group' | 'workshop') => void
  groupCount: number
  workshopCount: number
  children: ReactNode
  emptyState?: {
    icon: ReactNode
    title: string
    description: string
  }
  view?: 'grid' | 'list'
  onViewChange?: (view: 'grid' | 'list') => void
}

export default function ProgramListLayout({
  title,
  titleIcon,
  activeTab,
  onTabChange,
  groupCount,
  workshopCount,
  children,
  emptyState
  , view = 'grid',
  onViewChange
}: ProgramListLayoutProps) {
  const hasPrograms = groupCount > 0 || workshopCount > 0

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            {titleIcon}
            {title}
          </h1>
          <p className="text-slate-600 mt-2">Alle programma's die je geeft</p>
        </div>

        {/* View toggle: show when caller passed onViewChange */}
        {onViewChange ? (
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => onViewChange('grid')}
              aria-label="Grid view"
              className={`p-2 rounded-md ${view === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => onViewChange('list')}
              aria-label="List view"
              className={`p-2 rounded-md ${view === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <List size={16} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 mb-6">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => onTabChange('group')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'group'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cursussen ({groupCount})
          </button>
          <button
            onClick={() => onTabChange('workshop')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'workshop'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Workshops ({workshopCount})
          </button>
        </div>
      </div>

      {/* Programs List */}
      {!hasPrograms ? (
        emptyState ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            {emptyState.icon}
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {emptyState.title}
            </h3>
            <p className="text-slate-600">
              {emptyState.description}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Nog geen programma's toegewezen
            </h3>
            <p className="text-slate-600">
              Er zijn nog geen programma's beschikbaar.
            </p>
          </div>
        )
      ) : (
        view === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-6">
            {children}
          </div>
        ) : (
          <div className="space-y-3">
            {children}
          </div>
        )
      )}
    </div>
  )
}