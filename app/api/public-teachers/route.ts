import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

    if (userId) {
      const { data, error } = await supabase
        .from('public_teacher_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) return NextResponse.json({ error: error.message || 'db_error' }, { status: 500 })
      return NextResponse.json({ profile: data || null })
    }

    // If no userId provided, return a (small) public list of published profiles
    const { data, error } = await supabase
      .from('public_teacher_profiles')
      .select('id, user_id, first_name, last_name, headline, photo_url')
      .eq('is_public', true)
      .limit(50)

    if (error) return NextResponse.json({ error: error.message || 'db_error' }, { status: 500 })
    return NextResponse.json({ profiles: data || [] })
  } catch (err: any) {
    console.error('GET /api/public-teachers error', err)
    return NextResponse.json({ error: err.message || 'internal' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const admin = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null
  // If service role key is not available (local dev), fall back to using the authenticated user client.
  // This requires RLS or permissions to allow the signed-in user to upsert their own profile.

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    // Normalize dance_style to an array for text[] column support.
    let danceStyles: string[] | null = null
    if (Array.isArray(body.dance_style)) {
      const arr = body.dance_style.map((s: any) => (typeof s === 'string' ? s.trim() : String(s))).filter(Boolean)
      danceStyles = arr.length > 0 ? arr : null
    } else if (typeof body.dance_style === 'string') {
      const parsed = body.dance_style
        .split(/\s*,\s*/)
        .map((s: string) => s.trim())
        .filter(Boolean)
      danceStyles = parsed.length > 0 ? parsed : null
    }

    const payload = {
      user_id: user.id,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      date_of_birth: body.date_of_birth || null,
      headline: body.headline || null,
      bio: body.bio || null,
      contact_email: body.contact_email || user.email || null,
      phone_number: body.phone_number || null,
      website: body.website || null,
      photo_url: body.photo_url || null,
  // dance_style persisted as a text[] in the DB; accept array or CSV input
  dance_style: danceStyles,
      cv: body.cv || null,
      is_public: typeof body.is_public === 'boolean' ? body.is_public : true,
      updated_at: new Date().toISOString()
    }

    // Prefer using the service role client when available (allows admin upsert).
    // If not available (local dev), fall back to using the authenticated supabase client.
    let upsertResult: any = null
    if (admin) {
      const { data, error } = await admin
        .from('public_teacher_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
      upsertResult = { data, error }
    } else {
      const { data, error } = await supabase
        .from('public_teacher_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
      upsertResult = { data, error }
    }

    if (upsertResult.error) {
      console.error('Failed upserting public_teacher_profiles:', upsertResult.error)
      return NextResponse.json({ error: upsertResult.error.message || 'Failed to save profile' }, { status: 500 })
    }

    // upsertResult.data is usually an array of rows; pick first if present
    const saved = Array.isArray(upsertResult.data) ? upsertResult.data[0] : upsertResult.data

    // If we have canonical dance styles and a service role client, synchronize the junction table
    try {
      if (danceStyles && admin && saved && saved.id) {
        // Normalize to slugs and names
        const styles = danceStyles.map(s => ({ name: String(s).trim(), slug: String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }))

        // Insert missing styles into public.dance_styles
        for (const s of styles) {
          await admin.from('dance_styles').upsert({ name: s.name, slug: s.slug, active: true }, { onConflict: 'slug' })
        }

        // Fetch canonical ids
        const { data: canonical, error: canonErr } = await admin.from('dance_styles').select('id,slug').in('slug', styles.map(s => s.slug))
        if (canonErr) throw canonErr
        const ids = (canonical || []).map((c: any) => c.id)

        // Replace links for this teacher_profile_id: delete links not in ids, insert missing ones
        await admin.from('teacher_dance_styles').delete().eq('teacher_profile_id', saved.id).not('dance_style_id', 'in', `(${ids.join(',')})`)

        for (const id of ids) {
          await admin.from('teacher_dance_styles').upsert({ teacher_profile_id: saved.id, dance_style_id: id }, { onConflict: '(teacher_profile_id,dance_style_id)' })
        }
      } else if (danceStyles && !admin) {
        // We can't manage canonical table without service role; log so operators can run migration or provide service key
        console.warn('Received dance styles but no service role available to synchronize teacher_dance_styles; skipping canonical sync.')
      }
    } catch (syncErr) {
      console.error('Failed to sync teacher_dance_styles:', syncErr)
    }

    return NextResponse.json({ success: true, message: 'Publiek docentprofiel opgeslagen', profile: saved || null })
  } catch (err: any) {
    console.error('POST /api/public-teachers error', err)
    return NextResponse.json({ error: err.message || 'internal' }, { status: 500 })
  }
}
