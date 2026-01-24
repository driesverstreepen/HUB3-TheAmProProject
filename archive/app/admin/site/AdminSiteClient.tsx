"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ImageCropper from '@/components/ImageCropper'
import { safeSelect, safeUpdate, safeInsert } from '@/lib/supabaseHelpers'

export default function AdminSiteClient() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState<any>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [editingWelcome, setEditingWelcome] = useState(false)
  const [welcomeContent, setWelcomeContent] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [showCropper, setShowCropper] = useState(false)
  const [originalLogoFile, setOriginalLogoFile] = useState<File | null>(null)

  useEffect(() => { fetchSettings() }, [])

  async function fetchSettings() {
    setLoading(true)
    const { data, error, missingTable } = await safeSelect(supabase, 'site_settings', 'id,logo_url,support_email,welcome_content,created_by,created_at,updated_at')
    if (missingTable) {
      setMessage('Tabel site_settings bestaat niet. Draai de migratie 055_create_site_settings_table.sql in Supabase.')
    } else if (error) {
      setMessage((error as any)?.message || String(error))
    } else if (data) {
      const row = (data as any[])[0] || null
      setSettings(row)
      setLogoPreview(row?.logo_url || null)
      setSupportEmail(row?.support_email || '')
      setWelcomeContent(row?.welcome_content || '')
    }
    setLoading(false)
  }

  async function handleLogoUpload() {
    if (!logoFile) return
    setLoading(true)
    setMessage(null)
    try {
      // First, delete the old logo if it exists
      if (logoPreview) {
        try {
          // Extract the file path from the URL
          // URL format: https://[project].supabase.co/storage/v1/object/public/studio_logos/[filename]
          const urlParts = logoPreview.split('/storage/v1/object/public/studio_logos/')
          if (urlParts.length === 2) {
            const filePath = urlParts[1]
            console.info('Deleting old logo:', filePath)

            const { error: deleteError } = await supabase.storage
              .from('studio_logos')
              .remove([filePath])

            if (deleteError) {
              console.warn('Failed to delete old logo:', deleteError)
              // Don't throw here - continue with upload even if delete fails
            } else {
              console.info('Old logo deleted successfully')
            }
          }
        } catch (deleteErr) {
          console.warn('Error deleting old logo:', deleteErr)
          // Continue with upload
        }
      }

  // upload to Supabase Storage bucket (create a bucket named 'studio_logos' in Supabase Storage)
  const BUCKET = 'studio_logos'
  const filename = `site/logo-${Date.now()}-${logoFile.name}`
  const { data: uploadData, error: uploadError } = await supabase.storage.from(BUCKET).upload(filename, logoFile, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError
      // get public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path)
      const logoUrl = urlData.publicUrl

      // upsert into site_settings (we keep single-row semantics)
      const payload: any = { logo_url: logoUrl }
      const { success, error, missingTable } = await safeUpdate(supabase, 'site_settings', payload, {})
      // safeUpdate expects eqs; but for single-row table we'll update all rows. Use empty eqs fallback handled by helper? If not, use raw query fallback.
      if (missingTable) {
        setMessage('Tabel site_settings bestaat niet.')
      } else if (!success) {
        // Try insert fallback
        const ins = await safeInsert(supabase, 'site_settings', { ...payload })
        if (!ins.success) setMessage((ins.error as any)?.message || String(ins.error))
        else setMessage('Logo geüpload en opgeslagen')
      } else {
        setMessage('Logo geüpload en opgeslagen')
      }

      setLogoPreview(logoUrl)
      setLogoFile(null)
    } catch (err: any) {
      setMessage(err.message || String(err))
    } finally {
      setLoading(false)
      await fetchSettings()
    }
  }

  const handleLogoFileSelect = (file: File) => {
    setOriginalLogoFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      setLogoPreview(e.target?.result as string)
      setShowCropper(true)
    }
    reader.readAsDataURL(file)
  }

  const handleCropComplete = async (croppedImageBlob: Blob) => {
    // Convert blob to file
    const croppedFile = new File([croppedImageBlob], 'cropped-logo.jpg', { type: 'image/jpeg' })
    setLogoFile(croppedFile)
    setShowCropper(false)
    setOriginalLogoFile(null)
    // Auto-upload after cropping
    await handleLogoUpload()
  }

  const handleCropCancel = () => {
    setShowCropper(false)
    setLogoPreview(null)
    setOriginalLogoFile(null)
  }

  async function saveSettings() {
    setLoading(true)
    setMessage(null)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = (authData && (authData as any).user) ? (authData as any).user.id : null
      const payload: any = { support_email: supportEmail, welcome_content: welcomeContent, created_by: currentUserId }
      // try update
      const { success, error, missingTable } = await safeUpdate(supabase, 'site_settings', payload, {})
      if (missingTable) setMessage('Tabel site_settings bestaat niet.')
      else if (!success) {
        const ins = await safeInsert(supabase, 'site_settings', payload)
        if (!ins.success) setMessage((ins.error as any)?.message || String(ins.error))
        else setMessage('Instellingen opgeslagen')
      } else {
        setMessage('Instellingen opgeslagen')
      }
    } finally {
      setLoading(false)
      fetchSettings()
    }
  }

  return (
    <div className="bg-white rounded-xl border p-6 shadow-sm">
      <h2 className="text-2xl font-semibold mb-4">Site instellingen</h2>
      {message && <div className="mb-3 text-sm text-slate-700">{message}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="col-span-1">
          <div className="mb-3">Logo</div>
          <div className="mb-3">
            {logoPreview ? (
              <img src={logoPreview} alt="Site logo" className="h-24 object-contain" />
            ) : (
              <div className="h-24 w-full bg-slate-50 rounded flex items-center justify-center text-slate-400">Geen logo</div>
            )}
          </div>
          <input type="file" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleLogoFileSelect(file)
          }} />
          <div className="mt-3">
            <button disabled={!logoFile || loading} onClick={handleLogoUpload} className="px-4 py-2 bg-purple-600 text-white rounded">Upload</button>
          </div>
        </div>

        <div className="col-span-2">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Support e-mail</label>
            <input value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Welcome pagina inhoud (HTML)</label>
            <textarea value={welcomeContent} onChange={(e) => setWelcomeContent(e.target.value)} rows={8} className="w-full px-3 py-2 border rounded font-mono" />
            <div className="text-sm text-slate-500 mt-2">Je kunt HTML invoeren. We tonen de content op de publieke welcome pagina.</div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={saveSettings} disabled={loading} className="px-4 py-2 bg-purple-600 text-white rounded">Opslaan</button>
          </div>
        </div>
      </div>

      {showCropper && logoPreview && (
        <ImageCropper
          imageSrc={logoPreview}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          aspect={1}
          cropShape="rect"
        />
      )}
    </div>
  )
}
