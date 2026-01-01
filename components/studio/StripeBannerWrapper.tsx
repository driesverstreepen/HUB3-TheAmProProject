"use client"

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { StripeConnectionBanner } from './StripeStatus'
import { supabase } from '@/lib/supabase'

interface Props { studioId: string }

export default function StripeBannerWrapper({ studioId }: Props) {
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<any | null>(null)

  useEffect(() => {
    let mounted = true
    // don't show banner on settings page (it's already shown inside Payments tab)
    if (pathname?.includes(`/studio/${studioId}/settings`)) {
      setLoading(false)
      return
    }

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch(`/api/studio/stripe/connect?studio_id=${studioId}`, { credentials: 'include', headers })
        if (!mounted) return
        if (res.ok) {
          const text = await res.text()
          const json = text ? JSON.parse(text) : null
          setAccount(json?.data || null)
        } else {
          // don't show banner if unauthorized/forbidden
          setAccount(null)
        }
      } catch (err) {
        console.error('Error loading stripe account for banner:', err)
        setAccount(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [studioId])

  if (loading) return null

  return (
    <StripeConnectionBanner
      studioId={studioId}
      stripe_account_id={account?.stripe_account_id}
      stripe_charges_enabled={account?.charges_enabled}
      business_name={account?.business_name}
    />
  )
}
