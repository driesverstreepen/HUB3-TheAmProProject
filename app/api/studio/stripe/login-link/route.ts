import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'Stripe integration removed' }, { status: 410 })
}
