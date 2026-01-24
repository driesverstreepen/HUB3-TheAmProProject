"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Shield, FileText, Users, CheckCircle, TrendingUp } from 'lucide-react'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface PlatformStats {
  total_users: number
  total_studios: number
  total_programs: number
  total_consents: number
  recent_registrations: number
}

export default function SuperAdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [stats, setStats] = useState<PlatformStats>({
    total_users: 0,
    total_studios: 0,
    total_programs: 0,
    total_consents: 0,
    recent_registrations: 0,
  })

  useEffect(() => {
    checkSuperAdminAccess()
  }, [])

  const checkSuperAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .single()

      if (error || !data) {
        router.push('/')
        return
      }

      setIsSuperAdmin(true)
      await loadPlatformStats()
    } catch (error) {
      console.error('Error checking super admin access:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const loadPlatformStats = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const resp = await fetch('/api/super-admin/stats', {
        method: 'GET',
        credentials: 'include',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      })

      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) throw new Error(json?.error || 'Failed to load stats')

      const s = json?.stats
      setStats({
        total_users: Number(s?.total_users) || 0,
        total_studios: Number(s?.total_studios) || 0,
        total_programs: Number(s?.total_programs) || 0,
        total_consents: Number(s?.total_consents) || 0,
        recent_registrations: Number(s?.recent_registrations) || 0,
      })
    } catch (error) {
      console.error('Error loading platform stats:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size={48} label="Laden" indicatorClassName="border-b-purple-600" />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-auto">
      <SuperAdminSidebar />

      <div className="w-full min-w-0 sm:ml-64">
        <header className="bg-white border-b border-slate-200">
          <div className="px-4 sm:px-8 py-4 sm:py-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-600 rounded-xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Platform Overzicht</h1>
                <p className="text-sm text-slate-600">Statistieken en snelle toegang tot beheer</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-8 py-6 sm:py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-2xl font-bold text-slate-900">{stats.total_users}</span>
              </div>
              <h3 className="text-sm font-medium text-slate-600">Totaal Gebruikers</h3>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Shield className="w-6 h-6 text-purple-600" />
                </div>
                <span className="text-2xl font-bold text-slate-900">{stats.total_studios}</span>
              </div>
              <h3 className="text-sm font-medium text-slate-600">Totaal Studios</h3>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
                <span className="text-2xl font-bold text-slate-900">{stats.total_programs}</span>
              </div>
              <h3 className="text-sm font-medium text-slate-600">Totaal Programma's</h3>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-amber-600" />
                </div>
                <span className="text-2xl font-bold text-slate-900">{stats.total_consents}</span>
              </div>
              <h3 className="text-sm font-medium text-slate-600">GDPR Toestemmingen</h3>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Recente Activiteit</h2>
                <p className="text-sm text-slate-600">Laatste 7 dagen</p>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">{stats.recent_registrations}</span>
              <span className="text-slate-600">nieuwe registraties</span>
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-purple-600 mt-1" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Super Admin Rechten</h3>
                <p className="text-slate-700 leading-relaxed">
                  Als super admin heb je volledige toegang tot alle platform functionaliteiten.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
