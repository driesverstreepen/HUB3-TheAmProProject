import { Program } from '@/types/database'
import ContentContainer from '@/components/ContentContainer';
import { Building2, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { getTagClass } from '@/lib/tagColors'

interface ExtendedProgram extends Program {
  group_details?: {
    weekday: number;
    start_time: string;
    end_time: string;
    season_start?: string;
    season_end?: string;
  } | {
    weekday: number;
    start_time: string;
    end_time: string;
    season_start?: string;
    season_end?: string;
  }[];
  workshop_details?: {
    date: string;
    start_time: string;
    end_time: string;
  } | {
    date: string;
    start_time: string;
    end_time: string;
  }[];
  locations?: {
    id: string;
    name: string;
    city?: string;
    adres?: string;
  }[];
}

interface ProgramHeaderProps {
  program: ExtendedProgram
  studioName?: string
  cartItemCount?: number
  showCart?: boolean
  onBack?: () => void
  backText?: string
}

export default function ProgramHeader({
  program,
  studioName,
  cartItemCount = 0,
  showCart = false,
  onBack,
  backText = "Terug"
}: ProgramHeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200">
      <ContentContainer className="py-4">
        {onBack && (
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 t-bodySm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {backText}
            </button>
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {studioName && (
              <div className="flex items-center gap-2 t-bodySm mb-2">
                <Building2 className="w-4 h-4" />
                <span>{studioName}</span>
              </div>
            )}
            <h1 className="t-h1 font-bold mb-2">{program.title}</h1>
            <div className="flex items-center gap-2 mb-4">
              {/* program type tag */}
              <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${program.program_type === 'group' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200'}`}>
                {program.program_type === 'group' ? 'Cursus' : 'Workshop'}
              </span>

              {/* Always show the following tags: dance style, level, age info */}
              <div className="flex items-center gap-2">
                {program.dance_style && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass(program.dance_style)}`}>
                    {program.dance_style}
                  </span>
                )}
                {program.level && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass(program.level)}`}>
                    {program.level}
                  </span>
                )}
                {(program.min_age !== undefined && program.min_age !== null) && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass(String(program.min_age))}`}>
                    {program.min_age}+ jaar
                  </span>
                )}
                {(program.max_age !== undefined && program.max_age !== null && !program.min_age) && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass(String(program.max_age))}`}>
                    tot {program.max_age} jaar
                  </span>
                )}
                {(!program.min_age && !program.max_age) && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass('all')}`}>
                    Alle leeftijden
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-end gap-4">
            {/* Shopping Cart */}
            {showCart && (
              <Link
                href="/cart"
                className="relative p-2 text-slate-600 hover:text-slate-900 transition-colors"
                title="Winkelmandje bekijken"
              >
                <ShoppingCart className="w-6 h-6" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white t-caption t-noColor rounded-full h-5 w-5 flex items-center justify-center font-medium">
                    {cartItemCount > 99 ? '99+' : cartItemCount}
                  </span>
                )}
              </Link>
            )}
            {program.price && (
              <div className="text-right">
                <div className="t-h1 font-bold">€{program.price}</div>
                <div className="t-bodySm opacity-70">per {program.program_type === 'workshop' ? 'workshop' : 'seizoen'}</div>
              </div>
            )}
          </div>
        </div>
      </ContentContainer>
    </div>
  )
}