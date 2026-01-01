"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { safeSelect, safeUpdate } from '@/lib/supabaseHelpers';

export type StudioSchoolYearRow = {
  id: string;
  studio_id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
};

type StudioUserSchoolYearPreferenceRow = {
  selected_school_year_id: string | null;
};

export function useStudioSchoolYears(studioId?: string) {
  const [years, setYears] = useState<StudioSchoolYearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!studioId) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: selError, missingTable: mt } = await safeSelect(
        supabase,
        'studio_school_years',
        'id,studio_id,label,starts_on,ends_on,is_active',
        { studio_id: studioId },
      );

      if (mt) {
        setMissingTable(true);
        setYears([]);
        return;
      }

      if (selError) {
        setError('Schooljaren laden mislukt.');
        setYears([]);
        return;
      }

      const rows = (Array.isArray(data) ? data : data ? [data] : []) as any[];
      const mapped = rows
        .map((r) => ({
          id: String(r.id),
          studio_id: String(r.studio_id),
          label: String(r.label || ''),
          starts_on: String(r.starts_on || ''),
          ends_on: String(r.ends_on || ''),
          is_active: !!r.is_active,
        }))
        .sort((a, b) => (a.starts_on || '').localeCompare(b.starts_on || ''));

      setMissingTable(false);
      setYears(mapped);

      // Best-effort per-user selection (fail open if table isn't deployed yet).
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = (authData as any)?.user?.id as string | undefined;
        if (!userId) return;

        const { data: pref, error: prefError, missingTable: prefMissing } = await safeSelect(
          supabase,
          'studio_user_school_year_preferences',
          'selected_school_year_id',
          { studio_id: studioId, user_id: userId },
        );

        if (prefMissing) {
          // Optional; fall back to localStorage.
          return;
        }

        if (prefError) {
          // Optional; ignore.
          return;
        }

        const row = ((Array.isArray(pref) ? pref[0] : pref) ?? null) as any;
        const preferredId = (row as StudioUserSchoolYearPreferenceRow | null)?.selected_school_year_id ?? null;
        if (preferredId && mapped.some((y) => y.id === preferredId)) {
          setSelectedYearId(preferredId);
        }
      } catch {
        // ignore
      }
    } catch (e) {
      setError('Schooljaren laden mislukt.');
      setYears([]);
    } finally {
      setLoading(false);
    }
  }, [studioId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeYear = useMemo(() => years.find((y) => y.is_active) || null, [years]);

  const effectiveYearId = useMemo(() => {
    if (selectedYearId && years.some((y) => y.id === selectedYearId)) return selectedYearId;
    return activeYear?.id || null;
  }, [years, selectedYearId, activeYear?.id]);

  const selectedYear = useMemo(() => {
    if (!effectiveYearId) return null;
    return years.find((y) => y.id === effectiveYearId) || null;
  }, [years, effectiveYearId]);

  // LocalStorage fallback for selection (only used if DB preference isn't present).
  useEffect(() => {
    if (!studioId) return;
    if (selectedYearId) return;
    try {
      const key = `studio:${studioId}:selectedSchoolYearId`;
      const value = window.localStorage.getItem(key);
      if (value) setSelectedYearId(value);
    } catch {
      // ignore
    }
  }, [studioId, selectedYearId]);

  const setActiveYear = useCallback(
    async (schoolYearId: string) => {
      if (!studioId) return { ok: false, message: 'Studio ontbreekt.' };
      if (!schoolYearId) return { ok: false, message: 'Schooljaar ontbreekt.' };

      // Do not attempt if table isn't there yet.
      if (missingTable) return { ok: false, message: 'Schooljaren zijn nog niet beschikbaar.' };

      setLoading(true);
      setError(null);
      try {
        // First disable all for the studio
        const off = await safeUpdate(
          supabase,
          'studio_school_years',
          { is_active: false },
          { studio_id: studioId },
        );

        if ((off as any)?.missingTable) {
          setMissingTable(true);
          return { ok: false, message: 'Schooljaren zijn nog niet beschikbaar.' };
        }

        if ((off as any)?.error) {
          return { ok: false, message: 'Kon actief schooljaar niet wijzigen.' };
        }

        const on = await safeUpdate(
          supabase,
          'studio_school_years',
          { is_active: true },
          { id: schoolYearId },
        );

        if ((on as any)?.error) {
          return { ok: false, message: 'Kon actief schooljaar niet wijzigen.' };
        }

        await refresh();
        return { ok: true };
      } catch {
        return { ok: false, message: 'Kon actief schooljaar niet wijzigen.' };
      } finally {
        setLoading(false);
      }
    },
    [studioId, missingTable, refresh],
  );

  const setSelectedYear = useCallback(
    async (schoolYearId: string | null) => {
      if (!studioId) return { ok: false, message: 'Studio ontbreekt.' };

      setSelectedYearId(schoolYearId);
      try {
        const key = `studio:${studioId}:selectedSchoolYearId`;
        if (schoolYearId) window.localStorage.setItem(key, schoolYearId);
        else window.localStorage.removeItem(key);
      } catch {
        // ignore
      }

      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = (authData as any)?.user?.id as string | undefined;
        if (!userId) return { ok: true };

        const res = await supabase
          .from('studio_user_school_year_preferences')
          .upsert(
            {
              studio_id: studioId,
              user_id: userId,
              selected_school_year_id: schoolYearId,
              updated_at: new Date().toISOString(),
            } as any,
            { onConflict: 'studio_id,user_id' },
          );

        if ((res as any)?.error?.code === 'PGRST205') {
          // Optional table not deployed.
          return { ok: true };
        }
      } catch {
        // Optional; ignore.
      }

      return { ok: true };
    },
    [studioId],
  );

  return {
    years,
    activeYear,
    activeYearId: activeYear?.id || null,
    selectedYear,
    selectedYearId: effectiveYearId,
    loading,
    missingTable,
    error,
    refresh,
    setActiveYear,
    setSelectedYear,
  };
}
