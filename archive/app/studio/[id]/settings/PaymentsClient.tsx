"use client";

import { useEffect, useState } from 'react'
import { CreditCard, CheckCircle, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { StripeConnectionBanner, StripeStatusIndicator } from '@/components/studio/StripeStatus'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Props { studioId: string }

type StripeAccount = {
  id: string
  stripe_account_id: string
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted: boolean
  onboarding_completed: boolean
  business_name: string
  email: string
  country: string
  onboarding_url?: string
  onboarding_expires_at?: string
}

export default function PaymentsClient({ studioId }: Props) {
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeAccount, setStripeAccount] = useState<StripeAccount | null>(null)

  // No local input fields: Stripe will handle onboarding and login

  useEffect(() => {
    loadStripeAccount()
  }, [studioId])

  const loadStripeAccount = async () => {
    try {
  // include auth token as Bearer header so server routes can authenticate when cookies aren't present
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`/api/studio/stripe/connect?studio_id=${studioId}`, { credentials: 'include', headers })
      const text = await response.text()
      let result: any = null
      try { result = text ? JSON.parse(text) : null } catch { result = null }
      if (response.status === 401) {
        setError('Je bent niet ingelogd. Log in om Stripe-instellingen te beheren.')
        return
      }

      if (response.status === 403) {
        setError('Je hebt geen rechten om Stripe instellingen van deze studio te bekijken.')
        return
      }

      if (response.ok && result?.data) {
        // Normalize returned studios row into the expected StripeAccount shape
        const row = result.data
        const meta = row?.stripe_account_data || {}

        // Determine account id: prefer explicit column, fallback to nested data
        const accountId = row?.stripe_account_id || meta?.id || meta?.stripe_account_id || null

        if (accountId || meta?.onboarding_url) {
          const account = {
            id: row.id,
            stripe_account_id: accountId,
            charges_enabled: meta.charges_enabled ?? false,
            payouts_enabled: meta.payouts_enabled ?? row.stripe_payouts_enabled ?? false,
            details_submitted: meta.details_submitted ?? false,
            onboarding_completed: (meta.details_submitted && meta.charges_enabled) || !!row.stripe_onboarded_at,
            business_name: meta.business_name || meta.business_profile?.name || '',
            email: meta.email || '',
            country: meta.country || '',
            onboarding_url: meta.onboarding_url,
            onboarding_expires_at: meta.onboarding_expires_at
          }
          setStripeAccount(account)
        } else {
          // No stripe account connected for this studio
          setStripeAccount(null)
        }
      }
    } catch (err) {
      console.error('Error loading Stripe account:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAccount = async (e?: React.SyntheticEvent) => {
    if (e && typeof (e as any).preventDefault === 'function') (e as any).preventDefault()
    setCreating(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const headersCreate: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headersCreate.Authorization = `Bearer ${token}`
      const response = await fetch('/api/studio/stripe/connect', {
        method: 'POST',
        credentials: 'include',
        headers: headersCreate,
        body: JSON.stringify({ studio_id: studioId })
      })

      const text = await response.text()
      let result: any = null
      try { result = text ? JSON.parse(text) : null } catch { result = null }

      if (!response.ok) {
        // If the studio already has an account, refresh UI instead of throwing
        if (response.status === 400 && result?.account_id) {
          // Load existing account and guide user to Stripe
          await loadStripeAccount()
          setCreating(false)
          setError('Studio heeft al een Stripe account. Bekijk de status of open Stripe via de knop.')
          return
        }

        throw new Error(result?.error || 'Failed to create account')
      }

      if (result.onboarding_url) {
        window.location.href = result.onboarding_url
        return
      }

      // If no onboarding_url returned, reload account info
      await loadStripeAccount()
      setCreating(false)
    } catch (err: any) {
      console.error('Error creating account:', err)
      setError(err?.message || 'Er is iets misgegaan')
      setCreating(false)
    }
  }

  const handleRefreshOnboarding = async () => {
    setRefreshing(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const headersRefresh: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headersRefresh.Authorization = `Bearer ${token}`
      const response = await fetch('/api/studio/stripe/refresh-link', {
        method: 'POST',
        credentials: 'include',
        headers: headersRefresh,
        body: JSON.stringify({ studio_id: studioId })
      })
      // If we already have an onboarding_url from studio metadata, go there directly
      if (stripeAccount?.onboarding_url) {
        window.location.href = stripeAccount.onboarding_url
        return
      }

      const text = await response.text()
      let result: any = null
      try { result = text ? JSON.parse(text) : null } catch { result = null }

      if (!response.ok) throw new Error(result?.error || 'Failed to refresh link')

      if (result.onboarding_url) window.location.href = result.onboarding_url
    } catch (err: any) {
      console.error('Error refreshing link:', err)
      setError(err?.message || 'Er is iets misgegaan')
    } finally {
      setRefreshing(false)
    }
  }

  const handleUpdateStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const headersUpdate: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headersUpdate.Authorization = `Bearer ${token}`
      const response = await fetch('/api/studio/stripe/update-status', {
        method: 'POST',
        credentials: 'include',
        headers: headersUpdate,
        body: JSON.stringify({ studio_id: studioId })
      })

      const text = await response.text()
      let result: any = null
      try { result = text ? JSON.parse(text) : null } catch { result = null }

      if (response.ok && result?.account) setStripeAccount(result.account)
    } catch (err) {
      console.error('Error updating status:', err)
    }
  }

  const handleOpenStripeDashboard = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const headersLogin: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headersLogin.Authorization = `Bearer ${token}`
      const response = await fetch('/api/studio/stripe/login-link', {
        method: 'POST',
        credentials: 'include',
        headers: headersLogin,
        body: JSON.stringify({ studio_id: studioId })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Failed to create login link')
      if (result.url) window.location.href = result.url
    } catch (err: any) {
      console.error('Error creating login link:', err)
      setError(err?.message || 'Kon geen Stripe login-link maken')
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <LoadingSpinner size={32} label="Laden" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-blue-600 rounded-xl">
          <CreditCard className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-slate-900">Betalingen</h3>
          <p className="text-sm text-slate-600">Stripe instellingen en connecties</p>
        </div>
      </div>

      {/* Status banner: shows if setup incomplete or not connected */}
      <StripeConnectionBanner
        studioId={studioId}
        stripe_account_id={stripeAccount?.stripe_account_id}
        stripe_charges_enabled={stripeAccount?.charges_enabled}
        business_name={stripeAccount?.business_name}
        hideLink={true}
      />

      {/* Inline status indicator (small) */}
      <div className="mb-4">
        <StripeStatusIndicator
          stripe_account_id={stripeAccount?.stripe_account_id}
          stripe_charges_enabled={stripeAccount?.charges_enabled}
        />
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {!stripeAccount ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Koppel een bestaand Stripe-account of maak een nieuw account aan via Stripe. Je wordt doorgestuurd naar Stripe om in te loggen of te registreren.</p>

          <div className="flex gap-3">
            <button disabled={creating} onClick={handleCreateAccount} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{creating ? 'Doorgaan naar Stripe...' : 'Maak nieuw Stripe-account aan'}</button>
            <button disabled={creating} onClick={async () => {
              setCreating(true)
              setError(null)
              try {
                const { data: { session } } = await supabase.auth.getSession()
                const token = session?.access_token
                const headersStart: Record<string, string> = { 'Content-Type': 'application/json' }
                if (token) headersStart.Authorization = `Bearer ${token}`
                const res = await fetch('/api/studio/stripe/oauth/start', {
                  method: 'POST',
                  credentials: 'include',
                  headers: headersStart,
                  body: JSON.stringify({ studio_id: studioId })
                })
                const json = await res.json()
                if (!res.ok) throw new Error(json?.error || 'Failed to start OAuth')
                if (json?.url) {
                  window.location.href = json.url
                  return
                }
                throw new Error('No redirect url returned')
              } catch (err: any) {
                console.error('Error starting OAuth:', err)
                setError(err?.message || 'Kon geen bestaande account koppelen')
                setCreating(false)
              }
            }} className="px-4 py-2 bg-white border border-slate-200 rounded-lg">Koppel bestaand Stripe-account</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                {stripeAccount.onboarding_completed ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                )}
                <div>
                  <div className="font-medium text-slate-900">{stripeAccount.business_name}</div>
                  <div className="text-sm text-slate-600">{stripeAccount.email} • {stripeAccount.country}</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleUpdateStatus} className="px-3 py-2 rounded-lg hover:bg-slate-50">{<RefreshCw className="w-4 h-4" />}</button>
              {!stripeAccount.onboarding_completed && (
                <button onClick={handleRefreshOnboarding} disabled={refreshing} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{refreshing ? 'Link vernieuwen...' : 'Onboarding Voltooien'}</button>
              )}
              {/* Open Stripe dashboard/login link */}
              <button onClick={handleOpenStripeDashboard} className="px-4 py-2 bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200">Open Stripe</button>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Stripe Account ID</span>
              <span className="font-mono text-slate-900">{stripeAccount.stripe_account_id}</span>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-slate-600">Betalingen Actief</span>
              <span>{stripeAccount.charges_enabled ? 'Ja' : 'Nee'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
