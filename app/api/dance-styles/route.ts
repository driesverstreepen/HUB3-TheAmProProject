import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function GET(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data, error } = await supabase
      .from('dance_styles')
      .select('name, slug')
      .eq('active', true)
      .order('name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message || 'db_error' }, { status: 500 })
    return NextResponse.json({ styles: data || [] })
  } catch (err: any) {
    console.error('GET /api/dance-styles error', err)
    return NextResponse.json({ error: err.message || 'internal' }, { status: 500 })
  }
}
