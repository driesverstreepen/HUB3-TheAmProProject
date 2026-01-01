"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MapPin, Plus, Edit, Trash2, X, Check } from 'lucide-react';
import ActionIcon from '@/components/ActionIcon';
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm';
import type { Location } from '@/types/database';
import { useNotification } from '@/contexts/NotificationContext';
import { LoadingState } from '@/components/ui/LoadingState'

interface LocationsManagementProps {
  studioId: string;
}

export default function LocationsManagement({ studioId }: LocationsManagementProps) {
  const { showError } = useNotification();
  const { isArmed: isDeleteArmed, confirmOrArm: confirmOrArmDelete } = useTwoStepConfirm<string>(4500);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    adres: '',
  });

  useEffect(() => {
    loadLocations();
  }, [studioId]);

  const loadLocations = async () => {
    // Defensive: if studioId is not provided yet, don't call the API (prevents 'undefined' uuid errors)
    if (!studioId) {
      console.warn('loadLocations skipped: studioId is not defined yet');
      setLocations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('studio_id', studioId)
      .order('name');

    if (error) {
      // Log more details to help diagnose RLS / auth / network issues
      console.error('Error loading locations:', error, { studioId });
      showError('Failed to load locations: ' + (error?.message || JSON.stringify(error)));
    } else {
      setLocations(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Defensive: don't attempt to insert/update when studioId is empty or invalid
    if (!studioId) {
      console.error('Cannot save location: missing studioId', { studioId });
      showError('Kan locatie niet opslaan: studioId ontbreekt. Open de pagina via de studio-route en probeer opnieuw.');
      return;
    }

    if (!formData.name.trim()) {
      showError('Location name is required');
      return;
    }

    // Defensive: ensure we have a valid studioId (avoid empty string causing UUID parse errors)
    if (!studioId) {
      console.error('Cannot save location: missing studioId', { studioId });
      showError('Failed to save location: missing studio identifier (studioId)');
      return;
    }

    const payload = {
      studio_id: studioId,
      name: formData.name.trim(),
      adres: formData.adres.trim() || null,
      updated_at: new Date().toISOString(),
    };

    console.debug('Saving location payload:', payload);

    // Optional debug: verify membership for this studio (uses current membership model)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (user?.id && studioId) {
        const { data: membership, error: membershipError } = await supabase
          .from('studio_members')
          .select('role')
          .eq('user_id', user.id)
          .eq('studio_id', studioId)
          .maybeSingle();
        if (membershipError) console.warn('Membership lookup failed:', membershipError);
        console.log('Studio membership for location save:', membership);
      }
    } catch {
      // ignore
    }

    try {
      if (editingLocation) {
        const { error } = await supabase
          .from('locations')
          .update(payload)
          .eq('id', editingLocation.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('locations')
          .insert(payload);

        if (error) throw error;
      }

      setShowModal(false);
      setEditingLocation(null);
      resetForm();
      loadLocations();
    } catch (error: any) {
      console.error('Error saving location:', error);
      showError('Failed to save location: ' + (error?.message || JSON.stringify(error)));
    }
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      adres: (location as any).adres || location.city || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting location:', error);
      showError('Failed to delete location: ' + (error?.message || JSON.stringify(error)));
    } else {
      loadLocations();
    }
  };

  const resetForm = () => {
    setFormData({ name: '', adres: '' });
  };

  const startCreate = () => {
    setEditingLocation(null);
    resetForm();
    setShowModal(true);
  };

  if (loading) {
    return <LoadingState label="Locaties laden…" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Locaties</h2>
          <p className="text-slate-600 mt-1">Beheer de locaties waar je lessen doorgaan</p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Nieuw
        </button>
      </div>

      {locations.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <MapPin size={48} className="mx-auto text-slate-400 mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Geen locaties</h3>
          <p className="text-slate-600 mb-6">Voeg je eerste locatie toe</p>
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Nieuwe Locatie
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="divide-y divide-slate-200">
            {locations.map((location) => (
              <div key={location.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MapPin className="text-blue-600" size={20} />
                  <div>
                    <h3 className="font-medium text-slate-900">{location.name}</h3>
                    {(location as any).adres || location.city ? (
                      <p className="text-sm text-slate-600">{[(location as any).adres, location.city].filter(Boolean).join(', ')}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ActionIcon title="Bewerk locatie" onClick={() => handleEdit(location)}>
                    <Edit size={18} />
                  </ActionIcon>
                  <ActionIcon
                    variant="danger"
                    title={isDeleteArmed(location.id) ? 'Klik opnieuw om te verwijderen' : 'Verwijder locatie'}
                    className={isDeleteArmed(location.id) ? 'ring-2 ring-red-200' : ''}
                    onClick={() => confirmOrArmDelete(location.id, () => handleDelete(location.id))}
                  >
                    {isDeleteArmed(location.id) ? (
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
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div onClick={() => setShowModal(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full">
            <form onSubmit={handleSubmit}>
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <h2 className="text-xl font-bold text-slate-900">
                  {editingLocation ? 'Locatie Bewerken' : 'Nieuwe Locatie'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                  className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Locatie Naam *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="bijv. Studio Center"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Volledig adres
                  </label>
                  <input
                    type="text"
                    value={formData.adres}
                    onChange={(e) => setFormData({ ...formData, adres: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Straat 12, 1000 Brussel"
                  />
                </div>

                {/* postcode removed — full postcode should be included in the 'adres' field */}
              </div>

              <div className="p-6 border-t border-slate-200">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingLocation ? 'Opslaan' : 'Aanmaken'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
