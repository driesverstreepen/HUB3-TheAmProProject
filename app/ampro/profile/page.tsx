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
          .select('first_name,last_name,phone,birth_date,street,house_number,house_number_addition,postal_code,city')
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
          })
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Kon profiel niet laden')
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
      if (!user) throw new Error('Je bent niet ingelogd')

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
      }

      if (!isAmproProfileComplete(payload)) {
        throw new Error('Vul alle verplichte velden in: voornaam, achternaam, geboortedatum en adresgegevens')
      }

      const { error } = await supabase
        .from('ampro_dancer_profiles')
        .upsert(payload, { onConflict: 'user_id' })

      if (error) throw error

      showSuccess('Profiel opgeslagen')

      if (nextPath) {
        router.replace(nextPath)
      }
    } catch (e: any) {
      showError(e?.message || 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  async function updateEmail() {
    try {
      setUpdatingEmail(true)
      const nextEmail = newEmail.trim()
      if (!nextEmail) throw new Error('Vul een geldig e-mailadres in')

      const { error } = await supabase.auth.updateUser({ email: nextEmail })
      if (error) throw error

      showSuccess('E-mailadres update aangevraagd. Check je inbox om te bevestigen.')
    } catch (e: any) {
      showError(e?.message || 'E-mailadres wijzigen mislukt')
    } finally {
      setUpdatingEmail(false)
    }
  }

  async function updatePassword() {
    try {
      setUpdatingPassword(true)
      if (!newPassword) throw new Error('Vul een nieuw wachtwoord in')
      if (newPassword !== confirmPassword) throw new Error('Wachtwoorden komen niet overeen')

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setNewPassword('')
      setConfirmPassword('')
      showSuccess('Wachtwoord bijgewerkt')
    } catch (e: any) {
      showError(e?.message || 'Wachtwoord wijzigen mislukt')
    } finally {
      setUpdatingPassword(false)
    }
  }

  async function deleteAccount() {
    try {
      if (!userId) throw new Error('Je bent niet ingelogd')
      setDeleting(true)

      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Account verwijderen mislukt')

      await supabase.auth.signOut().catch(() => {})
      router.replace('/ampro')

      if (data?.warning) {
        showSuccess('Account verwijderd. Let op: ' + data.warning)
      } else if (data?.info) {
        showSuccess('Account verwijderd. ' + data.info)
      } else {
        showSuccess('Account verwijderd')
      }
    } catch (e: any) {
      showError(e?.message || 'Account verwijderen mislukt')
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
    <div className="min-h-screen bg-slate-50">
      <ContentContainer className="py-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-2xl font-bold text-slate-900">Mijn profiel</h1>
          <p className="mt-1 text-sm text-slate-600">{email}</p>

          {nextPath ? (
            <div className="mt-4 text-sm text-slate-700">
              Vul je profiel volledig in om verder te gaan.
            </div>
          ) : null}

          <div className="mt-8 grid gap-4">
            <div className="grid gap-1 text-sm font-medium text-slate-700">
              <span>
                Voornaam {requiredMark}
              </span>
              <input
                value={profile.first_name || ''}
                onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <div className="grid gap-1 text-sm font-medium text-slate-700">
              <span>
                Achternaam {requiredMark}
              </span>
              <input
                value={profile.last_name || ''}
                onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <div className="grid gap-1 text-sm font-medium text-slate-700">
              Telefoon
              <input
                value={profile.phone || ''}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              />
            </div>

            <div className="grid gap-1 text-sm font-medium text-slate-700">
              <span>
                Geboortedatum {requiredMark}
              </span>
              <input
                type="date"
                value={profile.birth_date || ''}
                onChange={(e) => setProfile((p) => ({ ...p, birth_date: e.target.value }))}
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <div className="mt-2 text-sm font-semibold text-slate-900">Adres</div>

            <div className="grid gap-1 text-sm font-medium text-slate-700">
              <span>
                Straat {requiredMark}
              </span>
              <input
                value={profile.street || ''}
                onChange={(e) => setProfile((p) => ({ ...p, street: e.target.value }))}
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-1 text-sm font-medium text-slate-700">
                <span>
                  Huisnummer {requiredMark}
                </span>
                <input
                  value={profile.house_number || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, house_number: e.target.value }))}
                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  required
                />
              </div>
              <div className="grid gap-1 text-sm font-medium text-slate-700">
                Huisnummer toevoeging
                <input
                  value={profile.house_number_addition || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, house_number_addition: e.target.value }))}
                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                />
              </div>
              <div className="grid gap-1 text-sm font-medium text-slate-700">
                <span>
                  Postcode {requiredMark}
                </span>
                <input
                  value={profile.postal_code || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, postal_code: e.target.value }))}
                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid gap-1 text-sm font-medium text-slate-700">
              <span>
                Gemeente {requiredMark}
              </span>
              <input
                value={profile.city || ''}
                onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                required
              />
            </div>

            <button
              onClick={save}
              disabled={saving}
              className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                saving ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {saving ? 'Opslaan…' : nextPath ? 'Opslaan en verdergaan' : 'Opslaan'}
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-red-200 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
              <p className="mt-1 text-sm text-slate-600">Wijzig je accountgegevens of verwijder je account permanent.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-6">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">E-mailadres wijzigen</div>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-1 text-sm font-medium text-slate-700">
                  Nieuw e-mailadres
                  <input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    inputMode="email"
                    autoComplete="email"
                  />
                </div>
                <button
                  type="button"
                  onClick={updateEmail}
                  disabled={updatingEmail || !newEmail.trim()}
                  className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                    updatingEmail || !newEmail.trim()
                      ? 'bg-slate-100 text-slate-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {updatingEmail ? 'Bijwerken…' : 'E-mailadres bijwerken'}
                </button>
                <div className="text-xs text-slate-600">Je kan een bevestigingsmail ontvangen om de wijziging af te ronden.</div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">Wachtwoord wijzigen</div>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-1 text-sm font-medium text-slate-700">
                  Nieuw wachtwoord
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    autoComplete="new-password"
                  />
                </div>
                <div className="grid gap-1 text-sm font-medium text-slate-700">
                  Bevestig nieuw wachtwoord
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    autoComplete="new-password"
                  />
                </div>
                <button
                  type="button"
                  onClick={updatePassword}
                  disabled={updatingPassword || !newPassword || !confirmPassword}
                  className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                    updatingPassword || !newPassword || !confirmPassword
                      ? 'bg-slate-100 text-slate-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {updatingPassword ? 'Bijwerken…' : 'Wachtwoord bijwerken'}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-red-200 p-4">
              <div className="text-sm font-semibold text-slate-900">Account verwijderen</div>
              <p className="mt-1 text-sm text-slate-600">Dit verwijdert je account en gekoppelde data permanent. Dit kan niet ongedaan gemaakt worden.</p>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(true)
                  setDeleteConfirmText('')
                }}
                className="mt-4 h-11 rounded-lg px-4 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Account verwijderen
              </button>
            </div>
          </div>
        </div>

        {showDeleteModal ? (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
              <div className="text-xl font-semibold text-slate-900">Account verwijderen</div>
              <p className="mt-2 text-sm text-slate-600">Type <span className="font-semibold">DELETE</span> om te bevestigen.</p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="mt-4 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                placeholder="Type DELETE"
              />
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className={`h-11 flex-1 rounded-lg px-4 text-sm font-semibold transition-colors ${
                    deleting ? 'bg-slate-100 text-slate-400' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deleting || deleteConfirmText.trim().toLowerCase() !== 'delete'}
                  className={`h-11 flex-1 rounded-lg px-4 text-sm font-semibold transition-colors ${
                    deleting || deleteConfirmText.trim().toLowerCase() !== 'delete'
                      ? 'bg-red-100 text-red-400'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {deleting ? 'Verwijderen…' : 'Verwijderen'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ContentContainer>
    </div>
  )
}
