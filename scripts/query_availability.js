const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadDotenv(file) {
  const p = path.resolve(file)
  if (!fs.existsSync(p)) return {}
  const src = fs.readFileSync(p, 'utf8')
  const out = {}
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)=(?:"([^"]*)"|'([^']*)'|(.*))\s*$/)
    if (!m) continue
    out[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return out
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length < 1) {
    console.error('Usage: node scripts/query_availability.js <performanceId>')
    process.exit(2)
  }
  const performanceId = argv[0]

  const env = Object.assign({}, loadDotenv('.env.local'), loadDotenv('.env'))
  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing SUPABASE URL or SERVICE role key in .env.local or .env')
    process.exit(2)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const reqResp = await supabase
      .from('ampro_availability_requests')
      .select('*')
      .eq('performance_id', performanceId)
      .maybeSingle()
    console.log('request:', JSON.stringify(reqResp, null, 2))

    if (!reqResp.data?.id) return

    const datesResp = await supabase
      .from('ampro_availability_request_dates')
      .select('*')
      .eq('request_id', reqResp.data.id)
      .order('day', { ascending: true })
    console.log('dates:', JSON.stringify(datesResp, null, 2))

    const usersResp = await supabase
      .from('ampro_availability_request_date_users')
      .select('*')
      .in('request_date_id', (datesResp.data || []).map(d => d.id))
    console.log('assigned users:', JSON.stringify(usersResp, null, 2))

    const responsesResp = await supabase
      .from('ampro_availability_responses')
      .select('*')
      .in('request_date_id', (datesResp.data || []).map(d => d.id))
    console.log('responses:', JSON.stringify(responsesResp, null, 2))
  } catch (err) {
    console.error('Error querying:', err)
  }
}

main()
