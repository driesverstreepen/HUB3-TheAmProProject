"use client"

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useNotification } from '@/contexts/NotificationContext'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { safeSelect } from '@/lib/supabaseHelpers'
import { Mail, Lock, Eye, EyeOff, User, MapPin, Shield, Building2, GraduationCap, Users, Calendar, Phone, Trash2, AlertTriangle, Download, X, Upload, Camera } from 'lucide-react'
import SubProfilesSection from '@/components/SubProfilesSection'
import ImageCropper from '@/components/ImageCropper'
import DANCE_STYLES from '@/lib/danceStyles'

export default function ProfilePageComponent() {
  // The content is intentionally identical to the previous page implementation
  const [user, setUser] = useState<any | null>(null)
  const [role, setRole] = useState<string>('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showStudioDeleteModal, setShowStudioDeleteModal] = useState(false)
  const [showTeacherRequestModal, setShowTeacherRequestModal] = useState(false)
  
  const [publicProfile, setPublicProfile] = useState<any | null>(null)
  const [showPublicProfileModal, setShowPublicProfileModal] = useState(false)
  const [publicEditMode, setPublicEditMode] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publicForm, setPublicForm] = useState({ first_name: '', last_name: '', date_of_birth: '', headline: '', bio: '', contact_email: '', phone_number: '', website: '', photo_url: '', cv: '', is_public: true, dance_style: [] as string[] })
  const [availableDanceStyles, setAvailableDanceStyles] = useState<string[]>(DANCE_STYLES)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Profile photo upload state
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showPhotoCropper, setShowPhotoCropper] = useState(false)
  const [originalPhotoFile, setOriginalPhotoFile] = useState<File | null>(null)

  const [profileData, setProfileData] = useState<any>({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    street: '',
    house_number: '',
    house_number_addition: '',
    postal_code: '',
    city: '',
    date_of_birth: '',
    role: '',
    studio_name: '',
    studio_id: '',
    photo_url: '',
  })

  const [memberships, setMemberships] = useState<any[]>([])
  const [showProfileNote, setShowProfileNote] = useState(false)
  const firstNameRef = useRef<HTMLInputElement | null>(null)
  const { showModal, showSuccess, showError, showInfo, dismissNotification } = useNotification()
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: authData, error } = await supabase.auth.getUser()
      if (error) {
        console.error('Auth getUser error', error)
      }
      setUser(authData?.user ?? null)
    }
    init()
  }, [])

  useEffect(() => {
    if (user) loadProfileData()
    // detect if user was just created and redirected here
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      if (params?.get('new_user') === '1' || params?.get('new_user') === 'true') setShowProfileNote(true)
    } catch {
      // ignore URL parse errors in unusual environments
    }
  }, [user])

  useEffect(() => {
    // Load public teacher profile if exists
    const loadPublic = async () => {
      try {
        if (!user) return
        const { data, error } = await supabase.from('public_teacher_profiles').select('*').eq('user_id', user.id).maybeSingle()
        if (!error && data) {
          setPublicProfile(data)
          setPublicForm({
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            date_of_birth: data.date_of_birth ? String(data.date_of_birth).slice(0,10) : '',
            headline: data.headline || '',
            bio: data.bio || '',
            contact_email: data.contact_email || profileData.email || '',
            phone_number: data.phone_number || '',
            website: data.website || '',
            photo_url: data.photo_url || '',
            cv: data.cv || '',
            is_public: data.is_public ?? true,
            dance_style: Array.isArray(data.dance_style)
              ? data.dance_style
              : (typeof data.dance_style === 'string' ? data.dance_style.split(/\s*,\s*/).map((s: string) => s.trim()).filter(Boolean) : [])
          })
        }
      } catch {
        // ignore (table might not exist locally until migration run)
      }
    }
    loadPublic()
  }, [user, profileData.email])

  // Prefill public form from user_profiles (profileData) when modal opens and public profile doesn't exist
  useEffect(() => {
    if (!showPublicProfileModal) return
    setPublicForm((prev) => ({
      ...prev,
      first_name: prev.first_name || profileData.first_name || '',
      last_name: prev.last_name || profileData.last_name || '',
      date_of_birth: prev.date_of_birth || profileData.date_of_birth || '',
      contact_email: prev.contact_email || profileData.email || ''
    }))
  }, [showPublicProfileModal, profileData])

  // Load canonical dance styles from API; fall back to local list
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/dance-styles')
        if (!res.ok) throw new Error('Failed to load')
        const json = await res.json()
        if (mounted && Array.isArray(json.styles)) setAvailableDanceStyles(json.styles.map((s: any) => (s.name ? String(s.name) : String(s))))
      } catch (err) {
        // ignore and keep fallback
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (showProfileNote) {
      // focus first required field after a small delay to ensure it's mounted
      setTimeout(() => firstNameRef.current?.focus(), 50)
    }
  }, [showProfileNote])

  const loadProfileData = async () => {
    if (!user) return
  console.info('[ProfilePage] Loading profile data for', user.id)
    setDataLoading(true)

    try {
      // determine role from public.users
      const { data: uRow, error: uErr } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
      if (uErr && uErr.code !== 'PGRST116') console.error('users fetch error', uErr)
      const userRole = uRow?.role || 'user'
      setRole(userRole)

      if (userRole === 'user') {
        const [{ data: p, missingTable: pMissing }, membershipResult] = await Promise.all([
          (async () => { const r = await safeSelect(supabase, 'user_profiles', '*', { user_id: user.id }); return { data: r.data, missingTable: r.missingTable }})(),
          (async () => { const r = await safeSelect(supabase, 'studio_memberships', '*, studios(name)', { user_id: user.id }); return r })()
        ])

        // safeSelect returns raw res.data which is usually an array for SELECT; normalize to single row when appropriate
        const profileRow = Array.isArray(p) ? p[0] : p

        console.info('[ProfilePage] Loaded:', { profileResult: { data: profileRow, missingTable: pMissing }, membershipResult })

        setMemberships(membershipResult?.data || [])
        setProfileData({
          first_name: profileRow?.first_name || '',
          last_name: profileRow?.last_name || '',
          email: profileRow?.email || user.email || '',
          phone_number: profileRow?.phone_number || '',
          street: profileRow?.street || '',
          house_number: profileRow?.house_number || '',
          house_number_addition: profileRow?.house_number_addition || '',
          postal_code: profileRow?.postal_code || '',
          city: profileRow?.city || '',
          date_of_birth: profileRow?.date_of_birth ? String(profileRow.date_of_birth).slice(0,10) : '',
          role: 'member',
          studio_name: (membershipResult.data?.[0]?.studios as { name: string } | null)?.name || '',
          studio_id: membershipResult.data?.[0]?.studio_id || ''
        })

        // ensure user_profiles exists (try to create or upsert a row)
        if (!p) {
          // Use upsert so re-running migrations or partial rows won't fail
          const { data: insData, error: insertErr } = await supabase
            .from('user_profiles')
            .upsert({ user_id: user.id, email: user.email, first_name: signupNameFallback(user), last_name: '' }, { onConflict: 'user_id' })
            .select()

            if (insertErr) {
            console.error('insert/upsert profile error', insertErr, JSON.stringify(insertErr, null, 2))
            showError('Database error while creating profile. Controleer of de `user_profiles` tabel en RLS-policies bestaan.')

            try {
              const { error: probeErr } = await supabase.from('user_profiles').select('user_id').limit(1)
              if (probeErr) console.error('user_profiles probe error', probeErr, JSON.stringify(probeErr, null, 2))
            } catch (probeEx) {
              console.error('probe exception', probeEx)
            }
          } else {
            // set local profile data from newly created row (if returned)
            if (insData && Array.isArray(insData) && insData[0]) {
              const created = insData[0]
              setProfileData((prev: any) => ({
                ...prev,
                first_name: created.first_name || '',
                last_name: created.last_name || '',
                email: created.email || user.email || ''
              }))
            }
          }
        } else {
          // If profile exists but personal fields are empty, try to populate from `users` table
          const emptyPersonal = !p.first_name && !p.last_name && (!p.email || p.email === user.email)
          if (emptyPersonal) {
            try {
              const { data: uRow2, error: uErr2 } = await supabase.from('users').select('naam, email').eq('id', user.id).maybeSingle()
              if (!uErr2 && uRow2) {
                const [firstFromUsers, lastFromUsers] = splitName(uRow2.naam || '')
                const { error: upsertErr } = await supabase.from('user_profiles').upsert({
                  user_id: user.id,
                  first_name: p.first_name || firstFromUsers || '',
                  last_name: p.last_name || lastFromUsers || '',
                  email: p.email || uRow2.email || user.email || null,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })
                if (upsertErr) console.warn('[ProfilePage] Could not upsert fallback user profile:', upsertErr)
                else {
                  // refresh local state
                  setProfileData((prev: any) => ({
                        ...prev,
                        first_name: p.first_name || firstFromUsers || '',
                        last_name: p.last_name || lastFromUsers || '',
                        email: p.email || uRow2.email || user.email || ''
                      }))
                }
              }
            } catch (ex) {
              console.error('[ProfilePage] Fallback population error', ex)
            }
          }
        }
      } else {
        // Use safeSelect so we can detect missing tables (RLS/migration issues)
  // Note: user_roles no longer contains personal columns; only request relation fields.
  // Request role + studio relation; personal data is stored in user_profiles.
  const rolesRes: any = await safeSelect(supabase, 'user_roles', 'role, studio_id, studios(naam)', { user_id: user.id })

        if (rolesRes.missingTable) {
          // Likely migrations/RLS not applied — surface a clear message for debugging
          console.error('user_roles table missing or inaccessible (check migrations/RLS)')
          showError('Configuration issue: user_roles table is missing or not accessible. Vraag de beheerder om de migrations te controleren.')
        } else if (rolesRes.error) {
          // Log the full error object for better diagnostics (some errors come back empty when RLS blocks)
          try { console.error('user_roles fetch error', JSON.stringify(rolesRes.error, null, 2)) } catch { console.error('user_roles fetch error', rolesRes.error) }
        } else if (rolesRes.data) {
          const row = Array.isArray(rolesRes.data) ? rolesRes.data[0] : rolesRes.data

          // Load personal profile fields from user_profiles (single source)
          const profRes: any = await safeSelect(supabase, 'user_profiles', '*', { user_id: user.id })
          const p = profRes.data ? (Array.isArray(profRes.data) ? profRes.data[0] : profRes.data) : null

          setProfileData({
            first_name: p?.first_name || '',
            last_name: p?.last_name || '',
            email: p?.email || user.email || '',
            phone_number: p?.phone_number || '',
            street: p?.street || '',
            house_number: p?.house_number || '',
            house_number_addition: p?.house_number_addition || '',
            postal_code: p?.postal_code || '',
            city: p?.city || '',
            date_of_birth: p?.date_of_birth ? String(p.date_of_birth).slice(0,10) : '',
            role: row?.role || '',
            studio_name: (row?.studios && Array.isArray(row.studios) ? (row.studios[0]?.naam || row.studios[0]?.name) : (row?.studios?.naam || row?.studios?.name)) || '',
            studio_id: row?.studio_id || '',
            photo_url: p?.photo_url || ''
          })
        }
      }
    } catch (err: any) {
      console.error('Error loading profile', err)
      showError('Failed to load profile data. Please refresh.')
    } finally {
      setDataLoading(false)
    }
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    // transient feedback will be shown via NotificationContext
    setProfileLoading(true)

    try {
      // Always persist personal fields to `user_profiles` (single source of truth).
      const { error: profileUpdateErr } = await supabase.from('user_profiles').upsert({
        user_id: user!.id,
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        email: profileData.email,
        phone_number: profileData.phone_number,
        street: profileData.street,
        house_number: profileData.house_number,
        house_number_addition: profileData.house_number_addition,
        postal_code: profileData.postal_code,
        city: profileData.city,
        date_of_birth: profileData.date_of_birth || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

      if (profileUpdateErr) throw profileUpdateErr

      showSuccess('Profile updated successfully')
    } catch (err: any) {
      console.error('Error saving profile', err)
      showError(err.message || 'Failed to save')
    } finally {
      setProfileLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (error) setMessage({ type: 'error', text: error.message })
    else { setMessage({ type: 'success', text: 'Password updated successfully' }); setNewPassword(''); setConfirmPassword('') }
  }

  const handleExportData = async () => {
    setProfileLoading(true)
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/export-user-data`
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(apiUrl, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' } })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to export data')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `user-data-${user?.id}.json`; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a)
      showSuccess('Your data has been exported successfully')
    } catch (err: any) {
      console.error('Export error', err)
      showError(err.message || 'Failed to export data')
    } finally { setProfileLoading(false) }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete') {
      showError('Please type DELETE to confirm')
      return
    }
    setDeleting(true)
    // Try to delete profile photo from storage first (best-effort)
    try {
      if (profileData.photo_url) {
        try {
          const urlParts = profileData.photo_url.split('/storage/v1/object/public/user_avatars/')
          if (urlParts.length === 2) {
            const filePath = urlParts[1]
            const { error: deleteError } = await supabase.storage.from('user_avatars').remove([filePath])
            if (deleteError) console.warn('Failed to delete profile photo during account deletion:', deleteError)
            else console.info('Profile photo deleted from storage')
          }
        } catch (e) {
          console.warn('Error deleting profile photo during account deletion:', e)
        }
      }

      // transient feedback via toasts
      const { error } = await supabase.rpc('safe_delete_user_account', { p_user_id: user!.id })
      if (error) throw error
      // sign out locally
      await supabase.auth.signOut()
    } catch (err: any) {
      showError(err.message || 'Failed to delete account')
      setDeleting(false)
    }
  }

  const handleDeleteStudio = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete studio') {
      showError('Please type DELETE STUDIO to confirm')
      return
    }
    setDeleting(true)
    // Best-effort: delete studio logo from storage before calling RPC
    try {
      try {
        const { data: studioRow, error: studioErr } = await supabase
          .from('studios')
          .select('logo_url')
          .eq('id', profileData.studio_id)
          .maybeSingle()

        if (!studioErr && studioRow?.logo_url) {
          const urlParts = studioRow.logo_url.split('/storage/v1/object/public/studio_logos/')
          if (urlParts.length === 2) {
            const filePath = urlParts[1]
            const { error: deleteError } = await supabase.storage.from('studio_logos').remove([filePath])
            if (deleteError) console.warn('Failed to delete studio logo during studio deletion:', deleteError)
            else console.info('Studio logo deleted from storage')
          }
        }
      } catch (e) {
        console.warn('Error while trying to remove studio logo before deletion:', e)
      }

      // transient feedback via toasts
      const { data, error } = await supabase.rpc('safe_delete_studio', { p_studio_id: profileData.studio_id })
      if (error) throw error
      if ((data as any)?.success) { showModal('Studio verwijderd', 'De studio is succesvol verwijderd', async () => { await supabase.auth.signOut() }) }
    } catch (err: any) {
      showError(err.message || 'Failed to delete studio')
      setDeleting(false)
    }
  }

  const handleProfilePhotoUpload = async () => {
    if (!profilePhotoFile || !user) return

    setUploadingPhoto(true)
    try {
      // First, delete the old profile photo if it exists
      if (profileData.photo_url) {
        try {
          // Extract the file path from the URL
          // URL format: https://[project].supabase.co/storage/v1/object/public/user_avatars/avatars/[user-id]/[filename]
          const urlParts = profileData.photo_url.split('/storage/v1/object/public/user_avatars/')
          if (urlParts.length === 2) {
            const filePath = urlParts[1]
            console.info('Deleting old profile photo:', filePath)

            const { error: deleteError } = await supabase.storage
              .from('user_avatars')
              .remove([filePath])

            if (deleteError) {
              console.warn('Failed to delete old profile photo:', deleteError)
              // Don't throw here - continue with upload even if delete fails
            } else {
              console.info('Old profile photo deleted successfully')
            }
          }
        } catch (deleteErr) {
          console.warn('Error deleting old profile photo:', deleteErr)
          // Continue with upload
        }
      }

      const fileExt = profilePhotoFile.name.split('.').pop()
      const fileName = `${user.id}/${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('user_avatars')
        .upload(filePath, profilePhotoFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('user_avatars')
        .getPublicUrl(filePath)

      const photoUrl = urlData.publicUrl

      // Update user profile using API route to bypass RLS issues
      console.info('Calling API with:', { userId: user.id, photoUrl })
      const response = await fetch('/api/update-profile-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          photoUrl: photoUrl
        })
      })

      console.info('API response status:', response.status)
      const responseData = await response.json()
      console.info('API response data:', responseData)

      if (!response.ok) {
        console.info('API failed, trying direct update as fallback...')
        // Fallback to direct update
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('user_id', user.id)
          .single()

        let updateError
        if (existingProfile) {
          const result = await supabase
            .from('user_profiles')
            .update({
              photo_url: photoUrl,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
          updateError = result.error
        } else {
          const result = await supabase
            .from('user_profiles')
            .insert({
              user_id: user.id,
              photo_url: photoUrl,
              updated_at: new Date().toISOString()
            })
          updateError = result.error
        }

        if (updateError) {
          console.error('Direct update also failed:', updateError)
          throw updateError
        }
        console.info('Direct update succeeded!')
      }

      // Update local state
      setProfileData((prev: any) => ({ ...prev, photo_url: photoUrl }))

      // Reset form
      setProfilePhotoFile(null)
      setProfilePhotoPreview(null)

      showSuccess('Profielfoto succesvol geüpload!')
    } catch (err: any) {
      console.error('Upload error:', err)
      showError(err.message || 'Upload mislukt')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handlePhotoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showError('Selecteer een geldig afbeeldingsbestand')
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showError('Afbeelding mag niet groter zijn dan 5MB')
        return
      }

      setOriginalPhotoFile(file)

      // Create preview for cropper
      const reader = new FileReader()
      reader.onload = (e) => {
        setProfilePhotoPreview(e.target?.result as string)
        setShowPhotoCropper(true)
      }
      reader.readAsDataURL(file)
    }
  }

  const handlePhotoCropComplete = async (croppedImageBlob: Blob) => {
    // Convert blob to file for upload
    const croppedFile = new File([croppedImageBlob], 'cropped-avatar.jpg', { type: 'image/jpeg' })
    setProfilePhotoFile(croppedFile)

    // Convert blob to data URL for preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setProfilePhotoPreview(e.target?.result as string)
    }
    reader.readAsDataURL(croppedImageBlob)

    setShowPhotoCropper(false)
    setOriginalPhotoFile(null)
    // Don't auto-upload - let user confirm with upload button
  }

  const handlePhotoCropCancel = () => {
    setShowPhotoCropper(false)
    setProfilePhotoPreview(null)
    setOriginalPhotoFile(null)
  }

  

  const handlePublishPublicProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setPublishing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Niet ingelogd')

      // Build payload from the public form (DB schema does not include display_name)
      const payload = {
        ...publicForm
      }

      const res = await fetch('/api/public-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })

      const json = await res.json()
      if (!res.ok) {
        showError(json.error || 'Kon publiek profiel niet opslaan')
      } else {
        // Show a short persistent/info toast with spinner while we navigate
        // Different UX when editing vs creating: when editing we stay on profile page and just update state.
        const toastId = showInfo(publicEditMode ? 'Profiel opgeslagen' : 'Profiel opgeslagen — doorsturen...', { persistent: !publicEditMode, withSpinner: !publicEditMode })
        setShowPublicProfileModal(false)
        // If the API returned the saved profile, update local state.
        if (json.profile && json.profile.id) {
          setPublicProfile(json.profile)
          if (!publicEditMode) {
            // creation flow: navigate to public profile page
            router.push(`/teacher/${json.profile.id}`)
          } else {
            // edit flow: show a success toast and stay on profile page
            showSuccess('Publiek docentprofiel bijgewerkt')
          }
          // dismiss the persistent/info toast quickly for edits or after navigation for creates
          setTimeout(() => dismissNotification(toastId), publicEditMode ? 900 : 900)
        } else {
          // Fallback: try to refetch and update state
          try {
            const { data } = await supabase.from('public_teacher_profiles').select('*').eq('user_id', (await supabase.auth.getUser()).data.user?.id).maybeSingle()
            if (data) {
              setPublicProfile(data)
              if (!publicEditMode) router.push(`/teacher/${data.id}`)
            }
          } catch (err) {
            console.error('Refetch after publish error', err)
          } finally {
            setTimeout(() => dismissNotification(toastId), 1000)
          }
        }
      }
    } catch (err: any) {
      console.error('Publish profile error', err)
      showError(err.message || 'Interne fout')
    } finally {
      setPublishing(false)
    }
  }

  const getRoleIcon = (roleType: string) => {
    switch (roleType) {
      case 'super_admin': return <Shield className="text-blue-600" size={20} />
      case 'studio_admin': case 'admin': return <Building2 className="text-purple-600" size={20} />
      case 'teacher': return <GraduationCap className="text-green-600" size={20} />
      case 'member': return <Users className="text-slate-600" size={20} />
      default: return <User className="text-slate-400" size={20} />
    }
  }

  const getRoleLabel = (roleType: string) => {
    switch (roleType) {
      case 'super_admin': return 'Super Admin'
      case 'studio_admin': return 'Studio Admin'
      case 'admin': return 'Admin'
      case 'teacher': return 'Teacher'
      case 'member': return 'Member'
      default: return roleType
    }
  }

  const getRoleBadgeColor = (roleType: string) => {
    switch (roleType) {
      case 'super_admin': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'studio_admin': case 'admin': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'teacher': return 'bg-green-100 text-green-800 border-green-200'
      case 'member': return 'bg-slate-100 text-slate-800 border-slate-200'
      default: return 'bg-slate-100 text-slate-800 border-slate-200'
    }
  }

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LoadingSpinner size={48} className="mx-auto" label="Profiel laden" />
          <p className="mt-4 text-slate-600">Profiel laden…</p>
        </div>
      </div>
    )
  }

  if (!user) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6"><h2 className="text-lg font-semibold text-red-900 mb-2">Not Authenticated</h2><p className="text-red-700">Please log in to view your profile.</p></div>
  )

  return (
    <div className="px-4 sm:px-0 pt-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6 sm:mb-8">Mijn Profiel</h1>

      {showProfileNote && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <div className="flex items-start justify-between">
            <div>
              <strong>Vul je profiel aan</strong>
              <div className="text-sm">Om in te schrijven en de volledige functionaliteit van HUB3 te gebruiken moet je je profiel aanvullen. Velden met * zijn verplicht.</div>
            </div>
            <div>
              {/* Removed inline close link; use X or backdrop to dismiss */}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Account Information</h2>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Mail className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Email Address</p>
                  <p className="font-medium text-slate-900">{user?.email}</p>
                </div>
              </div>

              {/* Profile Photo Section */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left side - Info and upload */}
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Camera className="text-green-600" size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">Profielfoto</p>
                        <p className="text-xs text-slate-500">Upload een profielfoto (max 5MB, JPG/PNG)</p>
                      </div>
                    </div>

                    {/* Upload form */}
                    <div className="space-y-3">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoFileSelect}
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />

                      {/* Upload button */}
                      {profilePhotoFile && (
                        <button
                          onClick={handleProfilePhotoUpload}
                          disabled={uploadingPhoto}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Upload size={16} />
                          {uploadingPhoto ? 'Uploaden...' : 'Upload profielfoto'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right side - Photo display */}
                  <div className="md:col-span-1 flex flex-col items-center space-y-4">
                    {/* Current photo */}
                    {profileData.photo_url && (
                      <div className="text-center">
                        <p className="text-xs text-slate-600 mb-2">Huidige foto</p>
                        <img
                          src={profileData.photo_url}
                          alt="Profielfoto"
                          className="w-24 h-24 rounded-lg object-cover border-4 border-slate-200 mx-auto"
                        />
                      </div>
                    )}

                    {/* Preview */}
                    {profilePhotoPreview && (
                      <div className="text-center">
                        <p className="text-xs text-slate-600 mb-2">Nieuwe foto</p>
                        <img
                          src={profilePhotoPreview}
                          alt="Preview"
                          className="w-24 h-24 rounded-lg object-cover border-4 border-blue-200 mx-auto"
                        />
                      </div>
                    )}

                    {/* Placeholder when no photos */}
                    {!profileData.photo_url && !profilePhotoPreview && (
                      <div className="w-24 h-24 rounded-lg bg-slate-200 border-4 border-slate-300 flex items-center justify-center mx-auto">
                        <Camera className="text-slate-400" size={32} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {role !== 'user' && (
                <>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${profileData.role === 'super_admin' ? 'bg-blue-100' : profileData.role === 'studio_admin' || profileData.role === 'admin' ? 'bg-purple-100' : profileData.role === 'teacher' ? 'bg-green-100' : 'bg-slate-100'}`}>
                      {getRoleIcon(profileData.role)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">Your Role</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${getRoleBadgeColor(profileData.role)}`}>
                          {getRoleIcon(profileData.role)}
                          {getRoleLabel(profileData.role)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {profileData.studio_name && profileData.role !== 'super_admin' && (
                    <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                        <Building2 className="text-slate-600" size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">Studio</p>
                        <p className="font-medium text-slate-900">{profileData.studio_name}</p>
                      </div>
                    </div>
                  )}

                  

                  {profileData.role === 'super_admin' && (
                    <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <Shield className="text-blue-600" size={24} />
                      <div>
                        <p className="text-sm font-medium text-blue-900">Super Admin Access</p>
                        <p className="text-xs text-blue-700">You have full access to all studios and system settings</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {role === 'user' && memberships.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-600 mb-2">Studio Memberships</p>
                  <div className="space-y-2">
                    {memberships.map((membership) => (
                      <div key={membership.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="text-slate-600" size={16} />
                          <span className="font-medium text-slate-900">{membership.studios?.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${membership.membership_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>{membership.membership_status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shared button for requesting a public teacher profile (visible to regular users and teachers) */}
              {(role === 'user' || profileData.role === 'teacher') && (
                <div className="mt-4 p-4 bg-white rounded-lg border border-slate-200">
                  <p className="text-sm text-slate-600 mb-2">Wil je zichtbaar zijn als docent voor gebruikers?</p>
                  <div className="flex gap-2">
                    {publicProfile ? (
                      <div className="flex items-center gap-2">
                        <a href={`/teacher/${publicProfile.id}`} className="inline-flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm">
                          <GraduationCap size={16} />
                          <span className="text-sm font-medium">Bekijk docentprofiel</span>
                        </a>
                        <button onClick={() => { setPublicEditMode(true); setShowPublicProfileModal(true) }} className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100">Bewerk docentprofiel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setShowTeacherRequestModal(true); setPublicEditMode(false) }} className="inline-flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm">
                        <GraduationCap size={16} />
                        <span className="text-sm font-medium">Maak publiek docentprofiel</span>
                      </button>
                    )}

                    {/* Removed 'Uitleg' button as requested */}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Persoonlijke info</h2>

            {/* transient profile save/feedback is shown via NotificationContext toasts */}

            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Voornaam <span className="text-red-600">*</span></label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><User className="text-slate-400" size={20} /></div>
                    <input ref={firstNameRef} type="text" value={profileData.first_name} onChange={(e) => setProfileData({ ...profileData, first_name: e.target.value })} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Voornaam" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Achternaam <span className="text-red-600">*</span></label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><User className="text-slate-400" size={20} /></div>
                    <input type="text" value={profileData.last_name} onChange={(e) => setProfileData({ ...profileData, last_name: e.target.value })} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Enter last name" />
                  </div>
                </div>
              </div>

              {role === 'user' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Geboortedatum <span className="text-red-600">*</span></label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Calendar className="text-slate-400" size={20} /></div>
                      <input type="date" value={profileData.date_of_birth} onChange={(e) => setProfileData({ ...profileData, date_of_birth: e.target.value })} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Telefoonnummer <span className="text-slate-400">(optioneel)</span></label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Phone className="text-slate-400" size={20} /></div>
                      <input type="tel" value={profileData.phone_number} onChange={(e) => setProfileData({ ...profileData, phone_number: e.target.value })} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Enter phone number" />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
                <div className="col-span-2 sm:col-span-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Straat <span className="text-red-600">*</span></label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><MapPin className="text-slate-400" size={20} /></div>
                    <input type="text" value={profileData.street} onChange={(e) => setProfileData({ ...profileData, street: e.target.value })} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Street name" />
                  </div>
                </div>

                <div className="col-span-1 sm:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Huisnummer <span className="text-red-600">*</span></label>
                  <input type="text" value={profileData.house_number} onChange={(e) => setProfileData({ ...profileData, house_number: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="No." />
                </div>

                <div className="col-span-1 sm:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Toevoeging</label>
                  <input type="text" value={profileData.house_number_addition} onChange={(e) => setProfileData({ ...profileData, house_number_addition: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Apt / add." />
                </div>
              </div>

              {role === 'user' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Postcode <span className="text-red-600">*</span></label>
                    <input type="text" value={profileData.postal_code} onChange={(e) => setProfileData({ ...profileData, postal_code: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Enter postal code" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Plaats <span className="text-red-600">*</span></label>
                    <input type="text" value={profileData.city} onChange={(e) => setProfileData({ ...profileData, city: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Enter city" />
                  </div>
                </div>
              )}

              <button type="submit" disabled={profileLoading} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <span>{profileLoading ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </form>
          </div>
        </div>

        {role === 'user' && user && (
          <SubProfilesSection
            userId={user.id}
            parentAddress={`${profileData.street || ''} ${profileData.house_number || ''}${profileData.house_number_addition ? ' ' + profileData.house_number_addition : ''}`.trim()}
            parentPostalCode={profileData.postal_code}
            parentCity={profileData.city}
          />
        )}

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Change Password</h2>

            {message && (<div className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{message.text}</div>)}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="text-slate-400" size={20} /></div>
                  <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Enter new password" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">{showPassword ? <EyeOff className="text-slate-400 hover:text-slate-600" size={20} /> : <Eye className="text-slate-400 hover:text-slate-600" size={20} />}</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Confirm New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="text-slate-400" size={20} /></div>
                  <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Confirm new password" required />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">{showConfirmPassword ? <EyeOff className="text-slate-400 hover:text-slate-600" size={20} /> : <Eye className="text-slate-400 hover:text-slate-600" size={20} />}</button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full flex items-center justify-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><span>{loading ? 'Updating...' : 'Update Password'}</span></button>
            </form>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4"><AlertTriangle className="text-red-600" size={20} /><h2 className="text-lg font-semibold text-red-900">Danger Zone</h2></div>
            <div className="space-y-4">
              {(role === 'studio_admin' || role === 'admin') && profileData.studio_id && (
                <div className="border border-red-200 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-900 mb-2">Delete Studio</h3>
                  <p className="text-sm text-slate-600 mb-4">Permanently delete this studio and all associated data including members, lessons, groups, and teachers. This action cannot be undone.</p>
                  <button onClick={() => setShowStudioDeleteModal(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"><Trash2 size={18} />Delete Studio</button>
                </div>
              )}

              <div className="border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-2">Export Your Data</h3>
                <p className="text-sm text-slate-600 mb-4">Download all your personal data in JSON format (GDPR compliance).</p>
                <button onClick={handleExportData} disabled={profileLoading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"><Download size={18} />{profileLoading ? 'Exporting...' : 'Export My Data'}</button>
              </div>

              <div className="border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-2">Delete Account</h3>
                <p className="text-sm text-slate-600 mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>
                <button onClick={() => setShowDeleteModal(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"><Trash2 size={18} />Delete My Account</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-2 mb-4"><AlertTriangle className="text-red-600" size={24} /><h3 className="text-xl font-semibold text-slate-900">Delete Account</h3></div>
            <p className="text-slate-600 mb-4">This will permanently delete your account and all associated data. This action cannot be undone.</p>
            <p className="text-sm text-slate-600 mb-4">Type <strong>DELETE</strong> to confirm:</p>
            <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 mb-4 focus:ring-2 focus:ring-red-500 focus:border-transparent" placeholder="Type DELETE" />
            <div className="flex gap-3">
              {/* Removed bottom close button; use X or backdrop to close */}
              <button onClick={handleDeleteAccount} disabled={deleting || deleteConfirmText.toLowerCase() !== 'delete'} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{deleting ? 'Deleting...' : 'Delete Account'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Studio Modal */}
      {showStudioDeleteModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-2 mb-4"><AlertTriangle className="text-red-600" size={24} /><h3 className="text-xl font-semibold text-slate-900">Delete Studio</h3></div>
            <p className="text-slate-600 mb-4">This will permanently delete <strong>{profileData.studio_name}</strong> and all associated data including members, lessons, groups, and teachers. This action cannot be undone.</p>
            <p className="text-sm text-slate-600 mb-4">Type <strong>DELETE STUDIO</strong> to confirm:</p>
            <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 mb-4 focus:ring-2 focus:ring-red-500 focus:border-transparent" placeholder="Type DELETE STUDIO" />
            <div className="flex gap-3">
              {/* Removed bottom close button; use X or backdrop to close */}
              <button onClick={handleDeleteStudio} disabled={deleting || deleteConfirmText.toLowerCase() !== 'delete studio'} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{deleting ? 'Deleting...' : 'Delete Studio'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Public Teacher Profile Modal */}
      {showPublicProfileModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden text-slate-900">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">Publiek Docentprofiel</h3>
              <button type="button" onClick={() => setShowPublicProfileModal(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(90vh - 96px)' }}>
              <form onSubmit={handlePublishPublicProfile} className="space-y-4">

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Voornaam <span className="text-red-600">*</span></label>
                    <input required value={publicForm.first_name} onChange={(e) => setPublicForm({ ...publicForm, first_name: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Achternaam <span className="text-red-600">*</span></label>
                    <input required value={publicForm.last_name} onChange={(e) => setPublicForm({ ...publicForm, last_name: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Geboortedatum <span className="text-red-600">*</span></label>
                  <input required type="date" value={publicForm.date_of_birth} onChange={(e) => setPublicForm({ ...publicForm, date_of_birth: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">CV (kort of links)</label>
                  <textarea value={publicForm.cv} onChange={(e) => setPublicForm({ ...publicForm, cv: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows={4} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Korte headline</label>
                  <input value={publicForm.headline} onChange={(e) => setPublicForm({ ...publicForm, headline: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Bio</label>
                  <textarea value={publicForm.bio} onChange={(e) => setPublicForm({ ...publicForm, bio: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows={5} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Contact email</label>
                    <input value={publicForm.contact_email} onChange={(e) => setPublicForm({ ...publicForm, contact_email: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Telefoon</label>
                    <input value={publicForm.phone_number} onChange={(e) => setPublicForm({ ...publicForm, phone_number: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Website</label>
                  <input value={publicForm.website} onChange={(e) => setPublicForm({ ...publicForm, website: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Dance styles</label>
                  <div className="flex flex-wrap gap-2">
                    {availableDanceStyles.map((style) => {
                      const selected = Array.isArray(publicForm.dance_style) && publicForm.dance_style.includes(style)
                      return (
                        <button
                          type="button"
                          key={style}
                          onClick={() => {
                            const current = Array.isArray(publicForm.dance_style) ? publicForm.dance_style.slice() : []
                            const idx = current.indexOf(style)
                            if (idx === -1) current.push(style)
                            else current.splice(idx, 1)
                            setPublicForm({ ...publicForm, dance_style: current })
                          }}
                          className={`px-3 py-1 rounded-full text-sm border ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}
                        >
                          {style}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={publicForm.is_public} onChange={(e) => setPublicForm({ ...publicForm, is_public: e.target.checked })} />
                    Zichtbaar in de openbare zoekresultaten
                  </label>
                </div>

                <div className="flex gap-3 justify-end">
                  <button type="submit" disabled={publishing} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{publishing ? 'Opslaan...' : 'Opslaan en publiceren'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Request Public Teacher Modal (informational) */}
      {showTeacherRequestModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Publiek Docentprofiel</h3>
                <p className="text-sm text-slate-600 mt-1">Een publiek docentprofiel is onafhankelijk van studio's — het is jouw profiel op ons platform waar studios en gebruikers je kunnen vinden en contacteren.</p>
              </div>
              <button onClick={() => setShowTeacherRequestModal(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-slate-600">Je kunt direct een publiek profiel aanmaken of bewerken. Studio-lidmaatschappen zijn niet vereist voor het aanmaken van dit profiel.</p>
            </div>

            <div className="flex">
              <button onClick={() => { setPublicEditMode(false); setShowPublicProfileModal(true); setShowTeacherRequestModal(false) }} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Maak profiel</button>
            </div>
          </div>
        </div>
      )}

      {showPhotoCropper && profilePhotoPreview && (
        <ImageCropper
          imageSrc={profilePhotoPreview}
          onCropComplete={handlePhotoCropComplete}
          onCancel={handlePhotoCropCancel}
          aspect={1}
          cropShape="rect"
        />
      )}
    </div>
  )
}

// Helper: split a full name into first and last
function splitName(name: string): [string, string] {
  if (!name) return ['', '']
  const parts = name.trim().split(/\s+/)
  const first = parts.shift() || ''
  const last = parts.join(' ') || ''
  return [first, last]
}

// Attempt to derive a fallback first name from the auth user metadata
function signupNameFallback(user: any): string {
  if (!user) return ''
  const metaName = user?.user_metadata?.full_name || user?.user_metadata?.name || ''
  return splitName(metaName)[0] || ''
}
