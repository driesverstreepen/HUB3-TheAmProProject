'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import Select from '@/components/Select'

type Audience = 'all' | 'studio_owners' | 'users'

export default function SuperAdminPushPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const [audience, setAudience] = useState<Audience>('all')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')

  const [status, setStatus] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    checkAccess()
  }, [])

  const checkAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .maybeSingle()

      if (!data) {
        router.push('/')
        return
      }

      setIsSuperAdmin(true)
    } catch {
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const send = async () => {
    setStatus(null)
    setSending(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const resp = await fetch('/api/super-admin/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ audience, title, message, url: url.trim() || null }),
      })

      const data = await resp.json().catch(() => ({} as any))
      if (!resp.ok) {
        setStatus(data?.error || 'Versturen mislukt')
        return
      }

      setStatus(`Verzonden: ${data.sent}/${data.attempted} pushes (doelgroep users: ${data.users})`)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size={48} label="Laden" indicatorClassName="border-b-purple-600" />
      </div>
    )
  }

  if (!isSuperAdmin) return null

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-auto">
      <SuperAdminSidebar />

      <div className="w-full min-w-0 sm:ml-64">
        <header className="bg-white border-b border-slate-200">
          <div className="px-4 sm:px-8 py-4 sm:py-6">
            <h1 className="t-h2 font-bold text-slate-900">Push Notifications</h1>
            <p className="t-bodySm text-slate-600">Manueel push notificaties versturen</p>
          </div>
        </header>

        <main className="p-4 sm:p-8">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl">
            <div className="space-y-4">
              <div>
                <label className="t-caption text-slate-700">Doelgroep</label>
                <Select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as Audience)}
                  className="mt-1 w-full"
                >
                  <option value="all">Alle users</option>
                  <option value="studio_owners">Enkel studio owners</option>
                  <option value="users">Enkel gewone users (geen owners)</option>
                </Select>
              </div>

              <div>
                <label className="t-caption text-slate-700">Titel</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 t-bodySm"
                  placeholder="Bijv. Platform update"
                />
              </div>

              <div>
                <label className="t-caption text-slate-700">Bericht</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 t-bodySm"
                  rows={4}
                  placeholder="Bijv. We hebben nieuwe features toegevoegd..."
                />
              </div>

              <div>
                <label className="t-caption text-slate-700">URL (optioneel)</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 t-bodySm"
                  placeholder="Bijv. /hub of /super-admin"
                />
              </div>

              <button
                onClick={send}
                disabled={sending || !title.trim() || !message.trim()}
                className="w-full bg-purple-600 text-white! rounded-lg px-4 py-2 t-bodySm font-medium disabled:opacity-50"
              >
                {sending ? 'Bezig...' : 'Verstuur push'}
              </button>

              {status && (
                <div className="t-bodySm text-slate-700">{status}</div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
