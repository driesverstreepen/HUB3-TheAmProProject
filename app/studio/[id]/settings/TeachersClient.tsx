"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Plus, Trash2, Search, Mail, Clock, DollarSign, X, RefreshCw, Check } from 'lucide-react';
import ActionIcon from '@/components/ActionIcon';
import FormSelect from '@/components/FormSelect';
import { PendingTeacherInvitation } from '@/types/database';
import { useNotification } from '@/contexts/NotificationContext';
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Teacher {
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  assigned_programs_count?: number;
}

interface Compensation {
  lesson_fee: number;
  transport_fee: number;
  iban: string;
  payment_method: 'factuur' | 'vrijwilligersvergoeding' | 'verenigingswerk' | 'akv';
  active: boolean;
  notes: string;
}

interface Props {
  studioId: string;
}

export default function TeachersClient({ studioId }: Props) {
  const { showSuccess, showError, showInfo } = useNotification();
  const { isArmed: isRemoveArmed, confirmOrArm: confirmOrArmRemove } = useTwoStepConfirm<string>(4500);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingTeacherInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [compensation, setCompensation] = useState<Compensation>({
    lesson_fee: 0,
    transport_fee: 0,
    iban: '',
    payment_method: 'factuur',
    active: true,
    notes: ''
  });
  const [savingCompensation, setSavingCompensation] = useState(false);

  useEffect(() => {
    loadData();
  }, [studioId]);

  const loadData = async () => {
    try {
      await Promise.all([loadTeachers(), loadPendingInvitations()]);
    } catch (err) {
      console.error('Error in loadData:', err);
      // Don't alert here - individual functions handle their own errors
    }
  };

  const loadTeachers = async () => {
    try {
      // Get all teacher-studio links for this studio from studio_teachers junction table
      const { data: teacherLinks, error: linksError } = await supabase
        .from('studio_teachers')
        .select('user_id')
        .eq('studio_id', studioId);

      if (linksError) {
        console.error('Error loading teacher links:', linksError);
        // Don't throw - just set empty array and continue
        setTeachers([]);
        return;
      }

      if (!teacherLinks || teacherLinks.length === 0) {
        setTeachers([]);
        return;
      }

      const teacherIds = teacherLinks.map(link => link.user_id);

      // If no teachers, return empty array
      if (teacherIds.length === 0) {
        setTeachers([]);
        return;
      }

      // Get profile details for these teachers
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, email, first_name, last_name, phone_number')
        .in('user_id', teacherIds);

      if (profilesError) {
        console.error('Error loading profiles:', profilesError);
        setTeachers([]);
        return;
      }

      // Count assigned programs for each teacher
      const teachersWithCount = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { count } = await supabase
            .from('teacher_programs')
            .select('*', { count: 'exact', head: true })
            .eq('teacher_id', profile.user_id)
            .eq('studio_id', studioId);

          return {
            ...profile,
            assigned_programs_count: count || 0,
          };
        })
      );

      setTeachers(teachersWithCount);
    } catch (err: any) {
      console.error('Error loading teachers:', err.message || err);
      // Don't alert on load failure - user can retry
      setTeachers([]);
    }
  };

  const loadPendingInvitations = async () => {
    try {
      // Client-side: load pending invitations and check user_profiles for account existence
      const { data: pending, error } = await supabase
        .from('pending_teacher_invitations')
        .select('*')
        .eq('studio_id', studioId)
        .order('invited_at', { ascending: false });

      if (error) throw error;

      const invites = pending || [];

      const enhanced = await Promise.all(invites.map(async (inv: any) => {
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('user_id')
            .ilike('email', inv.email)
            .limit(1)
            .maybeSingle();

          return {
            ...inv,
            has_account: !!profile?.user_id,
            account_user_id: profile?.user_id || null
          }
        } catch (e) {
          console.error('Error checking account for invitation', inv.id, e)
          return { ...inv, has_account: false, account_user_id: null }
        }
      }))

      setPendingInvitations(enhanced as any);
    } catch (err) {
      console.error('Error loading pending invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setTeacherEmail('');
  };

  const handleAddTeacher = async () => {
    const email = teacherEmail.trim().toLowerCase();
    
    if (!email) {
      showError('Voer een e-mailadres in');
      return;
    }

    // Basic email validation
    if (!email.includes('@') || !email.includes('.')) {
      showError('Voer een geldig e-mailadres in');
      return;
    }

    try {
      // Check if user exists with this email
      const { data: existingProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, email')
        .eq('email', email)
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      if (existingProfile) {
        // User exists - check if already a teacher
        const { data: existingRole, error: roleCheckError } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', existingProfile.user_id)
          .eq('studio_id', studioId)
          .eq('role', 'teacher')
          .maybeSingle();

        // Log if there's an error checking the role (but don't fail)
        if (roleCheckError && roleCheckError.code !== 'PGRST116') {
          console.warn('Warning checking existing teacher role:', roleCheckError);
        }

        if (existingRole) {
          showError('Deze gebruiker is al een docent bij deze studio');
          return;
        }

        // Check if there's already a pending invitation
        const { data: existingInvitation } = await supabase
          .from('pending_teacher_invitations')
          .select('id, status')
          .eq('email', email)
          .eq('studio_id', studioId)
          .maybeSingle();

        if (existingInvitation && existingInvitation.status === 'pending') {
          showError('Er is al een uitnodiging verzonden naar dit e-mailadres');
          return;
        }

        // Use server endpoint so we can also trigger push notifications securely
        const { data: session } = await supabase.auth.getSession()
        const accessToken = session?.session?.access_token
        if (!accessToken) {
          showError('Je bent niet ingelogd')
          return
        }

        const resp = await fetch(`/api/studios/${encodeURIComponent(studioId)}/pending-invitations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ email }),
        })

        const result = await resp.json().catch(() => ({} as any))
        if (!resp.ok) {
          showError(result?.error || 'Uitnodiging versturen mislukt')
          return
        }

        if (result?.has_account) {
          showSuccess(`Uitnodiging verzonden naar ${email}. De gebruiker ontvangt een melding.`)
        } else {
          showSuccess(`Uitnodiging opgeslagen voor ${email}. De melding wordt verstuurd zodra de gebruiker een account heeft.`)
        }
        setShowAddModal(false);
        setTeacherEmail('');
        loadData();
      } else {
        // User doesn't exist yet - create pending invitation and create a placeholder notification
        const { error: inviteError } = await supabase
          .from('pending_teacher_invitations')
          .insert({
            email: email,
            studio_id: studioId,
            status: 'pending'
          });

        if (inviteError) throw inviteError;

        // We cannot create a notification row without a valid user_id because
        // the `notifications.user_id` column is NOT NULL and references auth.users(id).
        // Therefore we only create the pending invitation here and rely on the
        // signup/webhook flows to create the notification once the user exists.
        // This avoids DB constraint errors and duplicate/invalid notifications.
        // The admin bulk endpoint can be used to backfill notifications for existing users.

        showSuccess(`Uitnodiging aangemaakt voor ${email}. Zodra deze persoon een account aanmaakt, ontvangt deze een melding.`);
        setShowAddModal(false);
        setTeacherEmail('');
        loadData();
      }
    } catch (err: any) {
      console.error('Error adding teacher:', err);
      showError(err?.message || 'Fout bij het toevoegen van docent');
    }
  };

  const handleRemoveTeacher = async (teacherId: string) => {
    try {
      // Get access token
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        showError('Geen geldige sessie gevonden');
        return;
      }

      // Call API to remove teacher-studio link
      const response = await fetch(`/api/studios/${studioId}/teachers/${teacherId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Fout bij verwijderen van docent');
      }

      showSuccess('Docent verwijderd van dit studio');
      loadData();
    } catch (err: any) {
      console.error('Error removing teacher:', err);
      showError(err?.message || 'Fout bij het verwijderen van docent');
    }
  };

  const handleRemovePendingInvitation = async (invitationId: string, email: string) => {
    try {
      const { error } = await supabase
        .from('pending_teacher_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      showSuccess('Uitnodiging verwijderd');
      loadData();
    } catch (err: any) {
      console.error('Error removing pending invitation:', err);
      showError(err?.message || 'Fout bij het verwijderen van uitnodiging');
    }
  };

  const handleOpenCompensationModal = async (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setShowCompensationModal(true);
    
    // Load existing compensation settings
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = (session as any)?.access_token;
      if (!token) {
        showError('Je sessie is verlopen. Log opnieuw in.');
        setCompensation({
          lesson_fee: 0,
          transport_fee: 0,
          iban: '',
          payment_method: 'factuur',
          active: true,
          notes: ''
        });
        return;
      }

      const res = await fetch(`/api/studio/${studioId}/teacher-compensation?teacher_id=${encodeURIComponent(teacher.user_id)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(json?.error || 'Fout bij het laden van vergoeding');
      }

      const data = json?.compensation;
      if (data) {
        setCompensation({
          lesson_fee: Number(data.lesson_fee),
          transport_fee: Number(data.transport_fee),
          iban: String(data.iban || ''),
          payment_method: data.payment_method,
          active: data.active,
          notes: data.notes || ''
        });
      } else {
        // Reset to defaults if no compensation exists
        setCompensation({
          lesson_fee: 0,
          transport_fee: 0,
          iban: '',
          payment_method: 'factuur',
          active: true,
          notes: ''
        });
      }
    } catch (err) {
      console.error('Error loading compensation:', err);
      showError((err as any)?.message || 'Fout bij het laden van vergoeding');
    }
  };

  const handleSaveCompensation = async () => {
    if (!selectedTeacher) return;

    setSavingCompensation(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = (session as any)?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/studio/${studioId}/teacher-compensation`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          teacher_id: selectedTeacher.user_id,
          lesson_fee: compensation.lesson_fee,
          transport_fee: compensation.transport_fee,
          iban: compensation.iban,
          payment_method: compensation.payment_method,
          active: compensation.active,
          notes: compensation.notes
        })
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(json?.error || 'Fout bij het opslaan van vergoeding');
      }

      showSuccess('Vergoeding opgeslagen');
      setShowCompensationModal(false);
      setSelectedTeacher(null);
    } catch (err: any) {
      console.error('Error saving compensation:', {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        name: err?.name,
        stack: err?.stack
      });
      showError(err?.message || err?.hint || 'Fout bij het opslaan van vergoeding. Check de console voor details.');
    } finally {
      setSavingCompensation(false);
    }
  };

  const filteredTeachers = teachers.filter((teacher) => {
    const query = searchQuery.toLowerCase();
    const fullName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.toLowerCase();
    return (
      teacher.email.toLowerCase().includes(query) ||
      fullName.includes(query)
    );
  });

  const filteredPendingInvitations = pendingInvitations.filter((invitation) => {
    const query = searchQuery.toLowerCase();
    return invitation.email.toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" />
            <p className="text-slate-600">Docenten laden…</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users size={24} />
            Docenten
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Beheer welke gebruikers docent zijn bij deze studio en stel hun vergoedingen in
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-blue-600 text-white px-2 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          Docent Toevoegen
        </button>
      </div>

      {/* Search */}
      {(teachers.length > 0 || pendingInvitations.length > 0) && (
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Zoek op naam of email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      )}

      {/* Teachers List */}
      {filteredTeachers.length === 0 && filteredPendingInvitations.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            {searchQuery ? 'Geen docenten of uitnodigingen gevonden' : 'Nog geen docenten'}
          </h3>
          <p className="text-slate-600 mb-4">
            {searchQuery
              ? 'Probeer een andere zoekopdracht.'
              : 'Voeg gebruikers toe als docent om programma\'s aan hen toe te wijzen.'}
          </p>
          {!searchQuery && (
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-2 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              Docent Toevoegen
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Teachers Table */}
          {filteredTeachers.length > 0 && (
            <>
              {/* Mobile: card list (tables are hard to scan on small screens) */}
              <div className="md:hidden space-y-3 mb-6">
                {filteredTeachers.map((teacher) => (
                  <div
                    key={teacher.user_id}
                    className="bg-white rounded-xl border border-slate-200 p-4"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenCompensationModal(teacher)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleOpenCompensationModal(teacher)
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-3">
                        <div className="shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-blue-600 font-medium text-sm">
                            {teacher.first_name?.[0]?.toUpperCase() || teacher.email[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {teacher.first_name && teacher.last_name
                              ? `${teacher.first_name} ${teacher.last_name}`
                              : 'Naam niet ingevuld'}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-sm text-slate-600 min-w-0">
                            <Mail size={14} className="text-slate-400 flex-none" />
                            <a
                              href={`mailto:${teacher.email}`}
                              className="truncate hover:text-blue-600"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {teacher.email}
                            </a>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            Toegewezen programma's: {teacher.assigned_programs_count || 0}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-none">
                        <ActionIcon
                          variant="primary"
                          title="Vergoeding instellen"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCompensationModal(teacher);
                          }}
                        >
                          <DollarSign size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="danger"
                          title={isRemoveArmed(`teacher:${teacher.user_id}`) ? 'Klik opnieuw om te verwijderen' : 'Verwijder docent'}
                          className={isRemoveArmed(`teacher:${teacher.user_id}`) ? 'ring-2 ring-red-200' : ''}
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmOrArmRemove(`teacher:${teacher.user_id}`, () => handleRemoveTeacher(teacher.user_id));
                          }}
                        >
                          {isRemoveArmed(`teacher:${teacher.user_id}`) ? <Check size={16} /> : <Trash2 size={16} />}
                        </ActionIcon>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop/tablet: table */}
              <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden mb-8">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                        Docent
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                        Toegewezen Programma's
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                        Acties
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTeachers.map((teacher) => (
                      <tr
                        key={teacher.user_id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => handleOpenCompensationModal(teacher)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-600 font-medium text-sm">
                                {teacher.first_name?.[0]?.toUpperCase() || teacher.email[0]?.toUpperCase() || '?'}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-slate-900">
                                {teacher.first_name && teacher.last_name
                                  ? `${teacher.first_name} ${teacher.last_name}`
                                  : 'Naam niet ingevuld'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Mail size={14} />
                            <a
                              href={`mailto:${teacher.email}`}
                              className="hover:text-blue-600"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {teacher.email}
                            </a>
                          </div>
                          {teacher.phone_number && <div className="text-sm text-slate-500 mt-1">{teacher.phone_number}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-900">{teacher.assigned_programs_count || 0}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <ActionIcon
                              variant="primary"
                              title="Vergoeding instellen"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenCompensationModal(teacher);
                              }}
                            >
                              <DollarSign size={16} />
                            </ActionIcon>
                            <ActionIcon
                              variant="danger"
                              title={isRemoveArmed(`teacher:${teacher.user_id}`) ? 'Klik opnieuw om te verwijderen' : 'Verwijder docent'}
                              className={isRemoveArmed(`teacher:${teacher.user_id}`) ? 'ring-2 ring-red-200' : ''}
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmOrArmRemove(`teacher:${teacher.user_id}`, () => handleRemoveTeacher(teacher.user_id));
                              }}
                            >
                              {isRemoveArmed(`teacher:${teacher.user_id}`) ? (
                                <>
                                  <span className="hidden sm:inline text-sm font-medium">Verwijderen</span>
                                  <span className="sm:hidden">
                                    <Check size={16} />
                                  </span>
                                </>
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </ActionIcon>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pending Invitations */}
          {filteredPendingInvitations.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Clock size={20} />
                Uitnodigingen
              </h3>
              <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-amber-100 border-b border-amber-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider">
                        E-mailadres
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider">
                        Uitgenodigd op
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-amber-800 uppercase tracking-wider">
                        Acties
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200">
                    {filteredPendingInvitations.map((invitation) => {
                      const getStatusBadge = (inv: any) => {
                        const status = inv?.status;
                        if (status === 'accepted') {
                          return (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Geaccepteerd
                            </span>
                          );
                        }

                        if (status === 'declined') {
                          return (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Geweigerd
                            </span>
                          );
                        }

                        // Pending
                        if (!inv.has_account) {
                          return (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                              Geen account (uitnodiging nog niet verzonden)
                            </span>
                          );
                        }

                        if (inv.notification_id) {
                          return (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              Uitnodiging verzonden
                            </span>
                          );
                        }

                        return (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Klaar om te verzenden
                          </span>
                        );
                      };

                      return (
                        <tr key={invitation.id} className="hover:bg-amber-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Mail size={16} className="text-amber-600" />
                              <span className="text-sm font-medium text-slate-900">
                                {invitation.email}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {getStatusBadge(invitation)}
                            {/* removed extra descriptive hint per UX request */}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-600">
                              {invitation.sent_at ? new Date(invitation.sent_at).toLocaleDateString('nl-NL') : ''}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <ActionIcon
                              variant="danger"
                              title={isRemoveArmed(`invite:${invitation.id}`) ? 'Klik opnieuw om te verwijderen' : 'Uitnodiging verwijderen'}
                              className={isRemoveArmed(`invite:${invitation.id}`) ? 'ring-2 ring-red-200' : ''}
                              onClick={() => confirmOrArmRemove(`invite:${invitation.id}`, () => handleRemovePendingInvitation(invitation.id, invitation.email))}
                            >
                              {isRemoveArmed(`invite:${invitation.id}`) ? (
                                <>
                                  <span className="hidden sm:inline text-sm font-medium">Verwijderen</span>
                                  <span className="sm:hidden">
                                    <Check size={16} />
                                  </span>
                                </>
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </ActionIcon>
                            {/* Show send/refresh action only when there's an account and invitation still pending and no linked notification yet */}
                            {invitation.has_account && invitation.status === 'pending' && !invitation.notification_id && (
                              <ActionIcon
                                variant="primary"
                                title="Verstuur uitnodiging"
                                onClick={async () => {
                                  try {
                                    const { data: { session } } = await supabase.auth.getSession();
                                    const accessToken = session?.access_token;
                                    if (!accessToken) {
                                      showError('Geen geldige sessie gevonden');
                                      return;
                                    }

                                    const res = await fetch('/api/studios/process-invitation', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${accessToken}`
                                      },
                                      body: JSON.stringify({ invitation_id: invitation.id })
                                    });

                                    const json = await res.json();
                                    if (!res.ok) {
                                      console.error('Refresh API error:', json);
                                      showError('Versturen mislukt: ' + (json.error || json.message || res.status));
                                      return;
                                    }

                                    if (json.success) {
                                      showSuccess(json.message || 'Uitnodiging verzonden — de gebruiker ontvangt nu een melding.');
                                      loadData();
                                    } else if (json.reason === 'no_user') {
                                      showInfo('Nog geen account voor dit e-mailadres gevonden.');
                                    } else {
                                      showInfo('Actie voltooid');
                                      loadData();
                                    }
                                  } catch (e) {
                                    console.error('Error calling send-invitation endpoint:', e);
                                    showError('Fout bij versturen van uitnodiging');
                                  }
                                }}
                              >
                                <RefreshCw size={16} />
                              </ActionIcon>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Teacher Modal */}
      {showAddModal && (
        <div onClick={() => { setShowAddModal(false); setTeacherEmail(''); }} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900">Docent Toevoegen</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setTeacherEmail('');
                }}
                aria-label="Close"
                className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                E-mailadres van docent
              </label>
              <input
                type="email"
                value={teacherEmail}
                onChange={(e) => setTeacherEmail(e.target.value)}
                placeholder="docent@example.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-2">
                Voer het e-mailadres in van een bestaande gebruiker. Deze krijgt dan de docentrol toegewezen.
              </p>
            </div>

            <div className="flex">
              <button
                onClick={handleAddTeacher}
                disabled={!teacherEmail.trim()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Toevoegen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compensation Modal */}
      {showCompensationModal && selectedTeacher && (
        <div onClick={() => { setShowCompensationModal(false); setSelectedTeacher(null); }} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Vergoeding Instellen</h3>
                <p className="text-sm text-slate-600 mt-1">
                  {selectedTeacher.first_name && selectedTeacher.last_name
                    ? `${selectedTeacher.first_name} ${selectedTeacher.last_name}`
                    : selectedTeacher.email}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCompensationModal(false);
                  setSelectedTeacher(null);
                }}
                aria-label="Close"
                className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Lesson Fee */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Les Vergoeding (per uur)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-medium pointer-events-none">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={compensation.lesson_fee}
                    onChange={(e) => setCompensation({
                      ...compensation,
                      lesson_fee: parseFloat(e.target.value) || 0
                    })}
                    className="w-full pl-12 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Transport Fee */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Reiskostenvergoeding (per lesdag)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-medium pointer-events-none">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={compensation.transport_fee}
                    onChange={(e) => setCompensation({
                      ...compensation,
                      transport_fee: parseFloat(e.target.value) || 0
                    })}
                    className="w-full pl-12 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* IBAN */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  IBAN
                </label>
                <input
                  type="text"
                  value={compensation.iban}
                  onChange={(e) => setCompensation({
                    ...compensation,
                    iban: e.target.value
                  })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="NL00BANK0123456789"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Spaties zijn toegestaan; we slaan dit op zonder spaties.
                </p>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Betaalmethode
                </label>
                <FormSelect
                  value={compensation.payment_method}
                  onChange={(e) => setCompensation({
                    ...compensation,
                    payment_method: e.target.value as any
                  })}
                  className="w-full"
                  variant="sm"
                >
                  <option value="factuur">Factuur</option>
                  <option value="vrijwilligersvergoeding">Vrijwilligersvergoeding</option>
                  <option value="verenigingswerk">Verenigingswerk</option>
                  <option value="akv">AKV (Alternatieve Kostenvergoeding)</option>
                </FormSelect>
                <p className="text-xs text-slate-500 mt-1">
                  {compensation.payment_method === 'factuur' && 'Docent factureert met BTW'}
                  {compensation.payment_method === 'vrijwilligersvergoeding' && 'Onbelaste vrijwilligersvergoeding (max € 1.900/jaar)'}
                  {compensation.payment_method === 'verenigingswerk' && 'Verenigingswerk zonder fiscale gevolgen'}
                  {compensation.payment_method === 'akv' && 'Alternatieve kostenvergoeding voor werknemers'}
                </p>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="compensation-active"
                  checked={compensation.active}
                  onChange={(e) => setCompensation({
                    ...compensation,
                    active: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="compensation-active" className="text-sm font-medium text-slate-700">
                  Actief (wordt meegenomen in berekeningen)
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Notities
                </label>
                <textarea
                  value={compensation.notes}
                  onChange={(e) => setCompensation({
                    ...compensation,
                    notes: e.target.value
                  })}
                  rows={3}
                  placeholder="Optionele opmerkingen over deze vergoedingsregeling..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveCompensation}
                disabled={savingCompensation}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {savingCompensation ? (
                  <>
                    <LoadingSpinner
                      size={16}
                      className="shrink-0"
                      trackClassName="border-transparent"
                      indicatorClassName="border-b-white"
                      label="Laden"
                    />
                    Opslaan...
                  </>
                ) : (
                  <>
                    Opslaan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
