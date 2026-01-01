"use client"

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { safeSelect } from '@/lib/supabaseHelpers'
import { LoadingState } from '@/components/ui/LoadingState'

export default function FAQList() {
  const [faqs, setFaqs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchFaqs() }, [])

  async function fetchFaqs() {
    setLoading(true)
    const { data, error, missingTable } = await safeSelect(supabase, 'faqs', 'id,question,answer,display_order,is_active')
    if (missingTable) {
      setFaqs([])
    } else if (error) {
      console.error('Failed to load faqs', error)
      setFaqs([])
    } else if (data) {
      const rows = (data as any[]).filter(r => r.is_active).sort((a,b) => (a.display_order||100) - (b.display_order||100))
      setFaqs(rows)
    }
    setLoading(false)
  }

  if (loading) return <LoadingState label="Laden…" className="py-8" spinnerSize={32} />

  if (!faqs || faqs.length === 0) {
    return (
      <div className="py-8 text-center text-slate-600">Geen veelgestelde vragen gevonden.</div>
    )
  }

  return (
    <div className="space-y-4">
      {faqs.map((f) => (
        <details key={f.id} className="bg-white border border-slate-200 rounded-lg p-4">
          <summary className="m-bodyLg cursor-pointer font-medium text-slate-900">{f.question}</summary>
          <div className="m-body mt-2 text-slate-700 whitespace-pre-wrap">{f.answer}</div>
        </details>
      ))}
    </div>
  )
}
