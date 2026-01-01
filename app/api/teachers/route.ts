import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studioId = searchParams.get('studioId');

    if (!studioId) {
      return NextResponse.json({ error: 'studioId is required' }, { status: 400 });
    }

    // Use service role client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Optional programId - if provided include teachers assigned to that program
    const programId = searchParams.get('programId')

    try {
      // Collect ids from studio_teachers and (optionally) teacher_programs
      const idsSet = new Set<string>()

      // studio_teachers links
      const { data: teacherLinks, error: linksError } = await supabase
        .from('studio_teachers')
        .select('user_id')
        .eq('studio_id', studioId)

      if (linksError) {
        console.error('Error fetching teacher links:', linksError);
        return NextResponse.json({ error: linksError.message }, { status: 500 });
      }

      ;(teacherLinks || []).forEach((l: any) => l.user_id && idsSet.add(String(l.user_id)))

      // teacher_programs for the specific program (may include teachers not linked via studio_teachers)
      if (programId) {
        const { data: tps, error: tpErr } = await supabase
          .from('teacher_programs')
          .select('teacher_id')
          .eq('program_id', programId)
          .eq('studio_id', studioId)

        if (tpErr) {
          console.error('Error fetching teacher_programs:', tpErr)
          return NextResponse.json({ error: tpErr.message }, { status: 500 })
        }

        ;(tps || []).forEach((t: any) => t.teacher_id && idsSet.add(String(t.teacher_id)))
      }

      const teacherIds = Array.from(idsSet)

      if (teacherIds.length === 0) return NextResponse.json({ teachers: [] }, { status: 200 })

      // Get profile details for these teachers from user_profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, email, first_name, last_name')
        .in('user_id', teacherIds)

      if (profilesError) {
        console.error('Error fetching teacher profiles:', profilesError);
        return NextResponse.json({ error: profilesError.message }, { status: 500 });
      }

      // Transform the data
      const teachers = (profiles || []).map((profile: any) => ({
        id: profile.user_id,
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        naam: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Naamloos',
        email: profile.email || '',
      }));

      return NextResponse.json({ teachers }, { status: 200 });
    } catch (err: any) {
      console.error('Error building teachers list:', err)
      return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Error in teachers API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
