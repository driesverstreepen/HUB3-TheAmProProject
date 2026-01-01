'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Shield, FileText, Users, Settings, LogOut, LayoutDashboard, Database, HelpCircle, Type, Bell, Menu } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useDevice } from '@/contexts/DeviceContext'
import { MobileSidebar, type MobileSidebarSection } from '@/components/ui/MobileSidebar'

export default function SuperAdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false)
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags();
  const { isMobile } = useDevice()

  const basePath = pathname?.startsWith('/super-admin') ? '/super-admin' : '/admin';

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

    return () => {
      document.removeEventListener('click', handleClickOutside);
      if (resetTimeout) {
        clearTimeout(resetTimeout);
      }
    };
  }, [showLogoutConfirm]);

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

  const menuItems = [
    {
      label: 'Dashboard',
      href: basePath,
      icon: LayoutDashboard,
    },
    {
      label: 'Feedback',
      href: `${basePath}/feedback`,
      icon: HelpCircle,
    },
    {
      label: 'Promo Cards',
      href: `${basePath}/promo-cards`,
      icon: Settings,
    },
    {
      label: 'Feature Flags',
      href: `/super-admin/feature-flags`,
      icon: Settings,
    },
    {
      label: 'Legal Documents',
      href: `${basePath}/legal-documents`,
      icon: FileText,
    },
    {
      label: 'FAQ beheer',
      href: `${basePath}/faq`,
      icon: HelpCircle,
    },
    {
      label: 'User Management',
      href: `${basePath}/users`,
      icon: Users,
      featureKey: 'super-admin.users',
      defaultEnabled: true,
    },
    {
      label: 'Database',
      href: `${basePath}/database`,
      icon: Database,
      featureKey: 'super-admin.database',
      defaultEnabled: false,
    },
    {
      label: 'Typografie',
      href: `/super-admin/typography`,
      icon: Type,
    },
    {
      label: 'Push Notifications',
      href: `/super-admin/push`,
      icon: Bell,
    },
    {
      label: 'Platform Settings',
      href: `${basePath}/settings`,
      icon: Settings,
      featureKey: 'super-admin.settings',
      defaultEnabled: true,
    },
  ];

  const visibleMenuItems = menuItems.filter((item: any) => {
    if (item.featureKey && isHidden(item.featureKey, false)) return false
    return true
  })

  const mobileSections: MobileSidebarSection[] = [
    {
      title: 'Navigatie',
      items: visibleMenuItems.map((item: any) => {
        const disabled = item.featureKey
          ? !isEnabled(item.featureKey, item.defaultEnabled ?? true)
          : false
        const soonLabel = item.featureKey
          ? getComingSoonLabel(item.featureKey, 'Soon')
          : 'Soon'

        return {
          label: String(item.label),
          href: String(item.href),
          icon: item.icon,
          disabled,
          badge: disabled ? soonLabel : undefined,
        }
      }),
    },
    {
      title: 'Acties',
      items: [
        {
          label: showLogoutConfirm ? 'Bevestig uitloggen' : 'Uitloggen',
          onClick: () => {
            handleLogoutClick()
          },
          icon: LogOut,
          tone: showLogoutConfirm ? 'danger' : 'default',
        },
      ],
    },
  ]

  if (isMobile) {
    return (
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="px-4">
          <div className="flex items-center justify-between h-12">
            <button
              onClick={() => setMenuOpen(true)}
              className="p-2 rounded-md text-slate-700 hover:bg-slate-100"
              aria-label="Open super admin menu"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex-1 min-w-0 px-3">
              <div className="text-sm font-semibold text-slate-900 truncate">Super Admin</div>
              <div className="text-[11px] text-slate-500 truncate">Platform Beheer</div>
            </div>

            <div className="w-10" aria-hidden="true" />
          </div>
        </div>

        <MobileSidebar
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onOpen={() => setMenuOpen(true)}
          sections={mobileSections}
          header={
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-none">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">Super Admin</div>
                <div className="text-xs text-slate-500 truncate">Platform Beheer</div>
              </div>
            </div>
          }
        />
      </nav>
    )
  }

  return (
    <div className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 flex flex-col">
      {/* Super Admin Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="t-h4 font-bold truncate">
              Super Admin
            </h2>
            <p className="t-caption">Platform Beheer</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {menuItems.map((item: any) => {
            if (item.featureKey && isHidden(item.featureKey, false)) return null
            const Icon = item.icon;
            const isActive = pathname === item.href;

            const disabled = item.featureKey
              ? !isEnabled(item.featureKey, item.defaultEnabled ?? true)
              : false;
            const soonLabel = item.featureKey
              ? getComingSoonLabel(item.featureKey, 'Soon')
              : 'Soon';

            if (disabled) {
              return (
                <div
                  key={item.href}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg t-bodySm text-slate-400 cursor-not-allowed opacity-50"
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  <span className="ml-auto t-caption bg-slate-100 px-2 py-0.5 rounded">{soonLabel}</span>
                </div>
              );
            }

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-purple-50 text-purple-600 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="t-bodySm">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Logout pinned at bottom */}
      <div className="p-4 border-t border-slate-200 sticky bottom-0 bg-white">
        <button
          onClick={showLogoutConfirm ? handleLogout : handleLogoutClick}
          data-logout-button
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            showLogoutConfirm
              ? 'text-red-600 hover:bg-red-50 font-medium'
              : 'text-slate-700 hover:bg-red-50 hover:text-red-600'
          }`}
        >
          <LogOut className="w-5 h-5" />
          <span className="t-bodySm text-red-600">{showLogoutConfirm ? 'Bevestig uitloggen' : 'Uitloggen'}</span>
        </button>
      </div>
    </div>
  );
}
