"use client"

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type StudioMemberRole = 'owner' | 'admin' | 'bookkeeper' | 'comms'
  | 'viewer'

export function useStudioRolePermissions(studioId?: string) {
  const [role, setRole] = useState<StudioMemberRole | null>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!studioId) {
        setRole(null)
        setPermissions(null)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (!cancelled) {
            setRole(null)
            setPermissions(null)
            setLoading(false)
          }
          return
        }

        const { data: memberRow } = await supabase
          .from('studio_members')
          .select('role')
          .eq('studio_id', studioId)
          .eq('user_id', user.id)
          .maybeSingle()

        const r = (memberRow as any)?.role as StudioMemberRole | undefined
        const resolvedRole = r || null

        if (cancelled) return
        setRole(resolvedRole)

        if (!resolvedRole) {
          setPermissions(null)
          setLoading(false)
          return
        }

        if (resolvedRole === 'owner') {
          setPermissions({ __owner_all: true } as any)
          setLoading(false)
          return
        }

        const { data: permRow } = await supabase
          .from('studio_role_permissions')
          .select('permissions')
          .eq('studio_id', studioId)
          .eq('role', resolvedRole)
          .maybeSingle()

        const perms = (permRow as any)?.permissions as Record<string, boolean> | undefined

        // Conservative fallback: admins can access everything if not configured.
        if (!perms && resolvedRole === 'admin') {
          setPermissions({ __admin_all: true } as any)
          setLoading(false)
          return
        }

        setPermissions(perms || {})
        setLoading(false)
      } catch (err) {
        console.error('Error loading studio role permissions:', err)
        if (!cancelled) {
          setRole(null)
          setPermissions(null)
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [studioId])

  const canAccess = useMemo(() => {
    return (key?: string) => {
      if (!key) return true
      if (!role) return false
      if (role === 'owner') return true
      if (permissions && ((permissions as any).__admin_all || (permissions as any).__owner_all)) return true
      return !!permissions?.[key]
    }
  }, [permissions, role])

  return { role, permissions, canAccess, loading }
}
