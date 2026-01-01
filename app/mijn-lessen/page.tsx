 'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ProgramType, ProgramLevel } from '@/types/database';
import ProgramCard from '@/components/ProgramCard';
import LessonCard from '@/components/LessonCard';
import { formatDateOnly, formatTimeStr } from '@/lib/formatting';
import { Calendar, MapPin, Clock, X, Grid, List } from 'lucide-react';
import ProgramListItem from '@/components/ProgramListItem';
import Tag from '@/components/ui/Tag'
import { useNotification } from '@/contexts/NotificationContext'
import { formatCurrency } from '@/lib/formatting';
import { useTheme } from '@/contexts/ThemeContext';
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import ContentContainer from '@/components/ContentContainer'
// Top nav is provided by the UserLayoutWrapper; no local import needed

interface Enrollment {
  id: string;
  status: string;
  inschrijving_datum: string;
  form_data?: any;
  profile_snapshot?: any;
  sub_profile_id?: string | null;
  program: {
    id: string;
    title: string;
    description: string;
  program_type: ProgramType;
    dance_style: string;
  level: ProgramLevel | undefined;
  price?: number;
  min_age?: number;
  max_age?: number;
    studio_id: string;
    studio: {
      naam: string;
      location: string;
    };
    group_details?: {
      weekday: number;
      start_time: string;
      end_time: string;
      season_start?: string;
      season_end?: string;
    }[];
    workshop_details?: {
        date: string;
        start_time: string;
        end_time: string;
    }[];
  capacity?: number;
  accepts_payment?: boolean;
  show_capacity_to_users?: boolean;
    locations?: {
      id: string;
      name: string;
      city?: string;
      adres?: string;
    }[];
    is_public: boolean;
    created_at: string;
    updated_at: string;
  };
}

type TabType = 'group' | 'workshop' | 'proeflessen';

export default function MijnLessenPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const { isArmed: isUnenrollArmed, confirmOrArm: confirmOrArmUnenroll } = useTwoStepConfirm<string>(4500);
  const [loading, setLoading] = useState(true);
  const [, setIsStudioOnly] = useState(false);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('group');
  
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyHtml, setPolicyHtml] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policyContact, setPolicyContact] = useState<any | null>(null);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [selectedLessonAbsent, setSelectedLessonAbsent] = useState<boolean>(false);
  const [loadingAbsenceAction, setLoadingAbsenceAction] = useState<boolean>(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // Helper function to get the enrolled person's first name from profile_snapshot
  const getEnrolledPersonFirstName = (enrollment: Enrollment): string => {
    if (enrollment.profile_snapshot) {
      const firstName = enrollment.profile_snapshot.first_name || enrollment.profile_snapshot.voornaam;
      if (firstName) return firstName;
    }
    return 'Jouw account';
  };

  // Helper function to get extended status with enrolled person's first name
  const getExtendedStatus = (enrollment: Enrollment): string => {
    const baseStatus = enrollment.status || 'actief';
    const firstName = getEnrolledPersonFirstName(enrollment);
    return `${baseStatus} - ${firstName}`;
  };

  useEffect(() => {
    checkAccess()
  }, [])

  const checkAccess = async () => {
    try {
      const { data: { user } } = await Promise.race([
        supabase.auth.getUser(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Auth check timed out')), 5000)),
      ])
      if (!user) {
        setLoading(false)
        router.replace('/auth/login?redirect=/mijn-lessen')
        return
      }

      // Check if user is ONLY a studio member (owner/admin) without a user profile
      const { data: studioMember } = await supabase
        .from('studio_members')
        .select('role, studio_id')
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin'])
        .maybeSingle()

      if (studioMember) {
        // Check if they also have a user profile
        const { data: userProfile } = await supabase
          .from('users')
          .select('id, first_name, role')
          .eq('id', user.id)
          .maybeSingle()

        // Even if they lack a user profile, do NOT auto-switch to studio.
        // Stay in user interface; switching to studio must be explicit via topnav.
        if (!userProfile || (!userProfile.first_name && !userProfile.role)) {
          setIsStudioOnly(true)
          // No redirect; continue and load enrollments in user UI
        }
      }

      // If access is OK, load enrollments
      await loadEnrollments(user.id)
    } catch (error) {
      console.error('Error checking access:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    const fetchAbsenceForSelected = async () => {
      if (!selectedEnrollment) return;
      const lessonId = selectedEnrollment.form_data?.lesson_metadata?.id;
      if (!lessonId) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

  // Request absences for this specific enrollment so sub-profiles are handled separately
  const res = await fetch(`/api/lesson-absences?enrollment_id=${selectedEnrollment.id}&lesson_ids=${lessonId}`, { headers });
        if (res.ok) {
          const json = await res.json();
          const abs = json?.absences || [];
          setSelectedLessonAbsent(abs.some((a:any)=>a.lesson_id === lessonId));
        }
      } catch (e) {
  console.info('Could not fetch absence for selected lesson', e);
      }
    };
    fetchAbsenceForSelected();
  }, [selectedEnrollment]);

  const { showSuccess, showError } = useNotification();

  // Consistent color function for tags
  const getTagColor = (value: string) => {
    const colors = [
      "bg-blue-100 text-blue-800",
      "bg-green-100 text-green-800",
      "bg-purple-100 text-purple-800",
      "bg-pink-100 text-pink-800",
      "bg-indigo-100 text-indigo-800",
      "bg-red-100 text-red-800",
      "bg-yellow-100 text-yellow-800",
      "bg-teal-100 text-teal-800",
      "bg-orange-100 text-orange-800",
      "bg-cyan-100 text-cyan-800"
    ];
    
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  

  // Helper to detect trial programs (proeflessen)
  const isTrial = (p: any) => {
    const t = String((p as any).program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (p?.title && String(p.title).toLowerCase().includes('proef')) return true;
    if ((p as any).is_trial) return true;
    if (p?.price === 0) return true;
    return false;
  };

  const loadEnrollments = async (userId: string) => {
    try {
      // First get enrollments with program info
      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from('inschrijvingen')
        .select(`
          id,
          status,
          inschrijving_datum,
          form_data,
          profile_snapshot,
          sub_profile_id,
          program:programs(
            id,
            title,
            description,
            program_type,
            dance_style,
            level,
            price,
            min_age,
            max_age,
            capacity,
            accepts_payment,
            show_capacity_to_users,
            is_public,
            created_at,
            updated_at,
            studio_id,
            studio:studios!inner(naam, location, show_capacity_to_users),
            program_locations(location_id, locations(id, name, city, adres) ),
            group_details(*),
            workshop_details(*)
          )
        `)
        .eq('user_id', userId)
        .order('inschrijving_datum', { ascending: false });

      if (enrollmentsError) throw enrollmentsError;

  console.info('Basic enrollments data:', enrollmentsData); // Debug log

      // Map program_locations -> locations, ensure group/workshop details are arrays
      const combinedData = (enrollmentsData as any[])?.map((enrollment: any) => {
        const program = enrollment.program || {};
        const locations = (program.program_locations || []).map((pl: any) => pl.locations).filter(Boolean);
        const rawGroup = program.group_details ? (Array.isArray(program.group_details) ? program.group_details : [program.group_details]) : [];
        const normalizedGroup = rawGroup.map((d: any) => ({
          weekday: d.weekday,
          start_time: d.start_time,
          end_time: d.end_time,
          season_start: d.season_start ?? undefined,
          season_end: d.season_end ?? undefined,
        }));

        const rawWorkshop = program.workshop_details ? (Array.isArray(program.workshop_details) ? program.workshop_details : [program.workshop_details]) : [];
        const normalizedWorkshop = rawWorkshop.map((d: any) => ({
          date: d.date ?? d.start_datetime,
          start_time: d.start_time ?? d.start_datetime,
          end_time: d.end_time ?? d.end_datetime,
        }));

        return {
          ...enrollment,
          program: {
            ...program,
            locations,
            group_details: normalizedGroup,
            workshop_details: normalizedWorkshop,
          }
        };
      });

  console.info('Final combined data:', combinedData); // Debug log
      setEnrollments(combinedData as any || []);
    } catch (err) {
      console.error('Failed to load enrollments:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredEnrollments = () => {
    if (activeTab === 'proeflessen') {
      // Deduplicate by lesson id (prefer enrollments that include lesson_metadata)
      const items = enrollments.filter(e => (e.form_data && e.form_data.lesson_detail_type) || isTrial(e.program));
      const map = new Map<string, Enrollment>();
      for (const e of items) {
        const lessonId = e.form_data?.lesson_metadata?.id;
        const key = lessonId ? `l:${lessonId}` : `p:${e.program.id}`;
        const existing = map.get(key);
        // prefer the enrollment that contains lesson_metadata (more specific)
        if (!existing) {
          map.set(key, e);
        } else if (!existing.form_data?.lesson_metadata && e.form_data?.lesson_metadata) {
          map.set(key, e);
        }
      }
      return Array.from(map.values());
    }
    // For group/workshop tabs, exclude trial programs
    return enrollments.filter(e => e.program.program_type === activeTab && !isTrial(e.program));
  };

  const filteredEnrollments = getFilteredEnrollments();
  const groupCount = enrollments.filter(e => e.program.program_type === 'group' && !isTrial(e.program)).length;
  const workshopCount = enrollments.filter(e => e.program.program_type === 'workshop' && !isTrial(e.program)).length;
  // dedupe proeflessen count by lesson id to avoid duplicates
  const proeflessenCount = (() => {
    const items = enrollments.filter(e => (e.form_data && e.form_data.lesson_detail_type) || isTrial(e.program));
    const set = new Set<string>();
    for (const e of items) {
      const lessonId = e.form_data?.lesson_metadata?.id;
      const key = lessonId ? `l:${lessonId}` : `p:${e.program.id}`;
      set.add(key);
    }
    return set.size;
  })();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" />
          <p className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Laden…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <ContentContainer className="py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Mijn Lessen</h1>
          <p className="text-slate-600 mt-2">Overzicht van al je inschrijvingen</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 mb-6">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('group')}
              className={`flex-1 px-4 sm:px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'group'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span>Cursussen</span>
                <span>({groupCount})</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('workshop')}
              className={`flex-1 px-4 sm:px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'workshop'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span>Workshops</span>
                <span>({workshopCount})</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('proeflessen')}
              className={`flex-1 px-4 sm:px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'proeflessen'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span>Proeflessen</span>
                <span>({proeflessenCount})</span>
              </span>
            </button>
          </div>
        </div>

        {/* Enrollments List */}
        {/* View toggle */}
        <div className="flex items-center justify-end gap-2 mb-4">
          <button onClick={() => setView('grid')} aria-label="Grid view" className={`p-2 rounded-md ${view === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Grid size={16} />
          </button>
          <button onClick={() => setView('list')} aria-label="List view" className={`p-2 rounded-md ${view === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
            <List size={16} />
          </button>
        </div>
        {filteredEnrollments.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">Geen inschrijvingen</h3>
            <p className="text-slate-600 mb-6">
              Je hebt geen {activeTab === 'group' ? 'cursussen' : activeTab === 'workshop' ? 'workshops' : 'proeflessen'}.
            </p>
            <button
              onClick={() => router.push('/hub/studios')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Ontdek Programma's
            </button>
          </div>
        ) : (
          view === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredEnrollments.map((enrollment) => (
                <div key={enrollment.id} className="relative">
                  {activeTab === 'proeflessen' ? (
                    <LessonCard
                      lessonMeta={enrollment.form_data?.lesson_metadata}
                      formData={enrollment.form_data}
                      program={enrollment.program}
                      status={getExtendedStatus(enrollment)}
                      layout="programGrid"
                      onOpen={() => setSelectedEnrollment(enrollment)}
                    />
                  ) : (
                    <div onClick={() => router.push(`/mijn-lessen/${enrollment.program.id}?enrollmentId=${enrollment.id}`)} className="cursor-pointer">
                      <ProgramCard 
                        program={enrollment.program} 
                        showCapacity={false} 
                        showDescription={false}
                        status={getExtendedStatus(enrollment)}
                        onOpen={() => router.push(`/mijn-lessen/${enrollment.program.id}?enrollmentId=${enrollment.id}`)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEnrollments.map((enrollment) => (
                <div key={enrollment.id} className="relative">
                  {activeTab === 'proeflessen' ? (
                    <LessonCard
                      lessonMeta={enrollment.form_data?.lesson_metadata}
                      formData={enrollment.form_data}
                      program={enrollment.program}
                      status={getExtendedStatus(enrollment)}
                      layout="programList"
                      onOpen={() => setSelectedEnrollment(enrollment)}
                    />
                  ) : (
                    <ProgramListItem 
                      program={enrollment.program} 
                      status={getExtendedStatus(enrollment)}
                      onOpen={() => router.push(`/mijn-lessen/${enrollment.program.id}?enrollmentId=${enrollment.id}`)} 
                    />
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </ContentContainer>
      {showPolicyModal && (
        <div onClick={() => setShowPolicyModal(false)} className="fixed inset-0 bg-slate-900/30 flex items-center justify-center z-50">
          <div onClick={(e) => e.stopPropagation()} className="bg-white max-w-3xl w-full p-6 rounded-lg overflow-auto max-h-[80vh]">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">Annuleringsbeleid</h3>
              <button onClick={() => setShowPolicyModal(false)} aria-label="Close" className="text-slate-600 p-2 rounded-md hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="policy-preview-wrapper mb-4">
              <div className="prose prose-slate lg:prose-lg max-w-none policy-preview" dangerouslySetInnerHTML={{ __html: policyHtml || '' }} />
              <style>{`\
                .policy-preview h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 0.75rem; font-weight: 700; }\n\
                .policy-preview h2 { font-size: 1.375rem; line-height: 1.2; margin: 0.75rem 0 0.5rem; font-weight: 600; }\n\
                .policy-preview p { margin: 0 0 0.75rem; line-height: 1.8; }\n\
                .policy-preview ul { margin: 0.5rem 0 1rem; padding-left: 1.4rem; }\n\
              `}</style>
              {/* Show the server's denial message (if any) and studio contact info */}
              {policyError && (
                <div className="mt-4 mb-2 text-sm text-slate-700">
                  <strong>{policyError}</strong>
                </div>
              )}

              {policyContact && (
                <div className="mt-4 text-sm text-slate-700">
                  <p className="font-semibold mb-1">Neem contact op met de studio</p>
                  { (policyContact.contact_email || policyContact.email) && (
                    <p>
                      E-mail: <a className="text-blue-600 underline" href={`mailto:${policyContact.contact_email || policyContact.email}`}>{policyContact.contact_email || policyContact.email}</a>
                    </p>
                  )}
                  { policyContact.phone_number && (
                    <p>
                      Telefoon: <a className="text-blue-600 underline" href={`tel:${policyContact.phone_number}`}>{policyContact.phone_number}</a>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {selectedEnrollment && (
        <div onClick={() => setSelectedEnrollment(null)} className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div onClick={(e) => e.stopPropagation()} className="bg-white max-w-2xl w-full p-6 rounded-lg overflow-auto max-h-[85vh] relative">
            <button
              onClick={() => setSelectedEnrollment(null)}
              aria-label="Close"
              className="absolute top-4 right-4 p-2 rounded-md text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="">
              {/* Header area similar to ProgramCard */}
              <div className="w-full bg-white rounded-2xl p-0">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-semibold text-gray-900">{selectedEnrollment.form_data?.lesson_metadata?.title || selectedEnrollment.program.title}</h3>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <Tag asPill>Proefles</Tag>
                      <div className="flex items-center gap-2">
                        <Tag>{selectedEnrollment.program.dance_style || 'Onbekend'}</Tag>
                        <Tag>{selectedEnrollment.program.level || 'Alle niveaus'}</Tag>
                        {selectedEnrollment.program.min_age !== undefined && selectedEnrollment.program.min_age !== null ? (
                          <Tag>{`${selectedEnrollment.program.min_age}+ jaar`}</Tag>
                        ) : selectedEnrollment.program.max_age !== undefined && selectedEnrollment.program.max_age !== null ? (
                          <Tag>{`tot ${selectedEnrollment.program.max_age} jaar`}</Tag>
                        ) : (
                          <Tag>Alle leeftijden</Tag>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    {/* left header/content stays here */}
                  </div>
                </div>

                {/* Right column under the X: status, paid price (if any) and enrolled date */}
                <div className="absolute top-14 right-4 flex flex-col items-end gap-1">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${selectedEnrollment.status?.toLowerCase() === 'actief' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200'}`}>{selectedEnrollment.status}</span>

                  {selectedEnrollment.form_data?.price_snapshot ? (
                    <div className="text-lg font-semibold text-slate-900">{formatCurrency(selectedEnrollment.form_data.price_snapshot, { cents: true })}</div>
                  ) : selectedEnrollment.program.price ? (
                    <div className="text-lg font-semibold text-slate-900">{formatCurrency(Number(selectedEnrollment.program.price), { cents: false })}</div>
                  ) : null}

                  <div className="text-xs text-slate-600">Ingeschreven {formatDateOnly(selectedEnrollment.inschrijving_datum)}</div>

                  {selectedEnrollment.status?.toLowerCase() === 'actief' && (
                    <button
                      onClick={async () => {
                        const key = `unenroll:${selectedEnrollment.id}`;
                        confirmOrArmUnenroll(key, async () => {
                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            const token = (session as any)?.access_token;
                            const headers: Record<string,string> = { 'Content-Type': 'application/json' };
                            if (token) headers['Authorization'] = `Bearer ${token}`;

                            const res = await fetch('/api/inschrijvingen/cancel', { method: 'POST', headers, body: JSON.stringify({ inschrijvingId: selectedEnrollment.id }) });
                            const json = await res.json();
                            if (res.ok) {
                              showSuccess('Uitschrijven gelukt');
                              const { data: { user } } = await supabase.auth.getUser();
                              if (user) await loadEnrollments(user.id);
                              setSelectedEnrollment(null);
                            } else if (res.status === 403) {
                              setPolicyHtml(json?.cancellation_policy ?? null);
                              setPolicyContact(json?.contact ?? null);
                              setPolicyError(json?.error ?? null);
                              setShowPolicyModal(true);
                            } else {
                              console.error('Cancel failed', json);
                              showError(json?.error || 'Kon niet uitschrijven.');
                            }
                          } catch (e) {
                            console.error('Cancel error', e);
                            showError('Kon niet uitschrijven. Probeer het later.');
                          }
                        });
                      }}
                      className={`text-sm ${isUnenrollArmed(`unenroll:${selectedEnrollment.id}`) ? 'text-red-700 font-semibold' : 'text-slate-600 hover:text-red-600'}`}
                    >
                      {isUnenrollArmed(`unenroll:${selectedEnrollment.id}`) ? 'Bevestig' : 'Uitschrijven'}
                    </button>
                  )}
                </div>
                

                { (selectedEnrollment.form_data?.lesson_metadata?.description || selectedEnrollment.program.description) && (
                  <p className="text-sm text-gray-600 mb-3">{selectedEnrollment.form_data?.lesson_metadata?.description || selectedEnrollment.program.description}</p>
                ) }

                <div className="space-y-2 text-sm text-gray-500 mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-gray-400" />
                    <span>
                      {(() => {
                        const loc: any = selectedEnrollment.form_data?.lesson_metadata?.location || selectedEnrollment.program.locations?.[0] || null;
                        const name = (loc?.name || selectedEnrollment.program.studio?.naam || 'Locatie onbekend');
                        const addr = [loc?.adres || loc?.address, loc?.postcode || loc?.postal_code, loc?.city].filter(Boolean).join(' ');
                        return addr ? `${name} — ${addr}` : name;
                      })()}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Calendar size={14} className="text-slate-400" />
                      <span>{(() => {
                        const lm: any = selectedEnrollment.form_data?.lesson_metadata || {};
                        const w: any = selectedEnrollment.program.workshop_details?.[0] || {};
                        const date = lm.date || lm.start_datetime || w.date || null;
                        return date ? formatDateOnly(date) : '';
                      })()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Clock size={14} className="text-slate-400" />
                      <span>{(() => {
                        const lm: any = selectedEnrollment.form_data?.lesson_metadata || {};
                        const w: any = selectedEnrollment.program.workshop_details?.[0] || {};
                        const start = lm.time || (lm.start_datetime ? String(lm.start_datetime).split('T')[1]?.slice(0,5) : null) || w.start_time || null;
                        const end = lm.end_time || lm.end_datetime || w.end_time || null;
                        return [formatTimeStr(start || ''), end ? `— ${formatTimeStr(end)}` : ''].filter(Boolean).join(' ');
                      })()}</span>
                    </div>
                  </div>

                  {selectedEnrollment.form_data?.lesson_metadata?.duration_minutes && (
                    <p className="text-sm text-slate-700">Duur: {selectedEnrollment.form_data.lesson_metadata.duration_minutes} min</p>
                  )}

                </div>

                <div className="mt-4 flex items-center justify-end gap-3">
                  {/* Absence actions: like in program detail */}
                  {selectedEnrollment.form_data?.lesson_metadata?.id ? (
                    loadingAbsenceAction ? (
                      <button className="text-sm px-3 py-1 bg-slate-50 text-slate-600 rounded-md">Bezig...</button>
                    ) : selectedLessonAbsent ? (
                      <button onClick={async () => {
                        try {
                          setLoadingAbsenceAction(true);
                          const { data: { session } } = await supabase.auth.getSession();
                          const token = (session as any)?.access_token;
                          const headers: Record<string,string> = { 'Content-Type': 'application/json' };
                          if (token) headers['Authorization'] = `Bearer ${token}`;
                          const res = await fetch(`/api/lesson-absences?lesson_id=${selectedEnrollment.form_data.lesson_metadata.id}&enrollment_id=${selectedEnrollment.id}`, { method: 'DELETE', headers });
                          const json = await res.json();
                          if (!res.ok) {
                            console.error('Unreport absence failed', json);
                            showError(json?.error || 'Kon afwezigheid niet ongedaan maken');
                          } else {
                            setSelectedLessonAbsent(false);
                            showSuccess('Afwezigheid opgeheven');
                          }
                        } catch (e) {
                          console.error('Unreport absence error', e);
                          showError('Kon afwezigheid niet ongedaan maken. Probeer het later.');
                        } finally { setLoadingAbsenceAction(false); }
                      }} className="text-sm text-blue-600 hover:text-blue-800">Ongedaan maken</button>
                    ) : (
                      <button onClick={async () => {
                        try {
                          setLoadingAbsenceAction(true);
                          const { data: { session } } = await supabase.auth.getSession();
                          const token = (session as any)?.access_token;
                          const headers: Record<string,string> = { 'Content-Type': 'application/json' };
                          if (token) headers['Authorization'] = `Bearer ${token}`;
                          const res = await fetch('/api/lesson-absences', { method: 'POST', headers, body: JSON.stringify({ lesson_id: selectedEnrollment.form_data.lesson_metadata.id, enrollment_id: selectedEnrollment.id }) });
                          const json = await res.json();
                          if (!res.ok) {
                            console.error('Report absence failed', json);
                            showError(json?.error || 'Kon niet melden');
                          } else {
                            setSelectedLessonAbsent(true);
                            showSuccess('Afwezigheid gemeld');
                          }
                        } catch (e) {
                          console.error('Report absence error', e);
                          showError('Kon niet melden. Probeer het later.');
                        } finally { setLoadingAbsenceAction(false); }
                      }} className="text-sm text-slate-600 hover:text-red-600">Afwezigheid melden</button>
                    ) ) : null}

                  {/* bottom close button removed - modal can be closed with the X or by clicking outside */}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
