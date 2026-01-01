import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotificationsAndPush } from '@/lib/notify'

function formatDateYYYYMMDD(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseLessonStart(dateStr: string, timeStr: string) {
  // NOTE: lessons store date + time separately; this uses server-local timezone.
  // If you need strict timezone handling, store an explicit timezone or timestamptz.
  return new Date(`${dateStr}T${timeStr}:00`)
}

export async function POST(req: Request) {
  const secret = process.env.PUSH_CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'missing_PUSH_CRON_SECRET' }, { status: 500 })
  }

  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ error: 'missing_supabase_env' }, { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  const now = new Date()
  const windowStart = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const windowEnd = new Date(windowStart.getTime() + 10 * 60 * 1000)

  const dateA = formatDateYYYYMMDD(windowStart)
  const dateB = formatDateYYYYMMDD(windowEnd)
  const dateSet = Array.from(new Set([dateA, dateB]))

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, program_id, date, time, program:programs(title, program_type)')
    .in('date', dateSet)

  if (lessonsError) {
    return NextResponse.json({ error: 'lessons_query_failed', details: lessonsError.message }, { status: 500 })
  }

  let remindersAttempted = 0
  let remindersSent = 0

  const candidates = (lessons || []).filter((l: any) => {
    if (!l?.date || !l?.time) return false
    const program = Array.isArray(l?.program) ? l.program[0] : l.program
    if (program?.program_type !== 'workshop') return false
    const start = parseLessonStart(String(l.date).slice(0, 10), String(l.time).slice(0, 5))
    return start >= windowStart && start < windowEnd
  })

  for (const lesson of candidates) {
    const programId = lesson.program_id
    const program = Array.isArray((lesson as any)?.program) ? (lesson as any).program[0] : (lesson as any).program
    const programTitle = program?.title || 'Workshop'

    const { data: enrollments, error: enrollError } = await supabase
      .from('inschrijvingen')
      .select('user_id')
      .eq('program_id', programId)
      .eq('status', 'actief')

    if (enrollError) {
      continue
    }

    const userIds = Array.from(new Set((enrollments || []).map((e: any) => e?.user_id).filter(Boolean)))
    if (userIds.length === 0) continue

    const kind = 'workshop_reminder_8h'

    const { data: existingLogs, error: logError } = await supabase
      .from('push_notification_log')
      .select('user_id')
      .eq('kind', kind)
      .eq('lesson_id', lesson.id)
      .in('user_id', userIds)

    if (logError) {
      continue
    }

    const alreadySent = new Set((existingLogs || []).map((r: any) => r?.user_id).filter(Boolean))
    const remainingUserIds = userIds.filter((id) => !alreadySent.has(id))
    if (remainingUserIds.length === 0) continue

    remindersAttempted += remainingUserIds.length

    const notifyResult = await createNotificationsAndPush({
      userIds: remainingUserIds,
      type: 'info',
      title: 'Herinnering: workshop',
      message: `${programTitle} start binnen 8 uur.`,
      action_type: 'view_program',
      action_data: { program_id: programId },
      url: `/program/${programId}`,
    })
    if (notifyResult.ok) remindersSent += notifyResult.pushed

    const scheduledFor = windowStart.toISOString()
    const rows = remainingUserIds.map((userId) => ({
      user_id: userId,
      kind,
      lesson_id: lesson.id,
      program_id: programId,
      scheduled_for: scheduledFor,
    }))

    await supabase
      .from('push_notification_log')
      .upsert(rows, { onConflict: 'user_id,kind,lesson_id', ignoreDuplicates: true })
  }

  return NextResponse.json({
    ok: true,
    window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
    lessonsConsidered: (lessons || []).length,
    workshopCandidates: candidates.length,
    remindersAttempted,
    pushesSent: remindersSent,
  })
}
