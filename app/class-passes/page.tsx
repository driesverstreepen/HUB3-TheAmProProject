"use client";

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import ContentContainer from '@/components/ContentContainer'

type Purchase = {
  id: string
  credits_total: number
  credits_used: number
  expires_at: string | null
  status: string
  created_at: string
  class_pass_products?: { name: string } | null
}

export default function MyClassPassesPage() {
  const [loading, setLoading] = useState(true)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [balance, setBalance] = useState<number>(0)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: p }, { data: b }] = await Promise.all([
        supabase
          .from('class_pass_purchases')
          .select('id, credits_total, credits_used, expires_at, status, created_at, class_pass_products(name)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('class_pass_balances')
          .select('balance')
          .eq('user_id', user.id)
      ])
      setPurchases((p as any) || [])
      // Sum across studios for a simple total view (optional)
      const total = Array.isArray(b) ? (b as any[]).reduce((sum, row) => sum + (row.balance || 0), 0) : 0
      setBalance(total)
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <ContentContainer className="py-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Mijn Beurtenkaarten</h1>
      <div className="mb-6 p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
        <div className="text-slate-600">Totaal beschikbare credits</div>
        <div className="text-3xl font-semibold text-slate-900">{balance}</div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-900">Aankopen</div>
        {loading ? (
          <div className="p-4 text-slate-600 flex items-center gap-2">
            <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
            <span>Laden…</span>
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-4 text-slate-600">Nog geen beurtenkaarten gekocht.</div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {purchases.map(p => (
              <li key={p.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900">{p.class_pass_products?.name || 'Beurtenkaart'} · {p.credits_total} credits</div>
                  <div className="text-sm text-slate-600">Gebruikt: {p.credits_used} · Beschikbaar: {Math.max(0, (p.credits_total - p.credits_used))} {p.expires_at ? `· Vervalt: ${new Date(p.expires_at).toLocaleDateString()}` : ''}</div>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ContentContainer>
  )
}
