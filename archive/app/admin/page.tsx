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
    recent_registrations: 0
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

      // Check if user has super_admin role
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
      // Get total users
      const { count: usersCount } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })

      // Get total studios
      const { count: studiosCount } = await supabase
        .from('studios')
        .select('*', { count: 'exact', head: true })

      // Get total programs
      const { count: programsCount } = await supabase
        .from('programs')
        .select('*', { count: 'exact', head: true })

      // Get total consents
      const { count: consentsCount } = await supabase
        .from('user_consents')
        .select('*', { count: 'exact', head: true })

      // Get recent registrations (last 7 days)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      
      const { count: recentCount } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString())

      setStats({
        total_users: usersCount || 0,
        total_studios: studiosCount || 0,
        total_programs: programsCount || 0,
        total_consents: consentsCount || 0,
        recent_registrations: recentCount || 0
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
    <div className="flex min-h-screen bg-slate-50">
      <SuperAdminSidebar />
      
      <div className="flex-1 ml-64">
        {/* Header */}
        <header className="bg-white border-b border-slate-200">
          <div className="px-8 py-6">
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

        {/* Main Content */}
        <main className="px-8 py-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Users */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-2xl font-bold text-slate-900">{stats.total_users}</span>
              </div>
              <h3 className="text-sm font-medium text-slate-600">Totaal Gebruikers</h3>
            </div>

            {/* Total Studios */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Shield className="w-6 h-6 text-purple-600" />
                </div>
                <span className="text-2xl font-bold text-slate-900">{stats.total_studios}</span>
              </div>
              <h3 className="text-sm font-medium text-slate-600">Totaal Studios</h3>
            </div>

            {/* Total Programs */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
                <span className="text-2xl font-bold text-slate-900">{stats.total_programs}</span>
              </div>
              <h3 className="text-sm font-medium text-slate-600">Totaal Programma's</h3>
            </div>

            {/* Total Consents */}
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

          {/* Recent Activity */}
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

          {/* Info Banner */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-purple-600 mt-1" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Super Admin Rechten</h3>
                <p className="text-slate-700 leading-relaxed">
                  Als super admin heb je volledige toegang tot alle platform functionaliteiten. 
                  Gebruik deze rechten verantwoord en zorg ervoor dat alle wijzigingen in legal documents 
                  juridisch zijn gecontroleerd voordat ze actief worden gezet.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
