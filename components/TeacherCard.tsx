import React from 'react'
import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import Tag from '@/components/ui/Tag'

type Profile = {
  id: string
  first_name?: string | null
  last_name?: string | null
  headline?: string | null
  photo_url?: string | null
  dance_style?: string | null
  city?: string | null
}

export default function TeacherCard({ profile }: { profile: Profile }) {
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()

  const danceStyles: string[] = React.useMemo(() => {
    if (!profile.dance_style) return []
    if (Array.isArray((profile as any).dance_style)) return (profile as any).dance_style
    // allow comma-separated values in a single text column
    return (profile.dance_style as string).split(',').map(s => s.trim()).filter(Boolean)
  }, [profile.dance_style])

  return (
    <Link
      href={`/teacher/${profile.id}`}
      className="block w-full"
      aria-label={`Open docent ${fullName || 'detail'}`}
    >
  <div className="relative w-full rounded-2xl p-5 elev-1 flex items-start gap-4 min-h-[120px] hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-blue-500">
        {/* Top-right chevron */}
        <div className="absolute top-3 right-3 text-slate-400">
          <ChevronRight className="w-5 h-5" />
        </div>

        <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
          {profile.photo_url ? (
            <img src={profile.photo_url} alt={fullName || 'Docent'} className="w-full h-full object-cover" />
          ) : (
            <div className="text-slate-400 text-2xl">👩‍🏫</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{fullName || 'Naam niet beschikbaar'}</h3>
          {profile.city && (
            <div className="mt-1 inline-flex items-center gap-2 text-sm text-slate-500">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span>{profile.city}</span>
            </div>
          )}

          <div className="mt-3 flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2">
                {danceStyles.map((s) => (
                  <Tag key={s}>{s}</Tag>
                ))}
              </div>

              {profile.headline ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                  {profile.headline}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
