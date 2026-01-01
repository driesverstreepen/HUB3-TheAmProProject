"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
// Removed decorative Heart icon — prefer plain text fallback for branding
import { supabase } from '@/lib/supabase'
import { safeSelect } from '@/lib/supabaseHelpers'

export const PublicFooter: React.FC = () => {
  const [supportEmail, setSupportEmail] = useState<string | null>('hello@flowmanager.app')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
  // no loading UI required for footer settings
    const { data, error, missingTable } = await safeSelect(supabase, 'site_settings', 'logo_url,support_email')
    if (missingTable) {
      // Not fatal: keep defaults
      setMessage(null)
    } else if (error) {
      setMessage((error as any)?.message || String(error))
    } else if (data && Array.isArray(data) && data.length > 0) {
      const row = data[0] as any
      if (row.support_email) setSupportEmail(row.support_email)
      if (row.logo_url) setLogoUrl(row.logo_url)
    }
  // finished
  }

  return (
    <footer className="bg-white border-t border-slate-200 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="HUB3 logo" className="h-6 object-contain" />
            ) : (
              <div className="text-sm font-semibold text-slate-900">HUB3</div>
            )}

            <div className="text-sm">
              <div className="font-medium text-slate-900">HUB3</div>
              {supportEmail && (
                <a href={`mailto:${supportEmail}`} className="text-xs text-slate-600 hover:underline">{supportEmail}</a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-600">
            <Link href="/privacy-policy" className="hover:text-blue-600 transition-colors">Privacybeleid</Link>
            <Link href="/terms-of-service" className="hover:text-blue-600 transition-colors">Algemene Voorwaarden</Link>
            <span className="text-slate-400">© {new Date().getFullYear()} HUB3</span>
          </div>
        </div>

        {message && <div className="mt-2 text-xs text-red-600">{message}</div>}
      </div>
    </footer>
  )
}
