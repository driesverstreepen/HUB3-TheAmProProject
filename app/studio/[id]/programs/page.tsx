"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Calendar, Plus, Edit, Trash2, X, MapPin, Users, Eye, Grid, List, Check } from 'lucide-react';
import ProgramListItem from '@/components/ProgramListItem';
import UserDetailsModal from '@/components/UserDetailsModal';
import ActionIcon from '@/components/ActionIcon';
import { formatTimeStr, formatDateOnly } from '@/lib/formatting';
import Select from '@/components/Select';
import DANCE_STYLES from '@/lib/danceStyles';
import type { Program, Location, GroupDetails, WorkshopDetails, InschrijvingWithDetails } from '@/types/database';
import { useStudioFeatures } from '@/hooks/useStudioFeatures';
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears';
import { useNotification } from '@/contexts/NotificationContext';
import { FeatureGate } from '@/components/FeatureGate';
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface ProgramWithDetails extends Program {
  group_details?: GroupDetails;
  workshop_details?: WorkshopDetails;
  locations?: Location[];
  teacher_ids?: string[];
  linked_trial_program_id?: string | null;
  linked_trial_program_title?: string | null;
}

export default function ProgramsPage() {
  const params = useParams();
  const studioId = params.id as string;
  const { hasFeature } = useStudioFeatures(studioId);
  const { selectedYearId: activeYearId, missingTable: schoolYearsMissing } = useStudioSchoolYears(studioId);
  const { showError, showSuccess } = useNotification();
  const { isArmed: isProgramDeleteArmed, confirmOrArm: confirmOrArmProgramDelete } = useTwoStepConfirm<string>(4500);
  const [programs, setPrograms] = useState<ProgramWithDetails[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [membersMap, setMembersMap] = useState<Record<string, InschrijvingWithDetails[]>>({});
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [, setLoadingMembers] = useState<Record<string, boolean>>({});
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedUserEnrollments, setSelectedUserEnrollments] = useState<any[]>([]);
  const [confirmDeleteMap, setConfirmDeleteMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProgram, setEditingProgram] = useState<ProgramWithDetails | null>(null);
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [activeTab, setActiveTab] = useState<'group' | 'workshop' | 'proeflessen'>('group');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [studioFeatures, setStudioFeatures] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    program_type: 'group' as 'group' | 'workshop',
    title: '',
    description: '',
    dance_style: '',
    level: '' as '' | 'beginner' | 'intermediate' | 'advanced' | 'all_levels',
    capacity: '',
    waitlist_enabled: false,
    price: '',
    min_age: '',
    max_age: '',
    is_public: true,
    accepts_payment: false, // Default gratis
    is_trial: false,
    linked_form_id: '',
    linked_trial_program_id: '',
    show_capacity_to_users: true, // Default: toon capaciteit
    // Class pass settings
    accepts_class_passes: false,
    class_pass_product_id: '' as string,
    // Group fields
    weekday: '1',
    start_time: '',
    end_time: '',
    season_start: '',
    season_end: '',
    // Workshop fields (separate date and times)
    workshop_date: '',
    workshop_start_time: '',
    workshop_end_time: '',
    // Locations
    selected_locations: [] as string[],
    // Teachers (multiple selection)
    selected_teachers: [] as string[],
  });
  const [classPassProducts, setClassPassProducts] = useState<any[]>([]);

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

  useEffect(() => {
    // If school years are enabled, wait for an active year before loading.
    if (!schoolYearsMissing && !activeYearId) return;
    loadData();
    loadClassPassProducts();
  }, [studioId, activeYearId, schoolYearsMissing]);

  async function loadClassPassProducts() {
    if (!studioId) return;
    try {
      const { data, error } = await supabase
        .from('class_pass_products')
        .select('id, name, active')
        .eq('studio_id', studioId)
        .eq('active', true)
        .order('name');
      if (error) throw error;
      setClassPassProducts(data || []);
    } catch (e) {
      console.error('Failed to load class pass products', e);
    }
  }

  const loadData = async () => {
    setLoading(true);

    // Check authentication first
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = '/auth/login';
      return;
    }

    const [programsRes, locationsRes, formsRes, studioRes] = await Promise.all([
      supabase
        .from('programs')
        .select(`
          *,
          group_details(*),
          workshop_details(*),
          program_locations(
            location_id,
            locations(*)
          ),
          teacher_programs(
            teacher_id
          )
        `)
        .eq('studio_id', studioId)
        .match(activeYearId ? { school_year_id: activeYearId } : {})
        .order('created_at', { ascending: false }),
      supabase
        .from('locations')
        .select('*')
        .eq('studio_id', studioId)
        .order('name'),
      supabase
        .from('forms')
        .select('*')
        .eq('studio_id', studioId)
        .order('name'),
      supabase
        .from('studios')
        .select('features')
        .eq('id', studioId)
        .single(),
    ]);

    // Fetch teachers via API (uses service role to bypass RLS)
    const teachersResponse = await fetch(`/api/teachers?studioId=${studioId}`);
    const { teachers: teachersData } = await teachersResponse.json();

    // Fetch program-teachers mapping via service role API as a reliable source for teacher_ids
    let programTeachersMap: Record<string, string[]> = {}
    try {
      const ptRes = await fetch(`/api/studio/${studioId}/program-teachers`)
      if (ptRes.ok) {
        const json = await ptRes.json()
        programTeachersMap = json?.idsByProgram || {}
      }
    } catch {
      // non-fatal
    }

    if (programsRes.error) {
      console.error('Error loading programs:', programsRes.error);
      showError('Failed to load programs');
    } else {
      // Transform data
      const enrichedPrograms = programsRes.data.map((p: any) => {
        const enriched = {
          ...p,
          group_details: Array.isArray(p.group_details) && p.group_details.length > 0 ? p.group_details[0] : null,
          workshop_details: Array.isArray(p.workshop_details) && p.workshop_details.length > 0 ? p.workshop_details[0] : null,
          locations: p.program_locations?.map((pl: any) => pl.locations).filter(Boolean) || [],
          // Prefer mapping from API (bypasses RLS), fallback to joined selection
          teacher_ids: programTeachersMap[String(p.id)] || (p.teacher_programs?.map((tp: any) => tp.teacher_id) || []),
        };
        return enriched;
      });

      // Mark expired programs so the studio can quickly spot what to update/remove.
      // For proefles programs we also consult lesson dates (lessons table), because
      // many proeflessen are stored there instead of workshop_details.
      const todayKey = getAmsterdamDayKey();
      const trialIds = enrichedPrograms.filter(isTrialProgram).map((p: any) => p.id).filter(Boolean);

      const trialLessonMeta: Record<string, { sawAny: boolean; hasUpcoming: boolean }> = {};
      if (trialIds.length > 0) {
        try {
          const { data: lessons, error } = await supabase
            .from('lessons')
            .select('program_id, date')
            .in('program_id', trialIds);

          if (!error && lessons) {
            for (const row of lessons as any[]) {
              const pid = String(row.program_id);
              const datePart = normalizeDatePart(row?.date);
              if (!pid || !datePart) continue;
              if (!trialLessonMeta[pid]) trialLessonMeta[pid] = { sawAny: false, hasUpcoming: false };
              trialLessonMeta[pid].sawAny = true;
              if (datePart >= todayKey) trialLessonMeta[pid].hasUpcoming = true;
            }
          }
        } catch {
          // ignore
        }
      }

      const getSeasonEnd = (p: any): string | null => {
        const raw = (p as any)?.season_end || (p as any)?.group_details?.season_end || null;
        return normalizeDatePart(raw);
      }

      const isExpiredProgram = (p: any): boolean => {
        const seasonEnd = getSeasonEnd(p);
        if (seasonEnd && seasonEnd < todayKey) return true;

        const type = String((p as any)?.program_type || '').toLowerCase();
        const trial = isTrialProgram(p);
        if (!(type === 'workshop' || trial)) return false;

        let sawAnyDate = false;
        let hasUpcoming = false;

        const wd = (p as any)?.workshop_details;
        const datePart = normalizeDatePart(wd?.date || wd?.start_datetime || wd?.startDateTime || null);
        if (datePart) {
          sawAnyDate = true;
          if (datePart >= todayKey) hasUpcoming = true;
        }

        if (trial) {
          const meta = trialLessonMeta[String((p as any)?.id)] || null;
          if (meta?.sawAny) {
            sawAnyDate = true;
            if (meta.hasUpcoming) hasUpcoming = true;
          }
        }

        if (sawAnyDate && !hasUpcoming) return true;
        return false;
      }

      const withExpiredFlag = enrichedPrograms.map((p: any) => ({
        ...p,
        __isExpired: isExpiredProgram(p),
      }));

      setPrograms(withExpiredFlag);

      // Fetch member counts
      const programIds = enrichedPrograms.map(p => p.id);
      if (programIds.length > 0) {
        const { data: membersData, error: membersError } = await supabase
          .from('inschrijvingen')
          .select('program_id')
          .eq('status', 'actief')
          .in('program_id', programIds);

        if (membersError) {
          console.error('Error fetching member counts:', membersError);
        } else {
          const counts: Record<string, number> = {};
          for (const enrollment of membersData) {
            counts[enrollment.program_id] = (counts[enrollment.program_id] || 0) + 1;
          }
          setMemberCounts(counts);
        }
      }
    }

    setLocations(locationsRes.data || []);
    setForms(formsRes?.data || []);
    setStudioFeatures(studioRes.data?.features || {});
    
    // Teachers data already transformed by API
    setTeachers(teachersData || []);
    
    setLoading(false);
  };

  // Load or toggle members for a program
  async function toggleMembers(programId: string) {
    // If already loaded, remove to collapse
    if (membersMap[programId]) {
      const copy = { ...membersMap };
      delete copy[programId];
      setMembersMap(copy);
      return;
    }

    // otherwise fetch
    setLoadingMembers((s) => ({ ...s, [programId]: true }));
    // Prefer profile_snapshot (copied at enrollment time) to avoid depending on reading from auth.users
    const { data, error } = await supabase
      .from('inschrijvingen')
      .select(`
        *,
        profile_snapshot,
        user:users(id, naam, email)
      `)
      .eq('program_id', programId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading inscriptions:', error);
      showError('Fout bij het laden van ingeschreven leden');
      setLoadingMembers((s) => ({ ...s, [programId]: false }));
      return;
    }

    setMembersMap((s) => ({ ...s, [programId]: data || [] }));
    setLoadingMembers((s) => ({ ...s, [programId]: false }));
  }

  async function acceptWaitlistEntry(programId: string, userId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        showError('Je bent niet ingelogd');
        return;
      }

      const res = await fetch(`/api/studio/${studioId}/waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ program_id: programId, user_id: userId, action: 'accept' }),
      });

      if (!res.ok) {
        let json: any = null;
        try {
          json = await res.json();
        } catch {
          // ignore
        }
        throw new Error(json?.error || 'Kon wachtlijst niet accepteren');
      }

      showSuccess('Wachtlijst geaccepteerd');

      // Refresh expanded list so admin sees status update
      if (membersMap[programId]) {
        const { data, error } = await supabase
          .from('inschrijvingen')
          .select(`
            *,
            profile_snapshot,
            user:users(id, naam, email)
          `)
          .eq('program_id', programId)
          .order('created_at', { ascending: true });

        if (!error) {
          setMembersMap((s) => ({ ...s, [programId]: data || [] }));
        }
      }
    } catch (e: any) {
      console.error('Failed to accept waitlist entry', e);
      showError(e?.message || 'Kon wachtlijst niet accepteren');
    }
  }

  async function removeEnrollment(inschrijvingId: string, programId: string) {
    const { error } = await supabase.from('inschrijvingen').delete().eq('id', inschrijvingId);
    if (error) {
      console.error('Error deleting inschrijving:', error);
      showError('Kon inschrijving niet verwijderen');
      return;
    }

    // Refresh members list
    const { data, error: err } = await supabase
      .from('inschrijvingen')
      .select(`
        *,
        profile_snapshot,
        user:users(id, naam, email)
      `)
      .eq('program_id', programId)
      .order('created_at', { ascending: true });

    if (err) {
      console.error('Error reloading inscriptions:', err);
      return;
    }

    setMembersMap((s) => ({ ...s, [programId]: data || [] }));
  }

  const handleEdit = (program: ProgramWithDetails) => {
    setEditingProgram(program);
    setStep('details');
    setShowModal(true);
  };
  const handleDelete = async (id: string, title: string) => {
    const { error } = await supabase
      .from('programs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting program:', error);
      showError('Failed to delete program: ' + error.message);
    } else {
      loadData();
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (formData.program_type === 'group') {
      if (!formData.start_time || !formData.end_time) {
        showError('Vul start- en eindtijd in voor een groepscursus');
        return;
      }
      if (!formData.season_start || !formData.season_end) {
        showError('Vul seizoen start en seizoen einde in voor een groepscursus');
        return;
      }
    } else if (formData.program_type === 'workshop') {
      if (!formData.workshop_date || !formData.workshop_start_time || !formData.workshop_end_time) {
        showError('Vul datum, start- en eindtijd in voor een workshop');
        return;
      }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const access_token = session?.access_token;

      if (!access_token) {
        showError('Je bent niet ingelogd');
        return;
      }

      const parsedCapacity = formData.capacity ? parseInt(formData.capacity) : null;
      const waitlistEnabled = !!formData.waitlist_enabled && !!parsedCapacity && parsedCapacity > 0;

      const program = {
        studio_id: studioId,
        ...(activeYearId ? { school_year_id: activeYearId } : {}),
        program_type: formData.program_type,
        is_trial: formData.is_trial || false,
        title: formData.title,
        description: formData.description || null,
        dance_style: formData.dance_style || null,
        level: formData.level || null,
        capacity: parsedCapacity,
        waitlist_enabled: waitlistEnabled,
        price: formData.price ? parseFloat(formData.price) : null,
        min_age: formData.min_age ? parseInt(formData.min_age) : null,
        max_age: formData.max_age ? parseInt(formData.max_age) : null,
        is_public: formData.is_public,
        accepts_payment: formData.accepts_payment || false,
        linked_form_id: formData.linked_form_id || null,
        linked_trial_program_id: formData.linked_trial_program_id || null,
        show_capacity_to_users: studioFeatures.capacity_visibility !== false ? formData.show_capacity_to_users : false,
        accepts_class_passes: formData.accepts_class_passes || false,
        class_pass_product_id: formData.class_pass_product_id || null,
      };

      const groupDetails = formData.program_type === 'group' ? {
        // UI presents weekday as 1=Maandag .. 7=Zondag. DB expects 0=Zondag .. 6=Zaterdag.
        // Convert UI -> DB by taking modulo 7 so 7 -> 0 and 1..6 remain 1..6.
        weekday: (parseInt(formData.weekday) || 0) % 7,
        start_time: formData.start_time,
        end_time: formData.end_time,
        season_start: formData.season_start || null,
        season_end: formData.season_end || null,
      } : null;

      const workshopDetails = formData.program_type === 'workshop' ? {
        date: formData.workshop_date,
        start_time: formData.workshop_start_time,
        end_time: formData.workshop_end_time,
      } : null;

      if (editingProgram) {
        const response = await fetch('/api/programs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token,
            programId: editingProgram.id,
            program,
            groupDetails,
            workshopDetails,
            locationIds: formData.selected_locations,
            teacherIds: formData.selected_teachers,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
            console.error('Update program response error:', error);
            throw new Error(error.error || error.details || 'Failed to update program');
        }
      } else {
        const response = await fetch('/api/programs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token,
            program,
            groupDetails,
            workshopDetails,
            locationIds: formData.selected_locations,
            teacherIds: formData.selected_teachers,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
            console.error('Create program response error:', error);
            throw new Error(error.error || error.details || 'Failed to create program');
        }
      }

      setShowModal(false);
      setEditingProgram(null);
      resetForm();
      loadData();
    } catch (error: any) {
      console.error('Error saving program:', error);
      showError('Failed to save program: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      program_type: 'group',
      is_trial: false,
      title: '',
      description: '',
      dance_style: '',
      level: '',
      capacity: '',
      waitlist_enabled: false,
      price: '',
      min_age: '',
      max_age: '',
      is_public: true,
      accepts_payment: false,
      accepts_class_passes: false,
      class_pass_product_id: '',
      show_capacity_to_users: true,
      weekday: '1',
      start_time: '',
      end_time: '',
      season_start: '',
      season_end: '',
      workshop_date: '',
      workshop_start_time: '',
      workshop_end_time: '',
      selected_locations: [],
      selected_teachers: [],
      linked_form_id: '',
      linked_trial_program_id: '',
    });
    setStep('type');
  };

  const startCreate = () => {
    setEditingProgram(null);
    resetForm();
    setShowModal(true);
  };

  // Weekday names indexed by numeric weekday value (1 = Maandag .. 7 = Zondag)
  const weekdayNames = ['', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

  // helper to detect trial/proefles programs
  const isTrialProgram = (p: any) => {
    const t = String((p as any).program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (p?.title && String(p.title).toLowerCase().includes('proef')) return true;
    if ((p as any).is_trial) return true;
    if (p?.price === 0) return true;
    return false;
  };

  const groupPrograms = programs.filter(p => p.program_type === 'group' && !isTrialProgram(p));
  const workshopPrograms = programs.filter(p => p.program_type === 'workshop');
  const trialPrograms = programs.filter(p => isTrialProgram(p));

  function renderProgramCard(program: ProgramWithDetails) {
    const isTrial = (() => {
      const t = String((program as any).program_type || '').toLowerCase();
      if (t.includes('trial')) return true;
      if (program?.title && String(program.title).toLowerCase().includes('proef')) return true;
      if ((program as any).is_trial) return true;
      if (program?.price === 0) return true;
      return false;
    })();

    const accentClass = isTrial
      ? 'border-l-4 border-l-emerald-500'
      : program.program_type === 'group'
      ? 'border-l-4 border-l-blue-500'
      : program.program_type === 'workshop'
      ? 'border-l-4 border-l-orange-500'
      : 'border-l-4 border-l-emerald-500';

    return (
      <div key={program.id} className={`bg-white rounded-xl border border-slate-200 p-3 sm:p-6 hover:shadow-md transition-shadow ${accentClass}`}>
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900">{program.title}</h3>
              <span className={`hidden sm:inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                isTrial ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : (program.program_type === 'group' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200')
              }`}>
                {isTrial ? 'Proefles' : (program.program_type === 'group' ? 'Groepscursus' : 'Workshop')}
              </span>
              {(program as any)?.__isExpired && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                  Verlopen
                </span>
              )}
              {!program.is_public && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                  Privé
                </span>
              )}
            </div>

            {/* Badges directly under title */}
            <div className="mb-2 sm:mb-3 flex flex-wrap gap-2">
              {program.dance_style && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {program.dance_style}
                </span>
              )}
              {program.level && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 capitalize">
                  {program.level.replace('_', ' ')}
                </span>
              )}
              {(program.min_age || program.max_age) && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                  {program.min_age && program.max_age 
                    ? `${program.min_age}-${program.max_age} jaar`
                    : program.min_age 
                      ? `vanaf ${program.min_age} jaar`
                      : `tot ${program.max_age} jaar`}
                </span>
              )}
            </div>

            {/* Description intentionally hidden in grid cards (especially mobile) */}

            {/* Show linked proefles in studio admin UI when present */}
            {program.linked_trial_program_id && (
              (() => {
                const linked = programs.find(p => p.id === program.linked_trial_program_id as string);
                return (
                  <div className="text-sm text-slate-600 mb-3">
                    <span className="font-semibold">Proefles programma:</span>{' '}
                    {linked ? (
                      <button onClick={() => handleEdit(linked)} className="text-blue-600 underline">
                        {linked.title}
                      </button>
                    ) : (
                      <span className="text-slate-500">(verwijderd)</span>
                    )}
                  </div>
                );
              })()
            )}

            {/* Assigned teachers */}
            {(() => {
              try {
                const ids = program.teacher_ids || [];
                if (!ids || ids.length === 0) return null;
                const assigned = ids.map(id => teachers.find(t => String(t.id) === String(id))).filter(Boolean);
                if (!assigned || assigned.length === 0) return null;
                return (
                  <div className="mt-2 sm:mt-3 text-sm text-slate-700 hidden sm:flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span>{assigned.map((a:any) => a.naam || `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email || 'Docent').join(', ')}</span>
                  </div>
                )
              } catch {
                return null;
              }
            })()}
            
            <div className="mt-2 sm:mt-3 space-y-2 text-sm text-slate-600">
              {/* Schedule (group or workshop) */}
              {program.group_details && (
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-slate-400" />
                  <span>
                    {weekdayNames[program.group_details.weekday === 0 ? 7 : program.group_details.weekday]} | {formatTimeStr(program.group_details.start_time)} - {formatTimeStr(program.group_details.end_time)}
                  </span>
                </div>
              )}
              {program.workshop_details && (
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-slate-400" />
                  <span>
                    {(() => {
                      const wd: any = program.workshop_details as any;
                      const dateStr = wd?.date ? formatDateOnly(wd.date) : (wd?.start_datetime ? formatDateOnly(wd.start_datetime) : '');
                      const s = wd?.start_time ? formatTimeStr(wd.start_time) : (wd?.start_datetime ? new Date(wd.start_datetime).toISOString().slice(11,16) : '');
                      const e = wd?.end_time ? formatTimeStr(wd.end_time) : (wd?.end_datetime ? new Date(wd.end_datetime).toISOString().slice(11,16) : '');
                      const timeStr = [s, e].filter(Boolean).join(' - ');
                      return [dateStr, timeStr].filter(Boolean).join(' | ');
                    })()}
                  </span>
                </div>
              )}


              {/* Locations */}
              {program.locations && program.locations.length > 0 && (
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-slate-400" />
                  <span>{program.locations[0].name}</span>
                </div>
              )}

              {/* Capacity with enrollment count */}
              {program.capacity && (
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-slate-400" />
                  <span>{memberCounts[program.id] || 0} / {program.capacity} deelnemers</span>
                </div>
              )}

              {program.price && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-green-700">€{program.price.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
            <div className="flex gap-2">
              <ActionIcon title={membersMap[program.id] ? 'Verberg leden' : 'Toon leden'} onClick={() => toggleMembers(program.id)}>
                <Users size={18} />
              </ActionIcon>
              <ActionIcon title="Bewerk programma" onClick={() => handleEdit(program)}>
                <Edit size={18} />
              </ActionIcon>
              <ActionIcon
                variant="danger"
                title={isProgramDeleteArmed(program.id) ? 'Klik opnieuw om te verwijderen' : `Verwijder ${program.title}`}
                className={isProgramDeleteArmed(program.id) ? 'ring-2 ring-red-200' : ''}
                onClick={() => confirmOrArmProgramDelete(program.id, () => handleDelete(program.id, program.title))}
              >
                {isProgramDeleteArmed(program.id) ? (
                  <>
                    <span className="hidden sm:inline text-sm font-medium">Verwijderen</span>
                    <span className="sm:hidden">
                      <Check size={18} />
                    </span>
                  </>
                ) : (
                  <Trash2 size={18} />
                )}
              </ActionIcon>
            </div>
        </div>
        {membersMap[program.id] && (
          <div className="mt-4 border-t pt-4">
            {(() => {
              const allEnrollments = membersMap[program.id] || [];
              const activeEnrollments = (allEnrollments as any[]).filter((i) => !i.status || i.status === 'actief');
              const waitlistEnrollments = (allEnrollments as any[]).filter((i) => i.status === 'waitlisted' || i.status === 'waitlist_accepted');

              return (
                <>
                  <h4 className="flex items-center text-sm font-semibold text-slate-700 mb-2">
                    <Users className="w-5 h-5 mr-2 text-slate-700" style={{ color: '#334155' }} />
                    Ingeschreven leden ({activeEnrollments.length})
                  </h4>
                  <div className="space-y-2">
                    {activeEnrollments.map((inschrijving: any) => {
                      // Get user name from profile_snapshot or user data.
                      // Support both Dutch keys (naam, voornaam, achternaam) and English keys (first_name, last_name, name)
                      const snap = inschrijving.profile_snapshot || {};
                      const snapshotFullName = snap.naam || snap.name || null;
                      const snapshotFirst = snap.first_name || snap.voornaam || '';
                      const snapshotLast = snap.last_name || snap.achternaam || '';
                      const snapshotCombined = `${(snapshotFirst || '').trim()} ${(snapshotLast || '').trim()}`.trim() || null;

                      const userName = snapshotFullName || snapshotCombined ||
                        inschrijving.user?.naam || (inschrijving.user as any)?.name ||
                        snap.email || inschrijving.user?.email || 'Onbekend';

                      const userEmail = snap.email || inschrijving.user?.email || '';

                      return (
                        <div key={inschrijving.id} className="flex items-center justify-between bg-slate-50 p-3 rounded">
                          <div>
                            <div className="font-medium text-slate-900">{userName}</div>
                            <div className="text-sm text-slate-600">{userEmail}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <ActionIcon
                              title="Bekijk gebruiker"
                              onClick={async () => {
                                console.info('Opening user details for inschrijving:', inschrijving);
                                // Fetch all enrollments for this user from Supabase, then filter to this studio.
                                // We fetch the related program so we can check program.studio_id and show program title/type.
                                const userId = inschrijving.user_id || inschrijving.user?.id;
                                if (!userId) return;

                                // When opening the user details modal, we need to pass the correct user object.
                                // The `inschrijving` object contains both `profile_snapshot` (data at time of enrollment)
                                // and a `user` object (live data). The modal is designed to handle various shapes.
                                // We will pass the `profile_snapshot` directly if available, otherwise the user object.
                                const userData = inschrijving.profile_snapshot || inschrijving.user;
                                console.info('User data to pass to modal:', userData);
                                setSelectedUser(userData);

                                const { data, error } = await supabase
                                  .from('inschrijvingen')
                                  .select('*, program:programs(*)')
                                  .eq('user_id', userId)
                                  .order('created_at', { ascending: true });

                                if (error) {
                                  console.error('Error fetching user enrollments:', error);
                                  // fallback: open modal with no enrollments
                                  setSelectedUserEnrollments([]);
                                  setUserModalOpen(true);
                                  return;
                                }

                                // Filter enrollments to those linked to the current studio
                                const studioEnrollments = (data || []).filter((e: any) => e.program && e.program.studio_id === studioId)
                                  .map((e: any) => ({
                                    program: { title: e.program?.title || '', program_type: e.program?.program_type || 'group' },
                                    status: e.status,
                                    inschrijving_datum: e.inschrijving_datum,
                                  }));
                                console.info('Studio enrollments:', studioEnrollments);
                                setSelectedUserEnrollments(studioEnrollments);

                                setUserModalOpen(true);
                              }}
                            >
                              <Eye size={16} />
                            </ActionIcon>

                            <div className="relative">
                              {confirmDeleteMap[inschrijving.id] ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={async () => {
                                      // final confirm -> perform deletion
                                      await removeEnrollment(inschrijving.id, program.id);
                                      setConfirmDeleteMap((s) => ({ ...s, [inschrijving.id]: false }));
                                    }}
                                    className="px-3 py-1 bg-red-600 text-white rounded text-sm"
                                  >
                                    Bevestig
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteMap((s) => ({ ...s, [inschrijving.id]: false }))}
                                    className="px-2 py-1 border rounded text-sm text-slate-700"
                                  >
                                    Annuleer
                                  </button>
                                </div>
                              ) : (
                                <ActionIcon
                                  variant="danger"
                                  title="Verwijder inschrijving"
                                  onClick={() => {
                                    // first click: show inline confirm
                                    setConfirmDeleteMap((s) => ({ ...s, [inschrijving.id]: true }));
                                    // auto-cancel after 5s
                                    setTimeout(() => setConfirmDeleteMap((s) => ({ ...s, [inschrijving.id]: false })), 5000);
                                  }}
                                >
                                  <Trash2 size={16} />
                                </ActionIcon>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!!(program as any).waitlist_enabled && (
                    <div className="mt-6">
                      <h4 className="flex items-center text-sm font-semibold text-slate-700 mb-2">
                        <Users className="w-5 h-5 mr-2 text-slate-700" style={{ color: '#334155' }} />
                        Wachtlijst ({waitlistEnrollments.length})
                      </h4>
                      {waitlistEnrollments.length === 0 ? (
                        <div className="text-sm text-slate-600">Geen wachtlijst inschrijvingen</div>
                      ) : (
                        <div className="space-y-2">
                          {waitlistEnrollments.map((inschrijving: any) => {
                            const snap = inschrijving.profile_snapshot || {};
                            const snapshotFullName = snap.naam || snap.name || null;
                            const snapshotFirst = snap.first_name || snap.voornaam || '';
                            const snapshotLast = snap.last_name || snap.achternaam || '';
                            const snapshotCombined = `${(snapshotFirst || '').trim()} ${(snapshotLast || '').trim()}`.trim() || null;

                            const userName = snapshotFullName || snapshotCombined ||
                              inschrijving.user?.naam || (inschrijving.user as any)?.name ||
                              snap.email || inschrijving.user?.email || 'Onbekend';
                            const userEmail = snap.email || inschrijving.user?.email || '';
                            const statusLabel = inschrijving.status === 'waitlist_accepted' ? 'Geaccepteerd' : 'Wachtlijst';

                            return (
                              <div key={inschrijving.id} className="flex items-center justify-between bg-slate-50 p-3 rounded">
                                <div>
                                  <div className="font-medium text-slate-900 flex items-center gap-2">
                                    <span>{userName}</span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-800">
                                      {statusLabel}
                                    </span>
                                  </div>
                                  <div className="text-sm text-slate-600">{userEmail}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {inschrijving.status === 'waitlisted' && inschrijving.user_id && (
                                    <button
                                      type="button"
                                      onClick={() => acceptWaitlistEntry(program.id, inschrijving.user_id)}
                                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                    >
                                      Accepteren
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  return (
    <FeatureGate flagKey="studio.programs" mode="page">
      {loading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <LoadingSpinner size={48} className="mb-4" label="Programma's laden…" />
            <p className="text-slate-600">Programma's laden…</p>
          </div>
        </div>
      ) : (
        <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Programma's</h1>
          <p className="text-slate-600 mt-1">Beheer je cursussen en workshops</p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 sm:px-6 sm:py-3 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} className="sm:hidden" />
          <Plus size={20} className="hidden sm:inline" />
          <span className="sm:hidden">Nieuw</span>
          <span className="hidden sm:inline">Nieuw Programma</span>
        </button>
      </div>

      {programs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Calendar size={48} className="mx-auto text-slate-400 mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Nog geen programma's</h3>
          <p className="text-slate-600 mb-6">Maak je eerste cursus of workshop aan</p>
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Nieuw
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 mb-6 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Programma type</label>
            <div className="flex items-center gap-2">
              <Select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as any)}
                className="flex-1 min-w-0"
              >
                <option value="group">Groepscursussen ({groupPrograms.length})</option>
                <option value="workshop">Workshops ({workshopPrograms.length})</option>
                <option value="proeflessen">Proeflessen ({trialPrograms.length})</option>
              </Select>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  aria-label="Grid view"
                  title="Grid"
                  onClick={() => setView('grid')}
                  className={`h-10 w-10 shrink-0 aspect-square inline-flex items-center justify-center rounded-lg ${
                    view === 'grid' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Grid size={16} />
                </button>
                <button
                  aria-label="List view"
                  title="List"
                  onClick={() => setView('list')}
                  className={`h-10 w-10 shrink-0 aspect-square inline-flex items-center justify-center rounded-lg ${
                    view === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-4" />

          <div className="space-y-4">
            {activeTab === 'group' && (
              groupPrograms.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <Calendar size={48} className="mx-auto text-slate-400 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Nog geen groepscursussen</h3>
                  <p className="text-slate-600 mb-6">Maak je eerste groepscursus aan</p>
                  <button
                    onClick={() => {
                      setFormData({ ...formData, program_type: 'group' });
                      startCreate();
                    }}
                    className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={20} />
                    Nieuwe Groepscursus
                  </button>
                </div>
                ) : (
                view === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groupPrograms.map(program => renderProgramCard(program))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupPrograms.map(program => (
                      <ProgramListItem key={program.id} program={program as any} teachers={teachers} onOpen={() => handleEdit(program)} enrolledCount={memberCounts[program.id] ?? 0} />
                    ))}
                  </div>
                )
              )
            )}

            {activeTab === 'workshop' && (
              workshopPrograms.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <Calendar size={48} className="mx-auto text-slate-400 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Nog geen workshops</h3>
                  <p className="text-slate-600 mb-6">Maak je eerste workshop aan</p>
                  <button
                    onClick={() => {
                      // Create a workshop program
                      setFormData({ ...formData, program_type: 'workshop', is_trial: false });
                      startCreate();
                    }}
                    className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <Plus size={20} />
                    Nieuwe Workshop
                  </button>
                </div>
                ) : (
                view === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {workshopPrograms.map(program => renderProgramCard(program))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workshopPrograms.map(program => (
                      <ProgramListItem key={program.id} program={program as any} teachers={teachers} onOpen={() => handleEdit(program)} enrolledCount={memberCounts[program.id] ?? 0} />
                    ))}
                  </div>
                )
              )
            )}

            {activeTab === 'proeflessen' && (
              trialPrograms.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <Calendar size={48} className="mx-auto text-slate-400 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Nog geen proeflessen</h3>
                  <p className="text-slate-600 mb-6">Maak proeflessen aan als workshops of markeer bestaande programma's als proeflessen</p>
                  <button
                    onClick={() => {
                      // Proeflessen moeten als groepsschema worden aangemaakt en gemarkeerd als trial
                      setFormData({ ...formData, program_type: 'group', is_trial: true });
                      startCreate();
                    }}
                    className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    <Plus size={20} />
                    Nieuwe Proefles
                  </button>
                </div>
                ) : (
                view === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {trialPrograms.map(program => renderProgramCard(program))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {trialPrograms.map(program => (
                      <ProgramListItem key={program.id} program={program as any} teachers={teachers} onOpen={() => handleEdit(program)} enrolledCount={memberCounts[program.id] ?? 0} />
                    ))}
                  </div>
                )
              )
            )}
          </div>
        </>
      )}

      {/* Modal komt in volgende bestand vanwege lengte */}
      {showModal && (
        <ProgramModal
          editingProgram={editingProgram}
          formData={formData}
          setFormData={setFormData}
          step={step}
          setStep={setStep}
          locations={locations}
          teachers={teachers}
          weekdayNames={weekdayNames}
          onClose={() => setShowModal(false)}
          forms={forms}
          onSubmit={handleSubmit}
          trialPrograms={trialPrograms}
          studioFeatures={studioFeatures}
          classPassProducts={classPassProducts}
          hasFeature={hasFeature}
        />
      )}
      {userModalOpen && selectedUser && (
        <UserDetailsModal
          isOpen={userModalOpen}
          onClose={() => setUserModalOpen(false)}
          user={selectedUser}
          enrollments={selectedUserEnrollments}
        />
      )}
        </div>
      )}
    </FeatureGate>
  );
}

// Program Modal Component - separate vanwege lengte
interface ProgramModalProps {
  editingProgram: ProgramWithDetails | null;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  step: 'type' | 'details';
  setStep: React.Dispatch<React.SetStateAction<'type' | 'details'>>;
  locations: Location[];
  teachers: any[];
  weekdayNames: string[];
  onClose: () => void;
  onSubmit: React.FormEventHandler;
  forms: any[];
  studioFeatures: Record<string, boolean>;
  trialPrograms: any[];
  classPassProducts: any[];
  hasFeature: ReturnType<typeof useStudioFeatures>['hasFeature'];
}

function ProgramModal({
  editingProgram,
  formData,
  setFormData,
  step,
  setStep,
  locations,
  teachers,
  weekdayNames,
  onClose,
  onSubmit,
  forms,
  trialPrograms,
  studioFeatures,
  classPassProducts,
  hasFeature,
}: ProgramModalProps) {
  // Local trial detection for the modal (used to decide whether to show group fields)
  const localIsTrial = editingProgram ? (() => {
    const t = String((editingProgram as any).program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (editingProgram?.title && String(editingProgram.title).toLowerCase().includes('proef')) return true;
    if ((editingProgram as any).is_trial) return true;
    if (editingProgram?.price === 0) return true;
    return false;
  })() : false;

  useEffect(() => {
    const populateForm = async () => {
        if (editingProgram) {
          const locationIds = editingProgram.locations?.map(l => l.id) || [];
        
        // Prefer teacher_ids if already on program (from enrichment), otherwise fetch
        let teacherIds = editingProgram.teacher_ids || [];
        if (!teacherIds || teacherIds.length === 0) {
          try {
            const ptRes = await fetch(`/api/studio/${editingProgram.studio_id}/program-teachers?programId=${editingProgram.id}`)
            if (ptRes.ok) {
              const json = await ptRes.json()
              const idsByProgram = json?.idsByProgram || {}
              teacherIds = idsByProgram[String(editingProgram.id)] || []
            }
          } catch {
            // ignore, will remain []
          }
        }

        const baseFormData = {
          program_type: editingProgram.program_type,
          title: editingProgram.title,
          description: editingProgram.description || '',
          dance_style: editingProgram.dance_style || '',
          level: (editingProgram.level || '') as any,
          capacity: editingProgram.capacity?.toString() || '',
          waitlist_enabled: !!(editingProgram as any).waitlist_enabled,
          price: editingProgram.price?.toString() || '',
          min_age: editingProgram.min_age?.toString() || '',
          max_age: editingProgram.max_age?.toString() || '',
          is_public: editingProgram.is_public,
          accepts_payment: editingProgram.accepts_payment || false,
          is_trial: (editingProgram as any).is_trial || false,
          show_capacity_to_users: editingProgram.show_capacity_to_users ?? true,
          linked_form_id: (editingProgram as any).linked_form_id || '',
          linked_trial_program_id: (editingProgram as any).linked_trial_program_id || '',
          accepts_class_passes: (editingProgram as any).accepts_class_passes || false,
          class_pass_product_id: (editingProgram as any).class_pass_product_id || '',
          selected_locations: locationIds,
          selected_teachers: teacherIds,
          weekday: '1',
          start_time: '',
          end_time: '',
          season_start: '',
          season_end: '',
          workshop_date: '',
          workshop_start_time: '',
          workshop_end_time: '',
        };

          if ((editingProgram.program_type === 'group' || localIsTrial || baseFormData.is_trial) && editingProgram.group_details) {
          // DB stores weekday as 0=Zondag .. 6=Zaterdag; UI expects 1=Maandag .. 7=Zondag.
          const dbWd = editingProgram.group_details.weekday;
          const uiWd = (dbWd === 0) ? '7' : String(dbWd);
          setFormData({
            ...baseFormData,
            weekday: uiWd,
            start_time: editingProgram.group_details.start_time,
            end_time: editingProgram.group_details.end_time,
            season_start: editingProgram.group_details.season_start || '',
            season_end: editingProgram.group_details.season_end || '',
          });
        } else if (editingProgram.program_type === 'workshop' && editingProgram.workshop_details) {
          const wd: any = editingProgram.workshop_details as any;
          const legacyStart: string | null = wd.start_datetime || null;
          const legacyEnd: string | null = wd.end_datetime || null;
          const deriveTime = (iso?: string | null) => {
            if (!iso) return '';
            try { return new Date(iso).toISOString().slice(11,16) } catch { return '' }
          };
          setFormData({
            ...baseFormData,
            workshop_date: wd.date || (legacyStart ? String(legacyStart).slice(0,10) : ''),
            workshop_start_time: wd.start_time || deriveTime(legacyStart),
            workshop_end_time: wd.end_time || deriveTime(legacyEnd),
          });
        } else {
          setFormData(baseFormData);
        }
      }
    };

    populateForm();
  }, [editingProgram]);

  // load canonical dance styles for the dance style select; fall back to local list
  const [availableDanceStyles, setAvailableDanceStyles] = useState<string[]>(DANCE_STYLES);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/dance-styles');
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();

        // Accept multiple shapes: array of strings, array of {name,...}, or {dance_styles: [...]}, or {styles: [...]}
        let names: string[] = [];
        if (Array.isArray(json)) {
          // array of objects or strings
          names = json.map((s: any) => (s && typeof s === 'object' ? (s.name || s.title || s.label || '') : String(s))).filter(Boolean);
        } else if (Array.isArray(json.dance_styles)) {
          names = json.dance_styles.map((s: any) => (s && typeof s === 'object' ? (s.name || '') : String(s))).filter(Boolean);
        } else if (Array.isArray(json.styles)) {
          names = json.styles.map((s: any) => (s && typeof s === 'object' ? (s.name || '') : String(s))).filter(Boolean);
        }

        if (mounted && names.length > 0) {
          // dedupe and sort
          const uniq = Array.from(new Set(names.map(n => n.trim()))).sort((a, b) => a.localeCompare(b));
          setAvailableDanceStyles(uniq);
        }
      } catch (err) {
        // ignore and keep fallback
        console.info('Could not load /api/dance-styles, using local fallback', err);
      }
    })();
    return () => { mounted = false };
  }, []);

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white/90 dark:bg-zinc-900 backdrop-blur-md rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit}>
          <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-zinc-900">
            <h2 className="text-2xl font-bold text-slate-900">{editingProgram ? 'Programma Bewerken' : 'Nieuw Programma'}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="text-slate-500 dark:text-slate-300 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {step === 'type' && !editingProgram && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-4">Programma Type *</label>
                <div className="grid grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, program_type: 'group' });
                      setStep('details');
                    }}
                    className="p-6 border-2 border-blue-300 dark:border-slate-700/80 rounded-lg hover:bg-blue-50 dark:hover:bg-white/5 hover:border-blue-400 dark:hover:border-slate-600 focus:bg-blue-50 dark:focus:bg-white/5 focus:border-blue-400 dark:focus:border-slate-600 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Calendar className="text-blue-600" size={24} />
                      <h3 className="text-lg font-semibold text-slate-900">Groepscursus</h3>
                    </div>
                    <p className="text-sm text-slate-600">Wekelijkse lessen op vaste dag en tijd gedurende een periode</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, program_type: 'workshop', is_trial: false });
                      setStep('details');
                    }}
                    className="p-6 border-2 border-orange-300 dark:border-slate-700/80 rounded-lg hover:bg-orange-50 dark:hover:bg-white/5 hover:border-orange-400 dark:hover:border-slate-600 focus:bg-orange-50 dark:focus:bg-white/5 focus:border-orange-400 dark:focus:border-slate-600 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Calendar className="text-orange-600" size={24} />
                      <h3 className="text-lg font-semibold text-slate-900">Workshop</h3>
                    </div>
                    <p className="text-sm text-slate-600">Eenmalig evenement met specifieke start- en einddatum</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      // Proeflessen moeten als groepsschema worden aangemaakt maar gemarkeerd als trial
                      setFormData({ ...formData, program_type: 'group', is_trial: true });
                      setStep('details');
                    }}
                    className="p-6 border-2 border-emerald-500 dark:border-slate-700/80 rounded-lg hover:bg-emerald-100 dark:hover:bg-white/5 focus:bg-emerald-100 dark:focus:bg-white/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Calendar className="text-emerald-700" size={24} />
                      <h3 className="text-lg font-semibold text-slate-900">Proeflessen</h3>
                    </div>
                    <p className="text-sm text-slate-700">Proefles(sen) toevoegen aan een groepscursus programma</p>
                  </button>
                </div>
              </div>
            )}

            {step === 'details' && (
              <div>
                {!editingProgram && !!formData?.is_trial && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4">
                    <p className="text-sm text-slate-900 font-medium mb-1">Let op</p>
                    <p className="text-sm text-slate-700">
                      Controleer dat de aangemaakte proeflessen niet overlappen met aangemaakte lessen van het programma waarvoor de proeflessen zijn bedoeld. Als dit wel het geval is kun je de dubbele lessen handmatig verwijderen in de lessen pagina.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Titel *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="mt-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Beschrijving</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={4}
                  />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Dansstijl</label>
                    <Select
                      value={availableDanceStyles.includes(formData.dance_style) ? formData.dance_style : '__other__'}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__other__') {
                          // clear to allow manual entry
                          setFormData({ ...formData, dance_style: '' });
                        } else {
                          setFormData({ ...formData, dance_style: v });
                        }
                      }}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Geen selectie</option>
                      {availableDanceStyles.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option value="__other__">Anders (handmatig invoeren)</option>
                    </Select>

                    {/* show manual input when selected style isn't in canonical list */}
                    {!availableDanceStyles.includes(formData.dance_style) ? (
                      <input
                        type="text"
                        value={formData.dance_style}
                        onChange={(e) => setFormData({ ...formData, dance_style: e.target.value })}
                        className="w-full mt-3 px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Bijv. Ballet, Hip Hop, Jazz..."
                      />
                    ) : null}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Niveau</label>
                    <Select
                      value={formData.level}
                      onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Geen niveau</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Gevorderd</option>
                      <option value="advanced">Expert</option>
                      <option value="all_levels">Alle niveaus</option>
                    </Select>
                  </div>
                </div>

                {/* Capaciteit - alleen beschikbaar in Plus en Pro */}
                {hasFeature('member_management') && (
                  <div className="mt-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Capaciteit (max deelnemers)</label>
                    <input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => {
                        const nextCapacity = e.target.value;
                        const parsed = nextCapacity ? parseInt(nextCapacity) : null;
                        setFormData({
                          ...formData,
                          capacity: nextCapacity,
                          waitlist_enabled: !!formData.waitlist_enabled && !!parsed && parsed > 0,
                        });
                      }}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />

                    {/* Waitlist toggle - only makes sense when capacity is set */}
                    {(() => {
                      const parsed = formData.capacity ? parseInt(formData.capacity) : null;
                      const canUseWaitlist = !!parsed && parsed > 0;
                      if (!canUseWaitlist) return null;
                      return (
                        <div className="mt-3 flex items-start gap-3">
                          <input
                            type="checkbox"
                            id="waitlist-enabled"
                            checked={!!formData.waitlist_enabled}
                            onChange={(e) => setFormData({ ...formData, waitlist_enabled: e.target.checked })}
                            className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <label htmlFor="waitlist-enabled" className="text-sm font-medium text-slate-700 cursor-pointer">
                              Wachtlijst inschakelen wanneer volzet
                            </label>
                            <div className="text-xs text-slate-500 mt-1">
                              Wanneer de capaciteit bereikt is, kunnen gebruikers zich inschrijven op de wachtlijst.
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* Capacity visibility toggle - only show if studio feature is enabled */}
                    {studioFeatures.capacity_visibility !== false ? (
                    <div className="mt-3 flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="show-capacity"
                        checked={formData.show_capacity_to_users}
                        onChange={(e) => setFormData({ ...formData, show_capacity_to_users: e.target.checked })}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <label htmlFor="show-capacity" className="text-sm font-medium text-slate-700 cursor-pointer">
                          Toon capaciteit aan bezoekers en gebruikers
                        </label>
                        <div className="text-xs text-slate-500 mt-1">
                          {formData.show_capacity_to_users
                            ? 'Capaciteit is zichtbaar voor iedereen die dit programma bekijkt'
                            : 'Capaciteit is alleen zichtbaar voor studio admins'
                          }
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <div className="text-sm text-amber-800">
                          <strong>Capaciteit verborgen:</strong> De studio heeft capaciteit zichtbaarheid uitgeschakeld in de instellingen. 
                          Capaciteit wordt niet getoond aan gebruikers, alleen aan studio admins.
                        </div>
                      </div>
                    </div>
                  )}
                  </div>
                )}                {/* Gekoppeld formulier - alleen beschikbaar in Plus en Pro */}
                {hasFeature('enrollment_forms') && (
                <div className="mt-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Gekoppeld formulier</label>
                  <Select
                    value={formData.linked_form_id || ''}
                    onChange={(e) => setFormData({ ...formData, linked_form_id: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Geen formulier</option>
                    {forms && forms.map((f: any) => (
                      <option key={f.id} value={f.id}>{f.name || f.id}</option>
                    ))}
                  </Select>
                </div>
                )}

                {/* Docenten - alleen beschikbaar in Pro */}
                {hasFeature('teacher_management') && (
                <div className="mt-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Docenten</label>
                  <div className="bg-white dark:bg-slate-900/40 border border-slate-300 dark:border-slate-700 rounded-lg p-4 space-y-2 max-h-48 overflow-y-auto">
                    {teachers.length === 0 ? (
                      <p className="text-sm text-slate-500">Geen docenten beschikbaar. Voeg eerst docenten toe in Settings → Docenten.</p>
                    ) : (
                      teachers.map((teacher) => (
                          <label key={teacher.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={formData.selected_teachers.includes(teacher.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({ ...formData, selected_teachers: [...formData.selected_teachers, teacher.id] });
                                } else {
                                  setFormData({ ...formData, selected_teachers: formData.selected_teachers.filter((id: string) => id !== teacher.id) });
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-sm text-slate-700">
                              {teacher.naam || `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || teacher.email || 'Naamloos'}
                            </span>
                          </label>
                        ))
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Selecteer één of meerdere docenten voor dit programma.</p>
                </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Minimum leeftijd</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.min_age}
                      onChange={(e) => setFormData({ ...formData, min_age: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="bijv. 6"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Maximum leeftijd</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.max_age}
                      onChange={(e) => setFormData({ ...formData, max_age: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="bijv. 12"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Locaties</label>
                  <div className="bg-white dark:bg-slate-900/40 border border-slate-300 dark:border-slate-700 rounded-lg p-4 space-y-2 max-h-48 overflow-y-auto">
                    {locations.length === 0 ? (
                      <p className="text-sm text-slate-500">Geen locaties beschikbaar. Maak eerst locaties aan in Settings.</p>
                    ) : (
                      locations.map((location) => (
                        <label key={location.id} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="program_location"
                            checked={formData.selected_locations.includes(location.id)}
                            onChange={(e) => {
                              // Only allow one selected location - store as single-element array for compatibility
                              if (e.target.checked) {
                                setFormData({ ...formData, selected_locations: [location.id] });
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-sm text-slate-700">{location.name} {[(location as any).adres, location.city].filter(Boolean).join(', ') && `— ${[(location as any).adres, location.city].filter(Boolean).join(', ')}`}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {(formData.program_type === 'group' || localIsTrial) && (
                  <div className="border-t border-slate-200 pt-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Schema Groepscursus</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Weekdag *</label>
                        <Select
                          value={formData.weekday}
                          onChange={(e) => setFormData({ ...formData, weekday: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        >
                          {/* Present weekday choices starting with Maandag (1) through Zondag (7) */}
                          {[1,2,3,4,5,6,7].map((i) => (
                            <option key={i} value={String(i)}>{weekdayNames[i]}</option>
                          ))}
                        </Select>
                      </div>

                      {/* On mobile: show Start/Eind under Weekdag, side-by-side. On desktop: keep as 3 columns. */}
                      <div className="grid grid-cols-2 gap-4 sm:contents">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Start Tijd *</label>
                          <input
                            type="time"
                            value={formData.start_time}
                            onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Eind Tijd *</label>
                          <input
                            type="time"
                            value={formData.end_time}
                            onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Seizoen Start</label>
                        <input
                          type="date"
                          value={formData.season_start}
                          onChange={(e) => setFormData({ ...formData, season_start: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required={formData.program_type === 'group'}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Seizoen Einde</label>
                        <input
                          type="date"
                          value={formData.season_end}
                          onChange={(e) => setFormData({ ...formData, season_end: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required={formData.program_type === 'group'}
                        />
                      </div>
                    </div>

                    {/* Link a single proeflessen program to this group program (moved under schedule) */}
                    {formData.program_type === 'group' && !formData.is_trial && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Proefles programma</label>
                        <Select
                          value={formData.linked_trial_program_id || ''}
                          onChange={(e) => setFormData({ ...formData, linked_trial_program_id: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Geen proefles programma</option>
                          {trialPrograms && trialPrograms.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {formData.program_type === 'workshop' && (
                  <div className="border-t border-slate-200 pt-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Workshop Datum & Tijd</h3>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Datum *</label>
                        <input
                          type="date"
                          value={formData.workshop_date}
                          onChange={(e) => setFormData({ ...formData, workshop_date: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Start Tijd *</label>
                        <input
                          type="time"
                          value={formData.workshop_start_time}
                          onChange={(e) => setFormData({ ...formData, workshop_start_time: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Eind Tijd *</label>
                        <input
                          type="time"
                          value={formData.workshop_end_time}
                          onChange={(e) => setFormData({ ...formData, workshop_end_time: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Betaling Sectie - alleen beschikbaar in Plus en Pro */}
                {hasFeature('online_payments') && (
                <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-6">
                  <div className="bg-blue-50 border border-blue-200 dark:bg-slate-900/60 dark:border-slate-700/60 rounded-lg px-4 py-3">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Betalingen</h3>
                    
                    <label className="flex items-center gap-3 cursor-pointer mb-4">
                      <input
                        type="checkbox"
                        checked={formData.accepts_payment || false}
                        onChange={(e) => setFormData({ ...formData, accepts_payment: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-base font-semibold text-slate-900">Betalingen accepteren via Stripe</div>
                        <div className="text-sm text-slate-600 mt-1">
                          {formData.accepts_payment 
                            ? 'Deelnemers moeten online betalen voordat ze zich kunnen inschrijven'
                            : 'Dit programma is gratis - deelnemers kunnen direct inschrijven'
                          }
                        </div>
                      </div>
                    </label>

                    {/* Prijs input - alleen zichtbaar als accepts_payment is aangevinkt */}
                    {formData.accepts_payment && (
                      <div className="mt-4 pt-4 border-t border-blue-200 dark:border-slate-700/60">
                        <label className="block text-sm font-medium text-slate-900 mb-2">Prijs (€) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                          className="w-full px-4 py-2 border border-blue-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0.00"
                          required={formData.accepts_payment}
                        />
                        <p className="text-xs text-slate-600 mt-2">
                          Vul het bedrag in dat deelnemers moeten betalen via Stripe om zich in te schrijven.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* Class Pass Sectie - alleen beschikbaar in Pro */}
                {hasFeature('class_passes') && (
                <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-6">
                  <div className="bg-purple-50 border border-purple-200 dark:bg-slate-900/60 dark:border-slate-700/60 rounded-lg px-4 py-3">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Class Pass Inschrijvingen</h3>
                    
                    <label className="flex items-center gap-3 cursor-pointer mb-4">
                      <input
                        type="checkbox"
                        checked={formData.accepts_class_passes || false}
                        onChange={(e) => setFormData({ ...formData, accepts_class_passes: e.target.checked, class_pass_product_id: e.target.checked ? formData.class_pass_product_id : '' })}
                        className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-2 focus:ring-purple-500"
                      />
                      <div className="flex-1">
                        <div className="text-base font-semibold text-slate-900">Class Pass accepteren</div>
                        <div className="text-sm text-slate-600 mt-1">
                          {formData.accepts_class_passes 
                            ? 'Gebruikers met class pass credits kunnen zich per les inschrijven'
                            : 'Class pass inschrijvingen zijn niet beschikbaar voor dit programma'
                          }
                        </div>
                      </div>
                    </label>

                    {/* Product selectie - alleen zichtbaar als accepts_class_passes is aangevinkt */}
                    {formData.accepts_class_passes && (
                      <div className="mt-4 pt-4 border-t border-purple-200 dark:border-slate-700/60">
                        <label className="block text-sm font-medium text-slate-900 mb-2">Class Pass Product</label>
                        <Select
                          value={formData.class_pass_product_id || ''}
                          onChange={(e) => setFormData({ ...formData, class_pass_product_id: e.target.value })}
                          className="w-full px-4 py-2 border border-purple-300 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        >
                          <option value="">Alle actieve class pass producten</option>
                          {classPassProducts.map((product) => (
                            <option key={product.id} value={product.id}>{product.name}</option>
                          ))}
                        </Select>
                        <p className="text-xs text-slate-600 mt-2">
                          {formData.class_pass_product_id 
                            ? 'Alleen gebruikers met dit specifieke class pass product kunnen zich inschrijven'
                            : 'Gebruikers met elk actief class pass product van de studio kunnen zich inschrijven'
                          }
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                )}

                <div className="mt-6 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is-public"
                    checked={formData.is_public}
                    onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="is-public" className="text-base font-semibold text-slate-900 cursor-pointer">Programma is publiek zichtbaar</label>
                    <div className="text-sm text-slate-600 mt-1">
                      {formData.is_public 
                        ? 'Dit programma is zichtbaar voor iedereen op de website'
                        : 'Dit programma is alleen zichtbaar voor studio leden'
                      }
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
            {step === 'details' && !editingProgram && (
              <button type="button" onClick={() => setStep('type')} className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
                Terug
              </button>
            )}
            {step === 'details' && (
              <button type="submit" className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                {editingProgram ? 'Opslaan' : 'Aanmaken'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
