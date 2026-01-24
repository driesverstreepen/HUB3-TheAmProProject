'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function DebugAuthPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDebugData()
  }, [])

  const loadDebugData = async () => {
    setLoading(true)
    try {
      // Get current session
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData?.session
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user && !session) {
        setData({ 
          error: 'Not logged in',
          session: null,
          user: null,
          instructions: 'Please login first, then come back to this page'
        })
        setLoading(false)
        return
      }

      const userId = user?.id || session?.user?.id

      // Get user_roles data
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      // Get studios if studio_id exists
      let studioData = null
      if (roleData?.studio_id) {
        const { data: studio } = await supabase
          .from('studios')
          .select('id, naam')
          .eq('id', roleData.studio_id)
          .maybeSingle()
        studioData = studio
      }

      setData({
        session: session ? {
          access_token: session.access_token?.substring(0, 20) + '...',
          user_id: session.user.id,
          expires_at: session.expires_at,
        } : null,
        user: user ? {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        } : null,
        user_roles: roleData,
        user_roles_error: roleError,
        studio: studioData,
      })
    } catch (err: any) {
      setData({ error: err.message })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Auth Debug</h1>
          <div className="flex items-center gap-2 text-slate-600">
            <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
            <span>Laden…</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Auth Debug Info</h1>
        
        {data?.error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-2 text-yellow-900">Not Logged In</h2>
            <p className="text-yellow-800 mb-4">{data.instructions || data.error}</p>
            <a
              href="/"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block"
            >
              Go to Login
            </a>
          </div>
        )}

        {data?.session && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">Session Info</h2>
            <pre className="bg-slate-100 p-4 rounded overflow-auto text-sm">
              {JSON.stringify(data.session, null, 2)}
            </pre>
          </div>
        )}

        {data?.user && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">Current User</h2>
            <pre className="bg-slate-100 p-4 rounded overflow-auto text-sm">
              {JSON.stringify(data?.user, null, 2)}
            </pre>
          </div>
        )}

        {data?.user && (
          <>
            <div className="bg-white rounded-lg border border-slate-200 p-6 mb-4">
              <h2 className="text-xl font-semibold mb-4">User Roles Data</h2>
              <pre className="bg-slate-100 p-4 rounded overflow-auto text-sm">
                {JSON.stringify(data?.user_roles, null, 2)}
              </pre>
              {data?.user_roles_error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
                  <p className="text-red-800 font-semibold">Error fetching user_roles:</p>
                  <pre className="text-sm mt-2">{JSON.stringify(data.user_roles_error, null, 2)}</pre>
                </div>
              )}
            </div>

            {data?.studio && (
              <div className="bg-white rounded-lg border border-slate-200 p-6 mb-4">
                <h2 className="text-xl font-semibold mb-4">Studio Data</h2>
                <pre className="bg-slate-100 p-4 rounded overflow-auto text-sm">
                  {JSON.stringify(data.studio, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}

        <div className="mt-6">
          <button
            onClick={loadDebugData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh Data
          </button>
          
          <a
            href="/"
            className="ml-4 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 inline-block"
          >
            Back to Home
          </a>
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold mb-2">Expected for Studio Admin:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><code>user_roles.role</code> should be <code>"studio_admin"</code></li>
            <li><code>user_roles.studio_id</code> should be a valid UUID</li>
            <li><code>studio.naam</code> should show your studio name</li>
          </ul>
          <p className="mt-3 text-sm">If any of these are missing or incorrect, that's why you're being redirected to the user interface.</p>
        </div>
      </div>
    </div>
  )
}
