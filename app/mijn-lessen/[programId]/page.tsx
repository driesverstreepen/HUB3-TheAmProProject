"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatDateOnly } from '@/lib/formatting';
import { ArrowLeft, Calendar, MapPin, Clock, BookOpen, X } from "lucide-react";
import { useNotification } from '@/contexts/NotificationContext'
import StyleTags from '@/components/ui/StyleTags'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { getTagClass } from '@/lib/tagColors'
import ContentContainer from '@/components/ContentContainer'

interface ProgramDetails {
  id: string;
  title: string;
  description?: string | null;
  program_type: string;
  dance_style?: string | null;
  level?: string | null;
  price?: number | null;
  min_age?: number | null;
  max_age?: number | null;
  studio_id?: string | null;
  studio?: {
    naam?: string | null;
    contact_email?: string | null;
    phone_number?: string | null;
    adres?: string | null;
    stad?: string | null;
  } | null;
}

interface Enrollment {
  id: string;
  status: string;
  inschrijving_datum: string;
  profile_snapshot?: any;
  sub_profile_id?: string | null;
}

interface Lesson {
  id: string;
  title: string;
  description?: string | null;
  date?: string | null;
  time?: string | null;
  duration_minutes?: number | null;
  location?: {
    name?: string | null;
    adres?: string | null;
    city?: string | null;
  } | null;
}

interface Location {
  id: string;
  name?: string | null;
  adres?: string | null;
  city?: string | null;
  postcode?: string | null;
  address?: string | null;
  postal_code?: string | null;
}

interface GroupDetail {
  weekday?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  season_start?: string | null;
  season_end?: string | null;
}

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = params.programId as string;
  const enrollmentIdParam = searchParams.get('enrollmentId')

  const { showModal, showSuccess, showError } = useNotification()

  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<ProgramDetails | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [groupDetails, setGroupDetails] = useState<GroupDetail[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [myAbsences, setMyAbsences] = useState<Record<string, boolean>>({});
  const [visibleLessonsCount, setVisibleLessonsCount] = useState(8);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyHtml, setPolicyHtml] = useState<string | null>(null);
  const [policyContact, setPolicyContact] = useState<any | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [refundHtml, setRefundHtml] = useState<string | null>(null);
  const [showRefundPolicy, setShowRefundPolicy] = useState(false);
  const [showUnsubscribeModal, setShowUnsubscribeModal] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [cancellationAllowed, setCancellationAllowed] = useState<boolean | null>(null);
  const [cancellationCutoff, setCancellationCutoff] = useState<Date | null>(null);
  const [cancellationWindowLabel, setCancellationWindowLabel] = useState<string | null>(null);
  const [loadingCancellationInfo, setLoadingCancellationInfo] = useState(false);

  // Helper function to get the primary enrollment (first active, or first overall)
  const getPrimaryEnrollment = (): Enrollment | null => {
    if (enrollments.length === 0) return null;
    
    // First try to find an active enrollment
    const activeEnrollment = enrollments.find(e => e.status === 'actief');
    if (activeEnrollment) return activeEnrollment;
    
    // Otherwise return the first enrollment
    return enrollments[0];
  };

  // If user navigated here from a specific enrollment card, prefer that enrollment
  // so absences are stored and shown per main/sub account.
  const getSelectedEnrollment = (): Enrollment | null => {
    if (enrollments.length === 0) return null
    if (enrollmentIdParam) {
      const found = enrollments.find(e => String(e.id) === String(enrollmentIdParam))
      if (found) return found
    }
    return getPrimaryEnrollment()
  }

  // Helper function to get enrolled person's first name
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

  // Consistent color function for tags
  const getTagColor = (value: string) => {
    return getTagClass(String(value || '').trim() || 'tag')
  };

  useEffect(() => {
    loadProgramDetails();
     
  }, [programId]);

  const loadProgramDetails = async () => {
    try {
      if (!programId) {
        console.warn('loadProgramDetails skipped: programId is not defined');
        setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login?redirect=/mijn-lessen");
        return;
      }

      // Eerst het basis programma ophalen met studio info
      const { data: programData, error: programError } = await supabase
        .from("programs")
        .select(
          "id, title, description, program_type, dance_style, level, price, min_age, max_age, studio:studios(naam, contact_email, phone_number, adres, stad)"
        )
        .eq("id", programId)
        .maybeSingle();

      if (programError) {
        console.error("Program query error:", programError);
        throw programError;
      }
      
      if (!programData) {
  console.info("No program found for id:", programId);
        router.push("/mijn-lessen");
        return;
      }

      setProgram(programData as any);

      // Locaties apart ophalen via program_locations junction table
      const { data: programLocations, error: locError } = await supabase
        .from("program_locations")
        // select all columns from locations to avoid failing when a specific column name
        // differs between environments (e.g. 'adres' vs 'address'). We'll map fields later.
        .select("locations(*)")
        .eq("program_id", programId);

      // Improved error handling / fallback: log explicit errors so we can debug 400/403
      if (locError) {
        // Log full error to console to help reproduce the 400 seen in the browser network tab
        try {
          console.error('Error loading program_locations for program', programId, locError, JSON.stringify(locError));
        } catch (e) {
          console.error('Error loading program_locations for program', programId, locError);
        }

        // Defensive fallback: if program has studio address/name, use that so UI still shows something
        const studioFallbackName = (programData as any)?.studio?.naam || null;
        const studioFallbackAdres = (programData as any)?.studio?.adres || (programData as any)?.studio?.stad || null;
        if (studioFallbackName) {
          setLocations([{ id: 'fallback', name: studioFallbackName, adres: studioFallbackAdres || undefined, city: undefined }]);
        } else {
          setLocations([]);
        }
      } else if (programLocations) {
        const linked = programLocations
          .map((pl: any) => pl.locations)
          .filter(Boolean);
        setLocations(linked as Location[]);
      }

      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from("inschrijvingen")
        .select("id, status, inschrijving_datum, profile_snapshot, sub_profile_id")
        .eq("user_id", user.id)
        .eq("program_id", programId);

      if (enrollmentError) {
        console.error("Enrollment query error:", enrollmentError);
      }
      
      const enrollmentsArr = (enrollmentData as any[]) || []
      if (enrollmentsArr) {
        setEnrollments(enrollmentsArr as Enrollment[]);
      }

      const pickEnrollmentFromList = (list: any[]) => {
        if (!Array.isArray(list) || list.length === 0) return null
        if (enrollmentIdParam) {
          const found = list.find((e: any) => String(e.id) === String(enrollmentIdParam))
          if (found) return found
        }
        const active = list.find((e: any) => String(e.status || '').toLowerCase() === 'actief' || String(e.status || '').toLowerCase() === 'active')
        return active || list[0] || null
      }

      const selectedEnrollment = pickEnrollmentFromList(enrollmentsArr)

      const { data: lessonsData, error: lessonsError } = await supabase
        .from("lessons")
        .select(
          "id, title, description, date, time, duration_minutes, location:locations(name, adres, city)"
        )
        .eq("program_id", programId)
        .order("date", { ascending: true });

      if (lessonsError) {
        console.error("Lessons query error:", lessonsError);
      } else if (lessonsData) {
        const lessonsArr = (lessonsData as any) || [];
        setLessons(lessonsArr);

        // Load current user's absences for these lessons (if any)
        try {
          const lessonIds = lessonsArr.map((l: any) => l.id).join(',')
                // If user has enrollments for this program, check absences for the selected enrollment
                const enrollmentParam = selectedEnrollment ? `enrollment_id=${selectedEnrollment.id}` : `user_id=${user.id}`

                if (lessonIds && user?.id) {
            try {
                // Include access token so the server can authenticate the request
                const { data: { session } } = await supabase.auth.getSession();
                const token = (session as any)?.access_token;
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const absRes = await fetch(`/api/lesson-absences?${enrollmentParam}&lesson_ids=${lessonIds}`, { headers })
                if (absRes.ok) {
                  const json = await absRes.json()
                  const abs = json?.absences || []
                  const map: Record<string, boolean> = {}
                  abs.forEach((a: any) => { if (a && a.lesson_id) map[a.lesson_id] = true })
                  setMyAbsences(map)
                } else {
                  // non-OK (401/403) handled silently here; user might be unauthenticated server-side
                  console.info('Absences fetch returned non-OK status', absRes.status)
                }
              } catch (e) {
                console.info('Could not load my lesson absences', e)
              }
          }
        } catch (e) {
          console.info('Could not derive locations from lessons', e);
        }

        // If program_locations didn't provide a location, try to derive one from lessons
        try {
          const derivedLocations = lessonsArr
            .map((l: any) => l.location)
            .filter(Boolean);
          if ((!locations || locations.length === 0) && derivedLocations.length > 0) {
            // dedupe by name/address roughly
            const seen = new Set();
            const unique = derivedLocations.filter((loc: any) => {
              const key = `${loc.name || ''}::${loc.adres || ''}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }).map((loc: any, idx: number) => ({ id: `from-lesson-${idx}`, name: loc.name, adres: loc.adres, city: loc.city }));
            setLocations(unique as Location[]);
          }
        } catch (e) {
          console.info('Could not derive locations from lessons', e);
        }
      }

      const { data: groupData, error: groupError } = await supabase
        .from("group_details")
        .select("weekday, start_time, end_time, season_start, season_end")
        .eq("program_id", programId);

      if (groupError) {
        console.error("Group details query error:", groupError);
      } else if (groupData) {
        setGroupDetails((groupData as any[]) || []);
      }
    } catch (err) {
      console.error("Failed to load program details:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" />
          <p className="text-slate-600">Laden…</p>
        </div>
      </div>
    );
  }

  if (!program || !getSelectedEnrollment()) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">
            Programma niet gevonden of je bent niet ingeschreven.
          </p>
          <button
            onClick={() => router.push("/mijn-lessen")}
            className="text-blue-600 hover:text-blue-700"
          >
            Terug naar Mijn Lessen
          </button>
        </div>
      </div>
    );
  }

  const ageDisplay =
    program.min_age && program.max_age
      ? program.min_age + "-" + program.max_age + " jaar"
      : program.min_age
      ? program.min_age + "+ jaar"
      : program.max_age
      ? "tot " + program.max_age + " jaar"
      : null;

  const locationAddress =
    locations && locations.length > 0
      ? [
          locations[0].adres || locations[0].address || "",
          locations[0].postcode || locations[0].postal_code || "",
          locations[0].city || "",
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  const seasonDisplay =
    groupDetails.length > 0 &&
    groupDetails[0].season_start &&
    groupDetails[0].season_end
      ? formatDateOnly(groupDetails[0].season_start) +
        " - " +
        formatDateOnly(groupDetails[0].season_end)
      : null;

  const weekdayNames = [
    'Zondag',
    'Maandag',
    'Dinsdag',
    'Woensdag',
    'Donderdag',
    'Vrijdag',
    'Zaterdag',
  ];

  const formatWeekday = (w?: string | number | null) => {
    if (w === null || w === undefined) return null;
    const num = typeof w === 'string' && w.match(/^\d+$/) ? parseInt(w, 10) : typeof w === 'number' ? w : NaN;
    if (!isNaN(num) && num >= 0 && num <= 6) return weekdayNames[num];
    return String(w);
  };

  const formatTime = (t?: string | null) => {
    if (!t) return null;
    // t might be 'HH:MM:SS' or 'HH:MM:SSZ' or ISO datetime
    // Try detect ISO datetime
    if (t.includes('T')) {
      const part = t.split('T')[1];
      if (!part) return null;
      const hhmm = part.split(':');
      if (hhmm.length >= 2) return `${hhmm[0].padStart(2, '0')}:${hhmm[1].padStart(2, '0')}`;
      return part;
    }
    const parts = t.split(':');
    if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    return t;
  };

  // Compute end time from start time and duration (in minutes), formatted HH:MM
  const formatEndTime = (start?: string | null, durationMinutes?: number | null) => {
    if (!start || !durationMinutes || durationMinutes <= 0) return null;
    // Extract HH and MM from possible ISO or HH:MM[:SS]
    let hh = 0, mm = 0;
    let timePart = start;
    if (start.includes('T')) {
      const part = start.split('T')[1];
      if (!part) return null;
      timePart = part;
    }
    const comps = timePart.split(':');
    if (comps.length < 2) return null;
    hh = parseInt(comps[0] || '0', 10) || 0;
    mm = parseInt(comps[1] || '0', 10) || 0;
    let total = hh * 60 + mm + durationMinutes;
    total = ((total % (24 * 60)) + (24 * 60)) % (24 * 60); // wrap safely
    const endH = Math.floor(total / 60);
    const endM = total % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  // Compute cancellation window by calling server endpoint which handles RLS and policy visibility
  const computeCancellationWindow = async () => {
    try {
      setLoadingCancellationInfo(true);
      setCancellationAllowed(null);
      setCancellationCutoff(null);
      setCancellationWindowLabel(null);
      // Prefer program-level lookup first to avoid noisy 404 when enrollment isn't visible server-side
      const { data: { session } } = await supabase.auth.getSession();
      const token = (session as any)?.access_token;
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const resProg = await fetch('/api/inschrijvingen/cancellation-info', { method: 'POST', headers, body: JSON.stringify({ programId }) });
        const jsonProg = await resProg.json();
        if (resProg.ok) {
          setCancellationAllowed(Boolean(jsonProg.allowed));
          setCancellationWindowLabel(jsonProg.windowLabel ?? null);
          setPolicyHtml(jsonProg.cancellation_policy ?? null);
          setRefundHtml(jsonProg.refund_policy ?? null);
          setPolicyContact(jsonProg.contact ?? null);
          setPolicyError(jsonProg?.error ?? null);
          setCancellationCutoff(jsonProg.cutoff ? new Date(jsonProg.cutoff) : null);
          return;
        }
        // If program-level lookup failed and we have an enrollment, try enrollment-specific lookup
        if (resProg.status !== 200) {
          // fall through to enrollment lookup below
        }
      } catch (e) {
        console.warn('cancellation-info (program) failed', e);
      }

      const primary = getSelectedEnrollment();
      if (!primary) {
        // nothing else to try — allow by default
        setCancellationAllowed(true);
        return;
      }

      const res = await fetch('/api/inschrijvingen/cancellation-info', { method: 'POST', headers, body: JSON.stringify({ inschrijvingId: primary.id }) });
      const json = await res.json();
      if (!res.ok) {
        console.warn('cancellation-info (enrollment) failed', json);
        setCancellationAllowed(true);
        return;
      }

  setCancellationAllowed(Boolean(json.allowed));
  setCancellationWindowLabel(json.windowLabel ?? null);
  setPolicyHtml(json.cancellation_policy ?? null);
  setRefundHtml(json.refund_policy ?? null);
  setPolicyContact(json.contact ?? null);
  setPolicyError(json?.error ?? null);
  setCancellationCutoff(json.cutoff ? new Date(json.cutoff) : null);
    } catch (e) {
      console.error('computeCancellationWindow error', e);
      setCancellationAllowed(true);
    } finally {
      setLoadingCancellationInfo(false);
    }
  };

  const handleUnsubscribe = async () => {
    const primary = getSelectedEnrollment();
    if (!primary) {
      showError?.('Geen inschrijving gevonden');
      return;
    }
    // if we've computed cancellation is not allowed, open the policy modal instead and don't call the API
    if (cancellationAllowed === false) {
      setShowUnsubscribeModal(false);
      setShowPolicyModal(true);
      return;
    }
    try {
      setUnsubscribing(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = (session as any)?.access_token;
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/inschrijvingen/cancel', { method: 'POST', headers, body: JSON.stringify({ inschrijvingId: primary.id }) });
      const json = await res.json();
      if (res.ok) {
        showSuccess?.('Uitschrijven gelukt');
        // reload program details (enrollments)
        await loadProgramDetails();
        setShowUnsubscribeModal(false);
      } else if (res.status === 403) {
        setPolicyHtml(json?.cancellation_policy ?? null);
        setPolicyContact(json?.contact ?? null);
        setPolicyError(json?.error ?? null);
        // mark explicitly disallowed
        setCancellationAllowed(false);
        // try to enrich modal with refund policy and cutoff by querying cancellation-info for the program
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = (session as any)?.access_token;
          const headers: Record<string,string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const infoRes = await fetch('/api/inschrijvingen/cancellation-info', { method: 'POST', headers, body: JSON.stringify({ programId }) });
          if (infoRes.ok) {
            const infoJson = await infoRes.json();
            setRefundHtml(infoJson.refund_policy ?? null);
            setCancellationWindowLabel(infoJson.windowLabel ?? null);
            setCancellationCutoff(infoJson.cutoff ? new Date(infoJson.cutoff) : null);
          }
        } catch (e) {
          // ignore enrichment failures
        }

        setShowUnsubscribeModal(false);
        setShowPolicyModal(true);
      } else if (res.status === 401) {
        // Not authenticated — surface clearer message
        showError?.('Je bent niet ingelogd. Log in en probeer opnieuw.');
      } else {
        console.error('Cancel failed', json);
        showError?.(json?.error || 'Kon niet uitschrijven.');
      }
    } catch (e) {
      console.error('Cancel error', e);
      showError?.('Kon niet uitschrijven. Probeer het later.');
    } finally {
      setUnsubscribing(false);
    }
  };

  return (
    <div className="min-h-screen">
      <ContentContainer className="py-8">
        <button
          onClick={() => router.push("/mijn-lessen")}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Terug naar Mijn Lessen</span>
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex items-start justify-between mb-2 gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-slate-900 leading-tight truncate mb-1">{program.title}</h1>

              <div className="flex items-center gap-3 text-sm text-slate-600 truncate">
                <span className="inline-flex items-center gap-1 truncate">{program.studio?.naam || 'Studio'}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSelectedEnrollment() && getExtendedStatus(getSelectedEnrollment()!).toLowerCase().startsWith('actief') ? 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200' : 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200'}`}>{getSelectedEnrollment() ? getExtendedStatus(getSelectedEnrollment()!) : 'Onbekend'}</span>
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                {/* program type tag */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${program.program_type === 'group' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200'}`}>
                  {program.program_type === 'group' ? 'Cursus' : 'Workshop'}
                </span>

                {program.dance_style && (<StyleTags styles={program.dance_style} className={`${getTagColor(String(program.dance_style))}`} />)}
                {program.level && (<span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${getTagColor(program.level)}`}>{program.level}</span>)}
                {ageDisplay && (<span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${getTagColor(ageDisplay)}`}>{ageDisplay}</span>)}
              </div>

              {program.description && (<p className="text-slate-700 text-sm mt-2 truncate">{program.description}</p>)}
            </div>

            <div className="shrink-0 text-right">
              <div className="text-lg font-semibold text-slate-900">€{program.price ? program.price.toFixed(2) : '0.00'}</div>
              <div className="text-xs text-slate-600">Ingeschreven {formatDateOnly(getSelectedEnrollment()?.inschrijving_datum)} - {getSelectedEnrollment() ? getEnrolledPersonFirstName(getSelectedEnrollment()!) : ''}</div>
              <div className="mt-2">
                <button
                  onClick={async () => {
                    // open modal and compute cancellation window
                    setShowUnsubscribeModal(true);
                    await computeCancellationWindow();
                  }}
                  className="text-sm text-slate-600 hover:text-red-600 transition-colors"
                >
                  Uitschrijven
                </button>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center flex-wrap gap-4 text-sm text-slate-700">
              {program.program_type === 'group' ? (
                groupDetails.length > 0 && groupDetails[0]?.weekday ? (
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-slate-400" />
                    <span className="capitalize">{formatWeekday(groupDetails[0].weekday)}</span>
                  </div>
                ) : null
              ) : (
                lessons && lessons.length > 0 && lessons[0]?.date ? (
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-slate-400" />
                    <span>{formatDateOnly(lessons[0].date)}</span>
                  </div>
                ) : null
              )}

              {program.program_type === 'group' ? (
                groupDetails.length > 0 && groupDetails[0]?.start_time && groupDetails[0]?.end_time ? (
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-slate-400" />
                    <span>{formatTime(groupDetails[0].start_time)} - {formatTime(groupDetails[0].end_time)}</span>
                  </div>
                ) : null
              ) : (
                lessons && lessons.length > 0 && lessons[0]?.time ? (
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-slate-400" />
                    <span>
                      {formatTime(lessons[0].time)}{lessons[0].duration_minutes ? ` - ${formatEndTime(lessons[0].time, lessons[0].duration_minutes)}` : ''}
                    </span>
                  </div>
                ) : null
              )}

              {locations && locations.length > 0 ? (
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-slate-400" />
                  <span>
                    <span className="font-medium">{locations[0].name}</span>
                    {locationAddress ? <span className="text-slate-600"> — {locationAddress}</span> : null}
                  </span>
                </div>
              ) : null}

              {program.program_type === 'group' && seasonDisplay ? (
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-slate-400" />
                  <span className="text-slate-600">Seizoen: {seasonDisplay}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Location information removed here — now shown inline with weekday/hours/season above */}

          {/* season display moved into the tag area above to keep consistent layout */}
        </div>

        {/* Policy modal shown when server denies cancellation */}
        {showPolicyModal && (
          <div onClick={() => setShowPolicyModal(false)} className="fixed inset-0 bg-slate-900/30 flex items-center justify-center z-50">
            <div onClick={(e) => e.stopPropagation()} className="bg-white max-w-3xl w-full p-6 rounded-lg overflow-auto max-h-[80vh]">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold">Annuleringsbeleid</h3>
                <div className="flex items-center gap-3">
                  { /* show text buttons to policies when cancellation is denied */ }
                  {cancellationAllowed === false && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setShowRefundPolicy(false); /* scroll to cancellation */ }} className="text-sm text-blue-600 underline">Bekijk annuleringsbeleid</button>
                      {refundHtml && <button onClick={() => setShowRefundPolicy((s) => !s)} className="text-sm text-blue-600 underline">Bekijk restitutiebeleid</button>}
                    </div>
                  )}
                  <button onClick={() => setShowPolicyModal(false)} aria-label="Close" className="text-slate-600 p-2 rounded-md hover:bg-slate-100">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="policy-preview-wrapper mb-4">
                <div className="prose prose-slate lg:prose-lg max-w-none policy-preview" dangerouslySetInnerHTML={{ __html: policyHtml || '' }} />
                <style>{`\
                .policy-preview h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 0.75rem; font-weight: 700; }\n\
                .policy-preview h2 { font-size: 1.375rem; line-height: 1.2; margin: 0.75rem 0 0.5rem; font-weight: 600; }\n                .policy-preview p { margin: 0 0 0.75rem; line-height: 1.8; }\n                .policy-preview ul { margin: 0.5rem 0 1rem; padding-left: 1.4rem; }\n              `}</style>
              </div>
              {showRefundPolicy && refundHtml && (
                <div className="refund-preview-wrapper mb-4">
                  <h4 className="text-md font-semibold mt-4">Restitutiebeleid</h4>
                  <div className="prose prose-slate lg:prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: refundHtml }} />
                </div>
              )}
              {policyError && (
                <div className="mt-2 text-sm text-slate-700">
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
        )}

        {/* Unsubscribe confirmation modal */}
        {showUnsubscribeModal && (
          <div onClick={() => setShowUnsubscribeModal(false)} className="fixed inset-0 bg-slate-900/30 flex items-center justify-center z-50">
            <div onClick={(e) => e.stopPropagation()} className="bg-white max-w-lg w-full p-6 rounded-lg text-left">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold">Bevestig uitschrijving</h3>
                <button onClick={() => setShowUnsubscribeModal(false)} aria-label="Close" className="text-slate-600 p-2 rounded-md hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-sm text-slate-700">
                <p className="mb-0">Weet je zeker dat je je wilt uitschrijven voor dit programma?</p>

                <div>
                  {loadingCancellationInfo ? (
                    <div className="flex items-center gap-2 text-slate-700">
                      <LoadingSpinner size={16} label="Laden" indicatorClassName="border-b-slate-700" />
                      <span>Annuleringsinfo laden…</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {cancellationWindowLabel && <div className="text-slate-700">Annuleringsperiode: <span className="font-medium text-slate-900">{cancellationWindowLabel}</span></div>}
                      {cancellationCutoff ? (
                        <div className="text-slate-700">Je kunt je uitschrijven tot <span className="font-medium text-slate-900">{cancellationCutoff.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
                      ) : (
                        <div className="text-slate-700">Er is geen specifieke annuleringsduur geconfigureerd — je kunt je uitschrijven.</div>
                      )}
                    </div>
                  )}
                </div>

                {cancellationAllowed === true ? (
                  <div className="flex justify-end">
                    <button onClick={handleUnsubscribe} disabled={unsubscribing} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                      {unsubscribing ? 'Bezig…' : 'Uitschrijven'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-slate-700">De annuleringsperiode is verstreken.</div>

                    <div className="flex flex-wrap items-center gap-4">
                      <button onClick={() => { setShowUnsubscribeModal(false); setShowPolicyModal(true); }} className="text-sm text-blue-600 underline">Bekijk annuleringsbeleid</button>
                      {refundHtml && (
                        <button onClick={() => setShowRefundPolicy((s) => !s)} className="text-sm text-blue-600 underline">Bekijk restitutiebeleid</button>
                      )}
                    </div>

                    {showRefundPolicy && refundHtml && (
                      <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: refundHtml }} />
                    )}

                    {policyContact && (
                      <div className="mt-2 text-sm text-slate-700">
                        <p className="font-semibold mb-1">Neem contact op met de studio</p>
                        {(policyContact.contact_email || policyContact.email) && (
                          <p className="mb-0">E-mail: <a className="text-blue-600 underline" href={`mailto:${policyContact.contact_email || policyContact.email}`}>{policyContact.contact_email || policyContact.email}</a></p>
                        )}
                        {policyContact.phone_number && (
                          <p className="mb-0">Telefoon: <a className="text-blue-600 underline" href={`tel:${policyContact.phone_number}`}>{policyContact.phone_number}</a></p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <BookOpen size={20} className="text-blue-600" />
            Lessen ({lessons.length})
          </h2>

          {lessons.length === 0 ? (
            <div className="text-center py-8 text-slate-600">
              <Calendar className="mx-auto h-12 w-12 text-slate-400 mb-3" />
              <p>Er zijn nog geen lessen gepland voor dit programma.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lessons.slice(0, visibleLessonsCount).map((lesson) => (
                <div
                  key={lesson.id}
                  className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-4">
                        <h3 className="font-medium text-slate-900">
                          {lesson.title}
                        </h3>
                        {lesson.duration_minutes && (
                          <span className="text-sm text-slate-600">
                            {lesson.duration_minutes} min
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {myAbsences[lesson.id] ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-red-600">Afwezig gemeld</span>
                            <span className="text-slate-400 mx-2">•</span>
                            <button
                              onClick={async () => {
                                try {
                                  // Get current user to ensure authentication
                                  const { data: { user } } = await supabase.auth.getUser();
                                  if (!user) {
                                    showError('Je bent niet ingelogd. Vernieuw de pagina en log opnieuw in.');
                                    return;
                                  }

                                  // Get access token for API authentication
                                  const { data: { session } } = await supabase.auth.getSession();
                                  const token = session?.access_token;
                                  if (!token) {
                                    showError('Sessie verlopen. Vernieuw de pagina en log opnieuw in.');
                                    return;
                                  }

                                  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                                  if (token) headers['Authorization'] = `Bearer ${token}`;

                                  const primary = getSelectedEnrollment()
                                  const res = await fetch(`/api/lesson-absences?lesson_id=${lesson.id}${primary ? `&enrollment_id=${primary.id}` : ''}`, {
                                          method: 'DELETE',
                                          headers
                                        })
                                        const json = await res.json()
                                        if (!res.ok) {
                                          showError(json?.error || 'Kon afwezigheid niet ongedaan maken')
                                        } else {
                                          setMyAbsences((prev) => ({ ...prev, [lesson.id]: false }))
                                          showSuccess('Afwezigheid opgeheven')
                                        }
                                } catch (err) {
                                  console.error('Ongedaan maken van afwezigheid mislukt', err)
                                  showError('Kon afwezigheid niet ongedaan maken. Probeer het later opnieuw.')
                                }
                              }}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              Ongedaan maken
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={async () => {
                              try {
                                // Get current user to ensure authentication
                                const { data: { user } } = await supabase.auth.getUser();
                                if (!user) {
                                  showError('Je bent niet ingelogd. Vernieuw de pagina en log opnieuw in.');
                                  return;
                                }

                                // Get access token for API authentication
                                const { data: { session } } = await supabase.auth.getSession();
                                const token = session?.access_token;
                                if (!token) {
                                  showError('Sessie verlopen. Vernieuw de pagina en log opnieuw in.');
                                  return;
                                }

                                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                                if (token) headers['Authorization'] = `Bearer ${token}`;

                                const primary = getSelectedEnrollment()
                                const payload: any = { lesson_id: lesson.id }
                                if (primary) payload.enrollment_id = primary.id
                                const res = await fetch('/api/lesson-absences', {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify(payload)
                                      })
                                      const json = await res.json()
                                      if (!res.ok) {
                                        showError(json?.error || 'Kon niet melden')
                                      } else {
                                        setMyAbsences((prev) => ({ ...prev, [lesson.id]: true }))
                                        showSuccess('Afwezigheid gemeld')
                                      }
                              } catch (err) {
                                console.error('Melden van afwezigheid mislukt', err)
                                showError('Kon niet melden. Probeer het later opnieuw.')
                              }
                            }}
                            className="text-sm text-slate-600 hover:text-red-600"
                          >
                            Afwezigheid melden
                          </button>
                        )}
                      </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 mb-2">
                    {lesson.date && (
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {formatDateOnly(lesson.date)}
                      </span>
                    )}
                    {lesson.time && (
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {formatTime(lesson.time)}{lesson.duration_minutes ? ` - ${formatEndTime(lesson.time, lesson.duration_minutes)}` : ''}
                      </span>
                    )}
                    {lesson.location && (
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {lesson.location.name}
                        {lesson.location.city &&
                          ", " + lesson.location.city}
                      </span>
                    )}
                  </div>

                  {lesson.description && (
                    <p className="text-sm text-slate-600">
                      {lesson.description}
                    </p>
                  )}

                  {/* absence button moved into header for right alignment */}
                </div>
              ))}

              {lessons.length > visibleLessonsCount && (
                <div className="text-center mt-4">
                  <button
                    onClick={() => setVisibleLessonsCount((c) => c + 8)}
                    className="px-4 py-2 bg-slate-100 text-slate-800 rounded-md hover:bg-slate-200"
                  >
                    Laat meer zien
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </ContentContainer>
    </div>
  );
}
