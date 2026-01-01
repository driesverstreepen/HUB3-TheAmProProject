// Script: check_notifications.js
// Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/check_notifications.js <requestId> [teacherId] [requesterId]

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const args = process.argv.slice(2)
const requestId = args[0]
const teacherId = args[1]
const requesterId = args[2]

if (!requestId) {
  console.error('Missing requestId argument')
  process.exit(1)
}

async function run() {
  try {
    console.log('Checking notifications for request:', requestId)

    // Try to fetch notifications that reference the request_id in action_data (JSONB contains)
    const { data: byAction, error: aErr } = await admin
      .from('notifications')
      .select('*')
      .filter('action_data', 'cs', JSON.stringify({ request_id: requestId })) // contains operator

    if (aErr) console.warn('action_data contains query error (ignored):', aErr.message)

    // Fetch notifications for teacher/requester if IDs provided
    const ids = [teacherId, requesterId].filter(Boolean)
    let byUser = []
    if (ids.length > 0) {
      const orQuery = ids.map(id => `user_id.eq.${id}`).join(',')
      const { data: udata, error: uErr } = await admin.from('notifications').select('*').or(orQuery).order('created_at', { ascending: false }).limit(20)
      if (uErr) console.warn('user notifications query error (ignored):', uErr.message)
      byUser = udata || []
    }

    console.log('\nNotifications that contain action_data.request_id:')
    console.table((byAction || []).map(n => ({ id: n.id, user_id: n.user_id, type: n.type, title: n.title, created_at: n.created_at, action_data: n.action_data })))

    if (byUser.length > 0) {
      console.log('\nNotifications for given user IDs:')
      console.table(byUser.map(n => ({ id: n.id, user_id: n.user_id, type: n.type, title: n.title, created_at: n.created_at, action_data: n.action_data })))
    }

    if ((byAction || []).length === 0 && byUser.length === 0) {
      console.log('\nNo notifications found (yet).')
    }
  } catch (err) {
    console.error('Error checking notifications:', err)
    process.exit(1)
  }
}

run()
