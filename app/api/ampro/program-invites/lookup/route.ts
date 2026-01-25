import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')?.trim()
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const admin = createSupabaseServiceClient()

    const { data, error } = await admin
      .from('ampro_program_invites')
      .select(
        'id, token, performance_id, expires_at, max_uses, uses_count, revoked_at, ampro_programmas(title, applications_open, is_public)'
      )
      .eq('token', token)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    const now = new Date()
    const expired = data.expires_at ? new Date(String(data.expires_at)) < now : false
    const revoked = !!data.revoked_at
    const maxed = data.max_uses != null ? Number(data.uses_count || 0) >= Number(data.max_uses) : false

    const performance = (data as any).ampro_programmas

    return NextResponse.json({
      invite: {
        id: data.id,
        performance_id: data.performance_id,
        expires_at: data.expires_at,
        max_uses: data.max_uses,
        uses_count: data.uses_count,
        revoked_at: data.revoked_at,
      },
      performance: {
        id: data.performance_id,
        title: performance?.title || 'Programma',
        is_public: performance?.is_public ?? true,
        applications_open: performance?.applications_open ?? true,
      },
      status: {
        revoked,
        expired,
        maxed,
        ok: !revoked && !expired && !maxed,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
