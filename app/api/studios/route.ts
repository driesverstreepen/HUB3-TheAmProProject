import { NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createSupabaseClient()
    
    const { data, error } = await supabase
      .from('studios')
      .select('*')
      .order('naam', { ascending: true })

    if (error) throw error

    return NextResponse.json({ studios: data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from('studios')
      .insert(body)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ studio: data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
