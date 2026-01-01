'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User, Settings, LogOut, Sun, Moon, Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import NotificationBell from '@/components/NotificationBell';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';

export default function HubTopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isStudioAdmin, setIsStudioAdmin] = useState(false);
  const [isStudioOwner, setIsStudioOwner] = useState(false);
  const [studioId, setStudioId] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { theme, toggle } = useTheme();
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags();

  useEffect(() => {
    checkStudioAdmin();

    // Re-run check when auth state changes (ensures we detect user after login)
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      checkStudioAdmin();
    });

    // Reset logout confirmation when clicking outside (but not on logout button)
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't reset if clicking on logout button or its children
      if (!target.closest('[data-logout-button]')) {
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

    return () => {
      // unsubscribe if possible
      try {
        authListener?.subscription?.unsubscribe?.();
      } catch {
        // ignore
      }
      document.removeEventListener('click', handleClickOutside);
      if (resetTimeout) {
        clearTimeout(resetTimeout);
      }
    };
  }, [showLogoutConfirm]);

  const checkStudioAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStudioId(null);
        return;
      }

      // Studio interface access: both owner + admin.
      // Studio profile page: owner only.
      const { data: memberData } = await supabase
        .from('studio_members')
        .select('role, studio_id')
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin'])
        .maybeSingle();

      if (memberData) {
        setIsStudioAdmin(true);
        setIsStudioOwner(memberData.role === 'owner');
        setStudioId(memberData.studio_id || null);
      } else {
        // Owners are not always present in studio_members.
        const { data: ownerStudio } = await supabase
          .from('studios')
          .select('id')
          .eq('eigenaar_id', user.id)
          .maybeSingle();

        if (ownerStudio?.id) {
          setIsStudioAdmin(true);
          setIsStudioOwner(true);
          setStudioId(ownerStudio.id);
        } else {
          setIsStudioAdmin(false);
          setIsStudioOwner(false);
          setStudioId(null);
        }
      }
    } catch (error) {
      console.error('Error checking studio admin status:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleLogoutClick = () => {
    if (showLogoutConfirm) {
      handleLogout();
    } else {
      setShowLogoutConfirm(true);
    }
  };

  const resolveHomeTarget = async (): Promise<string> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return '/dashboard';

      const { data: memberData } = await supabase
        .from('studio_members')
        .select('role, studio_id')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .maybeSingle();

      if (memberData?.studio_id) return `/studio/${memberData.studio_id}`;

      const { data: ownerStudio } = await supabase
        .from('studios')
        .select('id')
        .eq('eigenaar_id', user.id)
        .maybeSingle();

      if (ownerStudio?.id) return `/studio/${ownerStudio.id}`;

      return '/dashboard';
    } catch {
      return '/dashboard';
    }
  }

  const resolveStudioBasePath = async (): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Studio interface access: owner + admin.
      const { data: memberData } = await supabase
        .from('studio_members')
        .select('role, studio_id')
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin'])
        .maybeSingle();

      if (memberData?.studio_id) return `/studio/${memberData.studio_id}`;

      // Owners are not always present in studio_members.
      const { data: ownerStudio } = await supabase
        .from('studios')
        .select('id')
        .eq('eigenaar_id', user.id)
        .maybeSingle();

      if (ownerStudio?.id) return `/studio/${ownerStudio.id}`;
      return null;
    } catch {
      return null;
    }
  }

  const handleProfileClick = async () => {
    // Only owners have a studio profile page.
    if (!isStudioOwner) {
      router.push('/profile')
      return
    }
    const studioBase = await resolveStudioBasePath()
    router.push(studioBase ? `${studioBase}/profile` : '/profile')
  }

  const handleSettingsClick = () => {
    router.push('/settings')
  }

  const handleHomeClick = async () => {
    // Only studio owners should be taken to the studio dashboard.
    if (isStudioOwner && studioId) {
      router.push(`/studio/${studioId}`);
      return;
    }
    router.push('/dashboard');
  }

  const tabs = [
    { name: 'HUB3', path: '/hub' },
    { name: 'Workshops HUB', path: '/hub/workshops', featureKey: 'hub.workshops' },
    { name: 'Studio HUB', path: '/hub/studios', featureKey: 'hub.studios' },
    { name: 'Teachers HUB', path: '/hub/teachers', featureKey: 'hub.teachers' },
  ];

  const visibleTabs = tabs.filter((t: any) => !t.featureKey || !isHidden(t.featureKey, false))

  return (
    <nav className="bg-white border-b border-gray-200 nav-surface sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side - Tabs */}
          <div className="flex space-x-8">
            {/* Home (interface-aware) */}
            <button
              onClick={handleHomeClick}
              className="group inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium transition-colors text-gray-500 hover:text-gray-700 hover:border-gray-300"
              title={isStudioOwner ? 'Naar Studio dashboard' : 'Naar Dashboard'}
              aria-label={isStudioOwner ? 'Naar Studio dashboard' : 'Naar Dashboard'}
            >
              {/* Reserve width for the longest label so hover text doesn't overlap neighbors */}
              <span className="relative inline-block">
                <span className="invisible whitespace-nowrap">Go back home</span>
                <span className="absolute left-0 top-0 inline-block whitespace-nowrap transition-all duration-200 group-hover:opacity-0 group-hover:-translate-y-1">Home</span>
                <span className="absolute left-0 top-0 inline-block whitespace-nowrap transition-all duration-200 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0">
                  Go back home
                </span>
              </span>
            </button>

            {visibleTabs.map((tab) => {
              const isActive = pathname === tab.path;
              const disabled = tab.featureKey ? !isEnabled(tab.featureKey, true) : false;
              const soonLabel = tab.featureKey ? getComingSoonLabel(tab.featureKey, 'Soon') : 'Soon';

              if (disabled) {
                return (
                  <div
                    key={tab.path}
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-400 cursor-not-allowed"
                  >
                    <span>{tab.name}</span>
                    <span className="ml-2 text-xs bg-slate-100 px-2 py-0.5 rounded">{soonLabel}</span>
                  </div>
                );
              }

              return (
                <button
                  key={tab.path}
                  onClick={() => router.push(tab.path)}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.name}
                </button>
              );
            })}
          </div>

          {/* Right side - Actions: left group (interface) + icons group (closer together) */}
          <div className="flex items-center">
              <div className="flex items-center space-x-3">
              {/* Notification Bell */}
              <NotificationBell />

              {/* Profile */}
              <button
                onClick={handleProfileClick}
                className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                title="Mijn Profiel"
              >
                <User className="w-4 h-4" />
              </button>

              {/* Settings */}
              <button
                onClick={handleSettingsClick}
                className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                title="Instellingen"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggle}
                className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                title={theme === 'dark' ? 'Schakel lichtmodus in' : 'Schakel donker modus in'}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Logout */}
              {showLogoutConfirm ? (
                <button
                  onClick={handleLogout}
                  data-logout-button
                  className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                  title="Bevestig uitloggen"
                  aria-label="Bevestig uitloggen"
                >
                  <Check className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleLogoutClick}
                  data-logout-button
                  className="p-1 text-gray-500 hover:text-red-500 focus:text-red-500 hover:bg-gray-100 rounded-full transition-colors"
                  title="Uitloggen"
                  aria-label="Uitloggen"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
