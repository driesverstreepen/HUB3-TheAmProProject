import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("cookie");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: authHeader ? { cookie: authHeader } : {} },
    });

    const body = await request.json();
    const { program_id, ampro_program_id } = body;

    if (!program_id && !ampro_program_id) {
      return NextResponse.json({ error: 'Missing program identifier' }, { status: 400 });
    }

    if (program_id) {
      const resp = await supabase
        .from('programs')
        .select('id, admin_payment_url')
        .eq('id', program_id)
        .maybeSingle();

      if (resp.error) return NextResponse.json({ error: 'DB error' }, { status: 500 });
      if (!resp.data) return NextResponse.json({ error: 'Program not found' }, { status: 404 });

      const url = resp.data.admin_payment_url;
      if (!url) return NextResponse.json({ error: 'No admin payment URL configured for this program' }, { status: 400 });

      return NextResponse.json({ url });
    }

    const resp = await supabase
      .from('ampro_programmas')
      .select('id, admin_payment_url')
      .eq('id', ampro_program_id)
      .maybeSingle();

    if (resp.error) return NextResponse.json({ error: 'DB error' }, { status: 500 });
    if (!resp.data) return NextResponse.json({ error: 'Program not found' }, { status: 404 });

    const url = resp.data.admin_payment_url;
    if (!url) return NextResponse.json({ error: 'No admin payment URL configured for this program' }, { status: 400 });

    return NextResponse.json({ url });
  } catch (err: any) {
    console.error('create-checkout error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
