import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Cart checkout endpoint disabled (Stripe cart checkout removed). Use per-program admin_payment_url instead.',
    },
    { status: 410 },
  )
}

export async function GET() {
  return POST()
}
