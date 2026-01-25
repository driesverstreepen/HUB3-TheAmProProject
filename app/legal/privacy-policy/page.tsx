import React from 'react'
import { createSupabaseServiceClient } from '@/lib/supabase'

export default async function PrivacyPolicyPage() {
  const supabase = createSupabaseServiceClient()
  let content = '<p>Privacyverklaring nog niet beschikbaar.</p>'
  let version = '—'

  try {
    const { data, error } = await supabase
      .from('legal_documents')
      .select('content,version')
      .eq('document_type', 'privacy_policy')
      .eq('is_active', true)
      .is('studio_id', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) {
      content = data.content || content
      version = data.version || version
    }
  } catch (e) {
    console.error('Could not fetch privacy policy', e)
  }

  return (
    <main className="prose mx-auto py-12 px-4">
      <h1>Privacyverklaring</h1>
      <p className="text-sm text-slate-600 mb-4">Versie: {version}</p>
      <article className="prose max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: content }} />
    </main>
  )
}
