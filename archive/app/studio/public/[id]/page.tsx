/**
 * Publieke studio pagina (visitor-facing)
 * Route: /studio/public/[id]
 * Doel: dit is de canonical visitor-facing pagina voor een studio. Gebruik deze
 * route voor links vanuit `Explore` en andere publieke plekken. Deze component
 * draait op de client en rendert de programma-overzichten, inschrijfflow en
 * contactinformatie voor alle bezoekers.
 *
 * Belangrijk: verwissel deze route niet met admin-routes onder `/studio/[id]/*`.
 */

"use client";

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Building2, MapPin, Mail, Phone, Globe, Users, ArrowLeft, ShoppingCart, X, Heart, Check } from 'lucide-react';
import ProgramListItem from '@/components/ProgramListItem';
import Select from '@/components/Select';
import Link from 'next/link';
import ProgramCard from '@/components/ProgramCard';
import ContentContainer from '@/components/ContentContainer';
import SearchFilterBar from '@/components/SearchFilterBar';
import { useDevice } from '@/contexts/DeviceContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useNotification } from '@/contexts/NotificationContext'

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
  features: any;
  logo_url?: string | null;
}

interface GroupDetails {
  weekday: number;
  start_time: string;
  end_time: string;
  season_start?: string;
  season_end?: string;
}

interface WorkshopDetails {
  start_datetime: string;
  end_datetime: string;
}

interface Program {
  id: string;
  title: string;
  description: string | null;
  program_type: string;
  price: number | null;
  capacity: number | null;
  is_public: boolean;
  dance_style: string | null;
  level: string | null;
  min_age: number | null;
  max_age: number | null;
  group_details?: GroupDetails[];
  workshop_details?: WorkshopDetails[];
  // optional denormalized schedule fields (may be backfilled by migration)
  weekday?: number | null;
  start_time?: string | null;
  end_time?: string | null;
}

type StudioPolicyRow = {
  id: string;
  title: string;
  content: string;
  version?: number;
  cancellation_policy?: string | null;
  refund_policy?: string | null;
};

type PolicyItem = {
  id: string;
  title: string;
  content: string;
  version?: number;
};

// weekday names removed — helper functions were unused

// Helper functions for schedule formatting were removed because they are not used

export default function PublicStudioPage() {
  const params = useParams();
  const router = useRouter();
  const { isMobile } = useDevice();
  const { showSuccess, showError } = useNotification();
  const studioId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classPasses, setClassPasses] = useState<Array<{ id: string; name: string; description: string | null; credit_count: number; price_cents: number; currency: string }>>([]);
  // No modal selection: program cards should navigate to program detail page
  const [activeTab, setActiveTab] = useState<'programs' | 'workshops' | 'proeflessen'>('programs');
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [levels, setLevels] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [policies, setPolicies] = useState<StudioPolicyRow[]>([]);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyItem | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const policyItems: PolicyItem[] = useMemo(() => {
    const items: PolicyItem[] = [];
    for (const p of policies || []) {
      items.push({ id: p.id, title: p.title, content: p.content || '', version: p.version });
      if (p.cancellation_policy) {
        items.push({
          id: `${p.id}__cancellation_policy`,
          title: 'Cancellation policy',
          content: p.cancellation_policy,
          version: p.version,
        });
      }
      if (p.refund_policy) {
        items.push({
          id: `${p.id}__refund_policy`,
          title: 'Refund policy',
          content: p.refund_policy,
          version: p.version,
        });
      }
    }
    return items;
  }, [policies]);

  const isTrial = (p: any) => {
    const t = String((p as any).program_type || '').toLowerCase();
    if (t.includes('trial')) return true;
    if (p.title && String(p.title).toLowerCase().includes('proef')) return true;
    if ((p as any).is_trial) return true;
    if (p.price === 0) return true;
    return false;
  };

  const isPastSeasonEnd = (p: any) => {
    // Workshops don't have season_end; hide once the workshop date has passed.
    // Proeflessen/trials can also use workshop_details as schedule; hide once all dates have passed.
    try {
      const type = String((p as any)?.program_type || '').toLowerCase();
      if (type === 'workshop' || isTrial(p)) {
        const wdRaw = (p as any)?.workshop_details;
        const list = Array.isArray(wdRaw) ? wdRaw : (wdRaw ? [wdRaw] : []);
        if (list.length === 0) return false;

        let sawAnyDate = false;
        for (const wd of list) {
          const rawDate = (wd as any)?.date || (wd as any)?.start_datetime || (wd as any)?.startDateTime || null;
          if (!rawDate) continue;
          const str = String(rawDate);
          const datePart = str.length >= 10 ? str.slice(0, 10) : str;
          const m = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart.split('-') : null;
          if (!m) continue;
          const year = Number(m[0]);
          const month = Number(m[1]);
          const day = Number(m[2]);
          if (!year || !month || !day) continue;
          sawAnyDate = true;
          const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
          // If ANY scheduled date is still upcoming, the program isn't past.
          if (new Date() <= endOfDay) return false;
        }

        // If we had dates and all were in the past -> hide.
        return sawAnyDate;
      }
    } catch {
      // ignore and fall back to season_end logic
    }

    const raw =
      (p as any)?.season_end ||
      (Array.isArray((p as any)?.group_details) ? (p as any).group_details?.[0]?.season_end : (p as any)?.group_details?.season_end) ||
      null;
    if (!raw) return false;

    const str = String(raw);
    const datePart = str.length >= 10 ? str.slice(0, 10) : str;
    const m = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart.split('-') : null;
    if (!m) return false;
    const year = Number(m[0]);
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (!year || !month || !day) return false;

    // Inclusive end-of-day in local time (NL users). Hide only after that day has passed.
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
    return new Date() > endOfDay;
  };

  // Used to decide whether the linked proefles indicator should be shown on a program card.
  // If the linked proefles program is filtered out (expired), we hide the indicator too.
  const visibleTrialIdSet = (() => {
    const set = new Set<string>();
    for (const p of programs || []) {
      if (isTrial(p) && !isPastSeasonEnd(p) && (p as any)?.id) {
        set.add(String((p as any).id));
      }
    }
    return set;
  })();

  useEffect(() => {
    loadStudioData();
    loadCartData();
    loadFavoriteStatus();
    loadFollowStatus();
  }, [studioId]);

  const loadStudioData = async () => {
    try {
      // Load studio + programs via server API (service role) so public viewing
      // isn't blocked by restrictive RLS policies.
      const res = await fetch(`/api/hub/public-studios/${studioId}`);
      const json = await res.json();
      if (!res.ok) {
        console.error('Studio not found or not public:', json?.error || res.status);
        router.push('/hub/studios');
        return;
      }

      const studioData = json?.studio as Studio | null;
      const programsData = (json?.programs as any[]) || [];
      const policiesData = (json?.policies as StudioPolicyRow[]) || [];

      if (!studioData) {
        router.push('/hub/studios');
        return;
      }

      setStudio(studioData);
      setPolicies(Array.isArray(policiesData) ? policiesData : []);

      // Load active class pass products (public policy allows this)
      try {
        const { data: cp } = await supabase
          .from('class_pass_products')
          .select('id, name, description, credit_count, price_cents, currency')
          .eq('studio_id', studioId)
          .eq('active', true)
          .order('price_cents');
        setClassPasses(cp || []);
      } catch (e) {
        // ignore if table not present or policy blocks
        setClassPasses([]);
      }

      // Attach linked locations (if any) to the program objects so ProgramCard can render them
      (programsData || []).forEach((p: any) => {
        p.locations = (p.program_locations || []).map((pl: any) => pl.locations).filter(Boolean);
      });

        // Determine whether current viewer is a teacher or studio_admin for this studio
      let isTeacherOrAdmin = false;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('studio_id', studioId)
            .maybeSingle();

          if (roleData && (roleData.role === 'teacher' || roleData.role === 'studio_admin')) {
            isTeacherOrAdmin = true;
          }
        }
      } catch {
        // ignore
      }
      // Attach isTeacherOrAdmin flag to state so the renderer can check the toggle
      // (we store the boolean separately to keep program objects untouched)
      (programsData || []).forEach((p: any) => {
        p._viewerIsTeacherOrAdmin = isTeacherOrAdmin;
        p._studioLogo = (studioData && (studioData as any).logo_url) || null;
      });
      setPrograms(programsData || []);

      // populate filter lists (unique levels and dance styles)
      try {
        const lvlSet = new Set<string>();
        const styleSet = new Set<string>();
        (programsData || []).forEach((p: any) => {
          if (p.level) lvlSet.add(String(p.level));
          if (p.dance_style) styleSet.add(String(p.dance_style));
        });
        setLevels(Array.from(lvlSet).sort());
        setStyles(Array.from(styleSet).sort());
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error('Failed to load studio data:', err);
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

  const loadFavoriteStatus = async () => {
    try {
      const res = await fetch(`/api/favorites/studios/${studioId}`, {
        method: 'GET',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) return;
      setIsFavorited(!!json?.favorited);
    } catch {
      // ignore
    }
  };

  const loadFollowStatus = async () => {
    try {
      const res = await fetch(`/api/follows/studios/${studioId}`, {
        method: 'GET',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) return;
      setIsFollowing(!!json?.followed);
    } catch {
      // ignore
    }
  };

  const toggleFavorite = async () => {
    if (favoriteBusy) return;

    try {
      setFavoriteBusy(true);

      if (isFavorited) {
        const res = await fetch(`/api/favorites/studios/${studioId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          if (res.status === 401) return;
          throw new Error(json?.error || 'Kon favoriet niet verwijderen');
        }
        setIsFavorited(false);
        showSuccess('Verwijderd uit favorieten');
      } else {
        const res = await fetch('/api/favorites/studios', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studio_id: studioId }),
        });
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          if (res.status === 401) return;
          throw new Error(json?.error || 'Kon favoriet niet toevoegen');
        }
        setIsFavorited(true);
        showSuccess('Toegevoegd aan favorieten');
      }
    } catch (e: any) {
      showError(e?.message || 'Fout')
    } finally {
      setFavoriteBusy(false);
    }
  };

  const toggleFollow = async () => {
    if (followBusy) return;

    try {
      setFollowBusy(true);

      if (isFollowing) {
        const res = await fetch(`/api/follows/studios/${studioId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          if (res.status === 401) return;
          throw new Error(json?.error || 'Kon volgen niet uitschakelen');
        }
        setIsFollowing(false);
        showSuccess('Niet meer aan het volgen');
      } else {
        const res = await fetch(`/api/follows/studios/${studioId}`, {
          method: 'POST',
          credentials: 'include',
        });
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          if (res.status === 401) return;
          throw new Error(json?.error || 'Kon volgen niet inschakelen');
        }
        setIsFollowing(true);
        showSuccess('Je volgt deze studio');
      }
    } catch (e: any) {
      showError(e?.message || 'Fout');
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" />
          <p className="text-slate-600">Studio laden…</p>
        </div>
      </div>
    );
  }

  if (!studio) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Studio niet gevonden</h1>
          <p className="text-slate-600 mb-6">Deze studio bestaat niet of is niet publiek beschikbaar.</p>
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
      {/* Header */}
      <div className="bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 w-full overflow-x-hidden -mt-[env(safe-area-inset-top)] pt-[env(safe-area-inset-top)] md:mt-0 md:pt-0">
        <ContentContainer className="py-8 pl-[max(1rem,env(safe-area-inset-left))]! pr-[max(1rem,env(safe-area-inset-right))]! sm:px-6! lg:px-8!">
          <div className="flex flex-col items-start gap-4">
            <button
              onClick={() => router.push('/hub/studios')}
              className="inline-flex items-center gap-2 text-slate-200 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Terug naar HUB3</span>
            </button>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6 w-full">
              {/* Identity row (logo + name + meta) */}
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center overflow-hidden shrink-0">
                  {studio?.logo_url ? (
                    <img src={studio.logo_url} alt={`${studio.naam} logo`} className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="w-8 h-8 text-blue-600" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <h1 className="text-3xl font-bold text-white! leading-tight truncate">{studio?.naam}</h1>

                  {/* Mobile: show only region + email under the name */}
                  <div className="md:hidden mt-1 flex flex-col gap-1 w-full">
                    <div className="flex items-center gap-2 text-slate-200">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="break-words leading-snug">{studio?.stad || ''}</span>
                    </div>

                    {studio?.contact_email && (
                      <a
                        href={`mailto:${studio.contact_email}`}
                        className="inline-flex items-start gap-2 text-slate-200 hover:text-white transition-colors"
                        title={studio.contact_email}
                      >
                        <Mail className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                        <span className="break-all leading-snug">{studio.contact_email}</span>
                      </a>
                    )}
                  </div>

                  {/* Desktop/tablet: keep city line */}
                  {studio?.stad && (
                    <div className="hidden md:flex items-center gap-2 text-slate-200 mt-1">
                      <MapPin className="w-4 h-4" />
                      <span>{studio.stad}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: actions (mobile: below identity to avoid truncating city/email) */}
              <div className="shrink-0 self-end flex flex-col items-end gap-2 md:self-auto md:flex-row md:items-center md:gap-2 mt-2 md:mt-0">
                <Link
                  href="/cart"
                  className="order-1 md:order-2 relative p-2 text-slate-200 hover:text-white transition-colors"
                  title="Winkelmandje bekijken"
                >
                  <ShoppingCart className="w-6 h-6" />
                  {cartItemCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                      {cartItemCount > 99 ? '99+' : cartItemCount}
                    </span>
                  )}
                </Link>

                <div className="order-2 md:order-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleFavorite}
                    disabled={favoriteBusy}
                    className="relative inline-flex items-center gap-2 p-2 md:px-3 md:py-2 rounded-lg bg-white/10 text-slate-200 hover:text-white hover:bg-white/15 transition-colors disabled:opacity-60"
                    title={isFavorited ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
                    aria-label={isFavorited ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
                  >
                    <Heart className="w-5 h-5" fill={isFavorited ? 'currentColor' : 'none'} />
                    <span className="hidden md:inline text-sm font-medium">Favoriet</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleFollow}
                    disabled={followBusy}
                    className="relative inline-flex items-center gap-2 p-2 md:px-3 md:py-2 rounded-lg bg-white/10 text-slate-200 hover:text-white hover:bg-white/15 transition-colors disabled:opacity-60"
                    title={isFollowing ? 'Ontvolgen' : 'Volgen'}
                    aria-label={isFollowing ? 'Ontvolgen' : 'Volgen'}
                  >
                    <span className="relative inline-flex">
                      <Users className="w-5 h-5" />
                      {isFollowing ? (
                        <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </span>
                      ) : null}
                    </span>
                    <span className="hidden md:inline text-sm font-medium">{isFollowing ? 'Volgend' : 'Volgen'}</span>
                  </button>
                </div>
              </div>
            </div>

              {/* Contact info inside hero (mobile) */}
              <div className="md:hidden mt-2 w-full">
                <div className="flex flex-col gap-2 text-sm text-slate-200">
                  {studio.phone_number && (
                    <a
                      href={`tel:${studio.phone_number}`}
                      className="inline-flex items-center gap-2 text-slate-200 hover:text-white"
                    >
                      <Phone className="w-4 h-4 text-slate-300" />
                      <span>{studio.phone_number}</span>
                    </a>
                  )}
                  {studio.website && (
                    <a
                      href={studio.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-slate-200 hover:text-white"
                    >
                      <Globe className="w-4 h-4 text-slate-300" />
                      <span>Website</span>
                    </a>
                  )}
                </div>
              </div>
          </div>
        </ContentContainer>
      </div>

      <ContentContainer className="py-8 pl-[max(1rem,env(safe-area-inset-left))]! pr-[max(1rem,env(safe-area-inset-right))]! sm:px-6! lg:px-8!">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* About is displayed in the sidebar for public profile pages */}

            {/* Class Pass products */}
            {classPasses && classPasses.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Class Passes</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {classPasses.map(p => (
                    <div key={p.id} className="border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">
                          {p.name} <span className="text-slate-500 font-normal">· {p.credit_count} credits</span>
                        </div>
                        {/* Mobile: price under the title on the left */}
                        <div className="sm:hidden mt-1 font-semibold text-slate-900">
                          {(p.price_cents / 100).toFixed(2)} {p.currency?.toUpperCase()}
                        </div>
                        {p.description && <div className="text-sm text-slate-600 mt-1">{p.description}</div>}
                      </div>

                      <div className="shrink-0 text-right">
                        {/* Desktop/tablet: keep price on the right */}
                        <div className="hidden sm:block font-semibold text-slate-900 mb-2">
                          {(p.price_cents / 100).toFixed(2)} {p.currency?.toUpperCase()}
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/studio/${studioId}/class-pass/create-checkout`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ product_id: p.id }),
                              })
                              const json = await res.json()
                              if (!res.ok) throw new Error(json.error || 'Kon checkout niet starten')
                              if (json.url) window.location.href = json.url
                            } catch (e: any) {
                              alert(e.message || 'Kon checkout niet starten')
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                        >Koop</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Programs */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Beschikbare programma's</h2>

              {/* Tabs */}
              <div className="flex gap-2 mb-6 border-b border-slate-200">
                <button
                  onClick={() => setActiveTab('programs')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'programs'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Cursussen
                </button>
                <button
                  onClick={() => setActiveTab('workshops')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'workshops'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Workshops
                </button>
                <button
                  onClick={() => setActiveTab('proeflessen')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'proeflessen'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Proeflessen
                </button>
              </div>

              <SearchFilterBar
                value={searchTerm}
                onChange={(v) => setSearchTerm(v)}
                placeholder="Zoek programma's..."
                viewMode={view}
                setViewMode={setView}
                collapsibleMobile
                mobileTitle="Extra filters"
                rightControls={(
                  <>
                    <Select
                      value={selectedLevel || ''}
                      onChange={(e) => setSelectedLevel((e.target as HTMLSelectElement).value || null)}
                      variant="md"
                      className="w-full sm:w-44"
                    >
                      <option value="">Alle niveaus</option>
                      {levels.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </Select>

                    <Select
                      value={selectedStyle || ''}
                      onChange={(e) => setSelectedStyle((e.target as HTMLSelectElement).value || null)}
                      variant="md"
                      className="w-full sm:w-44"
                    >
                      <option value="">Alle stijlen</option>
                      {styles.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Select>
                  </>
                )}
              />

              {/* Program List (use ProgramCard component and modal for enroll/details) */}
              {view === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 sm:gap-6">
                  {programs
                    .filter(p => {
                      if (activeTab === 'programs') return p.program_type === 'group' && !isTrial(p);
                      if (activeTab === 'workshops') return p.program_type === 'workshop';
                      if (activeTab === 'proeflessen') return isTrial(p);
                      return false;
                    })
                    .filter(p => !isPastSeasonEnd(p))
                    .filter(p => !searchTerm || p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.description?.toLowerCase().includes(searchTerm.toLowerCase()))
                    .filter(p => !selectedLevel || (p.level && String(p.level) === selectedLevel))
                    .filter(p => !selectedStyle || (p.dance_style && String(p.dance_style) === selectedStyle))
                    .map((program) => {
                      const linkedId = (program as any)?.linked_trial_program_id;
                      const hasVisibleLinkedTrial = !!linkedId && visibleTrialIdSet.has(String(linkedId));
                      return (
                        <ProgramCard
                          key={program.id}
                          program={{ ...(program as any), __has_visible_linked_trial: hasVisibleLinkedTrial } as any}
                          showCapacity={true}
                          showLocation={!isMobile}
                          onOpen={() => router.push(`/program/${program.id}`)}
                        />
                      );
                    })}
                </div>
              ) : (
                <div className="space-y-3">
                  {programs
                    .filter(p => {
                      if (activeTab === 'programs') return p.program_type === 'group' && !isTrial(p);
                      if (activeTab === 'workshops') return p.program_type === 'workshop';
                      if (activeTab === 'proeflessen') return isTrial(p);
                      return false;
                    })
                    .filter(p => !isPastSeasonEnd(p))
                    .filter(p => !searchTerm || p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.description?.toLowerCase().includes(searchTerm.toLowerCase()))
                    .filter(p => !selectedLevel || (p.level && String(p.level) === selectedLevel))
                    .filter(p => !selectedStyle || (p.dance_style && String(p.dance_style) === selectedStyle))
                    .map(program => (
                      <ProgramListItem key={program.id} program={program as any} showLocation={!isMobile} onOpen={() => router.push(`/program/${program.id}`)} />
                    ))}
                </div>
              )}

              {programs
                .filter(p => {
                  if (activeTab === 'programs') return p.program_type === 'group' && !isTrial(p);
                  if (activeTab === 'workshops') return p.program_type === 'workshop';
                  if (activeTab === 'proeflessen') return isTrial(p);
                  return false;
                })
                .filter(p => !isPastSeasonEnd(p))
                .filter(p => !searchTerm || p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.description?.toLowerCase().includes(searchTerm.toLowerCase()))
                .filter(p => !selectedLevel || (p.level && String(p.level) === selectedLevel))
                .filter(p => !selectedStyle || (p.dance_style && String(p.dance_style) === selectedStyle))
                .length === 0 && (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">Geen {activeTab === 'programs' ? 'cursussen' : activeTab === 'workshops' ? 'workshops' : 'proeflessen'} beschikbaar</p>
                </div>
              )}

              {/* Program details now open via program detail page */}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* About (moved to sidebar per request) */}
            {studio.beschrijving && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-4">Over deze studio</h3>
                <p className="text-slate-500 leading-relaxed">{studio.beschrijving}</p>
              </div>
            )}
            {/* Contact Info (desktop/tablet) */}
            <div className="hidden md:block bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="font-semibold text-slate-900 mb-4">Contact informatie</h3>
              <div className="space-y-3">
                {studio.contact_email && (
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-slate-400" />
                    <a href={`mailto:${studio.contact_email}`} className="text-blue-600 hover:text-blue-700 transition-colors">
                      {studio.contact_email}
                    </a>
                  </div>
                )}
                {studio.phone_number && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-slate-400" />
                    <a href={`tel:${studio.phone_number}`} className="text-blue-600 hover:text-blue-700 transition-colors">
                      {studio.phone_number}
                    </a>
                  </div>
                )}
                {studio.website && (
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-slate-400" />
                    <a href={studio.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 transition-colors">
                      Website bekijken
                    </a>
                  </div>
                )}
                {(studio.adres || studio.stad || studio.postcode) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div className="text-slate-500">
                      {studio.adres && <div>{studio.adres}</div>}
                      {(studio.postcode || studio.stad) && (
                        <div>{[studio.postcode, studio.stad].filter(Boolean).join(' ')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats (hide on mobile) */}
            <div className="hidden md:block bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="font-semibold text-slate-900 mb-4">Studio statistieken</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Programma's</span>
                  <span className="font-semibold text-slate-700">{programs.length}</span>
                </div>
              </div>
            </div>

                {/* Studio Policies (under statistics) */}
                {policyItems && policyItems.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                    <h3 className="font-semibold text-slate-900 mb-4">Studio policies</h3>
                    <div className="flex flex-col gap-2">
                      {policyItems.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedPolicy(p);
                            setShowPolicyModal(true);
                          }}
                          className="text-sm text-blue-600 hover:underline text-left"
                        >
                          {p.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
          </div>
        </div>
      </ContentContainer>
      {showPolicyModal && selectedPolicy && (
        <div onClick={() => setShowPolicyModal(false)} className="fixed inset-0 bg-slate-900/30 flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 max-w-3xl w-full p-4 sm:p-6 rounded-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedPolicy.title}</h3>
              <button onClick={() => setShowPolicyModal(false)} aria-label="Close" className="text-slate-600 dark:text-slate-300 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="policy-preview-wrapper mb-4">
              <div className="prose prose-slate lg:prose-lg max-w-none text-slate-700 dark:text-slate-200 policy-preview" dangerouslySetInnerHTML={{ __html: selectedPolicy.content || '' }} />
              <style>{`\
                .policy-preview h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 0.75rem; font-weight: 700; }\n\
                .policy-preview h2 { font-size: 1.375rem; line-height: 1.2; margin: 0.75rem 0 0.5rem; font-weight: 600; }\n\
                .policy-preview p { margin: 0 0 0.75rem; line-height: 1.8; }\n\
                .policy-preview ul { margin: 0.5rem 0 1rem; padding-left: 1.4rem; }\n\
              `}</style>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
