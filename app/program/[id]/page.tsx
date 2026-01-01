'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ContentContainer from '@/components/ContentContainer';
import { supabase } from '@/lib/supabase';
import { missingProfileFields, profileFieldLabel } from '@/lib/profileHelpers';
import Modal from '@/components/Modal';
import LessonDetailsModal from '@/components/LessonDetailsModal';
import { useNotification } from '@/contexts/NotificationContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ArrowLeft, Calendar, Users, Euro, Award, Clock, MapPin, ShoppingCart, Building2 } from 'lucide-react';
import { formatDateOnly, formatTimeStr, formatEndTime } from '@/lib/formatting';
import Link from 'next/link';
import HubTopNav from '@/components/hub/HubTopNav';
import { useDevice } from '@/contexts/DeviceContext';
import { getTagClass } from '@/lib/tagColors'

interface Program {
  id: string;
  title: string;
  description: string | null;
  program_type: string;
  price: number | null;
  capacity: number | null;
  waitlist_enabled?: boolean;
  manual_full_override?: boolean;
  is_public: boolean;
  dance_style: string | null;
  level: string | null;
  min_age: number | null;
  max_age: number | null;
  studio_id: string;
  season_start?: string | null;
  season_end?: string | null;
  show_capacity_to_users?: boolean;
}

interface Studio {
  id: string;
  naam: string;
  stad: string | null;
}

interface Location {
  id: string;
  name: string;
  city?: string | null;
  adres?: string | null;
  postcode?: string | null;
}
interface GroupDetail {
  weekday: number;
  start_time: string;
  end_time: string;
  season_start: string | null;
  season_end: string | null;
}

interface WorkshopDetail {
  date: string | null;
  start_time: string | null;
  end_time: string | null;
}

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const programId = params.id as string;
  const { isMobile } = useDevice();

  const weekdays = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];

  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<Program | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [groupDetails, setGroupDetails] = useState<GroupDetail[]>([]);
  const [workshopDetail, setWorkshopDetail] = useState<WorkshopDetail | null>(null);
  const [lessonsRows, setLessonsRows] = useState<any[]>([]);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [linkedTrialProgram, setLinkedTrialProgram] = useState<{ id: string; title: string } | null>(null);
  const [linkedTrialAvailable, setLinkedTrialAvailable] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [missingFieldsState, setMissingFieldsState] = useState<string[]>([]);
  const [isStudioAdmin, setIsStudioAdmin] = useState(false);
  const [showClassPassList, setShowClassPassList] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<any | null>(null);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [availability, setAvailability] = useState<{ isFull: boolean; waitlistEnabled: boolean; userWaitlistStatus: 'none' | 'waitlisted' | 'accepted' } | null>(null)

  useEffect(() => {
    loadProgramData();
    loadCartData();
    checkStudioAdmin();
    loadAvailability();
  }, [programId]);

  const loadAvailability = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/programs/${programId}/availability`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!res.ok) return
      const json = await res.json()
      setAvailability({
        isFull: !!json?.isFull,
        waitlistEnabled: !!json?.waitlistEnabled,
        userWaitlistStatus: (json?.userWaitlistStatus || 'none')
      })
    } catch {
      // ignore
    }
  }

  const checkStudioAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['studio_admin', 'admin']);

      setIsStudioAdmin(!!roleData && roleData.length > 0);
    } catch (err) {
      console.warn('Could not check studio admin status', err);
    }
  };

  const loadProgramData = async () => {
    try {
      // Load program (anon client). If RLS blocks access for visitors, fall back to
      // a server API that uses the service role but still enforces public-only.
      let programData: any | null = null;
      let studioFromApi: any | null = null;
      let linkedTrialFromApi: { id: string; title: string } | null = null;

      const { data: anonProgramData, error: anonProgramError } = await supabase
        .from('programs')
        .select(`
          *,
          program_locations(location_id, locations(*) ),
          group_details(*),
          workshop_details(*)
        `)
        .eq('id', programId)
        .eq('is_public', true)
        .single();

      if (!anonProgramError && anonProgramData) {
        programData = anonProgramData;
      } else {
        try {
          const res = await fetch(`/api/hub/public-programs/${programId}`);
          const json = await res.json();
          if (res.ok) {
            programData = json?.program || null;
            studioFromApi = json?.studio || null;
            linkedTrialFromApi = json?.linkedTrialProgram || null;
          } else {
            console.error('Program not found:', json?.error || anonProgramError);
          }
        } catch (e) {
          console.error('Program not found:', anonProgramError || e);
        }
      }

      if (!programData) {
        router.push('/hub/studios');
        return;
      }

      setProgram(programData);

      const getAmsterdamDayKey = () => {
        try {
          return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
        } catch {
          return new Date().toISOString().slice(0, 10);
        }
      }

      const normalizeDatePart = (raw: any): string | null => {
        if (!raw) return null;
        const str = String(raw);
        const datePart = str.length >= 10 ? str.slice(0, 10) : str;
        return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
      }

      const getSeasonEndDatePart = (p: any): string | null => {
        const raw =
          (p as any)?.season_end ||
          (Array.isArray((p as any)?.group_details) ? (p as any).group_details?.[0]?.season_end : (p as any)?.group_details?.season_end) ||
          null;
        return normalizeDatePart(raw);
      }

      const isTrialProgramLocal = (p: any) => {
        const t = String((p as any).program_type || '').toLowerCase();
        if (t.includes('trial')) return true;
        if (p?.title && String(p.title).toLowerCase().includes('proef')) return true;
        if ((p as any).is_trial) return true;
        if (p?.price === 0) return true;
        return false;
      }

      const hasUpcomingTrialSchedule = async (trialProgram: any, todayKey: string) => {
        let sawAnyDate = false;
        let hasUpcoming = false;

        const wdRaw = (trialProgram as any)?.workshop_details;
        const list = Array.isArray(wdRaw) ? wdRaw : (wdRaw ? [wdRaw] : []);
        for (const wd of list) {
          const datePart = normalizeDatePart((wd as any)?.date || (wd as any)?.start_datetime || (wd as any)?.startDateTime || null);
          if (!datePart) continue;
          sawAnyDate = true;
          if (datePart >= todayKey) {
            hasUpcoming = true;
            break;
          }
        }

        if (!hasUpcoming) {
          try {
            const { data: lessons, error } = await supabase
              .from('lessons')
              .select('date')
              .eq('program_id', String((trialProgram as any)?.id));
            if (!error && lessons) {
              for (const row of lessons as any[]) {
                const datePart = normalizeDatePart(row?.date);
                if (!datePart) continue;
                sawAnyDate = true;
                if (datePart >= todayKey) {
                  hasUpcoming = true;
                  break;
                }
              }
            }
          } catch {
            // ignore
          }
        }

        return { sawAnyDate, hasUpcoming };
      }

      // If this program links to a proefles program, fetch minimal info
      // so we can show a short callout with title + link on the detail page.
      try {
        const todayKey = getAmsterdamDayKey();
        if (linkedTrialFromApi) {
          setLinkedTrialProgram(linkedTrialFromApi);
          // If API provided it, it already passed the availability check.
          setLinkedTrialAvailable(true);
        } else {
          const linkedId = (programData as any)?.linked_trial_program_id;
          if (linkedId) {
            const { data: linkedData, error: linkedError } = await supabase
              .from('programs')
              .select('id, title, is_public, program_type, price, is_trial, season_end, group_details(*), workshop_details(*)')
              .eq('id', linkedId)
              .maybeSingle();

            if (!linkedError && linkedData && (linkedData as any).is_public === true) {
              // Only show this callout when proeflessen are actually still bookable.
              const seasonEnd = getSeasonEndDatePart(linkedData);
              if (seasonEnd && seasonEnd < todayKey) {
                setLinkedTrialProgram(null);
                setLinkedTrialAvailable(false);
              } else if (isTrialProgramLocal(linkedData)) {
                const { sawAnyDate, hasUpcoming } = await hasUpcomingTrialSchedule(linkedData, todayKey);
                if (sawAnyDate && !hasUpcoming) {
                  setLinkedTrialProgram(null);
                  setLinkedTrialAvailable(false);
                } else {
                  setLinkedTrialProgram({ id: (linkedData as any).id, title: (linkedData as any).title });
                  setLinkedTrialAvailable(true);
                }
              }
            }
          }
        }
      } catch (err) {
        console.info('Could not load linked proefles program data', err);
      }

      // Determine current user's role for this studio so we can decide whether to
      // show capacity even when the program is configured to hide it from visitors.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('studio_id', programData.studio_id)
            .maybeSingle();

          if (roleData && roleData.role) setUserRole(roleData.role);
        }
      } catch (err) {
        // ignore auth/role lookup errors; default will be treated as visitor
  console.info('Could not determine user role for program page', err);
      }

  // extract linked locations if present
  const linked = (programData as any)?.program_locations?.map((pl: any) => pl.locations).filter(Boolean) || [];
  setLocations(linked);

  // Extract group and workshop details from the joined data
  const groupData = (programData as any)?.group_details || [];
  const wdRaw = (programData as any)?.workshop_details;
  const wd0 = Array.isArray(wdRaw) ? (wdRaw[0] || null) : (wdRaw || null);
  setGroupDetails(groupData);
  if (wd0) {
    const legacyStart = (wd0 as any).start_datetime || null;
    const legacyEnd = (wd0 as any).end_datetime || null;
    const derive = (iso?: string | null) => {
      if (!iso) return null;
      try { return new Date(iso).toISOString().slice(11,16) } catch { return null }
    };
    setWorkshopDetail({
      date: (wd0 as any).date || (legacyStart ? String(legacyStart).slice(0,10) : null),
      start_time: (wd0 as any).start_time || derive(legacyStart),
      end_time: (wd0 as any).end_time || derive(legacyEnd),
    });
  } else {
    setWorkshopDetail(null);
  }

  // Load persisted lessons for this program as well (some proeflessen are stored
  // in the lessons table rather than workshop_details). We'll merge these with
  // workshop_details when rendering the proeflessen list.
  try {
    const { data: lessonsData, error: lessonsError } = await supabase
      .from('lessons')
      .select('*')
      .eq('program_id', programId)
      .order('date', { ascending: true });

    if (lessonsError) {
  console.info('Could not load lessons for program:', lessonsError);
      setLessonsRows([]);
    } else {
      setLessonsRows(lessonsData || []);
    }
  } catch (err) {
  console.info('Failed to fetch lessons for program:', err);
    setLessonsRows([]);
  }

      // Load studio info (prefer API response when anon RLS is restrictive)
      if (studioFromApi) {
        setStudio(studioFromApi);
      } else {
        const { data: studioData } = await supabase
          .from('studios')
          .select('id, naam, stad')
          .eq('id', programData.studio_id)
          .single();

        if (studioData) {
          setStudio(studioData);
        }
      }
    } catch (err) {
      console.error('Failed to load program:', err);
      router.push('/hub/studios');
    } finally {
      setLoading(false);
    }
  };

  const loadCartData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get active cart for this user
      const { data: cartData, error: cartError } = await supabase
        .from('carts')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (cartError || !cartData) {
        setCartItemCount(0);
        return;
      }

      // Get cart items count
      const { count, error: countError } = await supabase
        .from('cart_items')
        .select('*', { count: 'exact', head: true })
        .eq('cart_id', cartData.id);

      if (countError) {
        console.error('Failed to load cart item count:', countError);
        setCartItemCount(0);
      } else {
        setCartItemCount(count || 0);
      }
    } catch (err) {
      console.error('Failed to load cart data:', err);
      setCartItemCount(0);
    }
  };

  const { showModal } = useNotification()

  const handleAddToCart = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push(`/auth/login?redirect=/program/${programId}`);
      return;
    }

    // Block studio admins from adding to cart
    if (isStudioAdmin) {
      alert('Als studio admin kunt u zich niet inschrijven voor programma\'s. Maak een apart gebruikersaccount aan voor inschrijvingen.');
      return;
    }

    // Waitlist/fullness gate (server-checked)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/programs/${programId}/availability`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      const json = res.ok ? await res.json() : null
      const isFull = !!json?.isFull
      const waitlistEnabled = !!json?.waitlistEnabled
      const userWaitlistStatus = (json?.userWaitlistStatus || 'none') as any
      setAvailability({ isFull, waitlistEnabled, userWaitlistStatus })

      if (isFull) {
        if (!waitlistEnabled) {
          showModal('Programma volzet', 'Dit programma is volgeboekt.')
          return
        }

        if (userWaitlistStatus === 'accepted') {
          // allowed to proceed to checkout even when full
        } else if (userWaitlistStatus === 'waitlisted') {
          showModal('Wachtlijst', 'Je staat al op de wachtlijst voor dit programma.')
          return
        } else {
          // Join waitlist
          const joinRes = await fetch(`/api/programs/${programId}/waitlist`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
          })
          const joinJson = await joinRes.json().catch(() => null)
          if (!joinRes.ok) {
            showModal('Wachtlijst', joinJson?.error || 'Kon je niet op de wachtlijst zetten.')
            return
          }
          setAvailability({ isFull, waitlistEnabled, userWaitlistStatus: 'waitlisted' })
          showModal('Wachtlijst', 'Je staat op de wachtlijst. Je krijgt een melding als er een plaats vrijkomt.')
          return
        }
      }
    } catch {
      // if availability check fails, allow existing flow to proceed
    }

    // Check profile completeness before allowing add-to-cart
    try {
      const { data: up } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const snapshot = up ? {
        first_name: up.first_name || up.voornaam || null,
        last_name: up.last_name || up.achternaam || null,
        street: up.street || up.adres || null,
        house_number: up.house_number || up.huisnummer || null,
        house_number_addition: up.house_number_addition || up.huisnummer_toevoeging || null,
        postal_code: up.postal_code || up.postcode || null,
        city: up.city || up.stad || null,
        phone_number: up.phone_number || up.telefoon || null,
        email: up.email || null,
        date_of_birth: up.date_of_birth || up.geboortedatum || null,
      } : {
        first_name: user.user_metadata?.first_name || user.user_metadata?.voornaam || null,
        last_name: user.user_metadata?.last_name || user.user_metadata?.achternaam || null,
        street: user.user_metadata?.street || user.user_metadata?.adres || null,
        house_number: user.user_metadata?.house_number || user.user_metadata?.huisnummer || null,
        house_number_addition: user.user_metadata?.house_number_addition || user.user_metadata?.huisnummer_toevoeging || null,
        postal_code: user.user_metadata?.postal_code || user.user_metadata?.postcode || null,
        city: user.user_metadata?.city || user.user_metadata?.stad || null,
        phone_number: user.user_metadata?.phone_number || user.user_metadata?.telefoon || null,
        email: user.email || user.user_metadata?.email || null,
        date_of_birth: user.user_metadata?.date_of_birth || user.user_metadata?.geboortedatum || null,
      }

      const missing = missingProfileFields(snapshot)
      if (missing.length > 0) {
        // show a friendly modal with missing fields instead of an alert
        setMissingFieldsState(missing)
        setShowProfileModal(true)
        return
      }
    } catch (err) {
      console.warn('Could not validate profile completeness before add-to-cart', err)
      // allow operation to proceed if validation fails unexpectedly
    }

    setAddingToCart(true);

    try {
      // Get or create active cart for this user and studio
      let { data: cart } = await supabase
        .from('carts')
        .select('id')
        .eq('user_id', user.id)
        .eq('studio_id', program?.studio_id)
        .eq('status', 'active')
        .maybeSingle();

      if (!cart) {
        // Create new cart
        const { data: newCart, error: cartError } = await supabase
          .from('carts')
          .insert({
            user_id: user.id,
            studio_id: program?.studio_id,
            status: 'active'
          })
          .select()
          .single();

        if (cartError) throw cartError;
        cart = newCart;
      }

      // Check if item already in cart
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('id')
        .eq('cart_id', cart!.id)
        .eq('program_id', programId)
        .maybeSingle();

      if (existingItem) {
        showModal('Programma al in winkelmandje', 'Dit programma zit al in je winkelmandje.', () => { router.push('/cart') })
        return;
      }

      // Add to cart
      const { error: itemError } = await supabase
        .from('cart_items')
        .insert({
          cart_id: cart!.id,
          program_id: programId,
          sub_profile_id: null,
          price_snapshot: program?.price || 0,
          currency: 'EUR'
        });

  if (itemError) throw itemError;

  showModal('Programma toegevoegd', 'Het programma is toegevoegd aan je winkelmandje.', () => { router.push('/cart') })
    } catch (err) {
      console.error('Failed to add to cart:', err);
      alert('Er ging iets mis. Probeer het opnieuw.');
    } finally {
      setAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" label="Laden" />
          <p className="text-slate-600">Programma laden…</p>
        </div>
        {showProfileModal && (
          <Modal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} ariaLabel="Profiel aanvullen">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Profiel niet compleet</h3>
              <p className="text-sm text-gray-600 mb-4">Vul eerst je profiel aan met de volgende velden om in te schrijven:</p>
              <ul className="list-disc pl-5 mb-4 space-y-1">
                {missingFieldsState.map((f) => (
                  <li key={f} className="text-sm text-slate-800">{profileFieldLabel(f)}</li>
                ))}
              </ul>
              <div className="flex justify-end">
                <button
                  onClick={() => { setShowProfileModal(false); router.push('/profile'); }}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  Vul profiel aan
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // pick first linked location if present
  const firstLocation = locations && locations.length > 0 ? locations[0] : null;

  // season date helpers: prefer program-level season fields, fall back to group/workshop details
  const seasonStartRaw = program?.season_start || (groupDetails && groupDetails.length > 0 ? groupDetails[0].season_start : null) || (workshopDetail?.date || null);
  const seasonEndRaw = program?.season_end || (groupDetails && groupDetails.length > 0 ? groupDetails[0].season_end : null) || null;
  const seasonStart = seasonStartRaw ? String(seasonStartRaw) : null;
  const seasonEnd = seasonEndRaw ? String(seasonEndRaw) : null;

  const getAmsterdamDayKey = () => {
    try {
      return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  const normalizeDatePart = (raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw);
    const datePart = str.length >= 10 ? str.slice(0, 10) : str;
    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
  }

  const isPastSeasonEndByDay = (endRaw: string | null, todayKey: string) => {
    const end = normalizeDatePart(endRaw);
    if (!end) return false;
    return end < todayKey;
  }

  // helper to detect trial programs (proeflessen)
  const isTrialProgram = (p: any) => {
    const t = String((p as any).program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (p?.title && String(p.title).toLowerCase().includes('proef')) return true;
    if ((p as any).is_trial) return true;
    if (p?.price === 0) return true;
    return false;
  }

  // Build a unified list of trial items (workshops + persisted lessons)
  const getTrialItems = () => {
    const items: any[] = [];

    if (workshopDetail && workshopDetail.date) {
      const start = workshopDetail.start_time ? `${workshopDetail.date}T${workshopDetail.start_time}` : `${workshopDetail.date}T00:00:00`;
      const end = workshopDetail.end_time ? `${workshopDetail.date}T${workshopDetail.end_time}` : null;
      items.push({
        id: `workshop-0`,
        start_datetime: start,
        end_datetime: end,
        type: 'workshop',
        metadata: workshopDetail,
      });
    }

    if (lessonsRows && lessonsRows.length > 0) {
      lessonsRows.forEach((l: any) => {
        // lesson rows have date and time fields
        const start = l.date && l.time ? `${l.date}T${l.time}` : (l.date ? `${l.date}T00:00:00` : null);
        let end = null;
        try {
          if (start && l.duration_minutes) {
            const d = new Date(start);
            d.setMinutes(d.getMinutes() + Number(l.duration_minutes || 0));
            end = d.toISOString();
          }
        } catch {
          // ignore date parse errors
        }

        items.push({
          id: l.id,
          start_datetime: start,
          end_datetime: end,
          type: 'workshop',
          metadata: l,
        });
      });
    }

    // sort by start_datetime (fallback to id ordering)
    items.sort((a, b) => {
      if (a.start_datetime && b.start_datetime) return new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime();
      if (a.start_datetime) return -1;
      if (b.start_datetime) return 1;
      return String(a.id).localeCompare(String(b.id));
    });

    return items;
  }

  // Instead of directly inserting an enrollment for proeflessen, add the
  // selected lesson to the user's active cart so they can checkout per-lesson.
  const handleAddLessonToCart = async (detail: any, detailType: 'workshop' | 'group') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/auth/login?redirect=/program/${programId}`);
      return;
    }

    // Check profile completeness
    try {
      const { data: up } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const snapshot = up ? {
        first_name: up.first_name || up.voornaam || null,
        last_name: up.last_name || up.achternaam || null,
        street: up.street || up.adres || null,
        house_number: up.house_number || up.huisnummer || null,
        house_number_addition: up.house_number_addition || up.huisnummer_toevoeging || null,
        postal_code: up.postal_code || up.postcode || null,
        city: up.city || up.stad || null,
        phone_number: up.phone_number || up.telefoon || null,
        email: up.email || null,
        date_of_birth: up.date_of_birth || up.geboortedatum || null,
      } : {
        first_name: user.user_metadata?.first_name || user.user_metadata?.voornaam || null,
        last_name: user.user_metadata?.last_name || user.user_metadata?.achternaam || null,
        street: user.user_metadata?.street || user.user_metadata?.adres || null,
        house_number: user.user_metadata?.house_number || user.user_metadata?.huisnummer || null,
        house_number_addition: user.user_metadata?.house_number_addition || user.user_metadata?.huisnummer_toevoeging || null,
        postal_code: user.user_metadata?.postal_code || user.user_metadata?.postcode || null,
        city: user.user_metadata?.city || user.user_metadata?.stad || null,
        phone_number: user.user_metadata?.phone_number || user.user_metadata?.telefoon || null,
        email: user.email || user.user_metadata?.email || null,
        date_of_birth: user.user_metadata?.date_of_birth || user.user_metadata?.geboortedatum || null,
      }

      const missing = missingProfileFields(snapshot)
      if (missing.length > 0) {
        setMissingFieldsState(missing)
        setShowProfileModal(true)
        return
      }
    } catch (err) {
      console.warn('Could not validate profile completeness before add-to-cart', err)
    }

    setAddingToCart(true);

    try {
      // Get or create active cart for this user and studio
      let { data: cart } = await supabase
        .from('carts')
        .select('id')
        .eq('user_id', user.id)
        .eq('studio_id', program?.studio_id)
        .eq('status', 'active')
        .maybeSingle();

      if (!cart) {
        // Create new cart
        const { data: newCart, error: cartError } = await supabase
          .from('carts')
          .insert({
            user_id: user.id,
            studio_id: program?.studio_id,
            status: 'active'
          })
          .select()
          .single();

        if (cartError) throw cartError;
        cart = newCart;
      }

      // Check if same lesson already in cart
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('id')
        .eq('cart_id', cart!.id)
        .eq('program_id', programId)
        .eq('lesson_detail_id', detail.id || null)
        .maybeSingle();

      if (existingItem) {
        showModal('Proefles al in winkelmandje', 'Deze proefles staat al in je winkelmandje.', () => { router.push('/cart') })
        return;
      }

      // Add lesson to cart
      const { error: itemError } = await supabase
        .from('cart_items')
        .insert({
          cart_id: cart!.id,
          program_id: programId,
          sub_profile_id: null,
          lesson_detail_type: detailType,
          lesson_detail_id: detail.id || null,
          lesson_metadata: detail,
          price_snapshot: program?.price || 0,
          currency: 'EUR'
        });

      if (itemError) throw itemError;

      showModal('Proefles toegevoegd', 'De proefles is toegevoegd aan je winkelmandje.', () => { router.push('/cart') })
    } catch (err) {
      // Provide richer error output — Supabase errors can be non-enumerable so
      // JSON.stringify may help. Also surface a user-friendly message when
      // an error.message is present.
      try {
        const errMsg = err && (err as any).message ? (err as any).message : JSON.stringify(err, Object.getOwnPropertyNames(err));
        console.error('Failed to add lesson to cart:', err, 'stringified:', errMsg);
        alert(errMsg || 'Er ging iets mis. Probeer het opnieuw.');
      } catch {
        console.error('Failed to add lesson to cart (could not stringify error):', err);
        alert('Er ging iets mis. Probeer het opnieuw.');
      }
    } finally {
      setAddingToCart(false);
    }
  }

  if (!program) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Programma niet gevonden</h1>
          <p className="text-slate-600 mb-6">Dit programma bestaat niet of is niet beschikbaar.</p>
          <button
            onClick={() => router.push('/hub/studios')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Terug naar HUB3
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Mobile nav is provided by MobileShell in the root layout for /program routes */}
      {!isMobile && <HubTopNav />}
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <ContentContainer className="py-4">
                    <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Terug
            </button>
          </div>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                {studio && (
                  <>
                    <Building2 className="w-4 h-4" />
                    <span>{studio.naam}</span>
                  </>
                )}
              </div>

              <div className="flex items-start gap-3 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex-1 min-w-0">{program.title}</h1>
                {/* Mobile: cart icon aligned with title */}
                <Link
                  href="/cart"
                  className="md:hidden relative p-2 text-slate-600 hover:text-slate-900 transition-colors -mt-1"
                  title="Winkelmandje bekijken"
                >
                  <ShoppingCart className="w-6 h-6" />
                  {cartItemCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                      {cartItemCount > 99 ? '99+' : cartItemCount}
                    </span>
                  )}
                </Link>
              </div>

              {/* Always show the tags under the title */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {/* program type tag */}
                <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${program.program_type === 'group' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200'}`}>
                  {program.program_type === 'group' ? 'Cursus' : 'Workshop'}
                </span>

                {/* Always show the following tags: dance style, level, age info */}
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {program.dance_style && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass(program.dance_style)}`}>
                      {program.dance_style}
                    </span>
                  )}
                  {program.level && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass(program.level)}`}>
                      {program.level}
                    </span>
                  )}
                  {(program.min_age !== undefined && program.min_age !== null) && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass(String(program.min_age))}`}>
                      {program.min_age}+ jaar
                    </span>
                  )}
                  {(program.max_age !== undefined && program.max_age !== null && !program.min_age) && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass(String(program.max_age))}`}>
                      tot {program.max_age} jaar
                    </span>
                  )}
                  {(!program.min_age && !program.max_age) && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getTagClass('all')}`}>
                      Alle leeftijden
                    </span>
                  )}
                </div>
              </div>

              {/* location and season removed from header per design */}
            </div>
            <div className="flex items-center justify-between md:justify-end gap-4">
              {/* Desktop: cart icon */}
              <Link
                href="/cart"
                className="hidden md:inline-flex relative p-2 text-slate-600 hover:text-slate-900 transition-colors"
                title="Winkelmandje bekijken"
              >
                <ShoppingCart className="w-6 h-6" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                    {cartItemCount > 99 ? '99+' : cartItemCount}
                  </span>
                )}
              </Link>
              {program.price && (
                <div className="text-right">
                  <div className="text-3xl font-bold text-slate-900">€{program.price}</div>
                  <div className="text-sm text-slate-500">per seizoen</div>
                </div>
              )}
            </div>
          </div>
        </ContentContainer>
      </div>

      <ContentContainer className="py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Mobile: show description first */}
            {isMobile && program.description && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Over dit programma</h2>
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{program.description}</p>
              </div>
            )}
            {/* Description block moved below Programma details to avoid duplication */}

            {/* Details */}
            {/* If this is a proeflessen (trial) program, show the list of available proeflessen */}
            {isTrialProgram(program) ? (
              <>
                {/* Programma details section for trial programs */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900 mb-4">Programma details</h2>
                  <div className="grid grid-cols-2 md:grid-cols-2 gap-3 sm:gap-4">
                    {program.program_type === 'workshop' && workshopDetail && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-cyan-50 dark:bg-transparent border border-cyan-100 dark:border-cyan-500/40 rounded-lg flex items-center justify-center shrink-0">
                          <Calendar className="w-5 h-5 text-cyan-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm text-slate-500">Datum</div>
                          <div className="font-semibold text-slate-900">
                            {workshopDetail.date ? formatDateOnly(workshopDetail.date) : '—'}
                          </div>
                        </div>
                      </div>
                    )}
                    {program.program_type === 'workshop' && workshopDetail && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-50 dark:bg-transparent border border-indigo-100 dark:border-indigo-500/40 rounded-lg flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm text-slate-500">Tijd</div>
                          <div className="font-semibold text-slate-900">
                            {workshopDetail.start_time ? formatTimeStr(workshopDetail.start_time) : ''}{workshopDetail.end_time ? ` - ${formatTimeStr(workshopDetail.end_time)}` : ''}
                          </div>
                        </div>
                      </div>
                    )}
                    {program.program_type === 'group' && groupDetails.length > 0 && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-cyan-50 dark:bg-transparent border border-cyan-100 dark:border-cyan-500/40 rounded-lg flex items-center justify-center shrink-0">
                          <Calendar className="w-5 h-5 text-cyan-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm text-slate-500">Weekdag</div>
                          <div className="font-semibold text-slate-900">
                            {weekdays[groupDetails[0].weekday]}
                          </div>
                        </div>
                      </div>
                    )}
                    {program.program_type === 'group' && groupDetails.length > 0 && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-50 dark:bg-transparent border border-indigo-100 dark:border-indigo-500/40 rounded-lg flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm text-slate-500">Tijd</div>
                          <div className="font-semibold text-slate-900">
                            {groupDetails[0].start_time.slice(0, 5)} - {groupDetails[0].end_time.slice(0, 5)}
                          </div>
                        </div>
                      </div>
                    )}
                    {program.dance_style && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-green-50 dark:bg-transparent border border-green-100 dark:border-green-500/40 rounded-lg flex items-center justify-center shrink-0">
                          <Award className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm text-slate-500">Dansstijl</div>
                          <div className="font-semibold text-slate-900">{program.dance_style}</div>
                        </div>
                      </div>
                    )}
                    {firstLocation && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-yellow-50 dark:bg-transparent border border-yellow-100 dark:border-yellow-500/40 rounded-lg flex items-center justify-center shrink-0">
                          <MapPin className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm text-slate-500">Locatie</div>
                          <div className="font-semibold text-slate-900">{firstLocation.name}</div>
                          <div className="text-sm text-slate-600">{[firstLocation.adres, firstLocation.postcode, firstLocation.city].filter(Boolean).join(' ')}</div>
                        </div>
                      </div>
                    )}

                    {/* Season intentionally omitted for trial programs */}

                    {program.level && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-orange-50 dark:bg-transparent border border-orange-100 dark:border-orange-500/40 rounded-lg flex items-center justify-center shrink-0">
                          <Award className="w-5 h-5 text-orange-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm text-slate-500">Niveau</div>
                          <div className="font-semibold text-slate-900">{program.level}</div>
                        </div>
                      </div>
                    )}
                    {program.capacity && ((program.show_capacity_to_users ?? true) || userRole === 'teacher' || userRole === 'studio_admin') && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-50 dark:bg-transparent border border-blue-100 dark:border-blue-500/40 rounded-lg flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm text-slate-500">Max. deelnemers</div>
                          <div className="font-semibold text-slate-900">{program.capacity} personen</div>
                          {availability?.waitlistEnabled && (
                            <div className="text-xs text-slate-600 mt-1">Wachtlijst actief wanneer volzet</div>
                          )}
                        </div>
                      </div>
                    )}
                    {(program.min_age || program.max_age) && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-purple-50 dark:bg-transparent border border-purple-100 dark:border-purple-500/40 rounded-lg flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm text-slate-500">Leeftijd</div>
                          <div className="font-semibold text-slate-900">
                            {program.min_age && program.max_age
                              ? `${program.min_age} - ${program.max_age} jaar`
                              : program.min_age
                              ? `${program.min_age}+ jaar`
                              : `tot ${program.max_age} jaar`}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Proeflessen section */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900 mb-4">Proeflessen</h2>
                  <div className="space-y-4">
                    {(() => {
                      const todayKey = getAmsterdamDayKey();
                      const expiredBySeason = isPastSeasonEndByDay(seasonEnd, todayKey);

                      const itemsAll = getTrialItems();
                      const itemsUpcoming = itemsAll.filter((w: any) => {
                        const datePart = normalizeDatePart(w?.start_datetime);
                        if (!datePart) return true; // no date info: keep
                        return datePart >= todayKey;
                      });

                      // If all proeflessen are in the past or season end has passed: hide this section.
                      if (expiredBySeason || (itemsAll.length > 0 && itemsUpcoming.length === 0)) {
                        return null;
                      }

                      if (itemsUpcoming.length > 0) {
                        return itemsUpcoming.map((w: any) => (
                          <div key={w.id || w.start_datetime} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700/60 rounded-lg">
                            <div>
                              <div className="font-semibold text-slate-900">{w.start_datetime ? new Date(w.start_datetime).toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Datum onbekend'}</div>
                              <div className="text-sm text-slate-700">{w.start_datetime ? new Date(w.start_datetime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : ''}{w.end_datetime ? ` - ${new Date(w.end_datetime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : ''}</div>
                            </div>
                            <div>
                              <button onClick={() => handleAddLessonToCart(w.metadata || w, 'workshop')} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Reserveer</button>
                            </div>
                          </div>
                        ));
                      }

                      if (!expiredBySeason && groupDetails && groupDetails.length > 0) {
                        return groupDetails.map((g: any, idx: number) => (
                          <div key={g.id || idx} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700/60 rounded-lg">
                            <div>
                              <div className="font-semibold text-slate-900">{weekdays[g.weekday]}</div>
                              <div className="text-sm text-slate-700">{formatTimeStr(g.start_time)} - {formatTimeStr(g.end_time)}</div>
                            </div>
                            <div>
                              <button onClick={() => handleAddLessonToCart(g, 'group')} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Reserveer</button>
                            </div>
                          </div>
                        ));
                      }

                      return null;
                    })()}
                  </div>

                  {/* Extra info for proefles checkout */}
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="text-sm text-slate-600 space-y-2">
                      <p>✓ Veilige checkout</p>
                      <p>✓ Groepskortingen mogelijk</p>
                      <p>✓ Formulieren na betaling</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Programma details</h2>
                <div className="grid grid-cols-2 md:grid-cols-2 gap-3 sm:gap-4">
                {program.program_type === 'workshop' && workshopDetail && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-cyan-50 dark:bg-transparent border border-cyan-100 dark:border-cyan-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Datum</div>
                      <div className="font-semibold text-slate-900">
                        {workshopDetail.date ? formatDateOnly(workshopDetail.date) : '—'}
                      </div>
                    </div>
                  </div>
                )}
                {program.program_type === 'workshop' && workshopDetail && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-50 dark:bg-transparent border border-indigo-100 dark:border-indigo-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Tijd</div>
                      <div className="font-semibold text-slate-900">
                        {workshopDetail.start_time ? workshopDetail.start_time.slice(0,5) : ''}{workshopDetail.end_time ? ` - ${workshopDetail.end_time.slice(0,5)}` : ''}
                      </div>
                    </div>
                  </div>
                )}
                {program.program_type === 'group' && groupDetails.length > 0 && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-cyan-50 dark:bg-transparent border border-cyan-100 dark:border-cyan-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Weekdag</div>
                      <div className="font-semibold text-slate-900">
                        {weekdays[groupDetails[0].weekday]}
                      </div>
                    </div>
                  </div>
                )}
                {program.program_type === 'group' && groupDetails.length > 0 && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-50 dark:bg-transparent border border-indigo-100 dark:border-indigo-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Tijd</div>
                      <div className="font-semibold text-slate-900">
                        {groupDetails[0].start_time.slice(0, 5)} - {groupDetails[0].end_time.slice(0, 5)}
                      </div>
                    </div>
                  </div>
                )}
                {program.dance_style && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-green-50 dark:bg-transparent border border-green-100 dark:border-green-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <Award className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Dansstijl</div>
                      <div className="font-semibold text-slate-900">{program.dance_style}</div>
                    </div>
                  </div>
                )}
                {firstLocation && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-yellow-50 dark:bg-transparent border border-yellow-100 dark:border-yellow-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Locatie</div>
                      <div className="font-semibold text-slate-900">{firstLocation.name}</div>
                      <div className="text-xs sm:text-sm text-slate-600 wrap-break-word">{[firstLocation.adres, firstLocation.postcode, firstLocation.city].filter(Boolean).join(' ')}</div>
                    </div>
                  </div>
                )}

                {/* Season as a separate block with its own icon */}
                {(seasonStart || seasonEnd) && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-cyan-50 dark:bg-transparent border border-cyan-100 dark:border-cyan-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Seizoen</div>
                      <div className="font-semibold text-slate-900">{seasonStart ? formatDateOnly(seasonStart) : '—'}{(seasonStart || seasonEnd) ? ' — ' : ''}{seasonEnd ? formatDateOnly(seasonEnd) : ''}</div>
                    </div>
                  </div>
                )}

                {program.level && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-orange-50 dark:bg-transparent border border-orange-100 dark:border-orange-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <Award className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Niveau</div>
                      <div className="font-semibold text-slate-900">{program.level}</div>
                    </div>
                  </div>
                )}
                {program.capacity && ((program.show_capacity_to_users ?? true) || userRole === 'teacher' || userRole === 'studio_admin') && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-50 dark:bg-transparent border border-blue-100 dark:border-blue-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Max. deelnemers</div>
                      <div className="font-semibold text-slate-900">{program.capacity} personen</div>
                    </div>
                  </div>
                )}
                {(program.min_age || program.max_age) && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-purple-50 dark:bg-transparent border border-purple-100 dark:border-purple-500/40 rounded-lg flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500">Leeftijd</div>
                      <div className="font-semibold text-slate-900">
                        {program.min_age && program.max_age
                          ? `${program.min_age} - ${program.max_age} jaar`
                          : program.min_age
                          ? `${program.min_age}+ jaar`
                          : `tot ${program.max_age} jaar`}
                      </div>
                    </div>
                  </div>
                )}
                {/* Lesduur removed per request */}
              </div>
            </div>
          )}

            {/* Description (desktop + non-mobile order) */}
            {!isMobile && program.description && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Over dit programma</h2>
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{program.description}</p>
              </div>
            )}
          </div>

          {/* Sidebar - Add to Cart */}
          <div>
            {linkedTrialProgram && linkedTrialAvailable && (
                <div className="mb-4 p-4 bg-white border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Proeflessen beschikbaar</div>
                    <div className="text-sm text-slate-900 truncate max-w-xs">{linkedTrialProgram.title}</div>
                  </div>
                  <div>
                    <Link href={`/program/${linkedTrialProgram.id}`} className="inline-flex items-center px-3 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
                      Bekijk proeflessen
                    </Link>
                  </div>
                </div>
              </div>
            )}
            {!isTrialProgram(program) && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 sticky top-6">
                <h3 className="font-semibold text-slate-900 mb-4">Inschrijven</h3>
              
              <div className="mb-4 p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-600">Prijs</span>
                  <span className="text-2xl font-bold text-slate-900">
                    {program.price ? `€${program.price}` : 'Gratis'}
                  </span>
                </div>
                <div className="text-sm text-slate-500">
                  {program.program_type === 'workshop' ? 'per workshop' : 'per seizoen'}
                </div>
              </div>

              {(program as any)?.accepts_class_passes && (
                <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="mt-2">
                    <button
                      onClick={() => setShowClassPassList(true)}
                      className="float-right ml-4 px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm whitespace-nowrap text-center leading-tight"
                    >
                      {'Gebruik Class\u00A0Pass'}
                    </button>

                    <div className="text-sm text-purple-700">
                      Je kan voor individuele lessen inschrijven met een Class Pass voor dit programma.
                    </div>

                    <div className="clear-both" />
                  </div>
                </div>
              )}

              {!isTrialProgram(program) && !isStudioAdmin && (
                <button
                  onClick={handleAddToCart}
                  disabled={addingToCart}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingToCart ? (
                    <>
                      <LoadingSpinner
                        size={20}
                        className="shrink-0"
                        trackClassName="border-transparent"
                        indicatorClassName="border-b-white"
                        label="Laden"
                      />
                      {(availability?.isFull && availability?.waitlistEnabled && availability?.userWaitlistStatus !== 'accepted') ? 'Aanmelden...' : 'Toevoegen...'}
                    </>
                  ) : (
                    <>
                      {(availability?.isFull && availability?.waitlistEnabled && availability?.userWaitlistStatus !== 'accepted') ? (
                        <>
                          <Clock className="w-5 h-5" />
                          Op wachtlijst
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-5 h-5" />
                          Toevoegen aan winkelmandje
                        </>
                      )}
                    </>
                  )}
                </button>
              )}

              {isStudioAdmin && (
                <div className="w-full p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-800">
                    <Building2 className="w-5 h-5" />
                    <span className="font-medium">Studio Admin</span>
                  </div>
                  <p className="text-sm text-amber-700 mt-1">
                    Als studio admin kunt u zich niet inschrijven voor programma's. Maak een apart gebruikersaccount aan voor inschrijvingen.
                  </p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="text-sm text-slate-600 space-y-2">
                  <p>✓ Veilige checkout</p>
                  <p>✓ Groepskortingen mogelijk</p>
                  <p>✓ Formulieren na betaling</p>
                </div>
              </div>
              </div>
            )}
          </div>
        </div>
      </ContentContainer>
      {showProfileModal && (
        <Modal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} ariaLabel="Profiel aanvullen">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-2">Profiel niet compleet</h3>
            <p className="text-sm text-gray-600 mb-4">Vul eerst je profiel aan met de volgende velden om in te schrijven:</p>
            <ul className="list-disc pl-5 mb-4 space-y-1">
              {missingFieldsState.map((f) => (
                <li key={f} className="text-sm text-slate-800">{profileFieldLabel(f)}</li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                onClick={() => { setShowProfileModal(false); router.push('/profile'); }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Vul profiel aan
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showClassPassList && (
        <Modal isOpen={showClassPassList} onClose={() => setShowClassPassList(false)} ariaLabel="Class Pass lessen">
          <div>
            <h3 className="text-lg font-semibold mb-4">Lessen — Gebruik Class Pass</h3>
            <div className="text-sm text-slate-600 mb-4">Kies een les om je in te schrijven met een Class Pass. De status en beschikbare credits worden per les gecontroleerd.</div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {(() => {
                const items = getTrialItems();
                if (!items || items.length === 0) return <div className="text-slate-600">Geen lessen gevonden voor dit programma.</div>;
                return items.map((it: any) => (
                  <div key={it.id || it.start_datetime} className="flex items-center justify-between p-3 border border-slate-100 bg-white rounded-lg">
                    <div>
                      <div className="font-semibold text-slate-900">{it.start_datetime ? new Date(it.start_datetime).toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Onbekende datum'}</div>
                      <div className="text-sm text-slate-700">{it.start_datetime ? new Date(it.start_datetime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setSelectedLesson(it.metadata || it); setShowLessonModal(true); setShowClassPassList(false); }} className="px-3 py-2 bg-purple-600 text-white rounded-md">Gebruik</button>
                    </div>
                  </div>
                ));
              })()}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {studio && (
                <Link href={`/studio/${studio.id}/class-passes`} className="px-3 py-2 border rounded-md text-sm">Koop Class Pass</Link>
              )}
              <button onClick={() => setShowClassPassList(false)} className="px-3 py-2 bg-slate-100 rounded-md">Sluiten</button>
            </div>
          </div>
        </Modal>
      )}

      {showLessonModal && selectedLesson && (
        <LessonDetailsModal
          program={program as any}
          lesson={selectedLesson}
          onClose={() => { setShowLessonModal(false); setSelectedLesson(null); }}
          onBack={() => { setShowLessonModal(false); setShowClassPassList(true); }}
          onSuccess={() => { setShowLessonModal(false); setSelectedLesson(null); }}
        />
      )}
    </div>
  );
}

// Render modal outside of main component's return would be unreachable; instead
// the Modal is controlled inside the component's JSX (React requires it be inside).
