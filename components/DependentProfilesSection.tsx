"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { safeSelect, safeInsert, safeDelete } from '@/lib/supabaseHelpers'
import { UserPlus, UserMinus } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function DependentProfilesSection({ userId, parentAddress, parentPostalCode, parentCity }: { userId: string, parentAddress?: string, parentPostalCode?: string, parentCity?: string }) {
  const [dependents, setDependents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const { data, missingTable, error } = await safeSelect(supabase, 'sub_profiles', '*', { parent_user_id: userId })
    if (missingTable) {
      console.warn('sub_profiles table missing — skipping dependents load')
      setDependents([])
    } else if (error) {
      console.error('dependents fetch error', error)
    } else setDependents(data || [])
    setLoading(false)
  }

  const add = async () => {
    if (!name) return
    setAdding(true)
    const payload: any = { parent_user_id: userId, name }
    if (parentAddress) payload.address = parentAddress
    if (parentPostalCode) payload.postal_code = parentPostalCode
    if (parentCity) payload.city = parentCity
    const { success, missingTable, error } = await safeInsert(supabase, 'sub_profiles', payload)
    if (missingTable) {
      console.warn('sub_profiles table missing — cannot add dependent')
    } else if (!success) {
      console.error('insert dependent error', error)
    }
    setName('')
    await load()
    setAdding(false)
  }

  const remove = async (id: string) => {
  const { success, missingTable, error } = await safeDelete(supabase, 'sub_profiles', { id })
  if (missingTable) console.warn('sub_profiles table missing — cannot delete dependent')
  else if (!success) console.error('delete dependent error', error)
    await load()
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Dependents</h2>
      <p className="text-sm text-slate-600 mb-4">Add profiles for children or dependents so they can be registered for programs.</p>

      <div className="space-y-3">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dependent name" className="flex-1 px-3 py-2 border rounded" />
          <button onClick={add} disabled={adding} className="px-4 py-2 bg-blue-600 text-white rounded flex items-center gap-2"><UserPlus size={16} />Add</button>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <LoadingSpinner size={16} label="Laden" indicatorClassName="border-b-slate-500" />
            <span>Laden…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {dependents.length === 0 && <div className="text-sm text-slate-500">No dependents yet.</div>}
            {dependents.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-slate-500">{d.address ? `${d.address}, ${d.postal_code} ${d.city}` : 'No address'}</div>
                </div>
                <button onClick={() => remove(d.id)} className="text-red-600 flex items-center gap-1"><UserMinus size={16} />Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
