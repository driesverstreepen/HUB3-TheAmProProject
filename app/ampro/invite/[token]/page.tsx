'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { CheckCircle, XCircle, Link2 } from 'lucide-react'
import { isAmproProfileComplete } from '@/lib/ampro'

type LookupResponse = {
  invite: {
    id: string
    performance_id: string
    expires_at: string | null
    max_uses: number | null
    uses_count: number
    revoked_at: string | null
  }
  performance: {
    id: string
    title: string
    is_public: boolean
    applications_open: boolean
  }
  status: {
    revoked: boolean
    expired: boolean
    maxed: boolean
    ok: boolean
  }
}

interface Props {
  params: Promise<{ token: string }>
}

export default function AmproInvitePage({ params }: Props) {
  const router = useRouter()
  const [token, setToken] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [lookup, setLookup] = useState<LookupResponse | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [success, setSuccess] = useState(false)

  const [needsProfile, setNeedsProfile] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profile, setProfile] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    birth_date: '',
    street: '',
    house_number: '',
    house_number_addition: '',
    postal_code: '',
    city: '',
    instagram_username: '',
    tshirt_size: '',
  })

  useEffect(() => {
    params.then((p) => setToken(p.token))
  }, [params])

  const nextUrl = useMemo(() => `/ampro/invite/${encodeURIComponent(token)}`, [token])

  useEffect(() => {
    if (!token) return

    let cancelled = false

    ;(async () => {
      setLoading(true)
      setLookupError(null)
      setClaimError(null)

      try {
        const [{ data: sessionData }, lookupRes] = await Promise.all([
          supabase.auth.getSession(),
          fetch(`/api/ampro/program-invites/lookup?token=${encodeURIComponent(token)}`),
        ])

        if (cancelled) return
        setUser(sessionData?.session?.user || null)

        const json = await lookupRes.json()
        if (!lookupRes.ok) throw new Error(json?.error || 'Invitation not found')
        setLookup(json)
      } catch (e: any) {
        if (!cancelled) setLookupError(e?.message || 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token])

  // Auto-claim after login/signup when the invite is valid.
  useEffect(() => {
    if (!token) return
    if (!lookup?.status?.ok) return
    if (!user) return
    if (success) return
    if (claiming) return
    if (claimError) return

    // Fire and forget (errors surface in claimError).
    claim()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, lookup?.status?.ok, user, success])

  async function claim() {
    if (!token) return
    setClaiming(true)
    setClaimError(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token || null

      const resp = await fetch('/api/ampro/program-invites/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, access_token: accessToken }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Claim failed')

      // After claim, require a complete profile before proceeding (invite signups often miss data).
      const shouldGate = await loadProfileAndMaybeGate()
      setSuccess(true)

      if (!shouldGate) {
        setTimeout(() => {
          router.replace('/ampro/mijn-projecten')
        }, 800)
      }
    } catch (e: any) {
      setClaimError(e?.message || 'Claim failed')
    } finally {
      setClaiming(false)
    }
  }

  async function loadProfileAndMaybeGate(): Promise<boolean> {
    try {
      setLoadingProfile(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const u = sessionData?.session?.user
      if (!u) return false

      const resp = await supabase
        .from('ampro_dancer_profiles')
        .select('first_name,last_name,phone,birth_date,street,house_number,house_number_addition,postal_code,city,instagram_username,tshirt_size')
        .eq('user_id', u.id)
        .maybeSingle()

      if (resp.error) throw resp.error
      const p: any = resp.data || {}

      const nextProfile = {
        first_name: String(p.first_name || ''),
        last_name: String(p.last_name || ''),
        phone: String(p.phone || ''),
        birth_date: String(p.birth_date || ''),
        street: String(p.street || ''),
        house_number: String(p.house_number || ''),
        house_number_addition: String(p.house_number_addition || ''),
        postal_code: String(p.postal_code || ''),
        city: String(p.city || ''),
        instagram_username: String(p.instagram_username || ''),
        tshirt_size: String(p.tshirt_size || ''),
      }
      setProfile(nextProfile)

      const complete = isAmproProfileComplete({
        first_name: nextProfile.first_name,
        last_name: nextProfile.last_name,
        birth_date: nextProfile.birth_date,
        street: nextProfile.street,
        house_number: nextProfile.house_number,
        postal_code: nextProfile.postal_code,
        city: nextProfile.city,
      })

      const shouldGate = !complete
      setNeedsProfile(shouldGate)
      return shouldGate
    } catch (e: any) {
      // If something goes wrong, don't block the user completely.
      console.warn('Failed to load profile for invite completion', e)
      return false
    } finally {
      setLoadingProfile(false)
    }
  }

  async function saveProfileAndContinue() {
    try {
      setSavingProfile(true)

      const { data: sessionData } = await supabase.auth.getSession()
      const u = sessionData?.session?.user
      if (!u) throw new Error('You are not logged in')

      const payload: any = {
        user_id: u.id,
        first_name: profile.first_name.trim() || null,
        last_name: profile.last_name.trim() || null,
        phone: profile.phone.trim() || null,
        birth_date: profile.birth_date || null,
        street: profile.street.trim() || null,
        house_number: profile.house_number.trim() || null,
        house_number_addition: profile.house_number_addition.trim() || null,
        postal_code: profile.postal_code.trim() || null,
        city: profile.city.trim() || null,
        instagram_username: profile.instagram_username ? profile.instagram_username.replace(/^@+/, '').trim() : null,
        tshirt_size: profile.tshirt_size || null,
      }

      const complete = isAmproProfileComplete(payload)
      if (!complete) {
        throw new Error('Please fill in all required fields to continue')
      }

      const up = await supabase.from('ampro_dancer_profiles').upsert(payload, { onConflict: 'user_id' })
      if (up.error) throw up.error

      // Best-effort: backfill missing application snapshots for invite-based applications.
      try {
        const snapshot = {
          first_name: payload.first_name,
          last_name: payload.last_name,
          birth_date: payload.birth_date,
          email: u.email ?? null,
          phone: payload.phone,
          street: payload.street,
          house_number: payload.house_number,
          house_number_addition: payload.house_number_addition,
          postal_code: payload.postal_code,
          city: payload.city,
          instagram_username: payload.instagram_username,
          tshirt_size: payload.tshirt_size,
        }

        const appsResp = await supabase
          .from('ampro_applications')
          .select('id,snapshot_json')
          .eq('user_id', u.id)
          .limit(200)

        if (!appsResp.error) {
          for (const row of (appsResp.data as any[]) || []) {
            const id = String((row as any)?.id || '')
            if (!id) continue

            const current = (row as any)?.snapshot_json
            const base = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {}
            let changed = false

            for (const [key, value] of Object.entries(snapshot)) {
              const existing = (base as any)[key]
              const hasExisting = typeof existing === 'string' ? existing.trim().length > 0 : existing != null
              const incoming = typeof value === 'string' ? value.trim() : value
              if (!hasExisting && incoming != null && String(incoming).trim().length > 0) {
                ;(base as any)[key] = incoming
                changed = true
              }
            }

            if (changed) {
              await supabase.from('ampro_applications').update({ snapshot_json: base }).eq('id', id)
            }
          }
        }
      } catch (e) {
        console.warn('Failed to backfill snapshots after invite profile completion', e)
      }

      router.replace('/ampro/mijn-projecten')
    } catch (e: any) {
      setClaimError(e?.message || 'Save failed')
    } finally {
      setSavingProfile(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
          <LoadingSpinner size={48} className="mx-auto mb-4" label="Loading invitation" />
          <p className="text-gray-600">Loading invitation…</p>
        </div>
      </div>
    )
  }

  if (success && !needsProfile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Connected!</h1>
          <p className="text-gray-600 mb-2">You have been added to {lookup?.performance?.title || 'the program'}.</p>
          <p className="text-sm text-gray-500">You will be redirected…</p>
        </div>
      </div>
    )
  }

  if (lookupError || !lookup) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid link</h1>
          <p className="text-gray-600 mb-6">{lookupError || 'This invitation could not be found'}</p>
          <Link href="/ampro" className="inline-flex h-11 items-center justify-center rounded-3xl bg-gray-600 px-5 text-sm font-semibold text-white hover:bg-gray-700">
            Back
          </Link>
        </div>
      </div>
    )
  }

  const disabled = !lookup.status.ok

  const requiredOk = isAmproProfileComplete({
    first_name: profile.first_name,
    last_name: profile.last_name,
    birth_date: profile.birth_date,
    street: profile.street,
    house_number: profile.house_number,
    postal_code: profile.postal_code,
    city: profile.city,
  })

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Link2 className="w-10 h-10 text-blue-600" />
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-gray-500">Step {success && needsProfile ? '2' : '1'}/2</div>
            {success && needsProfile ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                Complete profile
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-900">
                Link program
              </span>
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div
              className={`rounded-2xl border px-3 py-2 font-semibold ${
                success ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-gray-50 text-gray-700'
              }`}
            >
              1. Link program
            </div>
            <div
              className={`rounded-2xl border px-3 py-2 font-semibold ${
                success && needsProfile ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-gray-200 bg-gray-50 text-gray-500'
              }`}
            >
              2. Complete profile
            </div>
          </div>

          <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: success && needsProfile ? '100%' : '50%' }}
            />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Program invite</h1>
        <p className="text-center text-gray-600 mb-8">
          You will be linked to: <span className="font-semibold">{lookup.performance.title}</span>
        </p>

        {!lookup.status.ok ? (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
            This link is {lookup.status.revoked ? 'revoked' : lookup.status.expired ? 'expired' : 'full'}.
          </div>
        ) : null}

        {success && needsProfile ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">Step 2/2: complete your profile</div>
              <div className="mt-1 text-sm text-amber-900">
                Fill in your profile completely to complete your registration. This information is used for insurance and to administratively register your participation correctly.
              </div>
              <div className="mt-2 text-sm text-amber-900">Fields marked with * are mandatory. You can always change this later via My Profile.</div>
            </div>

            {loadingProfile ? (
              <div className="text-sm text-gray-600">Loading profile…</div>
            ) : (
              <div className="grid gap-3">
                <div className="mt-4 text-lg font-bold text-gray-900">Personal information</div>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  First name *
                  <input
                    value={profile.first_name}
                    onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Last name *
                  <input
                    value={profile.last_name}
                    onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Phone
                  <input
                    value={profile.phone}
                    onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Date of birth *
                  <input
                    type="date"
                    value={profile.birth_date}
                    onChange={(e) => setProfile((p) => ({ ...p, birth_date: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <div className="mt-4 text-lg font-bold text-gray-900">Address</div>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Street *
                  <input
                    value={profile.street}
                    onChange={(e) => setProfile((p) => ({ ...p, street: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Number *
                  <input
                    value={profile.house_number}
                    onChange={(e) => setProfile((p) => ({ ...p, house_number: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Addition
                  <input
                    value={profile.house_number_addition}
                    onChange={(e) => setProfile((p) => ({ ...p, house_number_addition: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Postalcode *
                  <input
                    value={profile.postal_code}
                    onChange={(e) => setProfile((p) => ({ ...p, postal_code: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  City *
                  <input
                    value={profile.city}
                    onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>

                <div className="mt-4 text-lg font-bold text-gray-900">Extras</div>

                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  Instagram username
                  <input
                    value={profile.instagram_username}
                    onChange={(e) => setProfile((p) => ({ ...p, instagram_username: e.target.value }))}
                    placeholder="@ ..."
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-gray-700">
                  T-shirt size
                  <select
                    value={profile.tshirt_size}
                    onChange={(e) => setProfile((p) => ({ ...p, tshirt_size: e.target.value }))}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">(select)</option>
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={saveProfileAndContinue}
                  disabled={savingProfile || !requiredOk}
                  className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                    savingProfile || !requiredOk ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {savingProfile ? 'Saving…' : 'Save and continue'}
                </button>
              </div>
            )}

            {claimError ? <p className="text-sm text-red-600">{claimError}</p> : null}
          </div>
        ) : !user ? (
          <div className="grid gap-3">
            <Link
              href={`/ampro/login?next=${encodeURIComponent(nextUrl)}`}
              className={`h-11 rounded-3xl px-4 text-sm font-semibold flex items-center justify-center transition-colors ${
                disabled ? 'bg-blue-100 text-blue-400 pointer-events-none' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Log in
            </Link>
            <Link
              href={`/ampro/signup?next=${encodeURIComponent(nextUrl)}`}
              className={`h-11 rounded-3xl px-4 text-sm font-semibold flex items-center justify-center border transition-colors ${
                disabled ? 'border-gray-200 text-gray-400 pointer-events-none' : 'border-gray-200 text-gray-900 hover:bg-gray-50'
              }`}
            >
              Create account
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            <button
              type="button"
              onClick={claim}
              disabled={claiming || disabled}
              className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                claiming || disabled ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {claiming ? 'Connecting...' : 'Connect me to this program'}
            </button>
            {claimError ? <p className="text-sm text-red-600">{claimError}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}
