"use client"

import React from 'react'
import FAQList from '@/components/FAQList'
import Link from 'next/link'
import { ArrowLeft, HelpCircle } from 'lucide-react'
import { PublicNavigation } from '@/components/PublicNavigation'
import { FeatureGate } from '@/components/FeatureGate'

export default function FAQPage() {
  return (
    <FeatureGate flagKey="welcome.faq" mode="page" title="FAQ komt binnenkort">
      <div className="min-h-screen bg-slate-50">
        <PublicNavigation
          onLogin={() => { window.location.href = '/?login=true' }}
          onSignup={() => { window.location.href = '/?signup=user' }}
        />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="m-bodySm">Terug naar home</span>
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-100 rounded-xl">
            <HelpCircle className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h1 className="m-sectionTitle font-bold text-slate-900">Veelgestelde Vragen (FAQ)</h1>
            <p className="m-body text-slate-600 mt-1">Hier vind je antwoorden op veelgestelde vragen over HUB3.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <FAQList />
          </div>

          <aside className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="m-cardTitle font-semibold text-slate-900 mb-2">Nog vragen?</h3>
            <p className="m-bodySm text-slate-600 mb-4">Neem contact op met support via de e-mail in de footer of bekijk de documentatie in het admin-paneel.</p>
            <a href="/auth/registreer" className="m-button inline-block px-4 py-2 bg-blue-600 text-white rounded">Maak een account</a>
          </aside>
        </div>
      </main>
      </div>
    </FeatureGate>
  )
}
