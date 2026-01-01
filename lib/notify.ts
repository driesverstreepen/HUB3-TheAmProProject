import { createClient } from '@supabase/supabase-js'
import { sendPushToUserIds } from '@/lib/pushDispatch'

export type NotifyInput = {
  userIds: string[]
  type: string
  title: string
  message: string
  action_type?: string | null
  action_data?: any
  url?: string | null
  channels?: {
    inApp?: boolean
    push?: boolean
  }
}

const ALLOWED_NOTIFICATION_TYPES = new Set([
  'teacher_invitation',
  'studio_admin_invitation',
  'info',
  'warning',
  'announcement',
])

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service env not configured')
  }

  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

export async function createNotificationsAndPush(input: NotifyInput) {
  const userIds = Array.from(new Set((input.userIds || []).filter(Boolean)))
  if (userIds.length === 0) return { ok: true as const, created: 0, pushed: 0 }

  const inApp = input.channels?.inApp ?? true
  const push = input.channels?.push ?? true
  if (!inApp && !push) return { ok: true as const, created: 0, pushed: 0 }

  const normalizedType = ALLOWED_NOTIFICATION_TYPES.has(input.type)
    ? input.type
    : 'info'

  const admin = createServiceClient()

  let created = 0
  if (inApp) {
    const rows = userIds.map((userId) => ({
      user_id: userId,
      type: normalizedType,
      title: input.title,
      message: input.message,
      action_type: input.action_type ?? null,
      action_data: input.action_data ?? null,
      read: false,
    }))

    const { error: insertError } = await admin.from('notifications').insert(rows)
    if (insertError) {
      return { ok: false as const, created: 0, pushed: 0, error: insertError.message }
    }
    created = rows.length
  }

  // Best-effort push (if user has no subscription, sendPushToUserIds will just attempt 0)
  let pushed = 0
  if (push) {
    try {
      const payload = {
        title: input.title,
        body: input.message,
        url: input.url ?? undefined,
      }
      const result = await sendPushToUserIds(userIds, payload)
      pushed = result.ok ? result.sent : 0
    } catch {
      pushed = 0
    }
  }

  return { ok: true as const, created, pushed }
}
