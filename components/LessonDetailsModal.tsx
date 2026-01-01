"use client";

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { safeSelect } from '@/lib/supabaseHelpers';
import type { Program } from '@/types/database';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Props {
  program: Program;
  lesson: any;
  onClose: () => void;
  onBack: () => void;
  onSuccess: () => void;
}

export default function LessonDetailsModal({ program, lesson, onClose, onBack, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [consents, setConsents] = useState({ media: false, policy: true });
  const [status, setStatus] = useState<{ accepts_class_passes: boolean; remaining_credits: number; eligible: boolean; already_enrolled: boolean; reason: string | null; purchases?: any[]; upcoming_expiry?: any } | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)

  useEffect(() => {
    loadProfiles();
  }, []);

  // Load status when program accepts class passes and profile selection changes
  useEffect(() => {
    if (!(program as any).accepts_class_passes) return;
    if (!lesson?.id || !program?.studio_id || !program?.id) return;
    fetchStatus();
  }, [program?.id, program?.studio_id, lesson?.id, selectedProfileId]);

  async function fetchStatus() {
    try {
      setStatusLoading(true)
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      const params = new URLSearchParams({
        studio_id: String(program.studio_id),
        program_id: String(program.id),
        lesson_id: String(lesson.id),
      })
      if (selectedProfileId && selectedProfileId !== uid) {
        params.set('sub_profile_id', selectedProfileId)
      }
      const res = await fetch(`/api/class-pass/status?${params.toString()}`)
      const json = await res.json()
      if (res.ok) {
        setStatus(json)
      } else {
        console.warn('Status endpoint error:', json.error)
        setStatus(null)
      }
    } catch (e) {
      console.error('Failed to fetch class pass status', e)
      setStatus(null)
    } finally {
      setStatusLoading(false)
    }
  }

  const loadProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;

      const [mainProfileRes, subsRes] = await Promise.all([
        safeSelect(supabase, 'user_profiles', '*', { user_id: uid }),
        safeSelect(supabase, 'sub_profiles', '*', { parent_user_id: uid })
      ]);

      const mainProfile = (mainProfileRes as any).data;
      const dependents = (subsRes as any).data;

      const list: any[] = [];
      if (mainProfile) list.push({ id: mainProfile.user_id, label: `${mainProfile.first_name || ''} ${mainProfile.last_name || ''}`.trim() || 'Mijn profiel', type: 'main' });
      if (dependents) list.push(...(dependents as any[]).map((d: any) => ({ id: d.id, label: `${d.first_name || ''} ${d.last_name || ''}`.trim(), type: 'sub' })));

      setProfiles(list);
      if (list.length > 0) setSelectedProfileId(list[0].id);
    } catch (err) {
      console.error('Failed to load profiles', err);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const enrollForLesson = async () => {
    setLoading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        window.location.href = '/auth/login';
        return;
      }

      // find or create member
      let memberId: string | null = null;

      const { data: existingMember } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', uid)
        .eq('studio_id', program.studio_id)
        .maybeSingle();

      if (existingMember) {
        memberId = existingMember.id;
      } else {
        // try to load profile
        const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', uid).maybeSingle();
        const profileData = profile || { first_name: '', last_name: '', email: '' };
        const { data: newMember } = await supabase.from('members').insert({
          user_id: uid,
          studio_id: program.studio_id,
          first_name: profileData.first_name,
          last_name: profileData.last_name,
          email: profileData.email || userRes.user?.email,
          is_dependent: false,
          photo_video_consent: consents.media,
          photo_video_consent_timestamp: new Date().toISOString(),
        }).select().single();
        memberId = newMember.id;
      }

      if (!memberId) throw new Error('Failed to find or create member');

      if (!selectedProfileId) {
        alert('Selecteer een profiel om verder te gaan');
        return;
      }

      const applicationData: any = {
        program_id: program.id,
        studio_id: program.studio_id,
        member_id: memberId,
        user_id: uid,
        applicant_type: 'self',
        sub_profile_id: null,
        status: 'pending',
        payment_status: (program as any).requires_payment ? 'pending' : 'completed',
        opmerking: `Lesson enrollment: ${lesson.id}`,
      };

      // if a sub-profile is selected (not the main profile), use it
      // main profile option uses the user's id as id in our profiles list
      if (selectedProfileId && selectedProfileId !== uid) {
        applicationData.sub_profile_id = selectedProfileId;
      }

      // If program accepts class passes, attempt to enroll by consuming a credit
      if ((program as any).accepts_class_passes === true) {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes.user?.id;
        const res = await fetch('/api/class-pass/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studio_id: program.studio_id,
            program_id: program.id,
            lesson_id: lesson.id,
            profile_snapshot: {},
            sub_profile_id: (selectedProfileId && selectedProfileId !== uid) ? selectedProfileId : null,
          })
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Kon inschrijving niet voltooien met class pass')
        // Optimistic update: decrement credits and mark enrolled
        setStatus(s => s ? { ...s, remaining_credits: Math.max(0, s.remaining_credits - 1), eligible: false, already_enrolled: true, reason: 'Reeds ingeschreven voor deze les' } : s)
      } else {
        if (!(program as any).requires_payment) {
          applicationData.status = 'approved';
          applicationData.approved_at = new Date().toISOString();
        }
        const { error: appErr } = await supabase.from('applications').insert(applicationData).select().single();
        if (appErr) throw appErr;
      }

      onSuccess();
    } catch (err: any) {
      console.error('Failed to enroll for lesson', err);
      alert(err.message || 'Failed to enroll');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="t-h3 font-semibold">{lesson.naam || lesson.name || 'Lesson'}</h3>
            <div className="t-bodySm">{lesson.datum} {lesson.tijd}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={onBack} className="px-3 py-1 rounded-lg border t-button">Back</button>
            <button onClick={onClose} aria-label="Close" className="p-2 rounded-md text-slate-500 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block t-label font-medium mb-2">Kies profiel</label>
            {loadingProfiles ? (
              <div className="t-bodySm text-slate-600 flex items-center gap-2">
                <LoadingSpinner size={16} label="Profielen laden" indicatorClassName="border-b-slate-600" />
                <span>Profielen laden…</span>
              </div>
            ) : profiles.length === 0 ? (
              <div className="t-bodySm">Geen profielen gevonden. Vul je profiel in of maak een sub-profiel aan.</div>
            ) : (
              <div className="space-y-2">
                {profiles.map(p => (
                  <label key={p.id} className="flex items-center gap-3 t-bodySm">
                    <input type="radio" name="profile" checked={selectedProfileId === p.id} onChange={() => setSelectedProfileId(p.id)} />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {lesson.beschrijving && <p className="t-body">{lesson.beschrijving}</p>}

          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={consents.media} onChange={(e) => setConsents(s => ({ ...s, media: e.target.checked }))} />
              <span className="t-bodySm">Ik geef toestemming voor foto/video gebruik</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={consents.policy} onChange={(e) => setConsents(s => ({ ...s, policy: e.target.checked }))} />
              <span className="t-bodySm">Ik accepteer het beleid</span>
            </label>
          </div>

          <div className="flex flex-col gap-2">
            {(program as any).accepts_class_passes && (
              <div className="space-y-2">
                <div className="t-bodySm">
                  {statusLoading && 'Bezig met laden van class pass status...'}
                  {!statusLoading && status && (
                    <>
                      <span className="font-medium">Credits:</span> {status.remaining_credits} {status.already_enrolled && '• Reeds ingeschreven'} {(!status.eligible && status.reason) && `• ${status.reason}`}
                    </>
                  )}
                </div>
                {!statusLoading && status?.upcoming_expiry && (
                  <div className="t-caption t-noColor text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    Let op: bundel '{status.upcoming_expiry.product_name}' verloopt over {status.upcoming_expiry.days_to_expiry} dagen (op {new Date(status.upcoming_expiry.expires_at).toLocaleDateString()}).
                  </div>
                )}
                {!statusLoading && status?.purchases && status.purchases.length > 0 && (
                  <div className="t-caption space-y-1 max-h-32 overflow-y-auto">
                    {status.purchases.map(p => (
                      <div key={p.id} className="flex justify-between">
                        <span>{p.product_name || 'Product'}: {p.remaining}/{p.credits_total}</span>
                        {p.expires_at && (
                          <span>{p.days_to_expiry}d</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={enrollForLesson}
              disabled={loading || ((program as any).accepts_class_passes && (!status || !status.eligible))}
              className={`flex-1 px-4 py-2 rounded-lg text-white t-button t-noColor ${loading ? 'bg-slate-400' : ((program as any).accepts_class_passes ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700')}`}
            >
              {loading ? 'Bezig...' : ((program as any).accepts_class_passes ? 'Inschrijven met Class Pass' : 'Inschrijven voor deze les')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
