import { NextResponse } from "next/server";

export async function POST() {
    return NextResponse.json({ error: 'Stripe integration disabled. Use admin payment URLs configured in the studio.' }, { status: 410 })
}
