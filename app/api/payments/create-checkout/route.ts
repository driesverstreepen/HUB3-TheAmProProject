import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Checkout endpoint disabled (Stripe checkout removed). Use the program admin_payment_url directly.',
    },
    { status: 410 },
  )
}

export async function GET() {
  return POST()
}
