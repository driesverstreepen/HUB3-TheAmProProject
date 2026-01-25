import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Stripe integration removed; webhooks disabled" }, { status: 410 });
}
