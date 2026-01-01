import { createClient } from '@supabase/supabase-js'
import { createNotificationsAndPush } from '@/lib/notify'

type EnrollmentChannel = 'none' | 'in_app' | 'push'

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

function getStudentDisplayName(snapshot: any): string {
  const firstName = String(snapshot?.first_name || '').trim()
  const lastName = String(snapshot?.last_name || '').trim()
  const full = `${firstName} ${lastName}`.trim()
  return full || 'Iemand'
}

export async function notifyStudioAdminsOnEnrollment(input: {
  studioId: string
  programId: string
  enrollmentId?: string | null
  enrolledUserId: string
  profileSnapshot?: any
  programTitle?: string | null
}) {
  const admin = createServiceClient()
  if (!admin) return

  const studioId = String(input.studioId)
  const programId = String(input.programId)
  const enrolledUserId = String(input.enrolledUserId)
  const enrollmentId = input.enrollmentId ? String(input.enrollmentId) : null

  // Resolve recipients (owner + admins)
  const [{ data: studioRow }, { data: members }] = await Promise.all([
    admin.from('studios').select('id, eigenaar_id').eq('id', studioId).maybeSingle(),
    admin
      .from('studio_members')
      .select('user_id, role')
      .eq('studio_id', studioId)
      .in('role', ['owner', 'admin']),
  ])

  const recipientIds = new Set<string>()
  const ownerId = studioRow?.eigenaar_id ? String(studioRow.eigenaar_id) : null
  if (ownerId) recipientIds.add(ownerId)
  for (const row of (members || []) as any[]) {
    if (row?.user_id) recipientIds.add(String(row.user_id))
  }

  recipientIds.delete(enrolledUserId)

  const allRecipients = Array.from(recipientIds)
  if (allRecipients.length === 0) return

  // Load preferences in one query (new table), fallback to legacy table if not deployed.
  let prefsRows: any[] | null = null
  try {
    const { data, error } = await admin
      .from('studio_notification_preferences')
      .select('user_id, disable_all, enrollment_channel')
      .eq('studio_id', studioId)
      .in('user_id', allRecipients)
    if (!error) prefsRows = (data as any[]) || []
  } catch {
    // ignore
  }

  if (!prefsRows) {
    const { data } = await admin
      .from('studio_enrollment_notification_preferences')
      .select('user_id, disable_all, enrollment_channel')
      .eq('studio_id', studioId)
      .in('user_id', allRecipients)
    prefsRows = (data as any[]) || []
  }

  const prefByUser = new Map<string, { disable_all: boolean; enrollment_channel: EnrollmentChannel }>()
  for (const row of (prefsRows || []) as any[]) {
    prefByUser.set(String(row.user_id), {
      disable_all: !!row.disable_all,
      enrollment_channel: (row.enrollment_channel as EnrollmentChannel) || 'push',
    })
  }

  // Apply defaults when no row exists
  const inAppRecipients: string[] = []
  const pushRecipients: string[] = []

  for (const userId of allRecipients) {
    const pref = prefByUser.get(userId) || { disable_all: false, enrollment_channel: 'push' as EnrollmentChannel }
    if (pref.disable_all) continue
    if (pref.enrollment_channel === 'none') continue
    if (pref.enrollment_channel === 'in_app') inAppRecipients.push(userId)
    if (pref.enrollment_channel === 'push') pushRecipients.push(userId)
  }

  if (inAppRecipients.length === 0 && pushRecipients.length === 0) return

  // Best-effort dedupe when we have an enrollmentId (Stripe webhooks can retry)
  const filterAlreadyNotified = async (userIds: string[]) => {
    if (!enrollmentId || userIds.length === 0) return userIds

    const { data: existing } = await admin
      .from('notifications')
      .select('user_id')
      .eq('action_type', 'studio_enrollment')
      .contains('action_data', { enrollment_id: enrollmentId })
      .in('user_id', userIds)

    const already = new Set((existing || []).map((r: any) => String(r.user_id)))
    return userIds.filter((id) => !already.has(id))
  }

  const [finalInApp, finalPush] = await Promise.all([
    filterAlreadyNotified(inAppRecipients),
    filterAlreadyNotified(pushRecipients),
  ])

  const studentName = getStudentDisplayName(input.profileSnapshot)
  const programTitle = (input.programTitle || '').trim() || 'een programma'

  const title = 'Nieuwe inschrijving'
  const message = `${studentName} heeft zich ingeschreven voor ${programTitle}.`
  const url = `/studio/${studioId}/programs/${programId}/attendance`

  const actionData = {
    studio_id: studioId,
    program_id: programId,
    enrollment_id: enrollmentId,
    url,
  }

  if (finalInApp.length > 0) {
    await createNotificationsAndPush({
      userIds: finalInApp,
      type: 'info',
      title,
      message,
      action_type: 'studio_enrollment',
      action_data: actionData,
      url,
      channels: { inApp: true, push: false },
    })
  }

  if (finalPush.length > 0) {
    await createNotificationsAndPush({
      userIds: finalPush,
      type: 'info',
      title,
      message,
      action_type: 'studio_enrollment',
      action_data: actionData,
      url,
      // push channel mirrors user settings: push implies in-app + push
      channels: { inApp: true, push: true },
    })
  }
}
