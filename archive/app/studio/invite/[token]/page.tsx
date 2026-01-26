'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Building2, Mail, Shield, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface InviteData {
  email: string
  role: 'admin' | 'owner' | 'bookkeeper' | 'comms' | 'viewer'
  expires_at: string
  studio_name: string
  studio_id: string
  invited_by_name: string
}

interface Props {
  params: Promise<{ token: string }>
}

export default function InviteAcceptPage({ params }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    params.then(p => setToken(p.token))
  }, [params])

  useEffect(() => {
    if (token) {
      checkAuth()
      loadInvite()
    }
  }, [token])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const loadInvite = async () => {
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      // Fetch invite data (public access)
      const { data, error: fetchError } = await supabaseAdmin
        .from('studio_invites')
        .select(`
          email,
          role,
          expires_at,
          studio_id,
          invited_by,
          studios(naam),
          invited_by_profile:user_profiles!studio_invites_invited_by_fkey(first_name, last_name)
        `)
        .eq('token', token)
        .is('accepted_at', null)
        .maybeSingle()

      if (fetchError || !data) {
        setError('Deze uitnodiging is ongeldig of al geaccepteerd')
        return
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        setError('Deze uitnodiging is verlopen')
        return
      }

      const invitedByProfile = Array.isArray(data.invited_by_profile)
        ? data.invited_by_profile[0]
        : data.invited_by_profile

      setInviteData({
        email: data.email,
        role: data.role,
        expires_at: data.expires_at,
        studio_name: (data.studios as any)?.naam || 'Studio',
        studio_id: data.studio_id,
        invited_by_name: invitedByProfile
          ? `${invitedByProfile.first_name || ''} ${invitedByProfile.last_name || ''}`.trim()
          : 'Studio admin'
      })
    } catch (err) {
      console.error('Error loading invite:', err)
      setError('Er is een fout opgetreden bij het laden van de uitnodiging')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!user) {
      // Redirect to login with return path
      router.push(`/auth/login?redirect=/studio/invite/${token}`)
      return
    }

    setAccepting(true)
    setError(null)

    try {
      const response = await fetch('/api/studio/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to accept invitation')
      }

      setSuccess(true)
      
      // Redirect to studio dashboard after 2 seconds
      setTimeout(() => {
        router.push(`/studio/${result.studio_id}`)
      }, 2000)
    } catch (err: any) {
      console.error('Error accepting invite:', err)
      setError(err.message || 'Er is een fout opgetreden')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <LoadingSpinner size={48} className="mx-auto mb-4" label="Uitnodiging laden" />
          <p className="text-slate-600">Uitnodiging laden…</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Geaccepteerd!</h1>
          <p className="text-slate-600 mb-4">
            Je bent nu lid van {inviteData?.studio_name}
          </p>
          <p className="text-sm text-slate-500">
            Je wordt doorgestuurd naar het studio dashboard…
          </p>
        </div>
      </div>
    )
  }

  if (error || !inviteData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Ongeldige uitnodiging</h1>
          <p className="text-slate-600 mb-6">
            {error || 'Deze uitnodiging kon niet worden gevonden'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Terug naar home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        {/* Studio Icon */}
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Building2 className="w-10 h-10 text-blue-600" />
        </div>

        {/* Header */}
        <h1 className="text-2xl font-bold text-slate-900 text-center mb-2">
          Studio Uitnodiging
        </h1>
        <p className="text-center text-slate-600 mb-8">
          Je bent uitgenodigd om lid te worden van een studio team
        </p>

        {/* Invite Details */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
            <Building2 className="w-5 h-5 text-slate-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">Studio</p>
              <p className="text-slate-900 font-semibold">{inviteData.studio_name}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
            <Mail className="w-5 h-5 text-slate-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">Uitgenodigd voor</p>
              <p className="text-slate-900">{inviteData.email}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
            <Shield className="w-5 h-5 text-slate-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">Rol</p>
              <p className="text-slate-900">
                {inviteData.role === 'owner'
                  ? 'Eigenaar'
                  : inviteData.role === 'admin'
                    ? 'Admin'
                    : inviteData.role === 'bookkeeper'
                      ? 'Boekhouder'
                      : inviteData.role === 'comms'
                        ? 'Communicatie'
                        : 'Alleen-lezen'}
              </p>
            </div>
          </div>

          <div className="text-sm text-slate-600 text-center">
            Uitgenodigd door <span className="font-medium">{inviteData.invited_by_name}</span>
          </div>
        </div>

        {/* Info Box */}
        {!user && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-900">
                Je moet ingelogd zijn om deze uitnodiging te accepteren. Je wordt doorgestuurd naar de login pagina.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {accepting ? (
              <>
                <LoadingSpinner size={20} label="Accepteren" indicatorClassName="border-b-white" />
                Accepteren...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                {user ? 'Accepteer uitnodiging' : 'Log in om te accepteren'}
              </>
            )}
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
          >
            Annuleer
          </button>
        </div>

        {/* Expiry Notice */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Deze uitnodiging verloopt op{' '}
          {new Date(inviteData.expires_at).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })}
        </p>
      </div>
    </div>
  )
}
