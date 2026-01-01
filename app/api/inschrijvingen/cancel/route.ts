import { NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/inschrijvingen/cancel
 * Body: { inschrijvingId: string }
 * Validates the studio's cancellation_period_days and updates the inschrijving status to 'geannuleerd'
 */
export async function POST(request: Request) {
  try {
    const supabase = createSupabaseClient()
    const body = await request.json()
    const { inschrijvingId } = body || {}

    if (!inschrijvingId) {
      return NextResponse.json({ error: 'Missing inschrijvingId' }, { status: 400 })
    }

    // Get current user
    const { data: authData } = await supabase.auth.getUser()
    const user = (authData as any)?.data?.user
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Load enrollment and program info
    const { data: inschrijving, error: insErr } = await supabase
      .from('inschrijvingen')
      .select('id, status, inschrijving_datum, program_id, user_id, program:programs(id, program_type, studio_id)')
      .eq('id', inschrijvingId)
      .maybeSingle()

    if (insErr) throw insErr
    if (!inschrijving) return NextResponse.json({ error: 'Inschrijving not found' }, { status: 404 })

    // Only the owner may cancel via this endpoint (studio admins could have a separate flow)
    if (inschrijving.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (inschrijving.status === 'geannuleerd') {
      return NextResponse.json({ error: 'Already cancelled' }, { status: 400 })
    }

    // Determine program start date heuristic
    let startDate: string | null = null

    try {
      const program = (inschrijving as any).program
      if (program) {
        // For group programs, prefer season_start from group_details.
        if (program.program_type === 'group') {
          const { data: gd } = await supabase
            .from('group_details')
            .select('season_start')
            .eq('program_id', program.id)
            .maybeSingle()
          if (gd && (gd as any).season_start) startDate = (gd as any).season_start
        }
        // for workshops, try to fetch workshop_details
        if (program.program_type === 'workshop') {
          const { data: wd } = await supabase
            .from('workshop_details')
            .select('start_datetime')
            .eq('program_id', program.id)
            .order('start_datetime', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (wd && wd.start_datetime) startDate = wd.start_datetime
        }
      }

      // fallback: try to pick the earliest lesson date
      if (!startDate) {
        const { data: lesson } = await supabase
          .from('lessons')
          .select('date')
          .eq('program_id', inschrijving.program_id)
          .order('date', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (lesson && lesson.date) startDate = lesson.date
      }
    } catch (e) {
      // ignore and continue; if we can't determine start date we'll allow cancellation by default
      console.warn('Could not determine start date for inschrijving', e)
    }

    // Fetch the latest studio policy row for this studio (includes per-program-type windows)
    let policyRow: any = null
    try {
      const studioId = (inschrijving as any).program?.studio_id
      if (studioId) {
        const { data: sp } = await supabase
          .from('studio_policies')
          .select(`
            cancellation_policy,
            cancellation_period_days,
            cancellation_window_group_value,
            cancellation_window_group_unit,
            cancellation_window_workshop_value,
            cancellation_window_workshop_unit,
            cancellation_window_trial_value,
            cancellation_window_trial_unit
          `)
          .eq('studio_id', studioId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()
        policyRow = sp ?? null
      }
    } catch (e) {
      console.warn('Failed to read studio_policies', e)
    }

    // Determine applicable cancellation window in milliseconds
    const now = new Date()
    let windowMs: number | null = null
    const program = (inschrijving as any).program || {}

    const toMs = (value: number | null | undefined, unit: string | null | undefined) => {
      if (value == null) return null
      const v = Number(value)
      if (!isFinite(v)) return null
      const u = (unit || 'days').toLowerCase()
      if (u === 'hours' || u === 'uur') return v * 60 * 60 * 1000
      // default to days
      return v * 24 * 60 * 60 * 1000
    }

    if (policyRow) {
      // choose per program type
      const type = String(program.program_type || '').toLowerCase()
      if (type === 'group') {
        windowMs = toMs(policyRow.cancellation_window_group_value, policyRow.cancellation_window_group_unit)
      } else if (type === 'workshop') {
        windowMs = toMs(policyRow.cancellation_window_workshop_value, policyRow.cancellation_window_workshop_unit)
      } else if (type === 'trial') {
        windowMs = toMs(policyRow.cancellation_window_trial_value, policyRow.cancellation_window_trial_unit)
      }

      // fallback to legacy cancellation_period_days when per-type not configured
      if (windowMs == null && policyRow.cancellation_period_days != null) {
        windowMs = Number(policyRow.cancellation_period_days) * 24 * 60 * 60 * 1000
      }
    }

    // If we have a start date and a configured window, enforce the policy
    if (startDate && windowMs != null) {
      const start = new Date(startDate)
      const cutoff = new Date(start.getTime() - windowMs)
      if (now > cutoff) {
        // Fetch studio contact info to surface to the user
        let contact: any = null
        try {
          const studioId = program?.studio_id
          if (studioId) {
            const { data: studio } = await supabase
              .from('studios')
              .select('contact_email, phone_number')
              .eq('id', studioId)
              .maybeSingle()
            contact = studio ?? null
          }
        } catch (e) {
          // ignore
        }

        const policyHtml = policyRow?.cancellation_policy ?? null
        // Localized Dutch message with contact suggestion
        const msg = 'Je kunt je niet meer uitschrijven: de annuleringsperiode is verstreken. Neem contact op met de studio voor hulp.'
        return NextResponse.json({ error: msg, cancellation_policy: policyHtml, contact }, { status: 403 })
      }
    }

    // If no start date or no cancellationDays configured, allow cancellation
    const { data: updated, error: updErr } = await supabase
      .from('inschrijvingen')
      .update({ status: 'geannuleerd', updated_at: new Date().toISOString() })
      .eq('id', inschrijvingId)
      .select()
      .maybeSingle()

    if (updErr) throw updErr

    return NextResponse.json({ success: true, inschrijving: updated })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
  }
}
