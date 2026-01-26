'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Users, Search, Eye, Mail } from 'lucide-react';
import UserDetailsModal from '@/components/UserDetailsModal';
import { FeatureGate } from '@/components/FeatureGate';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears';

interface Member {
  user_id: string;
  user_email: string;
  user_metadata: any;
  enrollments: Array<{
    id: string;
    status: string;
    inschrijving_datum: string;
    program: {
      id: string;
      title: string;
      program_type: string;
    };
  }>;
  total_enrollments: number;
  active_enrollments: number;
}

export default function MembersPage() {
  const params = useParams();
  const studioId = params.id as string;
  const { selectedYearId: activeYearId, missingTable: schoolYearsMissing } = useStudioSchoolYears(studioId);

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  useEffect(() => {
    if (!schoolYearsMissing && !activeYearId) return;
    loadMembers();
  }, [studioId, activeYearId, schoolYearsMissing]);

  const loadMembers = async () => {
    try {
      // Get all enrollments for programs in this studio, including the profile_snapshot
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('inschrijvingen')
        .select(`
          id,
          user_id,
          status,
          inschrijving_datum,
          sub_profile_id,
          profile_snapshot,
          program:programs!inner(
            id,
            title,
            program_type,
            studio_id,
            school_year_id
          )
        `)
        .eq('program.studio_id', studioId);

      // Filter client-side by program.school_year_id (keeps query robust across schema rollout)
      const filteredEnrollments = activeYearId
        ? ((enrollments || []) as any[]).filter((e) => String((e as any)?.program?.school_year_id || '') === String(activeYearId))
        : (enrollments || []);

      if (enrollmentsError) {
        console.error('Enrollments query error:', enrollmentsError);
        throw enrollmentsError;
      }

      // Build one row per sub-profile (grouped by sub_profile_id) and one row per parent user
      // (group enrollments that don't reference a sub_profile_id).
      const subMap = new Map<string, Member>();
      const enrollmentsArray: any[] = filteredEnrollments || [];

      // Preload parent profiles for all involved user_ids to use as fallback data
      const userIds = Array.from(new Set(enrollmentsArray.map((e: any) => e.user_id).filter(Boolean)));
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('user_profiles')
          .select('user_id, email, first_name, last_name, phone_number')
          .in('user_id', userIds as any[]);
        
        if (profilesError) {
          console.error('Profiles query error:', profilesError);
        }
        
        if (profilesData) {
          console.info('Loaded profiles:', profilesData.length, 'profiles for', userIds.length, 'users');
          for (const p of profilesData) profilesMap[p.user_id] = p;
        }
      }

      // Group sub-profile enrollments by sub_profile_id
      for (const e of enrollmentsArray.filter((x: any) => x.sub_profile_id)) {
        const key = String(e.sub_profile_id);
        const snapshot = e.profile_snapshot || {};
        const parentProfile = profilesMap[e.user_id] || {};
        // Prefer snapshot email, otherwise fall back to parent profile email
        const email = snapshot?.email || parentProfile?.email || 'Onbekend';

        if (!subMap.has(key)) {
          subMap.set(key, {
            user_id: `${e.user_id}-sub-${key}`,
            user_email: email,
            // merge snapshot with a light parent reference for contact fallback
            user_metadata: { ...(snapshot || {}), parent_contact: { email: parentProfile?.email } },
            enrollments: [],
            total_enrollments: 0,
            active_enrollments: 0,
          });
        }

        const m = subMap.get(key)!;
        m.enrollments.push({ id: e.id, status: e.status, inschrijving_datum: e.inschrijving_datum, program: e.program as any });
        m.total_enrollments++;
        if (e.status === 'actief') m.active_enrollments++;
      }

      // Now group remaining enrollments (no sub_profile_id) by user_id
      const memberMap = new Map<string, Member>();
      const withoutSub = enrollmentsArray.filter((x: any) => !x.sub_profile_id);
      for (const enrollment of withoutSub) {
        const userId = enrollment.user_id;

        if (!memberMap.has(userId)) {
          // Use the profilesMap data for parent accounts
          const userData = profilesMap[userId] || {};
          const userEmail = userData?.email || 'Onbekend';
          
          console.info('Parent account data for user', userId, ':', userData);

          memberMap.set(userId, {
            user_id: userId,
            user_email: userEmail,
            user_metadata: userData,
            enrollments: [],
            total_enrollments: 0,
            active_enrollments: 0,
          });
        }

        const member = memberMap.get(userId)!;
        member.enrollments.push({
          id: enrollment.id,
          status: enrollment.status,
          inschrijving_datum: enrollment.inschrijving_datum,
          program: enrollment.program as any,
        });
        member.total_enrollments++;
        if (enrollment.status === 'actief') member.active_enrollments++;
      }

      // Combine parent users and subprofiles into the members list
      setMembers([...Array.from(memberMap.values()), ...Array.from(subMap.values())]);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewUser = (member: Member) => {
    setSelectedUser({
      id: member.user_id,
      email: member.user_email,
      user_metadata: member.user_metadata,
    });
    setShowUserModal(true);
  };

  // Helper to compute a display name from various snapshot/profile shapes
  const getDisplayName = (meta: any, email: string) => {
    if (!meta && !email) return '';
    const first = meta?.first_name || meta?.voornaam || '';
    const last = meta?.last_name || meta?.achternaam || '';
    if (first || last) return `${first} ${last}`.trim();
    // Full name fields
    if (meta?.name) return String(meta.name).trim();
    if (meta?.naam) return String(meta.naam).trim();
    if (meta?.display_name) return String(meta.display_name).trim();
    // Fallback to email local part
    if (email) return String(email).split('@')[0];
    return '';
  };

  const getInitial = (meta: any, email: string) => {
    const name = getDisplayName(meta, email);
    const ch = (name && name[0]) || (email && email[0]) || '?';
    return String(ch).toUpperCase();
  };

  const getPhone = (meta: any) => {
    return meta?.phone_number || meta?.telefoon || meta?.mobiel || meta?.phone || '';
  };

    const filteredMembers = members.filter((member) => {
    const query = searchQuery.toLowerCase();
    const fullName = getDisplayName(member.user_metadata, member.user_email).toLowerCase();
    return (
      (member.user_email || '').toLowerCase().includes(query) ||
      fullName.includes(query)
    );
  });

  return (
    <FeatureGate flagKey="studio.members" mode="page">
      {loading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <LoadingSpinner size={48} className="mb-4" />
            <p className="text-slate-600">Leden laden...</p>
          </div>
        </div>
      ) : (
        <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Leden</h1>
          <p className="text-slate-600 mt-2">
            Alle ingeschreven leden voor programma's van deze studio
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Zoek op naam of email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{members.length}</div>
          <div className="text-xs sm:text-sm text-slate-600">Totaal Leden</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
          <div className="text-xl sm:text-2xl font-bold text-green-600">
            {members.reduce((sum, m) => sum + m.active_enrollments, 0)}
          </div>
          <div className="text-xs sm:text-sm text-slate-600">Actieve Inschrijvingen</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
          <div className="text-xl sm:text-2xl font-bold text-slate-900">
            {members.reduce((sum, m) => sum + m.total_enrollments, 0)}
          </div>
          <div className="text-xs sm:text-sm text-slate-600">Totaal Inschrijvingen</div>
        </div>
      </div>

      {/* Members List */}
      {filteredMembers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">Geen leden gevonden</h3>
          <p className="text-slate-600">
            {searchQuery
              ? 'Probeer een andere zoekopdracht.'
              : 'Er zijn nog geen inschrijvingen voor programma\'s van deze studio.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Lid
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Programma's
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Acties
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredMembers.map((member) => (
                <tr key={member.user_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex items-center">
                      <div className="shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-medium text-sm">
                          {getInitial(member.user_metadata, member.user_email)}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-slate-900">
                          {(() => {
                            const fullName = getDisplayName(member.user_metadata, member.user_email);
                            return fullName || 'Naam niet ingevuld';
                          })()}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          <a href={`mailto:${member.user_email}`} className="hover:text-blue-600">
                            {member.user_email}
                          </a>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="text-xs text-slate-500">
                      {member.enrollments.map(e => e.program.title).slice(0, 2).join(', ')}
                      {member.enrollments.length > 2 && ` +${member.enrollments.length - 2}`}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 whitespace-nowrap">
                      <span className="font-semibold">{member.active_enrollments}</span>
                      <span>actief</span>
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                    <button
                      onClick={() => handleViewUser(member)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <UserDetailsModal
          isOpen={showUserModal}
          onClose={() => {
            setShowUserModal(false);
            setSelectedUser(null);
          }}
          user={selectedUser}
          enrollments={members.find(m => m.user_id === selectedUser.id)?.enrollments}
        />
      )}
        </div>
      )}
    </FeatureGate>
  );
}
