'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ContentContainer from '@/components/ContentContainer'
import { isAmproProfileComplete } from '@/lib/ampro'
import { useNotification } from '@/contexts/NotificationContext'

type Profile = {
  first_name: string | null
  last_name: string | null
  phone: string | null
  birth_date: string | null
  street: string | null
  house_number: string | null
  house_number_addition: string | null
  postal_code: string | null
  city: string | null
  instagram_username: string | null
  tshirt_size: string | null
}

export default function AmproProfilePage() {
  const router = useRouter()
  const { showSuccess, showError } = useNotification()
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')
  const [newEmail, setNewEmail] = useState<string>('')
  const [updatingEmail, setUpdatingEmail] = useState(false)
  const [newPassword, setNewPassword] = useState<string>('')
  const [confirmPassword, setConfirmPassword] = useState<string>('')
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [nextPath, setNextPath] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile>({
    first_name: null,
    last_name: null,
    phone: null,
    birth_date: null,
    street: null,
    house_number: null,
    house_number_addition: null,
    postal_code: null,
    city: null,
    instagram_username: null,
    tshirt_size: null,
  })

  useEffect(() => {
    let cancelled = false

    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      const next = params?.get('next')
      if (next) setNextPath(next)
    } catch {
      // ignore
    }

    ;(async () => {
      try {
        setChecking(true)

        const { data } = await supabase.auth.getSession()
        const user = data?.session?.user
        if (!user) {
          router.replace('/ampro/login?next=/ampro/profile')
          return
        }

        if (!cancelled) {
          setUserId(user.id)
          setEmail(user.email || '')
          setNewEmail(user.email || '')
        }

        const resp = await supabase
          .from('ampro_dancer_profiles')
          .select('first_name,last_name,phone,birth_date,street,house_number,house_number_addition,postal_code,city,instagram_username,tshirt_size')
          .eq('user_id', user.id)
          .maybeSingle()

        if (resp.error) throw resp.error

        if (!cancelled) {
          setProfile({
            first_name: resp.data?.first_name ?? null,
            last_name: resp.data?.last_name ?? null,
            phone: resp.data?.phone ?? null,
            birth_date: resp.data?.birth_date ?? null,
            street: (resp.data as any)?.street ?? null,
            house_number: (resp.data as any)?.house_number ?? null,
            house_number_addition: (resp.data as any)?.house_number_addition ?? null,
            postal_code: (resp.data as any)?.postal_code ?? null,
            city: (resp.data as any)?.city ?? null,
            instagram_username: (resp.data as any)?.instagram_username ?? null,
            tshirt_size: (resp.data as any)?.tshirt_size ?? null,
          })
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Failed to load profile')
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  async function save() {
    try {
      setSaving(true)

      const { data } = await supabase.auth.getSession()
      const user = data?.session?.user
      if (!user) throw new Error('You are not logged in')

      const payload = {
        user_id: user.id,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        phone: profile.phone || null,
        birth_date: profile.birth_date || null,
        street: profile.street || null,
        house_number: profile.house_number || null,
        house_number_addition: profile.house_number_addition || null,
        postal_code: profile.postal_code || null,
        city: profile.city || null,
        instagram_username: profile.instagram_username ? profile.instagram_username.replace(/^@+/, '').trim() : null,
        tshirt_size: profile.tshirt_size || null,
      }

      if (!isAmproProfileComplete(payload)) {
        throw new Error('Please fill in all required fields: first name, last name, date of birth, and address details')
      }

      const { error } = await supabase
        .from('ampro_dancer_profiles')
        .upsert(payload, { onConflict: 'user_id' })

      if (error) throw error

      // Best-effort: if the user was added via invite link, their application snapshot may be empty.
      // Fill missing snapshot fields from the (now complete) profile without overwriting existing values.
      try {
        const snapshot = {
          first_name: payload.first_name,
          last_name: payload.last_name,
          birth_date: payload.birth_date,
          email: user.email ?? null,
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
          .eq('user_id', user.id)
          .limit(200)

        if (!appsResp.error) {
          const updates: Array<{ id: string; snapshot_json: any }> = []
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

            if (changed) updates.push({ id, snapshot_json: base })
          }

          for (const u of updates) {
            // Best-effort: don't block profile save if this fails.
            await supabase.from('ampro_applications').update({ snapshot_json: u.snapshot_json }).eq('id', u.id)
          }
        }
      } catch (e) {
        console.warn('Failed to backfill application snapshots after profile save', e)
      }

      showSuccess('Profile saved')

      if (nextPath) {
        router.replace(nextPath)
      }
    } catch (e: any) {
      showError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function updateEmail() {
    try {
      setUpdatingEmail(true)
      const nextEmail = newEmail.trim()
      if (!nextEmail) throw new Error('Enter a valid email address')

      const { error } = await supabase.auth.updateUser({ email: nextEmail })
      if (error) throw error

      showSuccess('Email update requested. Check your inbox to confirm.')
    } catch (e: any) {
      showError(e?.message || 'Failed to update email')
    } finally {
      setUpdatingEmail(false)
    }
  }

  async function updatePassword() {
    try {
      setUpdatingPassword(true)
      if (!newPassword) throw new Error('Enter a new password')
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match')

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setNewPassword('')
      setConfirmPassword('')
      showSuccess('Password updated')
    } catch (e: any) {
      showError(e?.message || 'Failed to update password')
    } finally {
      setUpdatingPassword(false)
    }
  }

  async function deleteAccount() {
    try {
      if (!userId) throw new Error('You are not logged in')
      setDeleting(true)

      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to delete account')

      await supabase.auth.signOut().catch(() => {})
      router.replace('/ampro')

      if (data?.warning) {
        showSuccess('Account deleted. Note: ' + data.warning)
      } else if (data?.info) {
        showSuccess('Account deleted. ' + data.info)
      } else {
        showSuccess('Account deleted')
      }
    } catch (e: any) {
      showError(e?.message || 'Failed to delete account')
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
      setDeleteConfirmText('')
    }
  }

  if (checking) return <div className="min-h-screen bg-white" />

  const requiredMark = (
    <span className="text-red-600" aria-hidden="true">
      *
    </span>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <ContentContainer className="py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="mt-1 text-sm text-gray-600">{email}</p>

          <div className="mt-4">
            <button
              onClick={() => router.push('/ampro/profile/notifications')}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              Notification settings
            </button>
          </div>

          {nextPath ? (
            <div className="mt-4 text-sm text-gray-700">
              Please complete your profile to continue.
            </div>
          ) : null}

          <div className="mt-8 grid gap-4">
            <div className="grid gap-1 text-sm font-medium text-gray-700">
              <span>
                First name {requiredMark}
              </span>
              <input
                value={profile.first_name || ''}
                onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
                className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <div className="grid gap-1 text-sm font-medium text-gray-700">
              <span>
                Last name {requiredMark}
              </span>
              <input
                value={profile.last_name || ''}
                onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
                className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <div className="grid gap-1 text-sm font-medium text-gray-700">
              Phone
              <input
                value={profile.phone || ''}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
              />
            </div>

            <div className="grid gap-1 text-sm font-medium text-gray-700">
              Instagram username
              <input
                value={profile.instagram_username || ''}
                onChange={(e) => setProfile((p) => ({ ...p, instagram_username: e.target.value }))}
                placeholder="@..."
                className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
              />
            </div>

            <div className="grid gap-1 text-sm font-medium text-gray-700">
              T-shirt size
              <select
                value={profile.tshirt_size || ''}
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
            </div>

            <div className="grid gap-1 text-sm font-medium text-gray-700">
              <span>
                Date of birth {requiredMark}
              </span>
              <input
                type="date"
                value={profile.birth_date || ''}
                onChange={(e) => setProfile((p) => ({ ...p, birth_date: e.target.value }))}
                className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <div className="mt-4 text-lg font-bold text-gray-900">Address</div>

            <div className="grid gap-1 text-sm font-medium text-gray-700">
              <span>
                Street {requiredMark}
              </span>
              <input
                value={profile.street || ''}
                onChange={(e) => setProfile((p) => ({ ...p, street: e.target.value }))}
                className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-1 text-sm font-medium text-gray-700">
                <span>
                  House number {requiredMark}
                </span>
                <input
                  value={profile.house_number || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, house_number: e.target.value }))}
                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  required
                />
              </div>
              <div className="grid gap-1 text-sm font-medium text-gray-700">
                Addition
                <input
                  value={profile.house_number_addition || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, house_number_addition: e.target.value }))}
                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                />
              </div>
              <div className="grid gap-1 text-sm font-medium text-gray-700">
                <span>
                  Postal code {requiredMark}
                </span>
                <input
                  value={profile.postal_code || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, postal_code: e.target.value }))}
                  className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid gap-1 text-sm font-medium text-gray-700">
              <span>
                City {requiredMark}
              </span>
              <input
                value={profile.city || ''}
                onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
                className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <button
              onClick={save}
              disabled={saving}
              className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                saving ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {saving ? 'Saving…' : nextPath ? 'Save and continue' : 'Save'}
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-red-200 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
              <p className="mt-1 text-sm text-gray-600">Update your account details or permanently delete your account.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-6">
            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Change email</div>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-1 text-sm font-medium text-gray-700">
                  New email address
                  <input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    inputMode="email"
                    autoComplete="email"
                  />
                </div>
                <button
                  type="button"
                  onClick={updateEmail}
                  disabled={updatingEmail || !newEmail.trim()}
                  className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                    updatingEmail || !newEmail.trim()
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {updatingEmail ? 'Updating…' : 'Update email'}
                </button>
                <div className="text-xs text-gray-600">You may receive a confirmation email to complete the change.</div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Change password</div>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-1 text-sm font-medium text-gray-700">
                  New password
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    autoComplete="new-password"
                  />
                </div>
                <div className="grid gap-1 text-sm font-medium text-gray-700">
                  Confirm new password
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                    autoComplete="new-password"
                  />
                </div>
                <button
                  type="button"
                  onClick={updatePassword}
                  disabled={updatingPassword || !newPassword || !confirmPassword}
                  className={`h-11 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                    updatingPassword || !newPassword || !confirmPassword
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {updatingPassword ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-red-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Delete account</div>
              <p className="mt-1 text-sm text-gray-600">This permanently deletes your account and related data. This cannot be undone.</p>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(true)
                  setDeleteConfirmText('')
                }}
                className="mt-4 h-11 rounded-3xl px-4 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Delete account
              </button>
            </div>
          </div>
        </div>

        {showDeleteModal ? (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200">
              <div className="text-xl font-semibold text-gray-900">Delete account</div>
              <p className="mt-2 text-sm text-gray-600">Type <span className="font-semibold">DELETE</span> to confirm.</p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="mt-4 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm"
                placeholder="Type DELETE"
              />
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className={`h-11 flex-1 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                    deleting ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deleting || deleteConfirmText.trim().toLowerCase() !== 'delete'}
                  className={`h-11 flex-1 rounded-3xl px-4 text-sm font-semibold transition-colors ${
                    deleting || deleteConfirmText.trim().toLowerCase() !== 'delete'
                      ? 'bg-red-100 text-red-400'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ContentContainer>
    </div>
  )
}
