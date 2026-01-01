"use client";

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import { useNotification } from '@/contexts/NotificationContext'
import { Plus } from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

type Product = {
  id: string
  studio_id: string
  name: string
  description: string | null
  credit_count: number
  price_cents: number
  currency: string
  expiration_months: number | null
  active: boolean
  created_at: string
}

export default function ClassPassAdminPage() {
  const params = useParams<{ id: string }>()
  const studioId = params?.id
  const { showError } = useNotification()

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Product[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', credit_count: 10, price_eur: '0.00', currency: 'eur', expiration_months: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (studioId) {
      load()
    }
  }, [studioId])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('class_pass_products')
        .select('*')
        .eq('studio_id', studioId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setItems((data as any) || [])
    } catch (e) {
      console.error('Failed to load class pass products', e)
    } finally {
      setLoading(false)
    }
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      // Normalize EUR -> cents for API
      const euro = Number(String(form.price_eur).replace(',', '.'))
      const price_cents = Number.isFinite(euro) ? Math.round(euro * 100) : NaN
      if (!Number.isFinite(price_cents) || price_cents < 0) {
        throw new Error('Ongeldige prijs (EUR)')
      }

      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        credit_count: Number(form.credit_count),
        price_cents,
        currency: form.currency || 'eur',
        expiration_months: form.expiration_months ? Number(form.expiration_months) : null,
      }
      const res = await fetch(`/api/studio/${studioId}/class-pass/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create product')
      setForm({ name: '', description: '', credit_count: 10, price_eur: '0.00', currency: 'eur', expiration_months: '' })
      setIsOpen(false)
      await load()
    } catch (e: any) {
      showError(e?.message || 'Kon product niet aanmaken')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(id: string, active: boolean) {
    try {
      const { error } = await supabase
        .from('class_pass_products')
        .update({ active: !active })
        .eq('id', id)
      if (error) throw error
      await load()
    } catch (e) {
      console.error('Failed to toggle active', e)
    }
  }

  return (
    <FeatureGate flagKey="studio.class-passes" mode="page">
      <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Class Pass producten</h1>
        <p className="text-slate-600">Maak beurtenkaarten aan die leden kunnen kopen en gebruiken voor per-les inschrijving. Koppel producten aan programma's via de programma instellingen.</p>
      </div>

      <div className="flex items-center justify-between mb-4">        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          <Plus size={16} />
          Nieuw
        </button>
      </div>

      <div className="bg-white rounded-xl shadow">
        <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 font-semibold">Overzicht</div>
        {loading ? (
          <div className="p-4 text-slate-600 flex items-center gap-2">
            <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
            <span>Laden…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Geen producten gevonden.</div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {items.map(p => (
              <li key={p.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900">{p.name} <span className="text-slate-500 font-normal">· {p.credit_count} credits</span></div>
                  <div className="text-sm text-slate-600">{(p.price_cents/100).toFixed(2)} {p.currency.toUpperCase()} {p.expiration_months ? `· vervalt in ${p.expiration_months} maand(en)` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs ${p.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{p.active ? 'Actief' : 'Inactief'}</span>
                  <button onClick={() => toggleActive(p.id, p.active)} className="px-3 py-1 border rounded-md text-sm">{p.active ? 'Deactiveer' : 'Activeer'}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <h3 className="text-lg font-semibold mb-4">Nieuw Class Pass product</h3>
        <form onSubmit={createProduct} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-700 mb-1">Naam</label>
              <input value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-md px-3 py-2" required />
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Credits</label>
              <input type="number" min={1} value={form.credit_count} onChange={e => setForm(s => ({ ...s, credit_count: Number(e.target.value) }))} className="w-full border rounded-md px-3 py-2" required />
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Prijs (EUR)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.price_eur}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9.,]/g, '')
                  setForm(s => ({ ...s, price_eur: v }))
                }}
                className="w-full border rounded-md px-3 py-2"
                placeholder="0,00"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Valuta</label>
              <input value={form.currency} onChange={e => setForm(s => ({ ...s, currency: e.target.value.toLowerCase() }))} className="w-full border rounded-md px-3 py-2" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-700 mb-1">Beschrijving</label>
              <textarea value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))} className="w-full border rounded-md px-3 py-2" rows={2} />
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Vervalt (maanden, optioneel)</label>
              <input type="number" min={1} value={form.expiration_months} onChange={e => setForm(s => ({ ...s, expiration_months: e.target.value }))} className="w-full border rounded-md px-3 py-2" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{saving ? 'Opslaan...' : 'Aanmaken'}</button>
          </div>
        </form>
      </Modal>
      </div>
    </FeatureGate>
  )
}
