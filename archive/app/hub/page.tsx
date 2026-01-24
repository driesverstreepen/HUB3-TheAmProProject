"use client";

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'next/navigation';
import HubTopNav from '@/components/hub/HubTopNav';
import HubMobileTopNav from '@/components/hub/HubMobileTopNav';
import { useDevice } from '@/contexts/DeviceContext';
import { HubBottomNav } from '@/components/hub/HubBottomNav';
import ProgramCard from '@/components/ProgramCard';
import { Calendar, Users, ArrowRight, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { formatDateOnly, formatTimeFromDate, formatTimeStr } from '@/lib/formatting';

export default function HubHomePage() {
  const { isMobile } = useDevice();
  const router = useRouter();
  const { isEnabled } = useFeatureFlags();
  const showBottomNav = isEnabled('ui.bottom-nav', true);
  const useMobileV2 = isMobile && isEnabled('ui.mobile-v2', false);

  const [searchText, setSearchText] = useState('');

  const [stats, setStats] = useState({
    totalWorkshops: 0,
    totalTeachers: 0,
    totalStudios: 0,
  });
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const [programs, setPrograms] = useState<any[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(true);

  useEffect(() => {
    loadStats();
    loadPublicPrograms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPublicPrograms = async () => {
    setLoadingPrograms(true);
    try {
      const res = await fetch('/api/hub/featured-programs');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load featured programs');
      setPrograms((json?.programs as any[]) || []);
    } catch (err: any) {
      console.error('Failed to load public programs for preview:', err?.message ?? JSON.stringify(err));
      setPrograms([]);
    } finally {
      setLoadingPrograms(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch('/api/hub/stats');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load stats');

      setStats({
        totalWorkshops: json.totalWorkshops || 0,
        totalTeachers: json.totalTeachers || 0,
        totalStudios: json.totalStudios || 0,
      });
      setLoading(false);
    } catch (error) {
      console.error('Error loading stats:', error);
      setLoading(false);
    }
  };

  const isTrialProgram = (p: any) => {
    const t = String((p as any).program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (p?.is_trial) return true;
    if (p?.title && String(p.title).toLowerCase().includes('proef')) return true;
    if (p?.price === 0) return true;
    return false;
  };

  const cursorBase = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const cursorMuted = theme === 'dark' ? 'text-white/70' : 'text-slate-600';

  const contentPaddingStyle = {
    paddingBottom: showBottomNav ? 'calc(3rem + env(safe-area-inset-bottom) + 12px)' : undefined,
  } as any;

  const V2Section = ({ title, items }: { title: string; items: any[] }) => {
    if (!items || items.length === 0) return null;
    return (
      <div>
        <div className="flex items-center justify-between">
          <h3 className={`${cursorBase} text-sm font-semibold`}>{title}</h3>
        </div>

        <div className="relative left-1/2 right-1/2 -translate-x-1/2 w-screen">
          <div className="relative overflow-hidden">
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 left-0 w-8 z-10 ${
                theme === 'dark' ? 'bg-linear-to-r from-black to-transparent' : 'bg-linear-to-r from-gray-50 to-transparent'
              }`}
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 right-0 w-8 z-10 ${
                theme === 'dark' ? 'bg-linear-to-l from-black to-transparent' : 'bg-linear-to-l from-gray-50 to-transparent'
              }`}
            />

            <div className="overflow-x-auto">
              <div
                className="flex min-w-max items-stretch gap-4 py-2"
                style={{
                  paddingBottom: 6,
                  paddingLeft: 'max(16px, calc(50vw - 180px))',
                  paddingRight: 'max(16px, calc(50vw - 180px))',
                }}
              >
                {items.map((p: any) => (
                  <div key={p.id} className="w-[360px] shrink-0">
                    <ProgramCard program={p} onOpen={() => (window.location.href = `/program/${p.id}`)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getWorkshopMeta = (p: any) => {
    const workshopFirst = p?.workshop_details ? (Array.isArray(p.workshop_details) ? p.workshop_details[0] : p.workshop_details) : null;
    if (!workshopFirst) return null;

    const workshopDateRaw = workshopFirst?.date ?? workshopFirst?.start_datetime ?? null;
    const displayDate = workshopDateRaw ? formatDateOnly(String(workshopDateRaw)) : '';

    const displayStart = workshopFirst?.start_time
      ? formatTimeStr(String(workshopFirst.start_time))
      : workshopFirst?.start_datetime
      ? formatTimeFromDate(String(workshopFirst.start_datetime))
      : '';
    return { displayDate, displayStart };
  };

  const CompactProgramCard = ({ program }: { program: any }) => {
    const studioName = String(program?.studio?.naam || '').trim();
    const meta = program?.program_type === 'workshop' ? getWorkshopMeta(program) : null;
    const price = typeof program?.price === 'number' ? program.price : null;

    return (
      <button
        onClick={() => router.push(`/program/${program.id}`)}
        className="relative w-[300px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition-transform active:scale-[0.99] dark:border-white/10 dark:bg-white/5"
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`${cursorBase} text-base font-bold leading-snug line-clamp-2`}>{program.title}</div>
              {studioName ? <div className={`${cursorMuted} mt-1 text-sm line-clamp-1`}>{studioName}</div> : null}
            </div>
            {price !== null ? (
              <div className="shrink-0 text-right">
                <div className={`${cursorBase} text-sm font-bold`}>€{price}</div>
              </div>
            ) : null}
          </div>

          {meta?.displayDate || meta?.displayStart ? (
            <div className={`${cursorMuted} mt-3 flex items-center gap-2 text-xs font-semibold`}
            >
              <Calendar className="h-4 w-4" />
              <span>{[meta.displayDate, meta.displayStart].filter(Boolean).join(' • ')}</span>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${
                program.program_type === 'workshop'
                  ? 'bg-orange-500'
                  : program.program_type === 'group'
                  ? 'bg-blue-500'
                  : 'bg-emerald-500'
              }`} />
              <span className={`${cursorMuted} text-xs font-semibold`}>{program.program_type === 'workshop' ? 'Workshop' : program.program_type === 'group' ? 'Cursus' : 'Programma'}</span>
            </div>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Bekijk</span>
          </div>
        </div>
      </button>
    );
  };

  const V2Row = ({ items }: { items: any[] }) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="relative left-1/2 right-1/2 -translate-x-1/2 w-screen">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex min-w-max gap-4 px-4 pb-1">
            {items.map((p: any) => (
              <CompactProgramCard key={p.id} program={p} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const v2Buckets = useMemo(() => {
    const cursussen = programs.filter(p => p.program_type === 'group' && !isTrialProgram(p)).slice(0, 8);
    const workshops = programs.filter(p => p.program_type === 'workshop').slice(0, 8);
    const proeflessen = programs.filter(p => isTrialProgram(p)).slice(0, 8);
    const uitgelicht = [...cursussen.slice(0, 2), ...workshops.slice(0, 2)].slice(0, 4);

    return { cursussen, workshops, proeflessen, uitgelicht };
  }, [programs]);

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-gray-50'}`}>
      {isMobile ? <HubMobileTopNav /> : <HubTopNav />}

      {useMobileV2 ? (
        <div className="pb-10" style={contentPaddingStyle}>
          {/* Sticky discover header (inspired by reference) */}
          <header className={`sticky top-0 z-20 px-4 pt-6 pb-3 backdrop-blur-md ${theme === 'dark' ? 'bg-black/80' : 'bg-gray-50/90'} border-b ${theme === 'dark' ? 'border-white/5' : 'border-slate-200/60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className={`${cursorBase} text-3xl font-bold tracking-tight leading-tight`}>HUB3</h2>
                <p className={`${cursorMuted} text-sm mt-1`}>Ontdek dans in jouw buurt</p>
              </div>
              <div className={`h-10 w-10 rounded-full border ${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'} shrink-0`} />
            </div>

            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                router.push('/hub/workshops');
              }}
            >
              <div className={`flex h-12 items-center rounded-full border ${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'} overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/30`}>
                <div className="flex items-center justify-center pl-4 text-slate-400">
                  <Search className="h-5 w-5" />
                </div>
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className={`w-full h-full bg-transparent border-none px-3 text-base focus:ring-0 ${cursorBase} placeholder:text-slate-400`}
                  placeholder="Zoek workshops, studio's..."
                />
                <button
                  type="button"
                  onClick={() => router.push('/hub/workshops')}
                  className={`mr-1 h-10 w-10 rounded-full flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-300' : 'bg-blue-500/10 hover:bg-blue-500/15 text-blue-700'}`}
                  aria-label="Filters"
                >
                  <SlidersHorizontal className="h-5 w-5" />
                </button>
              </div>
            </form>
          </header>

          {/* Category chips */}
          <section className="w-full pl-4 py-3">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pr-4">
              <button
                onClick={() => router.push('/hub')}
                className="flex h-9 shrink-0 items-center justify-center rounded-full bg-blue-600 px-5 text-white text-sm font-semibold shadow-sm active:scale-95"
              >
                Alles
              </button>
              <button
                onClick={() => router.push('/hub/workshops')}
                className={`flex h-9 shrink-0 items-center justify-center rounded-full px-5 text-sm font-medium active:scale-95 border ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white/80' : 'bg-white border-slate-200 text-slate-700'}`}
              >
                Workshops
              </button>
              <button
                onClick={() => router.push('/hub/studios')}
                className={`flex h-9 shrink-0 items-center justify-center rounded-full px-5 text-sm font-medium active:scale-95 border ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white/80' : 'bg-white border-slate-200 text-slate-700'}`}
              >
                Studio's
              </button>
              <button
                onClick={() => router.push('/hub/teachers')}
                className={`flex h-9 shrink-0 items-center justify-center rounded-full px-5 text-sm font-medium active:scale-95 border ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white/80' : 'bg-white border-slate-200 text-slate-700'}`}
              >
                Docenten
              </button>
            </div>
          </section>

          <main className="mx-auto max-w-xl px-4">
            {/* Featured / highlighted */}
            <section className="mt-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className={`${cursorBase} text-xl font-bold leading-tight tracking-tight flex items-center gap-2`}>
                  <Sparkles className="h-5 w-5 text-purple-400" />
                  Vandaag uitgelicht
                </h2>
                <span className={`${cursorMuted} text-xs font-semibold uppercase tracking-wider`}>Top picks</span>
              </div>

              {loadingPrograms ? (
                <LoadingState label="Programma's laden…" className="py-4" spinnerSize={28} />
              ) : v2Buckets.uitgelicht.length === 0 ? (
                <div className={`${cursorMuted} text-sm`}>Geen publieke programma's gevonden.</div>
              ) : (
                <div className="space-y-4">
                  {v2Buckets.uitgelicht.slice(0, 2).map((p: any) => (
                    <div
                      key={p.id}
                      className={`rounded-2xl p-[2px] ${theme === 'dark' ? 'bg-linear-to-br from-blue-500/60 via-purple-500/50 to-white/10' : 'bg-linear-to-br from-blue-500 via-purple-500 to-slate-900'}`}
                    >
                      <div className={`rounded-[14px] overflow-hidden ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}>
                        {/* Use existing ProgramCard for functionality; wrapper provides the V2 look */}
                        <div className={theme === 'dark' ? 'p-3' : 'p-3'}>
                          <ProgramCard program={p} onOpen={() => (window.location.href = `/program/${p.id}`)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Quick actions tiles */}
            <section className="mt-8">
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => router.push('/hub/workshops')}
                  className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-linear-to-br from-blue-900/15 to-black/10 p-4 text-center active:scale-95"
                >
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-500">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className={`${cursorBase} text-xs font-bold`}>Workshops</div>
                </button>
                <button
                  onClick={() => router.push('/hub/studios')}
                  className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-linear-to-br from-purple-900/15 to-black/10 p-4 text-center active:scale-95"
                >
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <div className={`${cursorBase} text-xs font-bold`}>Studio's</div>
                </button>
                <button
                  onClick={() => router.push('/hub/teachers')}
                  className="relative overflow-hidden rounded-2xl border border-pink-500/20 bg-linear-to-br from-pink-900/15 to-black/10 p-4 text-center active:scale-95"
                >
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-500">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className={`${cursorBase} text-xs font-bold`}>Docenten</div>
                </button>
              </div>
            </section>

            {/* Popular workshops */}
            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className={`${cursorBase} text-xl font-bold leading-tight tracking-tight`}>Populaire workshops</h2>
                <button onClick={() => router.push('/hub/workshops')} className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Bekijk alles</button>
              </div>
              {loadingPrograms ? null : <V2Row items={v2Buckets.workshops} />}
            </section>

            {/* Recommended */}
            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className={`${cursorBase} text-xl font-bold leading-tight tracking-tight`}>Aanbevolen voor jou</h2>
              </div>
              {loadingPrograms ? null : (
                <div className="space-y-3">
                  {v2Buckets.cursussen.slice(0, 4).map((p: any) => (
                    <div key={p.id} className="w-full">
                      <button
                        onClick={() => router.push(`/program/${p.id}`)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left ${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={`${cursorBase} font-bold line-clamp-1`}>{p.title}</div>
                            <div className={`${cursorMuted} mt-0.5 text-sm line-clamp-1`}>{p?.studio?.naam || ''}</div>
                          </div>
                          {typeof p?.price === 'number' ? <div className={`${cursorBase} font-bold text-sm`}>€{p.price}</div> : null}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Keep the original carousel sections available (less prominent) */}
            {loadingPrograms ? null : (
              <section className="mt-10 space-y-6">
                <V2Section title="Meer cursussen" items={v2Buckets.cursussen.slice(0, 6)} />
                <V2Section title="Proeflessen" items={v2Buckets.proeflessen.slice(0, 6)} />
              </section>
            )}
          </main>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12" style={contentPaddingStyle}>
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Welkom bij HUB3</h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">Ontdek workshops, vind getalenteerde teachers en maak contact met dance studios</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-12">
            <button
              onClick={() => router.push('/hub/workshops')}
              className="relative isolate aspect-square md:aspect-auto rounded-xl bg-white p-4 text-center transition-all focus:outline-none focus:ring-2 focus:ring-orange-200 before:content-[''] before:pointer-events-none before:absolute before:-inset-3 before:rounded-[1.4rem] before:bg-orange-500/25 before:blur-2xl before:opacity-100 before:z-0"
            >
              <div className="relative z-10 flex h-full flex-col items-center justify-center">
                <div className="text-4xl sm:text-3xl font-extrabold text-gray-900 leading-none mb-1">{loading ? '…' : stats.totalWorkshops}</div>
                <div className="text-lg font-semibold text-gray-900">Workshops</div>
                <div className="mt-2 flex items-center justify-center text-orange-700 font-medium text-xs">
                  Bekijk <ArrowRight className="w-3 h-3 ml-1" />
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push('/hub/studios')}
              className="relative isolate aspect-square md:aspect-auto rounded-xl bg-white p-4 text-center transition-all focus:outline-none focus:ring-2 focus:ring-blue-200 before:content-[''] before:pointer-events-none before:absolute before:-inset-3 before:rounded-[1.4rem] before:bg-blue-500/25 before:blur-2xl before:opacity-100 before:z-0"
            >
              <div className="relative z-10 flex h-full flex-col items-center justify-center">
                <div className="text-4xl sm:text-3xl font-extrabold text-gray-900 leading-none mb-1">{loading ? '…' : stats.totalStudios}</div>
                <div className="text-lg font-semibold text-gray-900">Studios</div>
                <div className="mt-2 flex items-center justify-center text-blue-700 font-medium text-xs">
                  Ontdek <ArrowRight className="w-3 h-3 ml-1" />
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push('/hub/teachers')}
              className="relative isolate aspect-square md:aspect-auto rounded-xl bg-white p-4 text-center transition-all focus:outline-none focus:ring-2 focus:ring-green-200 before:content-[''] before:pointer-events-none before:absolute before:-inset-3 before:rounded-[1.4rem] before:bg-green-500/25 before:blur-2xl before:opacity-100 before:z-0"
            >
              <div className="relative z-10 flex h-full flex-col items-center justify-center">
                <div className="text-4xl sm:text-3xl font-extrabold text-gray-900 leading-none mb-1">{loading ? '…' : stats.totalTeachers}</div>
                <div className="text-lg font-semibold text-gray-900">Teachers</div>
                <div className="mt-2 flex items-center justify-center text-green-700 font-medium text-xs">
                  Bekijk <ArrowRight className="w-3 h-3 ml-1" />
                </div>
              </div>
            </button>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Aanbevolen programma's</h2>
              <p className="t-h4 text-gray-600!">Een selectie van openbare cursussen en workshops — bekijk meer in de Hub.</p>
            </div>

            {loadingPrograms ? (
              <LoadingState label="Programma's laden…" className="py-0" spinnerSize={32} />
            ) : programs.length === 0 ? (
              <div className="text-center text-gray-600">Geen publieke programma's gevonden.</div>
            ) : (
              <div className="space-y-8">
                {(() => {
                  const cursussen = programs.filter(p => p.program_type === 'group' && !isTrialProgram(p)).slice(0, 6);
                  const workshops = programs.filter(p => p.program_type === 'workshop').slice(0, 6);
                  const proeflessen = programs.filter(p => isTrialProgram(p)).slice(0, 6);

                  const Row = ({ items }: { items: any[] }) => (
                    <div className="relative left-1/2 right-1/2 -translate-x-1/2 w-screen sm:left-0 sm:right-0 sm:translate-x-0 sm:w-auto">
                      <div className="relative overflow-hidden">
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-y-0 left-0 w-10 sm:hidden z-10 ${
                            theme === 'dark' ? 'bg-linear-to-r from-black to-transparent' : 'bg-linear-to-r from-gray-50 to-transparent'
                          }`}
                        />
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-y-0 right-0 w-10 sm:hidden z-10 ${
                            theme === 'dark' ? 'bg-linear-to-l from-black to-transparent' : 'bg-linear-to-l from-gray-50 to-transparent'
                          }`}
                        />

                        <div className="overflow-x-auto">
                          <div
                            className="flex min-w-max items-stretch gap-6 py-2"
                            style={{
                              paddingBottom: 6,
                              ...(isMobile
                                ? { paddingLeft: 'max(16px, calc(50vw - 180px))', paddingRight: 'max(16px, calc(50vw - 180px))' }
                                : { paddingLeft: 0, paddingRight: 0 }),
                            }}
                          >
                            {items.map((p: any) => (
                              <div key={p.id} className="w-[360px] shrink-0">
                                <ProgramCard program={p} onOpen={() => (window.location.href = `/program/${p.id}`)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-2xl font-bold text-gray-900">Cursussen</h3>
                        </div>
                        {cursussen.length === 0 ? <div className="text-gray-600">Geen cursussen gevonden.</div> : <Row items={cursussen} />}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-2xl font-bold text-gray-900">Workshops</h3>
                        </div>
                        {workshops.length === 0 ? <div className="text-gray-600">Geen workshops gevonden.</div> : <Row items={workshops} />}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-2xl font-bold text-gray-900">Proeflessen</h3>
                        </div>
                        {proeflessen.length === 0 ? <div className="text-gray-600">Geen proeflessen gevonden.</div> : <Row items={proeflessen} />}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-8 mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Wat wil je doen?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => router.push('/hub/studios')}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
              >
                <Calendar className="w-8 h-8 text-blue-600 mr-4" />
                <div>
                  <h3 className="font-semibold text-gray-900">Studio vinden</h3>
                  <p className="text-sm text-gray-600">Ontdek dance studios in jouw buurt</p>
                </div>
              </button>

              <button
                onClick={() => router.push('/hub/workshops')}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
              >
                <Calendar className="w-8 h-8 text-blue-600 mr-4" />
                <div>
                  <h3 className="font-semibold text-gray-900">Workshop zoeken</h3>
                  <p className="text-sm text-gray-600">Vind de perfecte workshop voor jou</p>
                </div>
              </button>

              <button
                onClick={() => router.push('/hub/teachers')}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors text-left"
              >
                <Users className="w-8 h-8 text-green-600 mr-4" />
                <div>
                  <h3 className="font-semibold text-gray-900">Teacher vinden</h3>
                  <p className="text-sm text-gray-600">Ontdek teachers en hun specialiteiten</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {isMobile && showBottomNav ? <HubBottomNav /> : null}
    </div>
  );
}
