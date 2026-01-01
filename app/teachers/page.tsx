import React from 'react'
import ContentContainer from '@/components/ContentContainer'
import { createSupabaseClient } from '../../lib/supabase'
import TeacherList from '@/components/TeacherList'

type ProfileRow = {
  id: string
  user_id: string
  first_name?: string | null
  last_name?: string | null
  headline?: string | null
  photo_url?: string | null
}

async function getPublicProfiles(): Promise<ProfileRow[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from('public_teacher_profiles')
    .select('id, user_id, first_name, last_name, headline, photo_url')
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) {
    // Fail gracefully and return empty list
    console.error('Error fetching public teacher profiles', error)
    return []
  }

  return (data as ProfileRow[]) || []
}

export default async function TeachersPage() {
  const profiles = await getPublicProfiles()

  return (
    <main className="min-h-screen bg-slate-50">
      <ContentContainer className="py-12">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Publieke docenten</h1>
          <p className="text-slate-600">Zoek en ontdek beschikbare docenten op ons platform.</p>
        </div>

        <TeacherList initialProfiles={profiles} />
      </ContentContainer>
    </main>
  )
}
