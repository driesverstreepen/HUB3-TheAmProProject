"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ContentContainer from './ContentContainer';
import type { Studio, Program } from '@/types/database';
import ProgramCard from './ProgramCard';
import { Calendar, Sparkles, Search, X } from 'lucide-react';
import Footer from '@/components/Footer';

type ViewMode = 'card' | 'list';

interface Props {
  studio: Studio;
  programs: ExtendedProgram[];
}

interface ExtendedProgram extends Program {
  group_details?: {
    weekday: number;
    start_time: string;
    end_time: string;
    season_start?: string;
    season_end?: string;
  };
  workshop_details?: {
    date: string;
    start_time: string;
    end_time: string;
  };
}

export default function StudioPublicProfile({ studio, programs: initialPrograms }: Props) {
  const router = useRouter();
  const [programs, setPrograms] = useState<ExtendedProgram[]>(initialPrograms || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'programs' | 'workshops' | 'proeflessen'>('programs');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [filterLevel] = useState<'all' | string>('all');
  const [sortBy] = useState<'alphabetical' | 'price_low' | 'price_high' | 'availability'>('alphabetical');
  // filter UI not used in this component currently
  const [studioFeatures, setStudioFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
        // Enrich programs list with linked proefles titles (if the linked program exists in the initialPrograms array)
        const enriched = (initialPrograms || []).map((p: any) => {
          const linked = (initialPrograms || []).find((q: any) => q.id === p.linked_trial_program_id);
          return { ...p, linked_trial_program_title: linked ? linked.title : null };
        });
        setPrograms(enriched);
        // Load studio features
        setStudioFeatures(studio?.features || {});
    }, [initialPrograms, studio]);

    // Policies
    const [policies, setPolicies] = useState<Array<{id: string; title: string; content: string; version?: number}>>([]);
    const [showPolicyModal, setShowPolicyModal] = useState(false);
    const [selectedPolicy, setSelectedPolicy] = useState<{id: string; title: string; content: string; version?: number} | null>(null);
    const [openPolicies, setOpenPolicies] = useState<Record<string, boolean>>({});

    useEffect(() => {
      // fetch active studio policies for this studio (client-side)
      const fetchPolicies = async () => {
        try {
          // lazy import supabase client to avoid SSR issues
          const { supabase } = await import('@/lib/supabase');
          const { data, error } = await supabase
            .from('studio_policies')
            .select('id, title, content, version')
            .eq('studio_id', studio.id)
            .eq('is_active', true)
            .order('version', { ascending: false });
          if (!error && data) setPolicies(data as any);
        } catch {
          // ignore for now
        }
      };

      fetchPolicies();
    }, [studio.id]);

  const filteredPrograms = useMemo(() => {
    let filtered = [...programs];

    const isTrial = (p: any) => {
      const t = String((p as any).program_type || '').toLowerCase();
      if (t.includes('trial')) return true;
      if (p.title && String(p.title).toLowerCase().includes('proef')) return true;
      if ((p as any).is_trial) return true;
      if (p.price === 0) return true;
      return false;
    }

    if (activeTab === 'programs') filtered = filtered.filter(p => p.program_type === 'group');
    if (activeTab === 'workshops') filtered = filtered.filter(p => p.program_type === 'workshop');
  if (activeTab === 'proeflessen') filtered = filtered.filter(p => isTrial(p));

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => p.title.toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term));
    }

    if (filterLevel !== 'all') {
      filtered = filtered.filter(p => p.level === filterLevel);
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'alphabetical':
          return a.title.localeCompare(b.title);
        case 'price_low':
          return ((a.price || 0) - (b.price || 0));
        case 'price_high':
          return ((b.price || 0) - (a.price || 0));
        case 'availability':
          return 0; // keep server order for now
        default:
          return 0;
      }
    });

    return filtered;
  }, [programs, searchTerm, activeTab, filterLevel, sortBy]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Studio Header Banner - Preview Mode Indicator */}
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm">
          <span className="font-semibold text-yellow-800">👁️ Preview Modus</span>
          <span className="text-yellow-700">Dit is hoe gebruikers jouw studio zien (read-only)</span>
        </div>
      </div>

      <div className="bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 border-b border-slate-700">
        <ContentContainer className="py-8">
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl font-extrabold text-white! mb-2">{studio.naam}</h1>
              {studio.beschrijving && (
                <p className="text-slate-200 text-lg mb-4">{studio.beschrijving}</p>
              )}
              <div className="flex flex-wrap gap-3 text-slate-200">
                {studio.stad && (
                  <div className="flex items-center gap-2">
                    <Calendar size={16} />
                    <span>{studio.stad}</span>
                  </div>
                )}
                {studio.contact_email && (
                  <div className="flex items-center gap-2">
                    <span>✉️</span>
                    <span>{studio.contact_email}</span>
                  </div>
                )}
                {studio.phone_number && (
                  <div className="flex items-center gap-2">
                    <span>📞</span>
                    <span>{studio.phone_number}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ContentContainer>
      </div>

      <ContentContainer className="py-12">
        {/* Studio policies quick links */}
        {policies && policies.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Studio policies</h3>
            {/* Compact clickable list (useful for sidebar-like appearance) */}
            <div className="flex flex-col gap-2 mb-3">
              {policies.map((p) => (
                <button
                  key={`link-${p.id}`}
                  onClick={() => { setSelectedPolicy(p); setShowPolicyModal(true); }}
                  className="text-sm text-blue-600 hover:underline text-left"
                >
                  {p.title}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {policies.map((p) => (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{p.title}</div>
                      <div className="text-xs text-slate-500">Versie {p.version ?? '—'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSelectedPolicy(p); setShowPolicyModal(true); }}
                        className="text-sm text-blue-600 underline"
                        aria-label={`Open ${p.title} in modal`}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => setOpenPolicies(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                        className="text-sm text-slate-600 px-2 py-1 rounded hover:bg-slate-50"
                        aria-expanded={!!openPolicies[p.id]}
                      >
                        {openPolicies[p.id] ? 'Verberg' : 'Lees'}
                      </button>
                    </div>
                  </div>
                  {openPolicies[p.id] && (
                    <div className="mt-3 prose prose-slate lg:prose-md max-w-none" dangerouslySetInnerHTML={{ __html: p.content || '' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Programma's</h2>
          <p className="text-slate-600">Bekijk en schrijf je in voor de programma's van {studio.naam}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button onClick={() => setActiveTab('programs')} className={`px-4 py-2 rounded-lg ${activeTab === 'programs' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Cursussen</button>
              <button onClick={() => setActiveTab('workshops')} className={`px-4 py-2 rounded-lg ${activeTab === 'workshops' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Workshops</button>
              <button onClick={() => setActiveTab('proeflessen')} className={`px-4 py-2 rounded-lg ${activeTab === 'proeflessen' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Proeflessen</button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Zoek programma's..." className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg w-64" />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={16} /></button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <button onClick={() => setViewMode('card')} className={`p-2 rounded ${viewMode === 'card' ? 'bg-white' : ''}`} title="Card view">▦</button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded ${viewMode === 'list' ? 'bg-white' : ''}`} title="List view">≡</button>
              </div>
            </div>
          </div>
        </div>

        {filteredPrograms.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Sparkles className="mx-auto text-slate-400 mb-4" size={48} />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">Geen programma's gevonden</h3>
            <p className="text-slate-600">Probeer andere filters of kom later terug.</p>
          </div>
        ) : (
          <div className={viewMode === 'card' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6' : 'space-y-4'}>
            {filteredPrograms.map((program) => (
              <div key={program.id} className={viewMode === 'card' ? 'h-full' : 'bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4'}>
                {viewMode === 'card' ? (
                                    <div className="h-full">
                                      <ProgramCard program={program} showCapacity={studioFeatures.capacity_visibility !== false} onOpen={() => router.push(`/program/${program.id}`)} />
                                    </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{program.title}</h3>
                      <p className="text-sm text-slate-600 line-clamp-2">{program.description}</p>
                    </div>
                    <div>
                      <Link href={`/studio/${studio.id}/programs`} className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg">View</Link>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </ContentContainer>

          {/* Footer */}
          {showPolicyModal && selectedPolicy && (
            <div
              onClick={() => setShowPolicyModal(false)}
              className="fixed inset-0 bg-slate-900/30 flex items-center justify-center z-50 p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white max-w-3xl w-full p-4 sm:p-6 rounded-2xl overflow-y-auto max-h-[90vh]"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold">{selectedPolicy.title}</h3>
                  {/* Keep only top X or backdrop for closing */}
                  <button onClick={() => setShowPolicyModal(false)} aria-label="Close" className="text-slate-600 p-2 rounded-md hover:bg-slate-100">
                    <X size={18} />
                  </button>
                </div>
                <div className="policy-preview-wrapper mb-4">
                  <div className="prose prose-slate lg:prose-lg max-w-none policy-preview" dangerouslySetInnerHTML={{ __html: selectedPolicy.content || '' }} />
                  <style>{`\
                    .policy-preview h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 0.75rem; font-weight: 700; }\n\
                    .policy-preview h2 { font-size: 1.375rem; line-height: 1.2; margin: 0.75rem 0 0.5rem; font-weight: 600; }\n\
                    .policy-preview p { margin: 0 0 0.75rem; line-height: 1.8; }\n\
                    .policy-preview ul { margin: 0.5rem 0 1rem; padding-left: 1.4rem; }\n\
                  `}</style>
                </div>
              </div>
            </div>
          )}

          <Footer
            title={studio.naam}
            contactEmail={studio.contact_email}
            actionHref={`/studio/${studio.id}/policy`}
            actionText="Studio Policies"
            copyrightName={studio.naam}
          />
    </div>
  );
}
