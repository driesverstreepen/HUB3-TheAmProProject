"use client"

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { safeSelect, safeInsert, safeDelete, safeUpdate } from '@/lib/supabaseHelpers'
import { UserPlus, Edit, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function SubProfilesSection({ userId, parentAddress, parentPostalCode, parentCity }: { userId: string, parentAddress?: string, parentPostalCode?: string, parentCity?: string }) {
  const [subs, setSubs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Use uncontrolled inputs (refs) inside modal to avoid frequent re-renders
  const firstNameRef = useRef<HTMLInputElement | null>(null)
  const lastNameRef = useRef<HTMLInputElement | null>(null)
  const dateOfBirthRef = useRef<HTMLInputElement | null>(null)
  const streetRef = useRef<HTMLInputElement | null>(null)
  const houseNumberRef = useRef<HTMLInputElement | null>(null)
  const houseNumberAdditionRef = useRef<HTMLInputElement | null>(null)
  const postalCodeRef = useRef<HTMLInputElement | null>(null)
  const cityRef = useRef<HTMLInputElement | null>(null)
  const phoneNumberRef = useRef<HTMLInputElement | null>(null)
  const emailRef = useRef<HTMLInputElement | null>(null)

  const [canSave, setCanSave] = useState(false)


  useEffect(() => {
    // prefill address fields from parent props
    if (parentAddress && streetRef.current) streetRef.current.value = parentAddress
    if (parentPostalCode && postalCodeRef.current) postalCodeRef.current.value = parentPostalCode
    if (parentCity && cityRef.current) cityRef.current.value = parentCity
    load()
  }, [])

  const openNewModal = async () => {
    // open modal for creating a new subprofile; actual prefill is handled by the modal-open effect
    setEditingId(null)
    setModalOpen(true)
  }

  // Always prefill when the modal opens for a NEW subprofile. We do this in a useEffect
  // because refs to inputs are only available after the modal is mounted.
  useEffect(() => {
    if (!modalOpen) return
    if (editingId) return // editing flow sets values directly when Edit is clicked

    // clear fields first
    if (firstNameRef.current) firstNameRef.current.value = ''
    if (lastNameRef.current) lastNameRef.current.value = ''
    if (dateOfBirthRef.current) dateOfBirthRef.current.value = ''
    if (streetRef.current) streetRef.current.value = ''
    if (houseNumberRef.current) houseNumberRef.current.value = ''
    if (houseNumberAdditionRef.current) houseNumberAdditionRef.current.value = ''
    if (postalCodeRef.current) postalCodeRef.current.value = ''
    if (cityRef.current) cityRef.current.value = ''
    if (phoneNumberRef.current) phoneNumberRef.current.value = ''
    if (emailRef.current) emailRef.current.value = ''

    ;(async () => {
      try {
        const { data, missingTable } = await safeSelect(supabase, 'user_profiles', '*', { user_id: userId })
        if (!missingTable && data && data[0]) {
          const up = data[0]
          if (dateOfBirthRef.current) dateOfBirthRef.current.value = up.date_of_birth || ''
          if (streetRef.current) streetRef.current.value = up.street || up.adres || ''
          if (houseNumberRef.current) houseNumberRef.current.value = up.house_number || up.huisnummer || ''
          if (postalCodeRef.current) postalCodeRef.current.value = up.postal_code || up.postcode || ''
          if (cityRef.current) cityRef.current.value = up.city || up.stad || ''
          if (phoneNumberRef.current) phoneNumberRef.current.value = up.phone_number || ''
          if (emailRef.current) emailRef.current.value = up.email || ''
        } else {
          // fallback to props
          if (streetRef.current) streetRef.current.value = parentAddress || ''
          if (postalCodeRef.current) postalCodeRef.current.value = parentPostalCode || ''
          if (cityRef.current) cityRef.current.value = parentCity || ''
        }
      } catch {
        // fallback to props
        if (streetRef.current) streetRef.current.value = parentAddress || ''
        if (postalCodeRef.current) postalCodeRef.current.value = parentPostalCode || ''
        if (cityRef.current) cityRef.current.value = parentCity || ''
      }

      computeCanSave()
    })()
  }, [modalOpen, editingId, userId, parentAddress, parentPostalCode, parentCity])

  // Handle per-item delete confirmation similar to logout confirmation pattern
  useEffect(() => {
    if (!confirmDeleteId) return

    // Reset when clicking outside any delete button
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-delete-button]')) setConfirmDeleteId(null)
    }

    // Auto-reset after 5 seconds
    const timer = setTimeout(() => setConfirmDeleteId(null), 5000)

    document.addEventListener('click', handleClickOutside)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      clearTimeout(timer)
    }
  }, [confirmDeleteId])

  const computeCanSave = () => {
    const f = firstNameRef.current?.value ?? ''
    const l = lastNameRef.current?.value ?? ''
    const dob = dateOfBirthRef.current?.value ?? ''
    const s = streetRef.current?.value ?? ''
    const hn = houseNumberRef.current?.value ?? ''
    const pc = postalCodeRef.current?.value ?? ''
    const c = cityRef.current?.value ?? ''
    const em = emailRef.current?.value ?? ''
    // phone is optional now
    setCanSave(Boolean(f.trim() && l.trim() && dob && s.trim() && hn.trim() && pc.trim() && c.trim() && em.trim()))
  }

  const load = async () => {
    setLoading(true)
    const { data, missingTable, error } = await safeSelect(supabase, 'sub_profiles', '*', { parent_user_id: userId })
    if (missingTable) {
      console.warn('sub_profiles table missing — skipping subprofiles load')
      setSubs([])
    } else if (error) {
      console.error('subprofiles fetch error', error)
    } else setSubs(data || [])
    setLoading(false)
  }

  // validation handled by computeCanSave and canSave state



  const remove = async (id: string) => {
    const { success, missingTable, error } = await safeDelete(supabase, 'sub_profiles', { id })
    if (missingTable) console.warn('sub_profiles table missing — cannot delete subprofile')
    else if (!success) console.error('delete subprofile error', error)
    await load()
  }

  return (
    <>
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Subprofielen</h2>
      <p className="text-sm text-slate-600 mb-4">Voeg subprofielen (kinderen/afhankelijken) toe zodat je ze kunt inschrijven voor programma's. Vul voornaam, achternaam en geboortedatum in. Adres wordt voorgesteld vanuit jouw profiel.</p>

        <div className="flex justify-end mt-2 mb-4">
          <button onClick={openNewModal} className="px-3 py-2 bg-blue-600 text-white rounded-lg inline-flex items-center gap-2"><UserPlus size={16} />Nieuw subprofiel</button>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <LoadingSpinner size={16} label="Laden" indicatorClassName="border-b-slate-500" />
            <span>Laden…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {subs.length === 0 && <div className="text-sm text-slate-500">Nog geen subprofielen.</div>}
            {subs.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                <div>
                  <div className="font-medium text-slate-900">{d.name || `${d.first_name || ''} ${d.last_name || ''}`.trim()}</div>
                  <div className="text-sm text-slate-700">{d.date_of_birth ? `Geboorte: ${d.date_of_birth}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button aria-label="Bewerk subprofiel" onClick={() => {
                    // populate refs with existing values
                    setEditingId(d.id);
                    if (firstNameRef.current) firstNameRef.current.value = d.first_name || '';
                    if (lastNameRef.current) lastNameRef.current.value = d.last_name || '';
                    if (dateOfBirthRef.current) dateOfBirthRef.current.value = d.date_of_birth || '';
                    if (streetRef.current) streetRef.current.value = d.street || '';
                    if (houseNumberRef.current) houseNumberRef.current.value = d.house_number || '';
                    if (houseNumberAdditionRef.current) houseNumberAdditionRef.current.value = d.house_number_addition || '';
                    if (postalCodeRef.current) postalCodeRef.current.value = d.postal_code || '';
                    if (cityRef.current) cityRef.current.value = d.city || '';
                    if (phoneNumberRef.current) phoneNumberRef.current.value = d.phone_number || '';
                    if (emailRef.current) emailRef.current.value = d.email || '';
                    // compute canSave for the populated values
                    computeCanSave();
                    setModalOpen(true);
                  }} className="inline-flex items-center justify-center rounded-md text-slate-700 hover:text-slate-900 p-2">
                    <Edit size={16} />
                  </button>
                  {confirmDeleteId === d.id ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { remove(d.id); setConfirmDeleteId(null) }} className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors">Verwijderen</button>
                    </div>
                  ) : (
                    <button data-delete-button onClick={() => setConfirmDeleteId(d.id)} className="inline-flex items-center justify-center rounded-md text-red-600 hover:text-red-700 p-2" aria-label="Start verwijder bevestiging">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Modal for Add / Edit */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingId(null); }} ariaLabel={editingId ? 'Bewerk subprofiel' : 'Nieuw subprofiel'}>
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">{editingId ? 'Bewerk subprofiel' : 'Nieuw subprofiel'}</h3>
              
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Voornaam <span className="text-red-600">*</span></label>
              <input ref={firstNameRef} placeholder="Voornaam" onInput={computeCanSave} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Achternaam <span className="text-red-600">*</span></label>
              <input ref={lastNameRef} placeholder="Achternaam" onInput={computeCanSave} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Geboortedatum <span className="text-red-600">*</span></label>
              <input ref={dateOfBirthRef} type="date" placeholder="Geboortedatum" onInput={computeCanSave} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Straat <span className="text-red-600">*</span></label>
              <input ref={streetRef} placeholder="Straat" onInput={computeCanSave} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Huisnummer <span className="text-red-600">*</span></label>
              <input ref={houseNumberRef} placeholder="Huisnummer" onInput={computeCanSave} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Toevoeging (optioneel)</label>
              <input ref={houseNumberAdditionRef} placeholder="Toevoeging (optioneel)" className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Postcode <span className="text-red-600">*</span></label>
              <input ref={postalCodeRef} placeholder="Postcode" onInput={computeCanSave} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Plaats <span className="text-red-600">*</span></label>
              <input ref={cityRef} placeholder="Plaats" onInput={computeCanSave} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Telefoon</label>
              <input ref={phoneNumberRef} placeholder="Telefoon" onInput={computeCanSave} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">E-mail <span className="text-red-600">*</span></label>
              <input ref={emailRef} placeholder="E-mail" onInput={computeCanSave} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>

          <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-100">
            <button disabled={!canSave} onClick={async () => {
              // read values from refs
              const f = firstNameRef.current?.value?.trim() || null
              const l = lastNameRef.current?.value?.trim() || null
              const dob = dateOfBirthRef.current?.value || null
              const s = streetRef.current?.value?.trim() || null
              const hn = houseNumberRef.current?.value?.trim() || null
              const hna = houseNumberAdditionRef.current?.value?.trim() || null
              const pc = postalCodeRef.current?.value?.trim() || null
              const c = cityRef.current?.value?.trim() || null
              const ph = phoneNumberRef.current?.value?.trim() || null
              const em = emailRef.current?.value?.trim() || null

              const payload: any = {
                parent_user_id: userId,
                first_name: f,
                last_name: l,
                date_of_birth: dob,
                street: s,
                house_number: hn,
                house_number_addition: hna || null,
                postal_code: pc,
                city: c,
                phone_number: ph,
                email: em,
              }
              // Do not set `name` here because some DB schemas may have replaced that column
              // with separate fields (or removed it). Construct address if the DB supports it.
              payload.address = payload.street ? `${payload.street} ${payload.house_number || ''}${payload.house_number_addition ? ' ' + payload.house_number_addition : ''}`.trim() : null

              // Whitelist permitted columns to avoid sending properties that don't exist
              const allowedFields = new Set([
                'parent_user_id', 'first_name', 'last_name', 'date_of_birth',
                'street', 'house_number', 'house_number_addition', 'postal_code', 'city',
                'phone_number', 'email', 'address'
              ])
              const filteredPayload: any = {}
              Object.entries(payload).forEach(([k, v]) => {
                if (allowedFields.has(k)) filteredPayload[k] = v
              })

              try {
                if (editingId) {
                  const { success, missingTable, error } = await safeUpdate(supabase, 'sub_profiles', payload, { id: editingId })
                  if (missingTable) console.warn('sub_profiles table missing — cannot update')
                  else if (!success) {
                    // Log richer error details for debugging (some Error objects are non-enumerable)
                    try {
                      console.error('update subprofile error', error, JSON.stringify(error, Object.getOwnPropertyNames(error)))
                    } catch {
                      console.error('update subprofile error (stringify failed)', error)
                    }
                    alert('Kon subprofiel niet bijwerken. Controleer de console voor details.')
                  }
                } else {
                  const { success, missingTable, error } = await safeInsert(supabase, 'sub_profiles', payload)
                  if (missingTable) console.warn('sub_profiles table missing — cannot add subprofile')
                  else if (!success) {
                    // Log richer error details for debugging (some Error objects are non-enumerable)
                    try {
                      console.error('insert subprofile error', error, JSON.stringify(error, Object.getOwnPropertyNames(error)))
                    } catch {
                      console.error('insert subprofile error (stringify failed)', error)
                    }
                    const message = (((error as any) && (((error as any).message) || ((error as any).error_description) || ((error as any).details))) || 'Onbekende fout')
                    alert('Kon subprofiel niet toevoegen: ' + message)
                  }
                }
              } catch (err) {
                try {
                  console.error('Failed saving subprofile', err, JSON.stringify(err, Object.getOwnPropertyNames(err)))
                } catch {
                  console.error('Failed saving subprofile (stringify failed)', err)
                }
              }
              // reset & reload
              setModalOpen(false)
              setEditingId(null)
              if (firstNameRef.current) firstNameRef.current.value = ''
              if (lastNameRef.current) lastNameRef.current.value = ''
              if (dateOfBirthRef.current) dateOfBirthRef.current.value = ''
              if (phoneNumberRef.current) phoneNumberRef.current.value = ''
              if (emailRef.current) emailRef.current.value = ''
              computeCanSave()
              await load()
            }} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed">Opslaan</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
