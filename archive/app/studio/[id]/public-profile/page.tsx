'use client';

/**
 * Admin edit page: Publiek profiel beheren
 * Route: /studio/[id]/public-profile
 * Doel: client-side formulier voor studio-admins om het publieke profiel te bewerken
 * en een preview te tonen. Deze pagina wordt gerenderd binnen de admin layout
 * (sidebar/navigation). Links vanuit publieke plekken moeten niet naar deze
 * pagina verwijzen.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Building2, MapPin, Mail, Phone, Eye, Globe, Lock, Upload, ExternalLink, CheckCircle, Calendar, AlertCircle } from 'lucide-react';
import ImageCropper from '@/components/ImageCropper';
import { FeatureGate } from '@/components/FeatureGate';
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears';

interface Studio {
  id: string;
  naam: string;
  beschrijving: string | null;
  adres: string | null;
  stad: string | null;
  postcode: string | null;
  contact_email: string | null;
  phone_number: string | null;
  website: string | null;
  is_public: boolean;
  logo_url?: string | null;
}

interface Program {
  id: string;
  naam: string;
  beschrijving: string | null;
  type: string;
  prijs: number | null;
  max_deelnemers: number | null;
}

export default function StudioPublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const studioId = params.id as string;
  const { selectedYearId: activeYearId, missingTable: schoolYearsMissing } = useStudioSchoolYears(studioId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [studio, setStudio] = useState<Studio | null>(null);
  const [publicPrograms, setPublicPrograms] = useState<Program[]>([]);

  // Logo upload state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [showLogoCropper, setShowLogoCropper] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    loadStudioData();
  }, [studioId]);

  useEffect(() => {
    if (showPreview) {
      if (!schoolYearsMissing && !activeYearId) return;
      loadPublicPrograms();
    }
  }, [showPreview, activeYearId, schoolYearsMissing]);

  const loadStudioData = async () => {
    try {
      const { data, error } = await supabase
        .from('studios')
        .select('*')
        .eq('id', studioId)
        .single();

      if (error) throw error;
      setStudio(data);
      setLogoPreview(data.logo_url || null);
    } catch (err: any) {
      console.error('Error loading studio:', err);
      setMessage({ type: 'error', text: 'Kon studio niet laden' });
    } finally {
      setLoading(false);
    }
  };

  const loadPublicPrograms = async () => {
    try {
      if (!schoolYearsMissing && !activeYearId) return;
      let q = supabase
        .from('programs')
        .select('*')
        .eq('studio_id', studioId)
        .eq('is_public', true);
      if (activeYearId) q = q.eq('school_year_id', activeYearId);

      const { data, error } = await q.limit(6);

      if (error) throw error;
      setPublicPrograms(data || []);
    } catch (err) {
      console.error('Error loading programs:', err);
    }
  };

  const handleSave = async () => {
    if (!studio) return;

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('studios')
        .update({
          naam: studio.naam,
          beschrijving: studio.beschrijving,
          adres: studio.adres,
          stad: studio.stad,
          postcode: studio.postcode,
          contact_email: studio.contact_email,
          phone_number: studio.phone_number,
          website: studio.website,
          is_public: studio.is_public,
        })
        .eq('id', studioId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Wijzigingen opgeslagen!' });
    } catch (err: any) {
      console.error('Error saving:', err);
      setMessage({ type: 'error', text: 'Opslaan mislukt: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFileSelect = (file: File) => {
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoPreview(e.target?.result as string);
      setShowLogoCropper(true);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoCrop = (croppedBlob: Blob) => {
    // Convert Blob to File
    const croppedFile = new File([croppedBlob], 'logo.jpg', { type: 'image/jpeg' });
    setLogoFile(croppedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoPreview(e.target?.result as string);
    };
    reader.readAsDataURL(croppedFile);
    setShowLogoCropper(false);
  };

  const handleLogoUpload = async () => {
    if (!logoFile || !studio) return;

    setUploadingLogo(true);
    try {
      // First, delete the old logo if it exists
      if (studio.logo_url) {
        try {
          // Extract the file path from the URL
          // URL format: https://[project].supabase.co/storage/v1/object/public/studio_logos/[studio-id]/[filename]
          const urlParts = studio.logo_url.split('/storage/v1/object/public/studio_logos/');
          if (urlParts.length === 2) {
            const filePath = urlParts[1];
            console.info('Deleting old studio logo:', filePath);

            const { error: deleteError } = await supabase.storage
              .from('studio_logos')
              .remove([filePath]);

            if (deleteError) {
              console.warn('Failed to delete old studio logo:', deleteError);
              // Don't throw here - continue with upload even if delete fails
            } else {
              console.info('Old studio logo deleted successfully');
            }
          }
        } catch (deleteErr) {
          console.warn('Error deleting old studio logo:', deleteErr);
          // Continue with upload
        }
      }

      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${studio.id}/logo-${Date.now()}.${fileExt}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from('studio_logos')
        .upload(filePath, logoFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('studio_logos')
        .getPublicUrl(filePath);

      const logoUrl = urlData.publicUrl;

      // Update studio with new logo URL
      const { error: updateError } = await supabase
        .from('studios')
        .update({ logo_url: logoUrl })
        .eq('id', studioId);

      if (updateError) throw updateError;

      // Update local state
      setStudio({ ...studio, logo_url: logoUrl });
      setLogoFile(null);

      setMessage({ type: 'success', text: 'Logo succesvol geüpload!' });
    } catch (err: any) {
      console.error('Logo upload error:', err);
      setMessage({ type: 'error', text: 'Logo upload mislukt: ' + err.message });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    // Best-effort: remove logo from storage and persist null to DB
    try {
      if (studio?.logo_url) {
        try {
          const urlParts = studio.logo_url.split('/storage/v1/object/public/studio_logos/');
          if (urlParts.length === 2) {
            const filePath = urlParts[1];
            const { error: deleteError } = await supabase.storage.from('studio_logos').remove([filePath]);
            if (deleteError) console.warn('Failed to delete studio logo from storage:', deleteError);
            else console.info('Studio logo deleted from storage');
          }
        } catch (e) {
          console.warn('Error deleting studio logo from storage:', e);
        }
      }

      // Persist null logo_url in DB (so public site no longer shows it)
      try {
        const { error: updateError } = await supabase
          .from('studios')
          .update({ logo_url: null })
          .eq('id', studioId);
        if (updateError) console.warn('Failed to clear logo_url on studio row:', updateError);
      } catch (e) {
        console.warn('Error updating studio row to clear logo_url:', e);
      }
    } finally {
      // Clear local UI state regardless of storage/db result
      setLogoPreview(null);
      setLogoFile(null);
      setStudio({ ...studio!, logo_url: null });
    }
  };

  let content: JSX.Element;

  if (loading) {
    content = (
      <div className="max-w-4xl">
        <div className="animate-pulse space-y-6">
          <div className="h-12 bg-slate-200 rounded w-64"></div>
          <div className="h-96 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  } else if (!studio) {
    content = (
      <div className="max-w-4xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800">Studio niet gevonden</p>
        </div>
      </div>
    );
  } else if (showPreview) {
    content = (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Studio Preview</h1>
            <p className="text-slate-600 mt-1">Zo zien gebruikers jouw studio in de Explore pagina</p>
          </div>
          <button
            onClick={() => setShowPreview(false)}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Terug naar Instellingen
          </button>
        </div>

        {/* Preview of Studio Card */}
        <div className="bg-white dark:bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 border-b border-slate-700 p-8">
            <div className="flex flex-col md:flex-row items-start gap-8">
              <div className="w-32 h-32 bg-linear-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shrink-0 shadow-2xl border-4 border-white">
                {studio.logo_url ? (
                  <img
                    src={studio.logo_url}
                    alt={`${studio.naam} logo`}
                    className="w-full h-full object-contain rounded-2xl"
                  />
                ) : (
                  <Building2 className="w-16 h-16 text-white" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-5xl font-bold text-white! mb-3 tracking-tight">{studio.naam}</h1>
                <div className="flex flex-wrap gap-3 items-center">
                  {studio.stad && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg text-slate-900 shadow-sm">
                      <MapPin size={16} />
                      <span className="font-medium">{studio.stad}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg text-slate-900 shadow-sm">
                    <CheckCircle size={16} />
                    <span className="font-semibold">Nu Inschrijven</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 mt-6">
                  {studio.contact_email && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg text-slate-900 shadow-sm">
                      <Mail size={18} />
                      <span>{studio.contact_email}</span>
                    </div>
                  )}
                  {studio.phone_number && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg text-slate-900 shadow-sm">
                      <Phone size={18} />
                      <span>{studio.phone_number}</span>
                    </div>
                  )}
                  {studio.website && (
                    <a
                      href={studio.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-all shadow-lg hover:shadow-xl font-semibold"
                    >
                      <ExternalLink size={18} />
                      <span>Bezoek Website</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Beschikbare Programma's</h2>
              <p className="text-slate-600">Programma's die publiek zichtbaar zijn</p>
            </div>

            {publicPrograms.length === 0 ? (
              <div className="bg-slate-50 rounded-xl p-12 text-center border border-slate-200">
                <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Geen Publieke Programma's</h3>
                <p className="text-slate-600">
                  Je hebt nog geen publieke programma's. Maak programma's aan en zet ze op publiek.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {publicPrograms.map((program) => (
                  <div
                    key={program.id}
                    className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
                  >
                    <div className="h-2 bg-linear-to-r from-blue-500 to-blue-600"></div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-slate-900 mb-2">{program.naam}</h3>
                      {program.beschrijving && (
                        <p className="text-slate-600 text-sm mb-4 line-clamp-3">{program.beschrijving}</p>
                      )}
                      <div className="text-center py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium">
                        Preview Only
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="max-w-4xl">
      {showLogoCropper && logoPreview && (
        <ImageCropper
          imageSrc={logoPreview}
          onCropComplete={handleLogoCrop}
          onCancel={() => {
            setShowLogoCropper(false);
            setLogoPreview(studio?.logo_url || null);
            setLogoFile(null);
          }}
          aspect={1}
          cropShape="rect"
        />
      )}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Publiek Profiel</h1>
        <p className="text-slate-600 mt-1">Beheer hoe jouw studio verschijnt voor gebruikers</p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="text-slate-700" size={24} />
            <h2 className="text-lg font-semibold text-slate-900">Studio Informatie</h2>
          </div>
          <div className="flex items-center gap-2">
            {studio.is_public ? (
              <span className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg font-medium">
                <Globe size={18} />
                Publiek
              </span>
            ) : (
              <span className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium">
                <Lock size={18} />
                Privé
              </span>
            )}
            <button
              onClick={() => router.push(`/studio/public/${studioId}`)}
              className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Eye size={18} />
              Preview
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Studio Naam *
            </label>
            <input
              type="text"
              value={studio.naam}
              onChange={(e) => studio && setStudio({ ...studio, naam: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
              placeholder="Jouw Studio Naam"
              required
            />
          </div>

          {/* Logo Upload Section */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Studio Logo
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6">
              <div className="text-center">
                {logoPreview ? (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-24 h-24 object-contain border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="flex justify-center gap-2">
                      {logoFile && (
                        <button
                          onClick={handleLogoUpload}
                          disabled={uploadingLogo}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {uploadingLogo ? 'Uploaden...' : 'Upload Logo'}
                        </button>
                      )}
                      <button
                        onClick={handleRemoveLogo}
                        className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100"
                      >
                        Verwijder
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-24 h-24 mx-auto bg-slate-100 border-2 border-slate-200 rounded-lg flex items-center justify-center">
                      <Upload className="text-slate-400" size={32} />
                    </div>
                    <div>
                      <label className="cursor-pointer">
                        <span className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                          Kies Logo
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleLogoFileSelect(file);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <p className="text-sm text-slate-500">
                      Upload een logo voor jouw studio (PNG, JPG, max 5MB)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Beschrijving
            </label>
            <textarea
              value={studio.beschrijving || ''}
              onChange={(e) => studio && setStudio({ ...studio, beschrijving: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
              placeholder="Vertel gebruikers over jouw studio..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Adres
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={studio.adres || ''}
                  onChange={(e) => studio && setStudio({ ...studio, adres: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                  placeholder="Straat en nummer"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Stad
              </label>
              <input
                type="text"
                value={studio.stad || ''}
                onChange={(e) => studio && setStudio({ ...studio, stad: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                placeholder="Stad"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Postcode
              </label>
              <input
                type="text"
                value={studio.postcode || ''}
                onChange={(e) => studio && setStudio({ ...studio, postcode: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                placeholder="1000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Telefoon
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="tel"
                  value={studio.phone_number || ''}
                  onChange={(e) => studio && setStudio({ ...studio, phone_number: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                  placeholder="+32 xxx xx xx xx"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  value={studio.contact_email || ''}
                  onChange={(e) => studio && setStudio({ ...studio, contact_email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                  placeholder="contact@studio.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Website
              </label>
              <div className="relative">
                <ExternalLink className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="url"
                  value={studio.website || ''}
                  onChange={(e) => studio && setStudio({ ...studio, website: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                  placeholder="https://www.studio.com"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="text-slate-700" size={20} />
                  <h3 className="font-semibold text-slate-900">Publieke Zichtbaarheid</h3>
                </div>
                <p className="text-sm text-slate-600 mb-3">
                  Wanneer ingeschakeld, verschijnt jouw studio op de Explore pagina waar gebruikers studios kunnen ontdekken.
                </p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={studio.is_public}
                    onChange={() => studio && setStudio({ ...studio, is_public: !studio.is_public })}
                    className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="font-medium text-slate-900">
                    Maak deze studio publiek zichtbaar
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={() => router.push(`/studio/${studioId}`)}
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Annuleren
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !studio.naam}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="font-medium">{saving ? 'Opslaan...' : 'Wijzigingen Opslaan'}</span>
            </button>
          </div>
        </div>
      </div>

      {studio && !studio.is_public && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-yellow-600 mt-0.5" size={20} />
            <div>
              <h4 className="font-semibold text-yellow-900 mb-1">Studio is Privé</h4>
              <p className="text-sm text-yellow-800">
                Jouw studio is momenteel privé en verschijnt niet op de Explore pagina. Schakel "Maak deze studio publiek zichtbaar" in om gevonden te worden door gebruikers.
              </p>
            </div>
          </div>
        </div>
      )}
      </div>
    );
  }

  return (
    <FeatureGate flagKey="studio.public-profile" mode="page">
      {content}
    </FeatureGate>
  );
}
