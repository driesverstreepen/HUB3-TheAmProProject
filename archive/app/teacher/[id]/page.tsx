import React from 'react'
import type { Metadata } from 'next'
import ContentContainer from '@/components/ContentContainer'
import StudioSidebar from '@/components/studio/StudioSidebar'
import Link from 'next/link'
import { PublicFooter } from '@/components/PublicFooter'
import { ArrowLeft, Mail, Phone, ExternalLink } from 'lucide-react'
import { createSupabaseClient } from '../../../lib/supabase'

type Props = {
  params: {
    id: string
  }
  // Next.js will pass searchParams for server components
  searchParams?: { [key: string]: string | string[] | undefined }
}

async function getProfileById(id: string) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from('public_teacher_profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching profile', error)
    return null
  }

  return data
}

export async function generateMetadata({ params }: { params: any }): Promise<Metadata> {
  const { id } = await params
  if (!id) return { title: 'Docent' }
  const profile = await getProfileById(id)
  if (!profile) return { title: 'Docent niet gevonden' }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
  const description = profile.headline || (profile.bio ? String(profile.bio).slice(0, 160) : '')
  const images = profile.photo_url ? [{ url: profile.photo_url as string, alt: fullName || 'Docent' }] : []

  return {
    title: fullName || 'Docent',
    description: description || undefined,
    openGraph: {
      title: fullName || 'Docent',
      description: description || undefined,
      images: images as any,
    }
  }
}

export default async function TeacherDetailPage({ params, searchParams }: Props) {
  // `params` can be a Promise in some Next versions; await to unwrap per Next warning
  const { id } = await (params as any)

  if (!id) {
    console.error('TeacherDetailPage called without id')
    return (
      <main className="p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-semibold">Profiel niet gevonden</h1>
          <p className="text-sm text-slate-600 mt-2">Geen geldige profiel-id opgegeven.</p>
        </div>
      </main>
    )
  }

  const profile = await getProfileById(id)

  // determine studioId to show sidebar: prefer search param (studio context), fallback to profile.studio_id
  const studioId = typeof searchParams === 'object' && searchParams?.studioId ? String(searchParams?.studioId) : (profile?.studio_id ? String(profile.studio_id) : null)

  // If we have a studioId, fetch basic studio info server-side to pass into the sidebar
  let studioName: string | undefined = undefined
  let studioLogo: string | null = null
  if (studioId) {
    try {
      const supabase = createSupabaseClient()
      const { data: studio } = await supabase.from('studios').select('naam, logo_url').eq('id', studioId).maybeSingle()
      if (studio) {
        studioName = (studio as any).naam || undefined
        studioLogo = (studio as any).logo_url || null
      }
    } catch (e) {
      console.error('Failed to load studio info for sidebar', e)
    }
  }

  if (!profile) {
    return (
      <main className="p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-semibold">Profiel niet gevonden</h1>
          <p className="text-sm text-slate-600 mt-2">Het gevraagde publieke docentprofiel bestaat niet of is niet beschikbaar.</p>
        </div>
      </main>
    )
  }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Render StudioSidebar only when we have a studioId (same pattern as studio layout) */}
      {studioId && <StudioSidebar studioId={studioId} studioName={studioName} studioLogo={studioLogo} />}

      <div className={studioId ? "pl-64" : ""}>
        {/* Hero: full-bleed gradient across viewport, inner content centered with ContentContainer */}
        <div className={`bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 border-b border-slate-700`}>
          <ContentContainer className="py-12">
            {/* Back to Teachers HUB */}
            <div className="mb-4 -mt-6">
              {/** Use server-side computed studioId to preserve context when present */}
              <Link
                href={studioId ? `/hub/teachers?studioId=${encodeURIComponent(studioId)}` : '/hub/teachers'}
                className="inline-flex items-center gap-2 text-white hover:text-slate-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
                <span className="text-white">Terug</span>
              </Link>
            </div>

            <div className="flex flex-col lg:flex-row items-start gap-8">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-6">
                <div className="w-40 h-40 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                  {profile.photo_url ? (
                      <img src={profile.photo_url} alt={fullName || 'Docent'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-4xl">👩‍🏫</div>
                  )}
                </div>

                <div className="min-w-0">
                  <h1 className="text-4xl font-extrabold text-white! leading-tight">{fullName || 'Naam niet beschikbaar'}</h1>
                  {profile.headline && <p className="text-lg text-slate-200 mt-2">{profile.headline}</p>}

                  <div className="mt-4 flex flex-wrap gap-3 text-slate-200">
                    {profile.contact_email && (
                      <div className="inline-flex items-center gap-2 bg-white/5 px-3 py-1 rounded-md">
                        <Mail size={14} />
                        <span className="text-sm">{profile.contact_email}</span>
                      </div>
                    )}
                    {profile.phone_number && (
                      <div className="inline-flex items-center gap-2 bg-white/5 px-3 py-1 rounded-md">
                        <Phone size={14} />
                        <span className="text-sm">{profile.phone_number}</span>
                      </div>
                    )}
                    {profile.website && (
                        <a href={profile.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 bg-white/5 px-3 py-1 rounded-md text-slate-200 text-sm">
                          <ExternalLink size={14} />
                          <span>Website</span>
                        </a>
                      )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column contact card removed — contact buttons are kept in the hero header */}
          </div>
            </ContentContainer>
          </div>

          <main className="p-6 lg:p-8">
            <ContentContainer className="py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 flex flex-col gap-6 h-full">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Over de docent</h2>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1">
              {profile.bio ? (
                <section className="mb-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Bio</h3>
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">{profile.bio}</p>
                </section>
              ) : (
                <div className="text-sm text-slate-600">Er is nog geen bio beschikbaar voor deze docent.</div>
              )}
            </div>
            <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">CV</h3>
              {profile.cv ? (
                <div className="text-sm text-slate-700 whitespace-pre-line">{profile.cv}</div>
              ) : (
                <div className="text-sm text-slate-600">Geen CV geüpload.</div>
              )}
            </div>
          </div>
          {/* Right column small info summary */}
          <aside>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="space-y-3 text-sm text-slate-700">
                {profile.date_of_birth && (() => {
                  try {
                    const dob = new Date(profile.date_of_birth)
                    const today = new Date()
                    let age = today.getFullYear() - dob.getFullYear()
                    const m = today.getMonth() - dob.getMonth()
                    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
                    return (<div><strong>Leeftijd:</strong> <div className="text-slate-600">{age} jaar</div></div>)
                  } catch {
                    return null
                  }
                })()}
                {profile.city && <div><strong>Locatie:</strong> <div className="text-slate-600">{profile.city}</div></div>}
                {profile.dance_style && (
                  <div>
                    <strong>Dansstijlen:</strong>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(Array.isArray(profile.dance_style) ? profile.dance_style : String(profile.dance_style || '').split(',').map((s: string) => s.trim()).filter(Boolean)).map((s: string, i: number) => (
                          <span key={i} className="text-xs bg-slate-100 px-2 py-1 rounded-md text-slate-700">{s}</span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </ContentContainer>

          <PublicFooter />
        </main>
      </div>
    </div>
  )
}

