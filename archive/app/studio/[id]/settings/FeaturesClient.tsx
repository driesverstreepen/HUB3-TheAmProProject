"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Checkbox from '@/components/Checkbox';
import { useNotification } from '@/contexts/NotificationContext'
import { LoadingState } from '@/components/ui/LoadingState'

interface Props { studioId: string }

export default function FeaturesClient({ studioId }: Props) {
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [attendanceEnabled, setAttendanceEnabled] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { showSuccess, showError } = useNotification()

  useEffect(() => {
    load();
  }, [studioId]);

  const load = async () => {
    if (!studioId) return setLoading(false);
    setLoading(true);
  // clear transient toast handled via NotificationContext
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setFeatures({})
        setAttendanceEnabled(false)
        showError('Je bent niet ingelogd')
        setLoading(false)
        return
      }

      const res = await fetch(`/api/studio/${studioId}/features`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) {
        console.error('Error loading studio features via API', json?.error)
        setFeatures({})
        setAttendanceEnabled(false)
      } else {
        setFeatures(json?.features || {})
        setAttendanceEnabled(!!json?.attendance_enabled)
        // capacity_visibility is stored per-program; do not expose as a global studio feature here
      }
    } catch (err) {
      console.error('Error loading studio features via API', err)
      setFeatures({})
      setAttendanceEnabled(false)
    }
    setLoading(false);
    setHasChanges(false);
  };

  const toggle = (key: string) => {
    const newFeatures = { ...(features || {}) };
    newFeatures[key] = !newFeatures[key];
    setFeatures(newFeatures);
  setHasChanges(true);
  };

  const toggleAttendance = () => {
    setAttendanceEnabled(!attendanceEnabled);
  setHasChanges(true);
  };

  const handleSave = async () => {
  setSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        showError('Je bent niet ingelogd')
        setSaving(false)
        return
      }

      const res = await fetch(`/api/studio/${studioId}/features`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          features,
          attendance_enabled: attendanceEnabled,
        }),
      })
      const json = await res.json()

      if (!res.ok) {
        console.error('Error saving features via API', json?.error)
        showError('Kon instellingen niet opslaan: ' + (json?.error || 'Onbekende fout'))
        setSaving(false)
        return
      }

      // Ensure local state reflects what was persisted
      setFeatures(json?.features || {})
      setAttendanceEnabled(!!json?.attendance_enabled)
      showSuccess('Instellingen succesvol opgeslagen')
      setHasChanges(false)

      // Force a full page refresh so sidebar and all views re-evaluate feature flags
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }, 250)
    } catch (err: any) {
      console.error('Error saving features via API', err)
      showError('Kon instellingen niet opslaan: ' + (err?.message || 'Onbekende fout'))
    }
    
    setSaving(false);
  };

  if (loading) return <LoadingState className="py-8" label="Laden…" />;

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-xl font-semibold text-slate-900 mb-2">Features</h3>
        <p className="text-sm text-slate-600 mb-4">Schakel optionele functionaliteit in of uit voor deze studio.</p>

        {/* transient operation result toasts are shown via NotificationContext */}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Formulieren</div>
              <div className="text-sm text-slate-600">Sta studio-specifieke formulieren toe (inschrijvingsformulieren).</div>
            </div>
            <div>
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={!!features['forms']}
                  onChange={() => toggle('forms')}
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Notities</div>
              <div className="text-sm text-slate-600">Sta studio-notities toe zodat beheerders notities aan docenten kunnen toewijzen.</div>
            </div>
            <div>
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={!!features['notes']}
                  onChange={() => toggle('notes')}
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">E-mails</div>
              <div className="text-sm text-slate-600">Schakel studio-gebonden e-mails en communicatie in.</div>
            </div>
            <div>
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={!!features['emails']}
                  onChange={() => toggle('emails')}
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Financiën</div>
              <div className="text-sm text-slate-600">Toon financiële overzichtspagina en transacties voor deze studio.</div>
            </div>
            <div>
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={!!features['finances']}
                  onChange={() => toggle('finances')}
                />
              </label>
            </div>
          </div>

          {/* Capacity visibility is configured per-program (show_capacity_to_users). Removed global toggle. */}

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Aanwezigheden</div>
              <div className="text-sm text-slate-600">Laat docenten aanwezigheid per les registreren.</div>
            </div>
            <div>
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={attendanceEnabled}
                  onChange={(e) => toggleAttendance()}
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Evaluaties</div>
              <div className="text-sm text-slate-600">Sta docenten toe om evaluaties/feedback aan leden toe te voegen.</div>
            </div>
            <div>
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={!!features['evaluations']}
                  onChange={() => toggle('evaluations')}
                />
              </label>
            </div>
          </div>

        </div>

        <div className="flex items-center gap-3 mt-6 pt-6">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{saving ? 'Opslaan...' : 'Opslaan'}</span>
          </button>
          {hasChanges && !saving && (
            <span className="text-sm text-amber-600">Er zijn niet-opgeslagen wijzigingen</span>
          )}
        </div>
      </div>
    </div>
  );
}
