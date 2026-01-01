"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { User, Calendar, Phone, Mail, Lock, Trash2, AlertTriangle, X } from 'lucide-react'
import { useNotification } from '@/contexts/NotificationContext'

interface Props {
  studioId: string
}

interface StudioAdminProfile {
  user_id: string
  studio_id: string
  organization_name?: string | null
  created_at?: string
  updated_at?: string
}

interface UserProfile {
  user_id: string
  first_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null
  email?: string | null
  phone?: string | null
  street?: string | null
  house_number?: string | null
  postal_code?: string | null
  city?: string | null
  profile_completed?: boolean
  created_at?: string
  updated_at?: string
}

export default function StudioProfilePage({ studioId }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [user, setUser] = useState<any | null>(null)
  const [studioProfile, setStudioProfile] = useState<StudioAdminProfile | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [resolvedStudioId, setResolvedStudioId] = useState<string | null>(null)
  const { showSuccess, showError } = useNotification()

  useEffect(() => {
    const init = async () => {
      const { data: authData, error } = await supabase.auth.getUser()
      if (error) console.error('Auth getUser error', error)
      setUser(authData?.user ?? null)
    }
    init()
  }, [])

  useEffect(() => {
    if (user) loadProfile()
  }, [user, studioId])

  const [isStudioAdmin, setIsStudioAdmin] = useState(false)

  const loadProfile = async () => {
    setLoading(true)
      setMessage(null)
    try {
      console.log('[StudioProfilePage] Loading profiles for user:', user.id, 'studio:', studioId)
      
      // If studioId is not provided, fetch from user_roles
      let effectiveStudioId = studioId
      if (!effectiveStudioId) {
        const { data: roleRow, error: roleErr } = await supabase
          .from('user_roles')
          .select('studio_id')
          .eq('user_id', user.id)
          .maybeSingle()
        
        if (!roleErr && roleRow?.studio_id) {
          effectiveStudioId = roleRow.studio_id
          setResolvedStudioId(effectiveStudioId)
          console.log('[StudioProfilePage] Resolved studio_id from user_roles:', effectiveStudioId)
        } else {
          console.error('[StudioProfilePage] Could not resolve studio_id:', roleErr)
          showError('Kon studio niet bepalen voor deze gebruiker')
          setLoading(false)
          return
        }
      } else {
        setResolvedStudioId(effectiveStudioId)
      }
      
      // Load user_profiles (personal data)
      const { data: userProfileData, error: userProfileErr } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      
      if (userProfileErr && userProfileErr.code !== 'PGRST116') {
        console.error('[StudioProfilePage] user_profiles SELECT error:', userProfileErr)
      }

      if (!userProfileData) {
        console.log('[StudioProfilePage] No user_profile found, creating new one')
        const { data: newUserProfile, error: insertErr } = await supabase
          .from('user_profiles')
          .upsert({ user_id: user.id, email: user.email }, { onConflict: 'user_id' })
          .select()
          .maybeSingle()
        
        if (insertErr) {
          console.error('[StudioProfilePage] upsert user_profile error:', insertErr)
          showError(`Kon gebruikersprofiel niet aanmaken: ${insertErr.message}`)
        } else {
          setUserProfile(newUserProfile)
        }
      } else {
        console.log('[StudioProfilePage] user_profile loaded:', userProfileData)
        setUserProfile(userProfileData)
      }

      // Load studio_admin_profiles (studio-specific data)
      const { data: studioProfileData, error: studioProfileErr } = await supabase
        .from('studio_admin_profiles')
        .select('*')
        .eq('user_id', user.id)
        .eq('studio_id', effectiveStudioId)
        .maybeSingle()
      
      if (studioProfileErr && studioProfileErr.code !== 'PGRST116') {
        console.error('[StudioProfilePage] studio_admin_profiles SELECT error:', studioProfileErr)
      }

      if (!studioProfileData) {
        console.log('[StudioProfilePage] No studio_admin_profile found, creating new one')
        const { data: newStudioProfile, error: insertErr } = await supabase
          .from('studio_admin_profiles')
          .upsert({ user_id: user.id, studio_id: effectiveStudioId }, { onConflict: 'user_id' })
          .select()
          .maybeSingle()
        
        if (insertErr) {
          console.error('[StudioProfilePage] upsert studio_admin_profile error:', insertErr)
          showError(`Kon studio profiel niet aanmaken: ${insertErr.message}`)
        } else {
          setStudioProfile(newStudioProfile)
        }
      } else {
        console.log('[StudioProfilePage] studio_admin_profile loaded:', studioProfileData)
        setStudioProfile(studioProfileData)
      }
      
      // determine if current user has studio_admin/admin role for this studio
      try {
        const { data: roleRow, error: roleErr } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()
        
        console.log('[StudioProfilePage] Role check:', { roleRow, roleErr })
        if (!roleErr && roleRow && (roleRow.role === 'studio_admin' || roleRow.role === 'admin')) {
          console.log('[StudioProfilePage] User is studio admin')
          setIsStudioAdmin(true)
        }
      } catch (roleEx) {
        console.error('[StudioProfilePage] role check error', roleEx)
      }
    } catch (err: any) {
      console.error('[StudioProfilePage] Load profile error:', err)
      showError(`Kon profiel niet laden: ${err.message || 'Onbekende fout'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!userProfile || !studioProfile) return
    setSaving(true)
    setMessage(null)
    try {
      // Save user_profiles (personal data)
      const { error: userProfileErr } = await supabase.from('user_profiles').upsert({
        user_id: userProfile.user_id,
        first_name: userProfile.first_name || null,
        last_name: userProfile.last_name || null,
        date_of_birth: userProfile.date_of_birth || null,
        email: userProfile.email || null,
        phone: userProfile.phone || null,
        street: userProfile.street || null,
        house_number: userProfile.house_number || null,
        postal_code: userProfile.postal_code || null,
        city: userProfile.city || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

      if (userProfileErr) throw userProfileErr

      // Save studio_admin_profiles (studio-specific data)
      const { error: studioProfileErr } = await supabase.from('studio_admin_profiles').upsert({
        user_id: studioProfile.user_id,
        studio_id: studioProfile.studio_id,
        organization_name: studioProfile.organization_name || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

      if (studioProfileErr) throw studioProfileErr

      showSuccess('Wijzigingen opgeslagen')
    } catch (err: any) {
      console.error('Save error', err)
      showError('Opslaan mislukt: ' + (err.message || ''))
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Wachtwoord moet minstens 6 tekens bevatten' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Wachtwoorden komen niet overeen' })
      return
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setMessage({ type: 'success', text: 'Wachtwoord succesvol gewijzigd' })
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      console.error('Password update error', err)
      setMessage({ type: 'error', text: err.message || 'Kon wachtwoord niet bijwerken' })
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete') {
      showError('Type DELETE om te bevestigen')
      return
    }
    setDeleting(true)
    // transient feedback via NotificationContext
    try {
      // Best-effort: remove profile photo from storage before deleting account
      try {
        const { data: profileRow, error: profileErr } = await supabase
          .from('user_profiles')
          .select('photo_url')
          .eq('user_id', user!.id)
          .maybeSingle()

        if (!profileErr && profileRow?.photo_url) {
          const urlParts = profileRow.photo_url.split('/storage/v1/object/public/user_avatars/')
          if (urlParts.length === 2) {
            const filePath = urlParts[1]
            const { error: delErr } = await supabase.storage.from('user_avatars').remove([filePath])
            if (delErr) console.warn('Failed to delete profile photo during account deletion:', delErr)
            else console.info('Deleted profile photo from storage')
          }
        }
      } catch (e) {
        console.warn('Error deleting profile photo before account deletion:', e)
      }

      const { error } = await supabase.rpc('safe_delete_user_account', { p_user_id: user!.id })
      if (error) throw error
      await supabase.auth.signOut()
    } catch (err: any) {
      console.error('Delete account error', err)
      showError(err.message || 'Kon account niet verwijderen')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LoadingSpinner size={48} className="mx-auto" label="Profiel laden" />
          <p className="mt-4 text-slate-600">Profiel laden…</p>
        </div>
      </div>
    )
  }

  if (!user || !userProfile) return <div className="bg-red-50 border border-red-200 rounded-lg p-6"><h2 className="text-lg font-semibold text-red-900 mb-2">Niet geauthenticeerd</h2><p className="text-red-700">Log in om uw profiel te beheren.</p></div>

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-8">Studio Admin Profiel</h1>

      <div className="space-y-6">
        <form onSubmit={handleSave} className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Persoonlijke Gegevens</h2>

          {message && (
            <div className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{message.text}</div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Voornaam</label>
              <input value={userProfile.first_name || ''} onChange={(e) => setUserProfile({ ...userProfile, first_name: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Achternaam</label>
              <input value={userProfile.last_name || ''} onChange={(e) => setUserProfile({ ...userProfile, last_name: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Geboortedatum</label>
              <input type="date" value={userProfile.date_of_birth || ''} onChange={(e) => setUserProfile({ ...userProfile, date_of_birth: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Telefoon</label>
              <input value={userProfile.phone || ''} onChange={(e) => setUserProfile({ ...userProfile, phone: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">E-mail</label>
            <input type="email" value={userProfile.email || ''} onChange={(e) => setUserProfile({ ...userProfile, email: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
          </div>

          <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Straat</label>
                <input value={userProfile.street || ''} onChange={(e) => setUserProfile({ ...userProfile, street: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Huisnummer</label>
              <input value={userProfile.house_number || ''} onChange={(e) => setUserProfile({ ...userProfile, house_number: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Postcode</label>
              <input value={userProfile.postal_code || ''} onChange={(e) => setUserProfile({ ...userProfile, postal_code: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Stad</label>
              <input value={userProfile.city || ''} onChange={(e) => setUserProfile({ ...userProfile, city: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
            </div>
          </div>

          {studioProfile && (
            <div className="mb-4 pt-4 border-t border-slate-200">
              <h3 className="text-md font-semibold text-slate-900 mb-3">Studio Gegevens</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Organisatienaam</label>
                <input value={studioProfile.organization_name || ''} onChange={(e) => setStudioProfile({ ...studioProfile, organization_name: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
              <span>{saving ? 'Opslaan...' : 'Opslaan'}</span>
            </button>
          </div>
        </form>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Wachtwoord wijzigen</h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Nieuw wachtwoord</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Bevestig nieuw wachtwoord</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900" />
            </div>
            <button type="submit" className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"><Lock size={16} />Wijzig wachtwoord</button>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-lg border border-red-200 p-6">
          <div className="flex items-center gap-2 mb-4"><AlertTriangle className="text-red-600" size={20} /><h2 className="text-lg font-semibold text-red-900">Danger Zone</h2></div>
          <div className="space-y-4">
            {isStudioAdmin && (
              <div className="border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-2">Delete Studio</h3>
                <p className="text-sm text-slate-600 mb-4">Verwijder deze studio en alle bijbehorende data. Deze actie kan niet ongedaan gemaakt worden.</p>
                <div className="flex gap-3">
                  <button onClick={() => { /* open studio delete modal or call RPC */ alert('Studio delete flow not implemented in UI; use admin settings') }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete Studio</button>
                </div>
              </div>
            )}

            <div className="border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-900 mb-2">Delete Account</h3>
              <p className="text-sm text-slate-600 mb-4">Verwijder je account en alle bijbehorende data. Deze actie kan niet ongedaan gemaakt worden.</p>
              <div className="flex gap-3">
                <button onClick={() => { setShowDeleteModal(true); setDeleteConfirmText('') }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete Account</button>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Account Modal */}
        {showDeleteModal && (
          <div onClick={() => setShowDeleteModal(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div onClick={(e) => e.stopPropagation()} className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2"><AlertTriangle className="text-red-600" size={24} /><h3 className="text-xl font-semibold text-slate-900">Delete Account</h3></div>
                <button onClick={() => setShowDeleteModal(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <p className="text-slate-600 mb-4">Typ <strong>DELETE</strong> om te bevestigen:</p>
              <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 mb-4" placeholder="Type DELETE" />
              <div className="flex gap-3">
                {/* Removed bottom close button; use X or backdrop to close */}
                <button onClick={handleDeleteAccount} disabled={deleting || deleteConfirmText.toLowerCase() !== 'delete'} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting...' : 'Delete Account'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
