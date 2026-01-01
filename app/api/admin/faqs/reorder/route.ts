import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('cookie')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { cookie: authHeader } }
    })

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check super_admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .single()

    if (!roleData) return NextResponse.json({ error: 'Forbidden: Super admin required' }, { status: 403 })

    const body = await request.json()
    const { items } = body
    if (!items || !Array.isArray(items)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    // Call the DB function to reorder atomically
    const { data, error } = await supabaseClient.rpc('reorder_faqs', { rows_json: JSON.stringify(items) })
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error reordering faqs', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
