'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Building2, Calendar, Users, Settings, LogOut, LayoutDashboard, BookOpen, User, DollarSign, MessageSquare, UserMinus, Mail, CreditCard, Star, Menu, ChevronDown, ChevronUp } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import Modal from '@/components/Modal';
import Select from '@/components/Select'
import { useTheme } from '@/contexts/ThemeContext';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useDevice } from '@/contexts/DeviceContext'
import { supabase } from '@/lib/supabase';
import { safeSelect } from '@/lib/supabaseHelpers'
import { useStudioFeatures } from '@/hooks/useStudioFeatures';
import type { FeatureKey } from '@/types/subscription';
import { MobileSidebar, type MobileSidebarSection } from '@/components/ui/MobileSidebar'
import { useStudioRolePermissions } from '@/hooks/useStudioRolePermissions'
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears'

interface StudioSidebarProps {
  studioId?: string;
  studioName?: string;
  studioLogo?: string | null;
}

export default function StudioSidebar({ studioId, studioName, studioLogo }: StudioSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [attendanceEnabled, setAttendanceEnabled] = useState(false);
  const [isStudioAdmin, setIsStudioAdmin] = useState(false);
  const [studioMemberRole, setStudioMemberRole] = useState<string | null>(null);
  const [isStudioMember, setIsStudioMember] = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { theme } = useTheme();
  const { isMobile } = useDevice()
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags();
  const { hasFeature, subscription } = useStudioFeatures(studioId);
  const { canAccess: canAccessPermission } = useStudioRolePermissions(studioId);
  const [resolvedStudioName, setResolvedStudioName] = useState<string | undefined>(studioName);
  const [resolvedStudioLogo, setResolvedStudioLogo] = useState<string | null | undefined>(studioLogo);
  const [isStudioOwnerUser, setIsStudioOwnerUser] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [expandedSubmenus, setExpandedSubmenus] = useState<Record<string, boolean>>(() => ({
    "Programma's": true,
  }))

  const {
    years: schoolYears,
    selectedYear,
    selectedYearId,
    setSelectedYear,
    missingTable: schoolYearsMissing,
    loading: schoolYearsLoading,
  } = useStudioSchoolYears(studioId)

  const toggleSubmenu = (label: string) => {
    setExpandedSubmenus((prev) => ({ ...prev, [label]: !(prev[label] ?? false) }))
  }

  useEffect(() => {
    // Reset logout confirmation when clicking outside (but not on logout button)
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't reset if clicking on logout button or its children
      // Also don't reset when interacting inside the mobile sidebar panel,
      // otherwise the confirmation state gets cleared immediately on mobile.
      if (!target.closest('[data-logout-button]') && !target.closest('[data-mobile-sidebar-panel="true"]')) {
        setShowLogoutConfirm(false);
      }
    };

    // Auto-reset logout confirmation after 5 seconds
    let resetTimeout: NodeJS.Timeout;
    if (showLogoutConfirm) {
      resetTimeout = setTimeout(() => {
        setShowLogoutConfirm(false);
      }, 5000);
    }

    document.addEventListener('click', handleClickOutside);

    if (!studioId) return;

    loadFeatures();

    // Ensure we show the actual studio name in the header (RLS/auth-aware).
    // The studio layout is a server component and should not rely on anon queries.
    (async () => {
      try {
        if (!studioId) return;
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from('studios')
          .select('naam, logo_url, eigenaar_id')
          .eq('id', studioId)
          .maybeSingle();

        if (!error && data?.naam) setResolvedStudioName(String(data.naam));
        const logoUrl = (data as any)?.logo_url;
        if (!error && typeof logoUrl === 'string') setResolvedStudioLogo(logoUrl);

        const ownerId = (data as any)?.eigenaar_id
        if (user?.id && typeof ownerId === 'string') setIsStudioOwnerUser(user.id === ownerId)
      } catch {
        // ignore
      }
    })();

    // Also fetch the current user's role for this studio to ensure admins see feature-gated items
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check membership in the studio. Use the `studio_members` table.
        const { data: memberRow } = await supabase
          .from('studio_members')
          .select('role')
          .eq('user_id', user.id)
          .eq('studio_id', studioId)
          .maybeSingle();

        const role = (memberRow as any)?.role;
        setStudioMemberRole(role || null);
        setIsStudioMember(!!role);

        // Mark as studio admin for feature access when owner/admin
        if (role === 'owner' || role === 'admin') setIsStudioAdmin(true);
      } catch (err) {
        // ignore errors but log for debugging
        console.error('Error fetching studio member role in sidebar:', err);
      }
    })();


    return () => {
      document.removeEventListener('click', handleClickOutside);
      if (resetTimeout) {
        clearTimeout(resetTimeout);
      }
    };
  }, [studioId, showLogoutConfirm]);

  

  const loadFeatures = async () => {
    try {
      if (!studioId) return;
      const { data, error } = await supabase
        .from('studios')
        .select('features, attendance_enabled')
        .eq('id', studioId)
        .maybeSingle();

      if (error) {
        console.error('Error loading features:', (error as any)?.message || JSON.stringify(error));
        setFeatures({});
        setAttendanceEnabled(false);
        return;
      }

      setFeatures({ ...(data?.features || {}), attendance: data?.attendance_enabled || false });
      setAttendanceEnabled(data?.attendance_enabled || false);
    } catch (error) {
      console.error('Error loading features:', (error as any)?.message || JSON.stringify(error));
      setFeatures({});
      setAttendanceEnabled(false);
    }
  };

  const handleLogout = async () => {
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timed out')), 4000)),
      ])
    } catch {
      // ignore
    } finally {
      window.location.href = '/'
    }
  };

  const handleLogoutClick = () => {
    if (showLogoutConfirm) {
      handleLogout();
    } else {
      setShowLogoutConfirm(true);
    }
  };

  const menuItems = [
    {
      label: 'Dashboard',
      href: `/studio/${studioId}`,
      icon: LayoutDashboard,
      featureKey: 'studio.dashboard',
    },
    {
      label: "Programma's",
      href: `/studio/${studioId}/programs`,
      icon: BookOpen,
      featureKey: 'studio.programs',
      children: [
        {
          label: 'Lessen',
          href: `/studio/${studioId}/lessons`,
          icon: Calendar,
          featureKey: 'studio.lessons',
        },
        {
          label: 'Aanwezigheden',
          href: `/studio/${studioId}/attendance`,
          icon: Calendar,
          subscriptionFeature: 'attendance_tracking' as FeatureKey,
          feature: 'attendance',
          featureKey: 'studio.attendance',
        },
        {
          label: 'Vervangingen',
          href: `/studio/${studioId}/replacements`,
          icon: UserMinus,
          subscriptionFeature: 'teacher_management' as FeatureKey,
          featureKey: 'studio.replacements',
        },
        {
          label: 'Class Passes',
          href: `/studio/${studioId}/class-passes`,
          icon: CreditCard,
          subscriptionFeature: 'class_passes' as FeatureKey,
          featureKey: 'studio.class-passes',
        },
      ],
    },
    {
      label: 'Leden',
      href: `/studio/${studioId}/members`,
      icon: Users,
      subscriptionFeature: 'member_management' as FeatureKey,
      featureKey: 'studio.members',
    },
    {
      label: 'Evaluaties',
      href: `/studio/${studioId}/evaluations`,
      icon: Star,
      feature: 'evaluations',
      featureKey: 'studio.evaluations',
    },
    {
      label: 'Notes',
      href: `/studio/${studioId}/notes`,
      icon: MessageSquare,
      feature: 'notes',
      featureKey: 'studio.notes',
    },
    {
      label: 'E-mails',
      href: `/studio/${studioId}/emails`,
      icon: Mail,
      subscriptionFeature: 'notifications' as FeatureKey,
      feature: 'emails',
      featureKey: 'studio.emails',
    },
    {
      label: 'Financiën',
      href: `/studio/${studioId}/finance`,
      icon: DollarSign,
      subscriptionFeature: 'online_payments' as FeatureKey,
      feature: 'finances',
      featureKey: 'studio.finance',
    },
  ];

  const filterByPermissions = (items: any[]): any[] => {
    return (items || [])
      .map((item) => {
        const children = item.children ? filterByPermissions(item.children) : undefined
        const hasVisibleChildren = Array.isArray(children) && children.length > 0
        const allowed = canAccessPermission(item.featureKey)
        // Keep a parent if it's allowed OR it has any allowed children (so submenu still works)
        if (!allowed && !hasVisibleChildren) return null
        return { ...item, ...(children ? { children } : {}) }
      })
      .filter(Boolean)
  }

  const permittedMenuItems = filterByPermissions(menuItems)

  // Filter menu items based on role permissions, subscription tier and enabled features
  const visibleMenuItems = permittedMenuItems
    .map((item) => {
      if (item.featureKey && isHidden(item.featureKey, false)) {
        return null
      }
      // If the item has children, filter its children too
      if (item.children && Array.isArray(item.children)) {
        const visibleChildren = item.children.filter((child: any) => {
          if (child.featureKey && isHidden(child.featureKey, false)) return false
          // Must pass BOTH subscription check AND feature check if both are present
          const passesSubscription = !child.subscriptionFeature || hasFeature(child.subscriptionFeature);
          const passesFeature = !child.feature || features[child.feature] === true;
          return passesSubscription && passesFeature;
        });

        return {
          ...item,
          children: visibleChildren,
        };
      }

      // Top-level items: must pass BOTH checks if both are present
      const passesSubscription = !(item as any).subscriptionFeature || hasFeature((item as any).subscriptionFeature);
      const passesFeature = !(item as any).feature || features[(item as any).feature] === true;

      if (passesSubscription && passesFeature) {
        return item;
      }

      return null;
    })
    .filter(Boolean);

  const baseHref = studioId ? `/studio/${studioId}` : '/studio'

  const mobileSections: MobileSidebarSection[] = (() => {
    const sections: MobileSidebarSection[] = []

    const standaloneItems: any[] = []

    for (const item of visibleMenuItems as any[]) {
      const href = item.href && studioId ? item.href.replace(`/studio/${studioId}`, baseHref) : (item.href ? `${baseHref}${item.href.replace('/studio', '')}` : baseHref)
      const itemDisabled = item.featureKey ? !isEnabled(item.featureKey, true) : false
      const itemBadge = item.featureKey ? getComingSoonLabel(item.featureKey, 'Soon') : undefined

      if (item.children && Array.isArray(item.children) && item.children.length > 0) {
        const childItems = (item.children as any[]).map((child) => {
          const childHref = child.href && studioId ? child.href.replace(`/studio/${studioId}`, baseHref) : (child.href ? `${baseHref}${child.href.replace('/studio', '')}` : baseHref)
          const childDisabled = itemDisabled || (child.featureKey ? !isEnabled(child.featureKey, true) : false)
          const childBadge = child.featureKey ? getComingSoonLabel(child.featureKey, 'Soon') : itemBadge

          return {
            label: child.label,
            href: childHref,
            icon: child.icon,
            disabled: childDisabled,
            badge: childDisabled ? childBadge : undefined,
          }
        })

        sections.push({
          title: String(item.label),
          items: [
            {
              label: String(item.label),
              href,
              icon: item.icon,
              disabled: itemDisabled,
              badge: itemDisabled ? itemBadge : undefined,
            },
            ...childItems,
          ],
        })
      } else {
        standaloneItems.push({
          label: String(item.label),
          href,
          icon: item.icon,
          disabled: itemDisabled,
          badge: itemDisabled ? itemBadge : undefined,
        })
      }
    }

    if (standaloneItems.length > 0) {
      sections.unshift({ title: 'Navigatie', items: standaloneItems })
    }

    const settingsBaseHref = `${baseHref}/settings`

    const interfaceItems: any[] = []
    interfaceItems.push({ label: 'HUB3 interface', href: '/hub', icon: LayoutDashboard })
    if (isStudioMember && studioMemberRole === 'admin' && !isStudioOwnerUser) {
      interfaceItems.push({
        label: 'User interface',
        onClick: () => {
          setMenuOpen(false)
          setShowReturnConfirm(true)
        },
        icon: User,
      })
    }
    sections.push({ title: 'Interface', items: interfaceItems })

    const actions: any[] = []
    if (!isStudioMember || studioMemberRole === 'owner' || studioMemberRole === 'admin') {
      actions.push({ label: 'Mijn profiel', href: studioId ? `/studio/${studioId}/profile` : '/studio', icon: User })
    }
    actions.push({ label: 'Instellingen', href: settingsBaseHref, icon: Settings })
    actions.push({
      label: showLogoutConfirm ? 'Bevestig uitloggen' : 'Uitloggen',
      onClick: () => {
        handleLogoutClick()
      },
      icon: LogOut,
      tone: showLogoutConfirm ? 'danger' : 'default',
    })

    sections.push({ title: 'Acties', items: actions })
    return sections
  })()

  if (isMobile) {
    return (
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="px-4">
          <div className="flex items-center justify-between h-12">
            <button
              onClick={() => setMenuOpen(true)}
              className="p-2 rounded-md text-slate-700 hover:bg-slate-100"
              aria-label="Open studio menu"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex-1 min-w-0 px-3">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {resolvedStudioName || studioName || 'Studio'}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {selectedYear?.label ? `Schooljaar: ${selectedYear.label}` : 'Studio Beheer'}
              </div>
            </div>

            <NotificationBell iconSize={20} />
          </div>
        </div>

        <MobileSidebar
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onOpen={() => setMenuOpen(true)}
          sections={mobileSections}
          header={
            <div className="min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200 flex-none">
                  {resolvedStudioLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolvedStudioLogo} alt="Studio logo" className="h-full w-full object-cover" />
                  ) : (
                    <Building2 className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{resolvedStudioName || studioName || 'Studio'}</div>
                  <div className="text-xs text-slate-500 truncate">Studio Beheer</div>
                </div>
              </div>

              {!schoolYearsMissing && schoolYears.length > 0 ? (
                <div className="mt-3">
                  <Select
                    variant="sm"
                    value={selectedYearId || ''}
                    onChange={(e) => {
                      const v = String((e as any)?.target?.value || '')
                      setSelectedYear(v || null)
                    }}
                    className="w-full"
                    disabled={schoolYearsLoading}
                  >
                    {schoolYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
          }
        />

        {/* Keep the existing confirmation modal behavior for returning to user UI */}
        {isStudioMember && studioMemberRole === 'admin' && !isStudioOwnerUser && (
          <Modal isOpen={showReturnConfirm} onClose={() => setShowReturnConfirm(false)} ariaLabel="Bevestig terugkeer naar gebruiker">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Terug naar gebruikersinterface</h3>
              <p className="text-sm text-slate-600 mb-6">Weet je zeker dat je wilt terugkeren naar je persoonlijke HUB3 omgeving?
                Je verlaat de studio interface.</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => {
                    setShowReturnConfirm(false);
                    router.push('/dashboard');
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                >
                  Terug naar Dashboard
                </button>
              </div>
            </div>
          </Modal>
        )}
      </nav>
    )
  }

  return (
    <div className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-slate-200 flex flex-col">
      {/* Studio Header */}
      <div className="p-6 border-b border-slate-200">
        {/* Header: Logo + Name */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200 flex-none">
            {resolvedStudioLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolvedStudioLogo} alt="Studio logo" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="w-5 h-5 text-slate-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 truncate">{resolvedStudioName || studioName || 'Studio'}</h2>
            <p className="text-xs text-slate-500">Studio Beheer</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-center space-x-2 w-full">
          {/* Logout */}
          <button
            onClick={showLogoutConfirm ? handleLogout : handleLogoutClick}
            data-logout-button
            className={`p-2 rounded-md transition-colors ${showLogoutConfirm ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100'}`}
            title={showLogoutConfirm ? 'Bevestig uitloggen' : 'Uitloggen'}
          >
            <LogOut className="w-4 h-4" />
          </button>
          {/* Settings */}
          <button
            onClick={() => router.push(studioId ? `/studio/${studioId}/settings` : '/studio')}
            className={`p-2 rounded-md transition-colors ${pathname === (studioId ? `/studio/${studioId}/settings` : '/studio') ? 'text-blue-600 hover:bg-slate-100' : 'text-slate-600 hover:bg-slate-100'}`}
            title="Instellingen"
          >
            <Settings className="w-4 h-4" />
          </button>
          {/* Profile */}
          {(!isStudioMember || studioMemberRole === 'owner' || studioMemberRole === 'admin') && (
            <button
              onClick={() => router.push(studioId ? `/studio/${studioId}/profile` : '/studio')}
              className={`p-2 rounded-md transition-colors ${pathname === (studioId ? `/studio/${studioId}/profile` : '/studio') ? 'text-blue-600 hover:bg-slate-100' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Mijn Profiel"
            >
              <User className="w-4 h-4" />
            </button>
          )}
          {/* Notifications */}
          <div className="p-2 rounded-md transition-colors relative text-slate-600 hover:bg-slate-100" title="Notificaties">
            <NotificationBell />
          </div>
        </div>

        {/* School year switcher (under icon row, above Explore HUB3) */}
        {!schoolYearsMissing && schoolYears.length > 0 ? (
          <div className="mt-4 flex justify-center">
            <Select
              variant="sm"
              value={selectedYearId || ''}
              onChange={(e) => {
                const v = String((e as any)?.target?.value || '')
                setSelectedYear(v || null)
              }}
              className="w-44 h-8"
              disabled={schoolYearsLoading}
            >
              {schoolYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {/* HUB3 / Return buttons */}
        <div className="mt-4 px-6 py-1 flex justify-center items-center gap-2">
          <button
            onClick={() => router.push('/hub')}
            className="btn-prominent w-44 h-8 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300"
            title={isStudioMember && studioMemberRole !== 'owner' ? 'Naar HUB3' : 'Naar HUB3 Interface'}
            aria-label={isStudioMember && studioMemberRole !== 'owner' ? 'HUB3' : 'Explore HUB3'}
          >
            <span className="min-w-0 truncate">{isStudioMember && studioMemberRole !== 'owner' ? 'HUB3' : 'Explore HUB3'}</span>
          </button>
          {isStudioMember && studioMemberRole === 'admin' && !isStudioOwnerUser && (
            <>
              <button
                onClick={() => setShowReturnConfirm(true)}
                className="btn-prominent w-44 h-8 bg-linear-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300"
                title="Naar gebruikersinterface"
                aria-label="Gebruikersinterface"
              >
                <Users className="w-4 h-4" />
              </button>
              <Modal
                isOpen={showReturnConfirm}
                onClose={() => setShowReturnConfirm(false)}
                ariaLabel="Bevestig terugkeer naar gebruiker"
                contentClassName="bg-white rounded-2xl elev-2 max-w-xl"
                contentStyle={{ maxWidth: 576, minHeight: 0 }}
              >
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">Terug naar gebruikersinterface</h3>
                  <p className="text-sm text-slate-600 mb-6">Weet je zeker dat je wilt terugkeren naar je persoonlijke HUB3 omgeving?
                    Je verlaat de studio interface.</p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => {
                        setShowReturnConfirm(false);
                        router.push('/dashboard');
                      }}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                    >
                      Terug naar Dashboard
                    </button>
                  </div>
                </div>
              </Modal>
            </>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 pb-10">
        <div className="space-y-0.5">
          {permittedMenuItems.map((item: any) => {
            const Icon = item.icon;
            const baseHref = studioId ? `/studio/${studioId}` : '/studio'
            const href = item.href && studioId ? item.href.replace(`/studio/${studioId}`, baseHref) : (item.href ? `${baseHref}${item.href.replace('/studio', '')}` : baseHref)
            const isActive = pathname === href;

            const disabled = item.featureKey ? !isEnabled(item.featureKey, true) : false
            const soonLabel = item.featureKey ? getComingSoonLabel(item.featureKey, 'Soon') : 'Soon'

            if (item.children && Array.isArray(item.children) && item.children.length > 0) {
              const submenuLabel = String(item.label)
              const isExpanded = expandedSubmenus[submenuLabel] ?? false

              return (
                <div key={String(item.label)}>
                  {disabled ? (
                    <div className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-slate-400 cursor-not-allowed opacity-60">
                      <Icon className="w-5 h-5" />
                      <div className="flex flex-col">
                        <span>{item.label}</span>
                        <span className="mt-1 text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{soonLabel}</span>
                      </div>
                      <span className="ml-auto">
                        <ChevronDown className="w-4 h-4" />
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`group w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'text-blue-600 font-medium'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(href)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-600 group-hover:!text-slate-900'}`} />
                        <span className={`${isActive ? 'text-blue-600' : 'text-slate-700 group-hover:!text-slate-900'}`}>{item.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSubmenu(submenuLabel)}
                        aria-label={isExpanded ? `Collapse ${submenuLabel}` : `Expand ${submenuLabel}`}
                        className="ml-auto p-1 rounded hover:bg-slate-100 text-slate-500"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-1 space-y-0.5 pl-8">
                      {item.children.map((child: any) => {
                        const ChildIcon = child.icon || null;
                        const childHref = child.href && studioId ? child.href.replace(`/studio/${studioId}`, baseHref) : (child.href ? `${baseHref}${child.href.replace('/studio', '')}` : baseHref)
                        const childActive = pathname === childHref;

                        const childDisabled = disabled || (child.featureKey ? !isEnabled(child.featureKey, true) : false)
                        const childSoonLabel = child.featureKey ? getComingSoonLabel(child.featureKey, 'Soon') : soonLabel
                        return (
                            childDisabled ? (
                            <div
                              key={String(child.label)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-slate-400 cursor-not-allowed opacity-60"
                            >
                              {ChildIcon ? <ChildIcon className="w-4 h-4" /> : null}
                              <div className="flex flex-col">
                                <span>{child.label}</span>
                                <span className="mt-1 text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{childSoonLabel}</span>
                              </div>
                            </div>
                          ) : (
                            <button
                              key={String(child.label)}
                              onClick={() => router.push(childHref)}
                              className={`group w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                                childActive ? 'text-blue-600 font-medium' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                            >
                              {ChildIcon ? <ChildIcon className={`w-4 h-4 ${childActive ? 'text-blue-600' : 'text-slate-600 group-hover:!text-slate-900'}`} /> : null}
                              <span className={`${childActive ? 'text-blue-600' : 'text-slate-700 group-hover:!text-slate-900'}`}>{child.label}</span>
                            </button>
                          )
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
                disabled ? (
                <div
                  key={String(item.label)}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-slate-400 cursor-not-allowed opacity-60"
                >
                  <Icon className="w-5 h-5" />
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    <span className="mt-1 text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{soonLabel}</span>
                  </div>
                </div>
              ) : (
                <button
                  key={String(item.label)}
                  onClick={() => router.push(href)}
                  className={`group w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'text-blue-600 font-medium'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-600 group-hover:!text-slate-900'}`} />
                  <span className={`${isActive ? 'text-blue-600' : 'text-slate-700 group-hover:!text-slate-900'}`}>{item.label}</span>
                </button>
              )
            );
          })}

          {/* HUB3 section removed (prominent button moved above) */}
        </div>
      </nav>

      {/* (logout removed from bottom - available in quick actions) */}

      {/* NotificationsPanel is rendered by NotificationBell (portal) to avoid being clipped by sidebar */}
    </div>
  );
}
