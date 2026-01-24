"use client"

import { useEffect, useMemo, useState } from 'react'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import SuperAdminGuard from '@/components/admin/SuperAdminGuard'
import { FeatureGate } from '@/components/FeatureGate'
import Modal from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import { useNotification } from '@/contexts/NotificationContext'
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm'
import { Check, ExternalLink, Search } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

type UserRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  phone_number: string | null
  updated_at: string | null
  roles: string[]
  is_super_admin: boolean
}

type UserDetails = {
  profile: {
    user_id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    phone_number: string | null
    updated_at: string | null
    deleted_at?: string | null
    deleted_by?: string | null
    deleted_reason?: string | null
  } | null
  roles: string[]
  studios: Array<{
    studio_id: string
    studio_name: string | null
    studio_slug: string | null
    member_role: 'owner' | 'admin' | string
    joined_at: string | null
    program_count: number
    enrollment_count: number
    subscription: {
      subscription_tier?: string | null
      subscription_status?: string | null
      subscription_period?: string | null
      subscription_start_date?: string | null
      subscription_end_date?: string | null
      trial_end_date?: string | null
      is_trial_active?: boolean | null
      trial_days_remaining?: number | null
    } | null
  }>
}

function getDisplayName(u: UserRow) {
  const first = (u.first_name || '').trim()
  const last = (u.last_name || '').trim()
  const full = `${first} ${last}`.trim()
  return full.length > 0 ? full : (u.email || u.user_id)
}

export default function SuperAdminUsersPage() {
  const { showError, showSuccess } = useNotification()
  const { isArmed: isRevokeArmed, confirmOrArm: confirmOrArmRevoke } = useTwoStepConfirm<string>(4500)
  const { isArmed: isDeleteArmed, confirmOrArm: confirmOrArmDelete } = useTwoStepConfirm<string>(4500)

  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])

  const [detailsUserId, setDetailsUserId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [details, setDetails] = useState<UserDetails | null>(null)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const [addStudioId, setAddStudioId] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteReason, setDeleteReason] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users

    return users.filter((u) => {
      const hay = [
        u.email,
        u.first_name,
        u.last_name,
        u.phone_number,
        u.user_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [query, users])

  async function loadUsers() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const resp = await fetch('/api/super-admin/users?limit=200', {
        method: 'GET',
        credentials: 'include',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      })

      const json = await resp.json().catch(() => ({} as any))

      if (resp.status === 401) {
        showError('Je sessie is verlopen. Log opnieuw in.')
        return
      }

      if (resp.status === 403) {
        showError('Geen toegang (super admin vereist).')
        return
      }

      if (!resp.ok) throw new Error(json?.error || 'Failed to load users')

      const list = Array.isArray(json?.users) ? (json.users as UserRow[]) : []
      setUsers(list)
    } catch (e: any) {
      console.error('Error loading users:', e)
      showError(e?.message || 'Kon gebruikers niet laden')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  async function setSuperAdmin(userId: string, makeSuperAdmin: boolean) {
    setSavingUserId(userId)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const resp = await fetch('/api/super-admin/users', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ user_id: userId, make_super_admin: makeSuperAdmin }),
      })

      const json = await resp.json().catch(() => ({} as any))

      if (!resp.ok) {
        throw new Error(json?.error || 'Failed to update role')
      }

      showSuccess(makeSuperAdmin ? 'Super admin toegevoegd' : 'Super admin verwijderd')
      await loadUsers()
    } catch (e: any) {
      console.error('Error updating role:', e)
      showError(e?.message || 'Aanpassen mislukt')
    } finally {
      setSavingUserId(null)
    }
  }

  async function loadUserDetails(userId: string) {
    setDetailsLoading(true)
    setDetailsError(null)
    setDetails(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const resp = await fetch(`/api/super-admin/users/${encodeURIComponent(userId)}`, {
        method: 'GET',
        credentials: 'include',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      })

      const json = await resp.json().catch(() => ({} as any))

      if (resp.status === 401) {
        showError('Je sessie is verlopen. Log opnieuw in.')
        return
      }

      if (resp.status === 403) {
        showError('Geen toegang (super admin vereist).')
        return
      }

      if (!resp.ok) throw new Error(json?.error || 'Failed to load details')
      setDetails(json as UserDetails)
    } catch (e: any) {
      console.error('Error loading user details:', e)
      setDetailsError(e?.message || 'Kon details niet laden')
    } finally {
      setDetailsLoading(false)
    }
  }

  async function addStudioAdmin(targetUserId: string, studioId: string) {
    setDetailsSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const resp = await fetch(`/api/super-admin/users/${encodeURIComponent(targetUserId)}/studio-members`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ studio_id: studioId }),
      })

      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) throw new Error(json?.error || 'Failed to add studio admin')

      showSuccess('Studio admin toegang toegevoegd')
      await loadUserDetails(targetUserId)
      setAddStudioId('')
    } catch (e: any) {
      console.error('Error adding studio admin:', e)
      showError(e?.message || 'Toevoegen mislukt')
    } finally {
      setDetailsSaving(false)
    }
  }

  async function removeStudioAccess(targetUserId: string, studioId: string) {
    setDetailsSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const resp = await fetch(`/api/super-admin/users/${encodeURIComponent(targetUserId)}/studio-members`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ studio_id: studioId }),
      })

      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) throw new Error(json?.error || 'Failed to remove studio access')

      showSuccess('Studio toegang verwijderd')
      await loadUserDetails(targetUserId)
    } catch (e: any) {
      console.error('Error removing studio access:', e)
      showError(e?.message || 'Verwijderen mislukt')
    } finally {
      setDetailsSaving(false)
    }
  }

  async function softDeleteUser(targetUserId: string, reason: string) {
    setDetailsSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const resp = await fetch(`/api/super-admin/users/${encodeURIComponent(targetUserId)}/soft-delete`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ reason }),
      })

      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) throw new Error(json?.error || 'Soft delete failed')

      showSuccess('Gebruiker soft-deleted')
      setDetailsOpen(false)
      setDetailsUserId(null)
      setDetails(null)
      setDeleteConfirmText('')
      setDeleteReason('')
      await loadUsers()
    } catch (e: any) {
      console.error('Error soft deleting user:', e)
      showError(e?.message || 'Soft delete mislukt')
    } finally {
      setDetailsSaving(false)
    }
  }

  useEffect(() => {
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <FeatureGate flagKey="super-admin.users" mode="page">
      <SuperAdminGuard>
        <div className="min-h-screen bg-slate-50 overflow-x-auto">
          <SuperAdminSidebar />

          <div className="w-full min-w-0 sm:ml-64">
            <header className="bg-white border-b border-slate-200">
              <div className="px-4 sm:px-8 py-4 sm:py-6">
                <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
                <p className="text-sm text-slate-600">Zoek gebruikers en beheer super admin rechten.</p>
              </div>
            </header>

            <main className="px-4 sm:px-8 py-6 sm:py-8">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                  <div className="relative w-full sm:max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Zoek op naam, e-mail, telefoon…"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>
                  <button
                    onClick={loadUsers}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                  >
                    Vernieuwen
                  </button>
                </div>

                {loading ? (
                  <div className="text-slate-600 flex items-center gap-2">
                    <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
                    <span>Laden…</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-slate-600">Geen gebruikers gevonden.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-200">
                          <th className="py-2 pr-4">Gebruiker</th>
                          <th className="py-2 pr-4">E-mail</th>
                          <th className="py-2 pr-4">Rollen</th>
                          <th className="py-2">Acties</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filtered.map((u) => {
                          const isSaving = savingUserId === u.user_id
                          return (
                            <tr key={u.user_id} className="text-slate-700">
                              <td className="py-3 pr-4">
                                <div className="font-medium text-slate-900">{getDisplayName(u)}</div>
                                <div className="text-xs text-slate-500">{u.user_id}</div>
                              </td>
                              <td className="py-3 pr-4">{u.email || '—'}</td>
                              <td className="py-3 pr-4">
                                <div className="flex flex-wrap gap-2">
                                  {u.is_super_admin && (
                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                      super_admin
                                    </span>
                                  )}
                                  {!u.is_super_admin && (
                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                      user
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={async () => {
                                      setDetailsUserId(u.user_id)
                                      setDetailsOpen(true)
                                      setAddStudioId('')
                                      setDeleteConfirmText('')
                                      setDeleteReason('')
                                      await loadUserDetails(u.user_id)
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                                  >
                                    Details
                                  </button>

                                  {u.is_super_admin ? (
                                    <button
                                      disabled={isSaving}
                                      onClick={() => confirmOrArmRevoke(`revoke-${u.user_id}`, () => setSuperAdmin(u.user_id, false))}
                                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50 ${
                                        isRevokeArmed(`revoke-${u.user_id}`) ? 'ring-2 ring-red-200' : ''
                                      }`}
                                      title={isRevokeArmed(`revoke-${u.user_id}`) ? 'Klik opnieuw om te bevestigen' : 'Verwijder super admin'}
                                    >
                                      {isSaving ? 'Bezig…' : (isRevokeArmed(`revoke-${u.user_id}`) ? (
                                        <span className="inline-flex items-center gap-2"><Check className="w-4 h-4" /> Bevestig</span>
                                      ) : 'Verwijder super admin')}
                                    </button>
                                  ) : (
                                    <button
                                      disabled={isSaving}
                                      onClick={() => setSuperAdmin(u.user_id, true)}
                                      className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50"
                                    >
                                      {isSaving ? 'Bezig…' : 'Maak super admin'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </main>

            <Modal
              isOpen={detailsOpen}
              onClose={() => {
                setDetailsOpen(false)
                setDetailsUserId(null)
                setDetails(null)
                setDetailsError(null)
              }}
              ariaLabel="User details"
              contentClassName="bg-white rounded-2xl shadow-xl max-w-4xl"
            >
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Gebruiker details</h2>
                  <p className="text-sm text-slate-600">Bekijk studio toegang, subscription info en acties.</p>
                </div>

                {detailsLoading ? (
                  <div className="text-slate-600">Laden…</div>
                ) : detailsError ? (
                  <div className="text-red-600 text-sm">{detailsError}</div>
                ) : !details ? (
                  <div className="text-slate-600">Geen details beschikbaar.</div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="text-sm font-semibold text-slate-900 mb-2">Profiel</div>
                        <div className="text-sm text-slate-700 space-y-1">
                          <div><span className="text-slate-500">Naam:</span> {(details.profile?.first_name || '')} {(details.profile?.last_name || '')}</div>
                          <div><span className="text-slate-500">E-mail:</span> {details.profile?.email || '—'}</div>
                          <div><span className="text-slate-500">Telefoon:</span> {details.profile?.phone_number || '—'}</div>
                          <div className="text-xs text-slate-500 break-all">{details.profile?.user_id}</div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="text-sm font-semibold text-slate-900 mb-2">Rollen</div>
                        <div className="flex flex-wrap gap-2">
                          {details.roles?.length ? details.roles.map((r) => (
                            <span key={r} className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                              {r}
                            </span>
                          )) : (
                            <span className="text-sm text-slate-600">Geen globale rollen.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">Studios (via studio_members)</div>
                          <div className="text-xs text-slate-500">Role edits blokkeren owners.</div>
                        </div>

                        {detailsUserId && (
                          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <input
                              value={addStudioId}
                              onChange={(e) => setAddStudioId(e.target.value)}
                              placeholder="Studio ID…"
                              className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-full sm:w-64"
                            />
                            <button
                              disabled={detailsSaving || !addStudioId.trim()}
                              onClick={() => addStudioAdmin(detailsUserId, addStudioId.trim())}
                              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium disabled:opacity-50"
                            >
                              Voeg toe als admin
                            </button>
                          </div>
                        )}
                      </div>

                      {details.studios.length === 0 ? (
                        <div className="text-sm text-slate-600">Geen studio memberships.</div>
                      ) : (
                        <div className="space-y-3">
                          {details.studios.map((s) => {
                            const canRemove = s.member_role !== 'owner'
                            return (
                              <div key={s.studio_id} className="rounded-lg border border-slate-200 p-3">
                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                  <div>
                                    <div className="font-medium text-slate-900">
                                      {s.studio_name || 'Studio'}
                                      {s.studio_slug ? <span className="text-slate-500 font-normal"> · {s.studio_slug}</span> : null}
                                    </div>
                                    <div className="text-xs text-slate-500 break-all">{s.studio_id}</div>

                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                        role: {s.member_role}
                                      </span>
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                        programs: {s.program_count}
                                      </span>
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                        enrollments: {s.enrollment_count}
                                      </span>
                                      {s.subscription?.subscription_tier ? (
                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                          tier: {s.subscription.subscription_tier}
                                        </span>
                                      ) : null}
                                      {s.subscription?.subscription_status ? (
                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                          status: {s.subscription.subscription_status}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    {s.studio_slug ? (
                                      <a
                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                                        href={`/studio/${encodeURIComponent(s.studio_slug)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Open studio <ExternalLink className="w-4 h-4" />
                                      </a>
                                    ) : null}

                                    {detailsUserId && (
                                      <button
                                        disabled={detailsSaving || !canRemove}
                                        onClick={() => removeStudioAccess(detailsUserId, s.studio_id)}
                                        className="px-3 py-1.5 rounded-lg border text-sm font-medium border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                        title={canRemove ? 'Verwijder toegang' : 'Owner kan niet verwijderd worden'}
                                      >
                                        Verwijder
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <div className="text-sm font-semibold text-red-800">Soft delete</div>
                      <div className="text-xs text-red-700 mt-1">Verwijdert studio_members (niet-owner), verwijdert user_roles, anonimiseert user_profiles.</div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          value={deleteReason}
                          onChange={(e) => setDeleteReason(e.target.value)}
                          placeholder="Reden (optioneel)…"
                          className="px-3 py-2 border border-red-200 rounded-lg text-sm"
                        />
                        <input
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="Typ VERWIJDER om te bevestigen…"
                          className="px-3 py-2 border border-red-200 rounded-lg text-sm"
                        />
                      </div>

                      {detailsUserId && (
                        <div className="mt-3">
                          <button
                            disabled={detailsSaving || deleteConfirmText.trim().toUpperCase() !== 'VERWIJDER'}
                            onClick={() => confirmOrArmDelete(`delete-${detailsUserId}`, () => softDeleteUser(detailsUserId, deleteReason.trim()))}
                            className={`px-3 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 ${
                              isDeleteArmed(`delete-${detailsUserId}`) ? 'ring-2 ring-red-300' : ''
                            }`}
                            title={isDeleteArmed(`delete-${detailsUserId}`) ? 'Klik opnieuw om te bevestigen' : 'Soft delete gebruiker'}
                          >
                            {detailsSaving ? 'Bezig…' : (isDeleteArmed(`delete-${detailsUserId}`) ? (
                              <span className="inline-flex items-center gap-2"><Check className="w-4 h-4" /> Bevestig soft delete</span>
                            ) : 'Soft delete gebruiker')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Modal>
          </div>
        </div>
      </SuperAdminGuard>
    </FeatureGate>
  )
}
