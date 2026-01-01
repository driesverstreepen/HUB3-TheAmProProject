"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, Trash2, Shield, Crown, Clock, Plus, X, Info, Mail, Check, Save, ChevronDown } from 'lucide-react'
import Select from '@/components/Select'
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm'
import { useNotification } from '@/contexts/NotificationContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface TeamMember {
  id: string
  user_id: string
  role: 'owner' | 'admin' | 'bookkeeper' | 'comms' | 'viewer'
  joined_at: string
  user_profile?: {
    first_name?: string
    last_name?: string
    email?: string
  }
}

interface PendingInvite {
  id: string
  email: string
  role: 'owner' | 'admin' | 'bookkeeper' | 'comms' | 'viewer'
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  invited_by_profile?: {
    first_name?: string
    last_name?: string
  }
}

interface Props {
  studioId: string
}

export default function TeamClient({ studioId }: Props) {
  const { isArmed: isRemoveArmed, confirmOrArm: confirmOrArmRemove } = useTwoStepConfirm<string>(4500)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'admin' | 'bookkeeper' | 'comms' | 'viewer' | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'bookkeeper' | 'comms' | 'viewer'>('admin')
  const [sending, setSending] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  const [rolePermissions, setRolePermissions] = useState<Record<string, Record<string, boolean>>>({})
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [savingRoleKey, setSavingRoleKey] = useState<string | null>(null)
  const [openRoleAccordion, setOpenRoleAccordion] = useState<'admin' | 'bookkeeper' | 'comms' | 'viewer' | null>('admin')
  const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, TeamMember['role']>>({})
  const [savingMemberRole, setSavingMemberRole] = useState<string | null>(null)

  const { showSuccess, showError } = useNotification()

  useEffect(() => {
    loadCurrentUser()
    loadMembers()
    loadInvites()
  }, [studioId])

  useEffect(() => {
    if (currentUserRole === 'owner') {
      loadRolePermissions()
    }
  }, [studioId, currentUserRole])

  const ROLE_LABELS: Record<string, string> = {
    owner: 'Eigenaar',
    admin: 'Admin',
    bookkeeper: 'Boekhouder',
    comms: 'Communicatie',
    viewer: 'Alleen-lezen',
  }

  const PERMISSION_KEYS: Array<{ key: string; label: string }> = [
    { key: 'studio.dashboard', label: 'Dashboard' },
    { key: 'studio.programs', label: "Programma's" },
    { key: 'studio.lessons', label: 'Lessen' },
    { key: 'studio.attendance', label: 'Aanwezigheden' },
    { key: 'studio.replacements', label: 'Vervangingen' },
    { key: 'studio.class-passes', label: 'Class Passes' },
    { key: 'studio.notes', label: 'Notes' },
    { key: 'studio.emails', label: 'E-mails' },
    { key: 'studio.finance', label: 'Financiën' },
    { key: 'studio.members', label: 'Leden' },
    { key: 'studio.evaluations', label: 'Evaluaties' },
    { key: 'studio.settings', label: 'Settings' },
    { key: 'studio.profile', label: 'Mijn profiel' },
    { key: 'studio.public-profile', label: 'Public profile' },
  ]

  const loadCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setCurrentUserId(user.id)

      // Get current user's role
      const { data: memberData } = await supabase
        .from('studio_members')
        .select('role')
        .eq('studio_id', studioId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (memberData) {
        setCurrentUserRole(memberData.role as any)
      }
    } catch (err) {
      console.error('Error loading current user:', err)
    }
  }

  const loadRolePermissions = async () => {
    try {
      setPermissionsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        setRolePermissions({})
        return
      }

      const res = await fetch(`/api/studio/${studioId}/role-permissions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const json = await res.json()
      if (!res.ok) {
        console.error('Role permissions API error:', json?.error)
        setRolePermissions({})
        return
      }

      const byRole: Record<string, Record<string, boolean>> = {}
      for (const row of (json.permissionsByRole || []) as any[]) {
        if (!row?.role) continue
        byRole[row.role] = row.permissions || {}
      }
      setRolePermissions(byRole)
    } catch (err) {
      console.error('Error loading role permissions:', err)
      setRolePermissions({})
    } finally {
      setPermissionsLoading(false)
    }
  }

  const toggleRolePermission = (role: string, key: string) => {
    setRolePermissions((prev) => {
      const next = { ...prev }
      const current = next[role] || {}
      next[role] = { ...current, [key]: !(current[key] ?? false) }
      return next
    })
  }

  const saveRolePermissions = async (role: 'admin' | 'bookkeeper' | 'comms' | 'viewer') => {
    try {
      setSavingRoleKey(role)
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Geen geldige sessie gevonden')

      const response = await fetch(`/api/studio/${studioId}/role-permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role, permissions: rolePermissions[role] || {} }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Opslaan mislukt')
      showSuccess('Permissies opgeslagen')
      await loadRolePermissions()
    } catch (err: any) {
      console.error('Error saving role permissions:', err)
      showError(err.message || 'Kon permissies niet opslaan')
    } finally {
      setSavingRoleKey(null)
    }
  }

  const saveMemberRole = async (memberId: string) => {
    try {
      const role = memberRoleDrafts[memberId]
      if (!role || role === 'owner') return
      setSavingMemberRole(memberId)
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Geen geldige sessie gevonden')

      const response = await fetch(`/api/studio/${studioId}/members/${memberId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Opslaan mislukt')
      showSuccess('Rol bijgewerkt')
      await loadMembers()
    } catch (err: any) {
      console.error('Error updating member role:', err)
      showError(err.message || 'Kon rol niet bijwerken')
    } finally {
      setSavingMemberRole(null)
    }
  }

  const loadMembers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        console.error('No access token for members fetch')
        setMembers([])
        setLoading(false)
        return
      }
      const res = await fetch(`/api/studio/${studioId}/members`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      const json = await res.json()
      if (!res.ok) {
        console.error('Members API error:', json.error)
        setMembers([])
        return
      }
      setMembers(json.members || [])
    } catch (err) {
      console.error('Error loading members via API:', err)
      setMembers([])
    } finally {
      setLoading(false)
    }
  }

  const loadInvites = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        console.error('No access token for invites fetch')
        setInvites([])
        return
      }
      const res = await fetch(`/api/studio/${studioId}/invites`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      const json = await res.json()
      if (!res.ok) {
        console.error('Invites API error:', json.error)
        setInvites([])
        return
      }
      setInvites(json.invites || [])
    } catch (err) {
      console.error('Error loading invites via API:', err)
      setInvites([])
    }
  }

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      showError('Voer een email adres in')
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail.trim())) {
      showError('Voer een geldig email adres in')
      return
    }

    setSending(true)
    try {
      // Get access token
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      
      if (!accessToken) {
        throw new Error('Geen geldige sessie gevonden')
      }

      const response = await fetch(`/api/studio/${studioId}/invites`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invite')
      }

      showSuccess('Uitnodiging verstuurd!')
      setInviteEmail('')
      setInviteRole('admin')
      setShowAddModal(false)
      loadInvites()
    } catch (err: any) {
      console.error('Error sending invite:', err)
      showError(err.message || 'Kon uitnodiging niet versturen')
    } finally {
      setSending(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      // Get access token
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      
      if (!accessToken) {
        throw new Error('Geen geldige sessie gevonden')
      }

      const response = await fetch(`/api/studio/${studioId}/invites/${inviteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to revoke invite')
      }

      showSuccess('Uitnodiging ingetrokken')
      loadInvites()
    } catch (err: any) {
      console.error('Error revoking invite:', err)
      showError(err.message || 'Kon uitnodiging niet intrekken')
    }
  }

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    // Prevent removing yourself
    if (memberUserId === currentUserId) {
      showError('Je kunt jezelf niet verwijderen')
      return
    }

    try {
      const { error } = await supabase
        .from('studio_members')
        .delete()
        .eq('id', memberId)

      if (error) throw error

      showSuccess('Teamlid verwijderd')
      loadMembers()
    } catch (err: any) {
      console.error('Error removing member:', err)
      showError('Kon teamlid niet verwijderen')
    }
  }

  // Always allow team management for now (will be restricted by API)
  const canManageTeam = true
  const canRemoveMembers = currentUserRole === 'owner'

  if (loading) {
    return (
      <div>
        {/* Header - always show even when loading */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Users size={24} />
              Team Beheer
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Beheer wie toegang heeft tot je studio interface
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Team Lid Toevoegen
          </button>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <div className="flex items-center justify-center gap-2 text-slate-600">
            <LoadingSpinner size={20} label="Laden…" indicatorClassName="border-b-slate-600" />
            <span>Laden…</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users size={24} />
            Team Beheer
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Beheer wie toegang heeft tot je studio interface
          </p>
        </div>
        {canManageTeam && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Team Lid Toevoegen
          </button>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex gap-3">
          <Info className="text-blue-600 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">Hoe werkt team beheer?</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Uitgenodigde teamleden krijgen een notificatie in hun HUB3 account</li>
              <li>Uitgenodigde teamleden hebben hun eigen account en profiel</li>
              <li>Zij krijgen geen toegang tot jouw persoonlijke informatie</li>
              <li>Alleen eigenaren kunnen teamleden verwijderen</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Current Members */}
      {members.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Naam
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Lid sinds
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Acties
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-blue-600 font-semibold">
                            {member.user_profile?.first_name?.[0]}{member.user_profile?.last_name?.[0]}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {member.user_profile?.first_name} {member.user_profile?.last_name}
                            {member.user_id === currentUserId && (
                              <span className="ml-2 text-xs text-slate-500">(jij)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900">{member.user_profile?.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {currentUserRole === 'owner' && member.role !== 'owner' ? (
                        <div className="flex items-center gap-2">
                          {/* Use native select here so the dropdown isn't clipped by table overflow containers */}
                          <div className="relative min-w-[180px]">
                            <select
                              value={memberRoleDrafts[member.id] ?? member.role}
                              onChange={(e) =>
                                setMemberRoleDrafts((prev) => ({
                                  ...prev,
                                  [member.id]: e.target.value as TeamMember['role'],
                                }))
                              }
                              className="w-full h-10 pl-4 pr-10 border border-slate-300 rounded-lg bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                            >
                              <option value="admin">Admin</option>
                              <option value="bookkeeper">Boekhouder</option>
                              <option value="comms">Communicatie</option>
                              <option value="viewer">Alleen-lezen</option>
                            </select>
                            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                          </div>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          member.role === 'owner'
                            ? 'bg-purple-100 text-purple-700'
                            : member.role === 'admin'
                              ? 'bg-blue-100 text-blue-700'
                              : member.role === 'bookkeeper'
                                ? 'bg-emerald-100 text-emerald-700'
                                : member.role === 'comms'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-slate-100 text-slate-700'
                        }`}>
                          {member.role === 'owner' ? <Crown size={12} /> : <Shield size={12} />}
                          {ROLE_LABELS[member.role] || member.role}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {new Date(member.joined_at).toLocaleDateString('nl-NL')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="inline-flex items-center justify-end gap-2">
                        {/* Save role icon (owner-only) */}
                        {currentUserRole === 'owner' && member.role !== 'owner' && (() => {
                          const draft = memberRoleDrafts[member.id] ?? member.role
                          const hasChange = draft !== member.role
                          const isSaving = savingMemberRole === member.id
                          const disabled = !hasChange || isSaving

                          return (
                            <button
                              onClick={() => saveMemberRole(member.id)}
                              disabled={disabled}
                              title={
                                isSaving ? 'Opslaan…' : hasChange ? 'Opslaan' : 'Geen wijzigingen'
                              }
                              className={`p-2 rounded-md transition-colors ${
                                disabled
                                  ? isSaving
                                    ? 'text-blue-600 opacity-60 cursor-not-allowed'
                                    : 'text-slate-300 cursor-not-allowed'
                                  : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 active:text-blue-700'
                              }`}
                            >
                              <Save size={18} />
                            </button>
                          )
                        })()}

                        {canRemoveMembers && member.user_id !== currentUserId && member.role !== 'owner' && (
                          <button
                            onClick={() => confirmOrArmRemove(`member:${member.id}`, () => handleRemoveMember(member.id, member.user_id))}
                            title={isRemoveArmed(`member:${member.id}`) ? 'Klik opnieuw om te verwijderen' : 'Verwijderen'}
                            className={`inline-flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors ${
                              isRemoveArmed(`member:${member.id}`) ? 'ring-2 ring-red-200' : ''
                            }`}
                          >
                            {isRemoveArmed(`member:${member.id}`) ? (
                              <>
                                <span className="hidden sm:inline text-sm font-medium">Verwijderen</span>
                                <span className="sm:hidden">
                                  <Check size={16} />
                                </span>
                              </>
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-amber-600" />
            Openstaande Uitnodigingen
          </h3>
          <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-amber-100 border-b border-amber-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">
                      E-mailadres
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">
                      Uitgenodigd op
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-amber-900 uppercase tracking-wider">
                      Acties
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-amber-200">
                  {invites.map((invite) => (
                    <tr key={invite.id} className="hover:bg-amber-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Mail size={16} className="text-amber-600" />
                          <span className="text-sm font-medium text-slate-900">
                            {invite.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Clock size={12} />
                          In afwachting
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600">
                          {new Date(invite.created_at).toLocaleDateString('nl-NL')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canManageTeam && (
                          <button
                            onClick={() => confirmOrArmRemove(`invite:${invite.id}`, () => handleRevokeInvite(invite.id))}
                            className={`inline-flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors ${
                              isRemoveArmed(`invite:${invite.id}`) ? 'ring-2 ring-red-200' : ''
                            }`}
                            title={isRemoveArmed(`invite:${invite.id}`) ? 'Klik opnieuw om in te trekken' : 'Trek uitnodiging in'}
                          >
                            {isRemoveArmed(`invite:${invite.id}`) ? (
                              <>
                                <span className="hidden sm:inline text-sm font-medium">Intrekken</span>
                                <span className="sm:hidden">
                                  <Check size={16} />
                                </span>
                              </>
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* No members/invites state */}
      {members.length === 0 && invites.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            Nog geen teamleden
          </h3>
          <p className="text-slate-600 mb-4">
            Voeg gebruikers toe als admin om hen toegang te geven tot de studio interface.
          </p>
          {canManageTeam && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              Team Lid Toevoegen
            </button>
          )}
        </div>
      )}

      {/* Add Team Member Modal */}
      {showAddModal && (
        <div onClick={() => { setShowAddModal(false); setInviteEmail(''); setInviteRole('admin'); }} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900">Team Lid Toevoegen</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setInviteEmail('');
                  setInviteRole('admin');
                }}
                aria-label="Close"
                className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                E-mailadres van gebruiker
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="gebruiker@example.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-2">
                Voer het e-mailadres in van een bestaande gebruiker. Deze krijgt de gekozen rol toegewezen.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Rol
              </label>
              <Select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="w-full"
                variant="md"
              >
                <option value="admin">Admin</option>
                <option value="bookkeeper">Boekhouder</option>
                <option value="comms">Communicatie</option>
                <option value="viewer">Alleen-lezen</option>
              </Select>
              <p className="text-xs text-slate-500 mt-2">
                Kies welke pagina's deze gebruiker mag zien. Alleen eigenaren kunnen rollen en permissies aanpassen.
              </p>
            </div>

            <div className="flex">
              <button
                onClick={handleSendInvite}
                disabled={sending}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? 'Versturen...' : 'Verstuur Uitnodiging'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role permissions editor (owner-only) */}
      {currentUserRole === 'owner' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Rollen & toegang</h3>
          <p className="text-sm text-slate-600 mb-4">
            Stel per rol in tot welke pagina's iemand toegang heeft.
          </p>

          {permissionsLoading ? (
            <div className="flex items-center gap-2 text-slate-600">
              <LoadingSpinner size={18} label="Permissies laden" indicatorClassName="border-b-slate-600" />
              <span>Permissies laden…</span>
            </div>
          ) : (
            <div className="space-y-3">
              {(['admin', 'bookkeeper', 'comms', 'viewer'] as const).map((role) => {
                const isOpen = openRoleAccordion === role

                return (
                  <div key={role} className="rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenRoleAccordion((prev) => (prev === role ? null : role))}
                      className="w-full flex items-center justify-between gap-4 p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="text-left">
                        <div className="text-sm font-semibold text-slate-900">{ROLE_LABELS[role]}</div>
                        <div className="text-xs text-slate-500">Pagina-toegang voor deze rol</div>
                      </div>
                      <span className="text-slate-500 text-sm select-none">
                        {isOpen ? '▴' : '▾'}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="p-4 bg-white">
                        {role === 'viewer' && (
                          <div className="mb-3 flex items-start gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <Info size={18} className="text-slate-500 mt-0.5" />
                            <div>
                              <div className="font-medium text-slate-900">Alleen-lezen</div>
                              <div className="text-slate-600">
                                Deze rol kan pagina's bekijken als je ze hieronder aanvinkt, maar kan niets toevoegen, bewerken of verwijderen.
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="grid sm:grid-cols-2 gap-2">
                          {PERMISSION_KEYS.map((p) => (
                            <label key={p.key} className="flex items-center gap-2 text-sm text-slate-800">
                              <input
                                type="checkbox"
                                checked={!!(rolePermissions[role]?.[p.key] ?? false)}
                                onChange={() => toggleRolePermission(role, p.key)}
                                className="h-4 w-4"
                              />
                              <span>{p.label}</span>
                            </label>
                          ))}
                        </div>

                        <div className="flex items-center justify-end mt-2">
                          <button
                            onClick={() => saveRolePermissions(role)}
                            disabled={savingRoleKey === role}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingRoleKey === role ? 'Opslaan…' : 'Opslaan'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
