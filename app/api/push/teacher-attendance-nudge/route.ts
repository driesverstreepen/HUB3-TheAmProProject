import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotificationsAndPush } from '@/lib/notify'

function formatDateYYYYMMDD(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseLessonStart(dateStr: string, timeStr: string) {
  return new Date(`${dateStr}T${timeStr}:00`)
}

export async function POST(req: Request) {
  const secret = process.env.PUSH_CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'missing_PUSH_CRON_SECRET' }, { status: 500 })

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
  // Scan recent lessons only (last 3 days) to keep it cheap
  const startScan = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const dateA = formatDateYYYYMMDD(startScan)
  const dateB = formatDateYYYYMMDD(now)

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, program_id, teacher_id, date, time, duration_minutes')
    .gte('date', dateA)
    .lte('date', dateB)

  if (lessonsError) {
    return NextResponse.json({ error: 'lessons_query_failed', details: lessonsError.message }, { status: 500 })
  }

  let lessonsConsidered = (lessons || []).length
  let lessonsNeedingNudge = 0
  let nudgesAttempted = 0
  let pushesSent = 0

  for (const lesson of lessons || []) {
    const teacherId = (lesson as any).teacher_id
    if (!teacherId) continue
    if (!lesson.date || !lesson.time || !lesson.duration_minutes) continue

    const start = parseLessonStart(String(lesson.date).slice(0, 10), String(lesson.time).slice(0, 5))
    const end = new Date(start.getTime() + Number(lesson.duration_minutes) * 60 * 1000)
    const nudgeAt = new Date(end.getTime() + 8 * 60 * 60 * 1000)

    if (now < nudgeAt) continue

    // Has any attendance been marked for this lesson?
    const { count: attendanceCount, error: attErr } = await supabase
      .from('lesson_attendances')
      .select('*', { count: 'exact', head: true })
      .eq('lesson_id', lesson.id)

    if (attErr) continue
    if ((attendanceCount || 0) > 0) continue

    lessonsNeedingNudge += 1

    const kind = 'teacher_attendance_missing_8h'

    const { data: existingLogs, error: logError } = await supabase
      .from('push_notification_log')
      .select('user_id')
      .eq('kind', kind)
      .eq('lesson_id', lesson.id)
      .eq('user_id', teacherId)
      .maybeSingle()

    if (logError) continue
    if (existingLogs) continue

    nudgesAttempted += 1

    // Need studio_id for a useful link
    const { data: programRow } = await supabase
      .from('programs')
      .select('studio_id')
      .eq('id', lesson.program_id)
      .maybeSingle()

    const studioId = (programRow as any)?.studio_id || null
    const url = studioId ? `/studio/${studioId}/attendance` : '/teacher/dashboard'

    const notifyResult = await createNotificationsAndPush({
      userIds: [teacherId],
      type: 'warning',
      title: 'Aanwezigheden ontbreken',
      message: 'Je hebt nog geen aanwezigheden ingevuld voor je laatste les. Vul dit even aan.',
      action_type: 'fill_attendance',
      action_data: { lesson_id: lesson.id, studio_id: studioId, program_id: lesson.program_id },
      url,
    })

    if (notifyResult.ok) pushesSent += notifyResult.pushed

    await supabase
      .from('push_notification_log')
      .insert({
        user_id: teacherId,
        kind,
        lesson_id: lesson.id,
        program_id: lesson.program_id,
        scheduled_for: nudgeAt.toISOString(),
      })
  }

  return NextResponse.json({
    ok: true,
    lessonsConsidered,
    lessonsNeedingNudge,
    nudgesAttempted,
    pushesSent,
  })
}
