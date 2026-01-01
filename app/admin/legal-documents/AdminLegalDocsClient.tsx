"use client"

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { safeSelect, safeInsert, safeUpdate } from '@/lib/supabaseHelpers'
import Modal from '@/components/Modal'

type Doc = {
  id: string
  document_type: string
  studio_id?: string | null
  content: string | null
  version: string | null
  created_at: string
  effective_date?: string | null
  is_active?: boolean | null
  created_by?: string | null
  published_at?: string | null
}

interface Props {
  studioId?: string | null;
}

export default function AdminLegalDocs({ studioId }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null)
  const [editorContent, setEditorContent] = useState<string>('')
  const [editorVersion, setEditorVersion] = useState<string>('1.0')
  const [publishNow, setPublishNow] = useState<boolean>(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [duplicateDoc, setDuplicateDoc] = useState<{ id: string, document_type: string } | null>(null)

  useEffect(() => {
    fetchDocs()
  }, [studioId])

  async function fetchDocs() {
    setLoading(true)
    const { data, error, missingTable } = await safeSelect(
      supabase,
      'legal_documents',
      'id,document_type,content,version,created_at,effective_date,is_active,created_by,published_at'
    )

    if (missingTable) {
      setMessage('Tabel "legal_documents" bestaat niet op deze database. Voer database migrations uit of contacteer devops.')
    } else if (error) {
      setMessage(error.message || String(error))
    } else if (data) {
      // If a studioId is provided, prefer studio-scoped docs and include global docs as fallback
      const all = data as Doc[]
      if (studioId) {
        const filtered = all.filter(d => d.studio_id === studioId || d.studio_id === null || d.studio_id === undefined)
        setDocs(filtered)
      } else {
        setDocs(all)
      }
    }
    setLoading(false)
  }

  function latestFor(type: string) {
    const list = docs.filter((d) => d.document_type === type)
    if (list.length === 0) return null
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  }

  function openEditor(docType: 'terms_of_service' | 'privacy_policy') {
    const doc = latestFor(docType)
    if (doc) {
      setEditingDoc(doc)
      setEditorContent(doc.content || '')
      setEditorVersion(doc.version || '1.0')
    } else {
      setEditingDoc({ document_type: docType } as Doc)
      setEditorContent('<p>Nieuwe tekst…</p>')
      setEditorVersion('1.0')
    }
    setMessage(null)
    setIsOpen(true)
  }

  function openEditorWithDoc(doc: Doc) {
    setEditingDoc(doc)
    setEditorContent(doc.content || '')
    setEditorVersion(doc.version || '1.0')
    setMessage(null)
    setIsOpen(true)
  }

  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    // sync content
    setEditorContent(editorRef.current?.innerHTML || '')
  }

  async function overwriteExisting() {
    if (!duplicateDoc) return
    setLoading(true)
    setMessage(null)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = (authData && (authData as any).user) ? (authData as any).user.id : (authData as any)?.user?.id || null
      const payload: any = {
        content: editorContent,
        version: editorVersion,
        created_by: currentUserId,
      }
      if (studioId) payload.studio_id = studioId
      if (publishNow) {
        // make others inactive first: scoped to studio when applicable, otherwise global
        if (studioId) {
          await safeUpdate(supabase, 'legal_documents', { is_active: false }, { document_type: duplicateDoc.document_type, studio_id: studioId })
        } else {
          await safeUpdate(supabase, 'legal_documents', { is_active: false }, { document_type: duplicateDoc.document_type })
        }
        payload.is_active = true
        payload.published_at = new Date().toISOString()
        payload.effective_date = new Date().toISOString().split('T')[0]
      }

      const { success, error, missingTable } = await safeUpdate(supabase, 'legal_documents', payload, { id: duplicateDoc.id })
      if (missingTable) setMessage('Tabel "legal_documents" bestaat niet op deze database.')
      else if (!success) setMessage((error as any)?.message || String(error))
      else setMessage('Bestaande versie overschreven')

      await fetchDocs()
      setIsOpen(false)
      setDuplicateDoc(null)
    } finally {
      setLoading(false)
    }
  }

  function bumpVersion() {
    const current = editorVersion
    let bumped = current
    const parts = current.split('.')
    if (parts.length > 1 && parts.every(p => /^\d+$/.test(p))) {
      const nums = parts.map(p => parseInt(p, 10))
      nums[nums.length - 1] = nums[nums.length - 1] + 1
      bumped = nums.join('.')
    } else if (/^(\d+)(?:-(\d+))?$/.test(current)) {
      const m = current.match(/^(\d+)(?:-(\d+))?$/)
      if (m) {
        const base = parseInt(m[1], 10)
        const suffix = m[2] ? parseInt(m[2], 10) + 1 : 1
        bumped = `${base}-${suffix}`
      }
    } else {
      bumped = `${current}-1`
    }
    setEditorVersion(bumped)
    setDuplicateDoc(null)
    setMessage(`Versie aangepast naar ${bumped}. Klik opnieuw Opslaan.`)
  }

  // Save as a new version (append history). We always insert a new row so history is preserved.
  async function handleSave() {
    setLoading(true)
    setMessage(null)
    try {
      const docType = editingDoc?.document_type || 'terms_of_service'
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = (authData && (authData as any).user) ? (authData as any).user.id : (authData as any)?.user?.id || null
      // If publishing now, mark existing rows inactive first
      if (publishNow) {
        if (studioId) {
          await safeUpdate(supabase, 'legal_documents', { is_active: false }, { document_type: docType, studio_id: studioId })
        } else {
          await safeUpdate(supabase, 'legal_documents', { is_active: false }, { document_type: docType })
        }
      }

      const payload: any = {
        document_type: docType,
        content: editorContent,
        version: editorVersion,
        created_by: currentUserId,
      }
      if (studioId) payload.studio_id = studioId
      if (publishNow) {
        payload.is_active = true
        payload.published_at = new Date().toISOString()
        payload.effective_date = new Date().toISOString().split('T')[0]
      }

      const { success, error, missingTable } = await safeInsert(supabase, 'legal_documents', payload)
      if (missingTable) {
        setMessage('Tabel "legal_documents" bestaat niet op deze database.')
      } else if (!success) {
        const msg = (error as any)?.message || String(error)
        const isDuplicate = (error as any)?.code === '23505' || /duplicate key/.test(String(msg).toLowerCase())
        if (isDuplicate) {
          // try to load the existing row so we can offer overwrite or bump
          try {
            const docType = editingDoc?.document_type || 'terms_of_service'
            const sel = await supabase.from('legal_documents').select('id,document_type').eq('document_type', docType).eq('version', editorVersion).limit(1).single()
            if (!sel.error && sel.data) {
              setDuplicateDoc({ id: sel.data.id, document_type: sel.data.document_type })
              setMessage('Er bestaat al een versie met dit versienummer. Kies overschrijven of pas het versienummer aan.')
              return
            }
          } catch (e) {
            // fallthrough to generic message
          }

          setMessage(msg)
        } else {
          setMessage(msg)
        }
      } else {
        setMessage(publishNow ? 'Document gepubliceerd als nieuwe versie' : 'Document opgeslagen als nieuwe versie')
      }

      await fetchDocs()
      setIsOpen(false)
    } finally {
      setLoading(false)
    }
  }

  async function restoreVersion(doc: Doc) {
    setLoading(true)
    setMessage(null)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = (authData && (authData as any).user) ? (authData as any).user.id : (authData as any)?.user?.id || null
      const payload: any = {
        document_type: doc.document_type,
        content: doc.content,
        version: doc.version,
        created_by: currentUserId,
      }
      if (studioId) payload.studio_id = studioId
      // restore does not auto-publish; admin can open and publish explicitly
      const { success, error, missingTable } = await safeInsert(supabase, 'legal_documents', payload)
      if (missingTable) setMessage('Tabel "legal_documents" bestaat niet op deze database.')
      else if (!success) setMessage((error as any)?.message || String(error))
      else setMessage('Versie hersteld als nieuwe versie')

      await fetchDocs()
    } finally {
      setLoading(false)
    }
  }

  const terms = latestFor('terms_of_service')
  const privacy = latestFor('privacy_policy')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Terms of Service</h2>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm text-slate-500 mb-2">Versie: {terms?.version || '—'}</div>
              <div className="prose max-w-none text-slate-700 border rounded p-4 bg-slate-50 min-h-[120px] overflow-hidden" dangerouslySetInnerHTML={{ __html: terms?.content || '<em>Nog geen Terms of Service beschikbaar.</em>' }} />
              {/* History list */}
              <div className="mt-3">
                <h4 className="text-sm font-medium mb-2">Geschiedenis</h4>
                <ul className="space-y-2 text-sm">
                  {docs.filter(d => d.document_type === 'terms_of_service').sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(d => (
                    <li key={d.id} className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">v{d.version} — {new Date(d.created_at).toLocaleString()}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditorWithDoc(d)} className="px-2 py-1 text-sm border rounded">Openen</button>
                        <button onClick={() => restoreVersion(d)} className="px-2 py-1 text-sm bg-slate-100 rounded">Herstel</button>
                      </div>
                    </li>
                  ))}
                  {docs.filter(d => d.document_type === 'terms_of_service').length === 0 && <li className="text-slate-500">Geen historische versies</li>}
                </ul>
              </div>
            </div>
            <div className="w-36 flex flex-col gap-2">
              <button onClick={() => openEditor('terms_of_service')} className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Bewerken</button>
              <a className="px-3 py-2 text-sm text-slate-600 border rounded text-center" href="/terms-of-service" target="_blank" rel="noreferrer">Bekijk</a>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Privacy Policy</h2>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm text-slate-500 mb-2">Versie: {privacy?.version || '—'}</div>
              <div className="prose max-w-none text-slate-700 border rounded p-4 bg-slate-50 min-h-[120px] overflow-hidden" dangerouslySetInnerHTML={{ __html: privacy?.content || '<em>Nog geen Privacy Policy beschikbaar.</em>' }} />
              <div className="mt-3">
                <h4 className="text-sm font-medium mb-2">Geschiedenis</h4>
                <ul className="space-y-2 text-sm">
                  {docs.filter(d => d.document_type === 'privacy_policy').sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(d => (
                    <li key={d.id} className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">v{d.version} — {new Date(d.created_at).toLocaleString()}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditorWithDoc(d)} className="px-2 py-1 text-sm border rounded">Openen</button>
                        <button onClick={() => restoreVersion(d)} className="px-2 py-1 text-sm bg-slate-100 rounded">Herstel</button>
                      </div>
                    </li>
                  ))}
                  {docs.filter(d => d.document_type === 'privacy_policy').length === 0 && <li className="text-slate-500">Geen historische versies</li>}
                </ul>
              </div>
            </div>
            <div className="w-36 flex flex-col gap-2">
              <button onClick={() => openEditor('privacy_policy')} className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Bewerken</button>
              <a className="px-3 py-2 text-sm text-slate-600 border rounded text-center" href="/privacy-policy" target="_blank" rel="noreferrer">Bekijk</a>
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} ariaLabel="Bewerk document">
        <div>
          <h3 className="text-xl font-semibold mb-2">Bewerk document</h3>
          <div className="text-sm text-slate-600 mb-4">Pas de tekst aan en klik op Opslaan.</div>

          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => exec('bold')} className="px-2 py-1 border rounded">B</button>
            <button type="button" onClick={() => exec('italic')} className="px-2 py-1 border rounded">I</button>
            <button type="button" onClick={() => exec('underline')} className="px-2 py-1 border rounded">U</button>
            <button type="button" onClick={() => exec('insertOrderedList')} className="px-2 py-1 border rounded">1.</button>
            <button type="button" onClick={() => exec('insertUnorderedList')} className="px-2 py-1 border rounded">•</button>
            <button type="button" onClick={() => {
              const url = window.prompt('Voer link URL in')
              if (url) exec('createLink', url)
            }} className="px-2 py-1 border rounded">Link</button>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-slate-700 mb-1">Versie</label>
            <input value={editorVersion} onChange={(e) => setEditorVersion(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

          <div className="mb-3 flex items-center gap-3">
            <input id="publishNow" type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="publishNow" className="text-sm text-slate-700">Publiceer direct als actieve versie</label>
          </div>

          <div className="mb-4">
            <div ref={editorRef} onInput={() => setEditorContent(editorRef.current?.innerHTML || '')} contentEditable className="min-h-[200px] p-4 border rounded prose max-w-none bg-white text-slate-800" dangerouslySetInnerHTML={{ __html: editorContent }} />
          </div>

          {duplicateDoc ? (
            <div className="mb-4 border-l-4 border-yellow-300 bg-yellow-50 p-4 rounded">
              <div className="text-sm text-yellow-800 mb-3">Er bestaat al een document met dit versienummer.</div>
              <div className="flex gap-2">
                <button onClick={overwriteExisting} className="px-3 py-2 bg-red-600 text-white rounded">Overschrijf bestaande versie</button>
                <button onClick={bumpVersion} className="px-3 py-2 border rounded">Pas versienummer aan</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-3">
              <button onClick={handleSave} className="px-4 py-2 bg-purple-600 text-white rounded">Opslaan</button>
            </div>
          )}
        </div>
      </Modal>

      {message && <div className="col-span-full text-sm mt-4 text-slate-700">{message}</div>}
    </div>
  )
}
