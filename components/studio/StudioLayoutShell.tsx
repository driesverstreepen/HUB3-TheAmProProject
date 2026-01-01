"use client"

import React from 'react'
import StudioSidebar from '@/components/studio/StudioSidebar'
import { useDevice } from '@/contexts/DeviceContext'
import { useTheme } from '@/contexts/ThemeContext'
import FloatingFeedbackButton from '@/components/feedback/FloatingFeedbackButton'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { usePathname, useRouter } from 'next/navigation'
import { useStudioRolePermissions } from '@/hooks/useStudioRolePermissions'
import { getStudioPermissionKeyForPath } from '@/lib/studioAccess'
import { useEffect, useState } from 'react'
import { safeSelect } from '@/lib/supabaseHelpers'
import { supabase } from '@/lib/supabase'

export default function StudioLayoutShell({
  studioId,
  children,
}: {
  studioId: string
  children: React.ReactNode
}) {
  const { isMobile } = useDevice()
  const { theme } = useTheme()
  const pathname = usePathname()
  const router = useRouter()
  const { canAccess, loading: permsLoading } = useStudioRolePermissions(studioId)

  const [schoolYearChecked, setSchoolYearChecked] = useState(false)
  const [hasActiveSchoolYear, setHasActiveSchoolYear] = useState(true)

  const permissionKey = getStudioPermissionKeyForPath(studioId, pathname)
  const isAllowed = permissionKey ? canAccess(permissionKey) : true

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        setSchoolYearChecked(false)

        const { data, missingTable, error } = await safeSelect(
          supabase,
          'studio_school_years',
          'id,is_active',
          { studio_id: studioId },
        )

        // If migrations are not deployed yet, don't block the interface.
        if (missingTable) {
          if (!cancelled) {
            setHasActiveSchoolYear(true)
            setSchoolYearChecked(true)
          }
          return
        }

        if (error) {
          // Fail open (do not block the studio UI due to transient errors).
          if (!cancelled) {
            setHasActiveSchoolYear(true)
            setSchoolYearChecked(true)
          }
          return
        }

        const rows = (Array.isArray(data) ? data : data ? [data] : []) as any[]
        const active = rows.find((r) => !!(r as any)?.is_active)
        const ok = !!active?.id

        if (!cancelled) {
          setHasActiveSchoolYear(ok)
          setSchoolYearChecked(true)
        }

        if (!ok) {
          router.replace(`/auth/complete-studio-schoolyear?studioId=${studioId}`)
        }
      } catch {
        if (!cancelled) {
          setHasActiveSchoolYear(true)
          setSchoolYearChecked(true)
        }
      }
    }

    if (studioId) check()
    return () => {
      cancelled = true
    }
  }, [router, studioId])

  return (
    <NotificationProvider>
      <div
        className={
          theme === 'dark'
            ? 'dark bg-black min-h-screen overflow-x-hidden'
            : 'bg-slate-50 min-h-screen overflow-x-hidden'
        }
      >
        {!schoolYearChecked || !hasActiveSchoolYear ? (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Laden…</p>
            </div>
          </div>
        ) : (
          <>
            <StudioSidebar studioId={studioId} />

            <FloatingFeedbackButton interface="studio" studioId={studioId} />

            <div className={isMobile ? '' : 'pl-64'}>
              <main className={isMobile ? 'p-4' : 'p-6 lg:p-8'}>
                {permsLoading ? (
                  children
                ) : !isAllowed ? (
                  <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl p-6">
                    <h1 className="text-xl font-bold text-slate-900 mb-2">Geen toegang</h1>
                    <p className="text-sm text-slate-600 mb-4">
                      Je hebt geen toegang tot deze pagina voor deze studio.
                    </p>
                    <button
                      onClick={() => router.push(`/studio/${studioId}`)}
                      className="px-4 py-2 bg-blue-600! text-white rounded-lg hover:bg-blue-700"
                    >
                      Naar dashboard
                    </button>
                  </div>
                ) : (
                  children
                )}
              </main>
            </div>
          </>
        )}
      </div>
    </NotificationProvider>
  )
}
