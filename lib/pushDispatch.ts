import { createClient } from '@supabase/supabase-js'
import { sendPush, type PushPayload } from '@/lib/pushServer'

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service env not configured')
  }

  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

function isGoneError(e: any) {
  const status = e?.statusCode || e?.status
  return status === 404 || status === 410
}

export async function sendPushToUserIds(userIds: string[], payload: PushPayload) {
  if (!userIds || userIds.length === 0) return { ok: true, attempted: 0, sent: 0 }

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
  if (uniqueUserIds.length === 0) return { ok: true, attempted: 0, sent: 0 }

  const supabase = createServiceClient()

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth,user_id')
    .in('user_id', uniqueUserIds)

  if (error) {
    return { ok: false, attempted: 0, sent: 0, error: error.message }
  }

  let sent = 0
  for (const s of subs || []) {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    }

    try {
      await sendPush(subscription, payload)
      sent += 1
    } catch (e: any) {
      // Clean up dead subscriptions
      if (isGoneError(e)) {
        try {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        } catch {
          // ignore
        }
      }
    }
  }

  return { ok: true, attempted: (subs || []).length, sent }
}
