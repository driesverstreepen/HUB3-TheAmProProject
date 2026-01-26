/**
 * Admin server-side studio public view
 * Route: /studio/[id]/public
 * Doel: server-rendered admin view that leeft onder de studio admin-layout
 * (met sidebar). Deze pagina laadt `StudioPublicProfile` op de server en is
 * bedoeld voor studio-admins (preview / server-side rendering of publiceren).
 * Niet bedoeld als de canonical visitor route — bezoekers horen `/studio/public/[id]` te gebruiken.
 */

import { createSupabaseClient } from '@/lib/supabase';
import StudioPublicProfile from '@/components/StudioPublicProfile';
import { FeatureGate } from '@/components/FeatureGate';
import type { Studio, Program } from '@/types/database';

interface Props {
  params: { id: string };
}

export default async function PublicStudioPage({ params }: Props) {
  const supabase = createSupabaseClient();
  const { id: studioId } = await params;

  const { data: studioData } = await supabase.from('studios').select('*').eq('id', studioId).maybeSingle();

  // If school years are deployed, prefer the active year
  let activeYearId: string | null = null;
  try {
    const { data: activeYear, error: activeYearError } = await supabase
      .from('studio_school_years')
      .select('id')
      .eq('studio_id', studioId)
      .eq('is_active', true)
      .maybeSingle();
    if (!activeYearError && activeYear?.id) activeYearId = String(activeYear.id);
  } catch {
    // fail open if table doesn't exist or query fails
  }

  let programsQuery = supabase
    .from('programs')
    .select(`
      *,
      teacher:teachers!teacher_id(first_name, last_name),
      group_details!left(weekday, start_time, end_time, season_start, season_end),
      workshop_details!left(start_datetime, end_datetime),
      locations:program_locations!left(locations(id, name, adres, city))
    `)
    .eq('studio_id', studioId)
    .eq('is_public', true)
  if (activeYearId) programsQuery = programsQuery.eq('school_year_id', activeYearId);

  const { data: programsData } = await programsQuery.order('created_at', { ascending: false });

  const studio = (studioData ?? null) as Studio | null;
  const programs = (programsData ?? []) as Program[];

  // If any programs reference a linked_trial_program_id, fetch those linked programs' titles
  const linkedIds = Array.from(new Set((programs || []).map((p: any) => p.linked_trial_program_id).filter(Boolean)));
  let enrichedPrograms = programs;
  if (linkedIds.length > 0) {
    const { data: linkedData } = await supabase
      .from('programs')
      .select('id, title')
      .in('id', linkedIds as string[]);
    const titleMap: Record<string, string> = {};
    (linkedData || []).forEach((l: any) => { titleMap[l.id] = l.title });
    enrichedPrograms = programs.map((p: any) => ({ ...p, linked_trial_program_title: p.linked_trial_program_id ? titleMap[p.linked_trial_program_id] || null : null }));
  }

  const content = !studio ? (
    <div className="max-w-4xl mx-auto px-4 py-24 text-center text-slate-600">
      Studio niet gevonden.
    </div>
  ) : (
    <StudioPublicProfile studio={studio} programs={enrichedPrograms} />
  );

  return (
    <FeatureGate flagKey="studio.public" mode="page">
      {content}
    </FeatureGate>
  );
}
