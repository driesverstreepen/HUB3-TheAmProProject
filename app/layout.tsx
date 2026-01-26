import type { Metadata, Viewport } from 'next'
import './globals.css'
import React, { Suspense } from 'react'
import UserLayoutWrapper from './UserLayoutWrapper'
import { Analytics } from '@vercel/analytics/next'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { defaultTypographyConfig, normalizeTypographyConfig, typographyConfigToCss } from '@/lib/typography'
import { unstable_noStore as noStore } from 'next/cache'
import ScrollbarsOnScroll from './ScrollbarsOnScroll'

export const metadata: Metadata = {
  title: 'HUB3',
  description: 'Het next level dansnetwerk',
  manifest: '/manifest.webmanifest',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: '/apple-touch-icon.png'
  },
}

// Disable zoom (especially on mobile) and enable iOS safe-area (notch) support.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAmpro = true

  // Typography must be instantly changeable by super-admin; avoid caching.
  // For AmPro deploy, skip HUB3-specific DB reads.
  if (!isAmpro) noStore()

  let typographyCss = typographyConfigToCss(defaultTypographyConfig)
  let siteLogoUrl: string | null = null

  if (!isAmpro) {
    try {
      const admin = createSupabaseServiceClient()
      const { data, error } = await admin
        .from('global_typography')
        .select('config')
        .eq('key', 'default')
        .maybeSingle()

      if (!error) {
        const config = data?.config ? normalizeTypographyConfig(data.config) : defaultTypographyConfig
        typographyCss = typographyConfigToCss(config)
      }
    } catch {
      // keep defaults
    }

    // Try to resolve a site logo URL from site_settings so we can expose it as app icon
    try {
      const admin = createSupabaseServiceClient()
      const { data: siteRow } = await admin.from('site_settings').select('logo_url').maybeSingle()
      siteLogoUrl = siteRow?.logo_url || null
    } catch {
      // ignore
    }
  }

  return (
    <html lang="nl">
      <head>
        {siteLogoUrl ? (
          <>
            <link rel="apple-touch-icon" sizes="180x180" href={siteLogoUrl} />
            <link rel="icon" href={siteLogoUrl} />
            <link rel="mask-icon" href={siteLogoUrl} color="#5bbad5" />
          </>
        ) : null}
      </head>
      <body className="font-sans antialiased">
        <ScrollbarsOnScroll />
        <style id="hub3-typography-vars">{typographyCss}</style>
        {/* TypographyLiveSync is HUB3-only and is archived in AmPro deploy. */}
        <Suspense fallback={<div className="min-h-screen bg-white" />}>
          <UserLayoutWrapper>{children}</UserLayoutWrapper>
        </Suspense>
        <Analytics />
      </body>
    </html>
  )
}
