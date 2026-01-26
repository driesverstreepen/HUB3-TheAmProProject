'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, MapPin, TrendingUp, Building2 } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import StripeBannerWrapper from '@/components/studio/StripeBannerWrapper';
import { TrialBanner } from '@/components/subscription/FeatureGate';
import { useStudioFeatures } from '@/hooks/useStudioFeatures';
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears';
import { supabase } from '@/lib/supabase';
import { safeSelect } from '@/lib/supabaseHelpers';
import type { Studio, Program, Location } from '@/types/database';

type PromoCardView = {
  is_visible: boolean;
  title: string;
  description: string;
  button_label: string | null;
  button_href: string | null;
};

export default function StudioDashboard() {
  const params = useParams();
  const studioId = params.id as string;

  const [studio, setStudio] = useState<Studio | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [promoCard, setPromoCard] = useState<PromoCardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrialBanner, setShowTrialBanner] = useState(true);

  const { subscription } = useStudioFeatures(studioId);
  const { selectedYearId: activeYearId } = useStudioSchoolYears(studioId);

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, activeYearId]);

  useEffect(() => {
    let cancelled = false;

    const loadPromo = async () => {
      const { data, error, missingTable } = await safeSelect(
        supabase,
        'promo_cards',
        'interface,is_visible,title,description,button_label,button_href',
        { interface: 'studio' }
      );

      if (cancelled) return;
      if (missingTable || error) {
        setPromoCard(null);
        return;
      }

      const row = Array.isArray(data) ? (data[0] as any) : null;
      if (!row) {
        setPromoCard(null);
        return;
      }

      setPromoCard({
        is_visible: !!row.is_visible,
        title: String(row.title || ''),
        description: String(row.description || ''),
        button_label: row.button_label ? String(row.button_label) : null,
        button_href: row.button_href ? String(row.button_href) : null,
      });
    };

    loadPromo();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedStudioPromoHref = useMemo(() => {
    const href = promoCard?.button_href || '';
    if (!href || href.trim().length === 0) return null;
    return href.includes('{studioId}') ? href.replaceAll('{studioId}', studioId) : href;
  }, [promoCard?.button_href, studioId]);

  const loadDashboardData = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      window.location.href = '/auth/login';
      return;
    }

    const [studioRes, programsRes, locationsRes] = await Promise.all([
      supabase.from('studios').select('*').eq('id', studioId).single(),
      activeYearId
        ? supabase.from('programs').select('*').eq('studio_id', studioId).eq('school_year_id', activeYearId)
        : supabase.from('programs').select('*').eq('studio_id', studioId),
      supabase.from('locations').select('*').eq('studio_id', studioId),
    ]);

    if (studioRes.data) setStudio(studioRes.data as any);
    if (programsRes.data) setPrograms(programsRes.data as any);
    if (locationsRes.data) setLocations(locationsRes.data as any);

    setLoading(false);
  };

  const groupPrograms = programs.filter((p) => p.program_type === 'group');
  const workshops = programs.filter((p) => p.program_type === 'workshop');

  return (
    <FeatureGate flagKey="studio.dashboard" mode="page">
      {loading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <LoadingSpinner size={48} className="mb-4" label="Dashboard laden…" />
            <p className="text-slate-600">Dashboard laden…</p>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-600 mt-1">Welkom bij {studio?.naam}</p>
              </div>

              <a
                href={`/studio/${studioId}/public-profile`}
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 rounded-lg border border-blue-600 text-white hover:bg-blue-700 shadow-sm"
                title="Beheer publiek profiel"
              >
                <Building2 size={16} className="text-white" />
                <span className="text-sm font-medium">Publiek Profiel</span>
              </a>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
              {(programs.length === 0 || locations.length === 0) && (
                <div className="lg:col-span-12 bg-blue-50 border border-blue-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-blue-900 mb-3">Aan de slag</h3>
                  <div className="space-y-2 text-sm text-blue-800">
                    {locations.length === 0 && (
                      <p>
                        → Voeg eerst locaties toe in <strong>Instellingen</strong>
                      </p>
                    )}
                    {programs.length === 0 && (
                      <p>
                        → Maak je eerste programma aan bij <strong>Programma&apos;s</strong>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {subscription?.is_trial_active && showTrialBanner && studioId && subscription.trial_end_date && (
                <div className="lg:col-span-12">
                  <TrialBanner
                    trialDaysRemaining={Math.max(
                      0,
                      Math.ceil(
                        (new Date(subscription.trial_end_date).getTime() - new Date().getTime()) /
                          (1000 * 60 * 60 * 24)
                      )
                    )}
                    studioId={studioId}
                    onClose={() => setShowTrialBanner(false)}
                  />
                </div>
              )}

              <div className="lg:col-span-8">
                <div className="h-full">
                  <StripeBannerWrapper studioId={studioId} />
                </div>
              </div>

              <div className="lg:col-span-4">
                {promoCard?.is_visible ? (
                  <div className="rounded-xl border border-white/10 bg-linear-to-br from-blue-600 via-purple-600 to-blue-800 text-white p-4 h-full overflow-hidden">
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex items-center rounded-md bg-white/15 text-white px-2 py-0.5 text-xs font-semibold">
                        New
                      </span>
                    </div>
                    <div className="mt-2 font-semibold text-white">{promoCard.title}</div>
                    <p className="mt-1 text-sm text-white/85">{promoCard.description}</p>
                    {resolvedStudioPromoHref ? (
                      <a
                        href={resolvedStudioPromoHref}
                        className="mt-3 inline-flex items-center rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
                      >
                        {promoCard.button_label && promoCard.button_label.trim().length > 0 ? promoCard.button_label : 'Bekijk'}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="p-2 sm:p-3 bg-blue-100 border border-blue-200 rounded-lg dark:bg-transparent">
                  <Calendar className="text-blue-600" size={20} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900">{programs.length}</div>
              <div className="text-xs sm:text-sm text-slate-600">Totaal Programma's</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="p-2 sm:p-3 bg-green-100 border border-green-200 rounded-lg dark:bg-transparent">
                  <TrendingUp className="text-green-600" size={20} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900">{groupPrograms.length}</div>
              <div className="text-xs sm:text-sm text-slate-600">Groepscursussen</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="p-2 sm:p-3 bg-purple-100 border border-purple-200 rounded-lg dark:bg-transparent">
                  <Calendar className="text-purple-600" size={20} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900">{workshops.length}</div>
              <div className="text-xs sm:text-sm text-slate-600">Workshops</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="p-2 sm:p-3 bg-orange-100 border border-orange-200 rounded-lg dark:bg-transparent">
                  <MapPin className="text-orange-600" size={20} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900">{locations.length}</div>
              <div className="text-xs sm:text-sm text-slate-600">Locaties</div>
            </div>
          </div>

          {/* Quick Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Studio Informatie</h2>
              <div className="space-y-3">
                {studio?.location && (
                  <div>
                    <span className="text-sm font-medium text-slate-700">Locatie:</span>
                    <p className="text-slate-900">{studio.location}</p>
                  </div>
                )}
                {studio?.contact_email && (
                  <div>
                    <span className="text-sm font-medium text-slate-700">Email:</span>
                    <p className="text-slate-900">{studio.contact_email}</p>
                  </div>
                )}
                {studio?.phone_number && (
                  <div>
                    <span className="text-sm font-medium text-slate-700">Telefoon:</span>
                    <p className="text-slate-900">{studio.phone_number}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Recente Activiteit</h2>
              <div className="space-y-3 text-sm text-slate-600">
                {programs.length === 0 && locations.length === 0 ? (
                  <p>Nog geen activiteit. Begin met het toevoegen van locaties en programma's!</p>
                ) : (
                  <>
                    {programs.length > 0 && (
                      <p>
                        ✓ {programs.length} programma{programs.length !== 1 ? "'s" : ''} aangemaakt
                      </p>
                    )}
                    {locations.length > 0 && (
                      <p>
                        ✓ {locations.length} locatie{locations.length !== 1 ? 's' : ''} toegevoegd
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </FeatureGate>
  );
}
