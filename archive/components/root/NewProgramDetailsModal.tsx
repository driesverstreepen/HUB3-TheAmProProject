"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { safeSelect } from '@/lib/supabaseHelpers';
import type { Program } from '@/types/database';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Props {
  program: Program;
  onClose: () => void;
  onEnroll: (profileId: string, consents: { media: boolean; policy: boolean }) => void;
}

export default function NewProgramDetailsModal({ program, onClose, onEnroll }: Props) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [consents, setConsents] = useState({ media: false, policy: true });

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const user = await supabase.auth.getUser();
      const uid = user.data.user?.id;
      if (!uid) return;

      const [mainProfileRes, subsRes] = await Promise.all([
        safeSelect(supabase, 'user_profiles', '*', { user_id: uid }),
        safeSelect(supabase, 'sub_profiles', '*', { parent_user_id: uid })
      ])

  const mainProfile = mainProfileRes.data
  const dependents = subsRes.data

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

  const handleEnroll = () => {
    if (!selectedProfileId) {
      alert('Selecteer een profiel om verder te gaan');
      return;
    }
    onEnroll(selectedProfileId, consents);
  };

  return (
    <div className="fixed inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/90 dark:bg-slate-950/80 backdrop-blur-md rounded-2xl shadow-2xl max-w-lg w-full p-6 text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="t-h3 font-semibold">{(program as any).title || (program as any).name || 'Programma'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>

        <div className="space-y-4">
          {(program as any).description && <p className="t-bodySm text-slate-700">{(program as any).description}</p>}

          <div>
            <label className="t-label block font-medium text-slate-700 mb-2">Kies profiel</label>
            {loadingProfiles ? (
              <div className="t-bodySm text-slate-600 flex items-center gap-2">
                <LoadingSpinner size={16} label="Profielen laden" indicatorClassName="border-b-slate-600" />
                <span>Profielen laden…</span>
              </div>
            ) : profiles.length === 0 ? (
              <div className="t-bodySm text-slate-600">Geen profielen gevonden. Vul je profiel in of maak een dependent aan.</div>
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

          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={consents.media} onChange={(e) => setConsents(s => ({ ...s, media: e.target.checked }))} />
              <span className="t-bodySm text-slate-700">Ik geef toestemming voor foto/video gebruik</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={consents.policy} onChange={(e) => setConsents(s => ({ ...s, policy: e.target.checked }))} />
              <span className="t-bodySm text-slate-700">Ik accepteer het beleid en de voorwaarden</span>
            </label>
          </div>

          <div className="flex gap-3">
            {/* Removed bottom close button; use X or backdrop to close */}
            <button onClick={handleEnroll} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg t-button font-medium">Enroll</button>
          </div>
        </div>
      </div>
    </div>
  );
}
