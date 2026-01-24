"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function TermsOfServicePage() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [effectiveDate, setEffectiveDate] = useState<string | null>(null)
  const [version, setVersion] = useState<number | null>(null)

  useEffect(() => {
    loadTermsOfService()
  }, [])

  const loadTermsOfService = async () => {
    try {
      const { data, error } = await supabase
        .from('legal_documents')
        .select('content, effective_date, version')
        .eq('document_type', 'terms_of_service')
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (error) throw error

      setContent(data.content)
      setEffectiveDate(data.effective_date)
      setVersion(data.version)
    } catch (error) {
      console.error('Error loading terms of service:', error)
      setContent('# Algemene Voorwaarden\n\nEr is een fout opgetreden bij het laden van de algemene voorwaarden.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="m-bodySm">Terug naar home</span>
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-xl">
              <FileText className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h1 className="m-sectionTitle font-bold text-slate-900">
                Algemene Voorwaarden {version && `(v${version})`}
              </h1>
              {effectiveDate && (
                <p className="m-bodySm text-slate-600 mt-1">
                  Effectief vanaf: {new Date(effectiveDate).toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size={48} label="Laden" />
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <div className="prose prose-slate max-w-none">
              <div 
                className="whitespace-pre-wrap text-slate-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            </div>
          </div>
        )}

        {/* Footer Actions removed as requested */}
      </main>
    </div>
  )
}
