"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ProfilePageComponent from '@/components/ProfilePage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import ContentContainer from '@/components/ContentContainer'

export default function Page() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    let timeoutId: any
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), ms)
    })
    try {
      return await Promise.race([promise, timeout])
    } finally {
      clearTimeout(timeoutId)
    }
  }

  useEffect(() => {
    checkAccess()
  }, [])

  const checkAccess = async () => {
    try {
      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        5000,
        'Auth check timed out',
      )
      if (!user) {
        setLoading(false)
        router.replace('/auth/login?redirect=/profile')
        return
      }

      setLoading(false)
    } catch (error) {
      console.error('Error checking access:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingSpinner size={48} className="mx-auto mb-4" label="Laden" />
          <p className="text-slate-600">Laden…</p>
        </div>
      </div>
    )
  }

  return (
    <ContentContainer className="py-8">
      <ProfilePageComponent />
    </ContentContainer>
  )
}
