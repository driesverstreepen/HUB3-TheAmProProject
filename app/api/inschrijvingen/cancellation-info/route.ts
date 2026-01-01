import { NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/inschrijvingen/cancellation-info
 * Body: { inschrijvingId: string }
 * Returns computed cancellation window info for the given enrollment (cutoff, allowed, label)
 */
export async function POST(request: Request) {
  try {
    const supabase = createSupabaseClient()
    const body = await request.json()
    const { inschrijvingId, programId } = body || {}
    if (!inschrijvingId && !programId) {
      return NextResponse.json({ error: 'Missing inschrijvingId or programId' }, { status: 400 })
    }

    // Load enrollment if inschrijvingId provided (we may also accept programId and compute without an enrollment)
    let inschrijving: any = null
    if (inschrijvingId) {
      const { data, error } = await supabase
        .from('inschrijvingen')
        .select('id, status, program_id')
        .eq('id', inschrijvingId)
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Inschrijving not found' }, { status: 404 })
      inschrijving = data
    }

    // Determine program id to use (from inschrijving or explicit programId)
    const programIdToUse = programId || (inschrijving ? inschrijving.program_id : null)
    if (!programIdToUse) return NextResponse.json({ error: 'Program not specified' }, { status: 400 })

    // Fetch program row (we need this for studio_id and program_type)
    const { data: programRow, error: progErr } = await supabase
      .from('programs')
      .select('id, program_type, studio_id')
      .eq('id', programIdToUse)
      .maybeSingle()
    if (progErr) throw progErr
    if (!programRow) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

    const program = (programRow as any)

    // Determine program start date heuristic
    let startDate: string | null = null
    try {
      if (String(program.program_type || '').toLowerCase() === 'group') {
        // try to fetch season_start from group_details
        const { data: gd } = await supabase
          .from('group_details')
          .select('season_start')
          .eq('program_id', program.id)
          .order('season_start', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (gd && gd.season_start) startDate = gd.season_start
      }
      if (String(program.program_type || '').toLowerCase() === 'workshop') {
        const { data: wd } = await supabase
          .from('workshop_details')
          .select('start_datetime')
          .eq('program_id', program.id)
          .order('start_datetime', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (wd && wd.start_datetime) startDate = wd.start_datetime
      }

      if (!startDate) {
        const { data: lesson } = await supabase
          .from('lessons')
          .select('date')
          .eq('program_id', programIdToUse)
          .order('date', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (lesson && lesson.date) startDate = lesson.date
      }
    } catch (e) {
      console.warn('Could not determine start date for program', e)
    }

    // Fetch the latest studio policy row for this studio
    let policyRow: any = null
    try {
      const studioId = program.studio_id
      if (studioId) {
        const { data: sp } = await supabase
          .from('studio_policies')
          .select(`
            cancellation_policy,
            refund_policy,
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

    const toMs = (value: number | null | undefined, unit: string | null | undefined) => {
      if (value == null) return null
      const v = Number(value)
      if (!isFinite(v)) return null
      const u = (unit || 'days').toLowerCase()
      if (u === 'hours' || u === 'uur') return v * 60 * 60 * 1000
      return v * 24 * 60 * 60 * 1000
    }

    let windowMs: number | null = null
    let label: string | null = null
    if (policyRow) {
      const type = String(program.program_type || '').toLowerCase()
      if (type === 'group') {
        windowMs = toMs(policyRow.cancellation_window_group_value, policyRow.cancellation_window_group_unit)
        if (policyRow.cancellation_window_group_value) label = `${policyRow.cancellation_window_group_value} ${policyRow.cancellation_window_group_unit || 'dagen'}`
      } else if (type === 'workshop') {
        windowMs = toMs(policyRow.cancellation_window_workshop_value, policyRow.cancellation_window_workshop_unit)
        if (policyRow.cancellation_window_workshop_value) label = `${policyRow.cancellation_window_workshop_value} ${policyRow.cancellation_window_workshop_unit || 'dagen'}`
      } else if (type === 'trial') {
        windowMs = toMs(policyRow.cancellation_window_trial_value, policyRow.cancellation_window_trial_unit)
        if (policyRow.cancellation_window_trial_value) label = `${policyRow.cancellation_window_trial_value} ${policyRow.cancellation_window_trial_unit || 'dagen'}`
      }

      if (windowMs == null && policyRow.cancellation_period_days != null) {
        windowMs = Number(policyRow.cancellation_period_days) * 24 * 60 * 60 * 1000
        label = `${policyRow.cancellation_period_days} dagen`
      }
    }

    // compute cutoff and allowed
    let cutoffIso: string | null = null
    let allowed: boolean | null = null
    if (startDate && windowMs != null) {
      const start = new Date(startDate)
      const cutoff = new Date(start.getTime() - windowMs)
      cutoffIso = cutoff.toISOString()
      allowed = new Date() <= cutoff
    } else if (startDate && windowMs == null) {
      // start exists but no window configured -> allowed
      allowed = true
    } else {
      // unknown start -> allowed by default
      allowed = true
    }

    // fetch studio contact info
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
    } catch {
      // ignore
    }

    return NextResponse.json({ allowed, cutoff: cutoffIso, windowLabel: label, cancellation_policy: policyRow?.cancellation_policy ?? null, refund_policy: policyRow?.refund_policy ?? null, contact })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
  }
}
