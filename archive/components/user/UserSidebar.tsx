"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, Settings, User, LogOut, GraduationCap, BookMarked, FileText, Bell, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import NotificationsPanel from '@/components/NotificationsPanel'
import { Notification } from '@/types/database'

interface TeacherStudio {
  studio_id: string;
  studio_name: string;
}

export default function UserSidebar() {
  const pathname = usePathname()
  const [isTeacher, setIsTeacher] = useState(false)
  const [teacherHasEvaluations, setTeacherHasEvaluations] = useState(false)
  const [, setTeacherStudios] = useState<TeacherStudio[]>([])
  const [, setUserId] = useState<string | null>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  useEffect(() => {
    checkTeacherRole()
    loadNotifications()
    
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
    
    // Set up real-time subscription
    const channel = supabase
      .channel('notifications-user-sidebar')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications'
        },
        () => {
          loadNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('click', handleClickOutside);
      if (resetTimeout) {
        clearTimeout(resetTimeout);
      }
    }
  }, [showLogoutConfirm])

  const loadNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      setNotifications(data || [])
      setUnreadCount(data?.filter(n => !n.read).length || 0)
    } catch (error) {
      console.error('Error loading notifications:', error)
    }
  }

  const checkTeacherRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)

      // Check if user has teacher role via user_roles
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()

      if (roleError && roleError.code !== 'PGRST116') throw roleError

      // If user has teacher role, get their studios from user_roles
      if (userRole && userRole.role === 'teacher') {
        const { data: studioLinks, error: linksError } = await supabase
          .from('user_roles')
          .select('studio_id, studios(naam, features)')
          .eq('user_id', user.id)
          .eq('role', 'teacher')

        if (linksError) throw linksError

        if (studioLinks && studioLinks.length > 0) {
          setIsTeacher(true)
          const studios = studioLinks.map((link: any) => ({
            studio_id: link.studio_id,
            studio_name: link.studios?.naam || 'Studio',
            features: link.studios?.features || {}
          }))
          setTeacherStudios(studios)

          // If any linked studio has evaluations feature enabled, show teacher evaluations link
          const hasEval = studios.some((s: any) => !!s.features?.evaluations)
          setTeacherHasEvaluations(hasEval)
        }
      }
    } catch (error) {
      console.error('Error checking teacher role:', error)
    }
  }

  const navItem = (href: string, label: string, Icon: any) => {
    const active = pathname === href
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-4 py-2 rounded-md t-bodySm font-medium transition-colors ${
          active ? 'text-blue-700' : 'hover:bg-slate-100'
        }`}
      >
        <Icon className="w-5 h-5" />
        <span>{label}</span>
      </Link>
    )
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const handleLogoutClick = () => {
    if (showLogoutConfirm) {
      handleLogout();
    } else {
      setShowLogoutConfirm(true);
    }
  }

  return (
    <aside className="w-64 bg-white border-r border-slate-200 min-h-screen flex flex-col sticky top-0">
      <div className="p-6 border-b border-slate-200">
        <div className="mb-4">
          <Link href="/" className="t-h3 font-bold">
            HUB3
          </Link>
          <p className="t-caption mt-1">Gebruiker Home</p>
        </div>

        {/* Quick Action Icons */}
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/profile"
            className={`p-2.5 rounded-lg transition-colors ${
              pathname === '/profile'
                ? 'text-blue-600'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Mijn Profiel"
          >
            <User className="w-5 h-5" />
          </Link>

          <Link
            href="/settings"
            className={`p-2.5 rounded-lg transition-colors ${
              pathname === '/settings'
                ? 'text-blue-600'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Instellingen"
          >
            <Settings className="w-5 h-5" />
          </Link>

          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={`p-2.5 rounded-lg transition-colors relative ${
              showNotifications
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Notificaties"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4.5 h-4.5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItem('/hub/studios', 'Explore Studios', Home)}
        {navItem('/mijn-lessen', 'Mijn Lessen', BookOpen)}
        {navItem('/user/evaluations', 'Mijn Evaluaties', Star)}

        {/* Teacher Section */}
        {isTeacher && (
          <>
            <div className="my-4 border-t border-slate-200 pt-4">
              <div className="px-4 py-2 t-caption font-semibold text-slate-500 uppercase tracking-wider">
                Docent
              </div>
            </div>
            {navItem('/dashboard', 'Docent Dashboard', GraduationCap)}
            {navItem('/teacher/courses', 'Mijn Cursussen', BookMarked)}
            {teacherHasEvaluations && navItem('/teacher/evaluations', 'Evaluaties', Star)}
            {navItem('/teacher/timesheets', 'Timesheets & Payrolls', FileText)}
          </>
        )}
      </nav>

      {/* Logout pinned at bottom */}
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+40px)] sm:pb-4 border-t border-slate-200 sticky bottom-0 bg-white">
        <button
          onClick={showLogoutConfirm ? handleLogout : handleLogoutClick}
          data-logout-button
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-md t-bodySm font-medium transition-colors ${
            showLogoutConfirm
              ? 'text-red-700 bg-red-50'
              : 'text-red-600 hover:bg-red-50'
          }`}
        >
          <LogOut className="w-5 h-5" />
          <span>{showLogoutConfirm ? 'Bevestig uitloggen' : 'Uitloggen'}</span>
        </button>
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <NotificationsPanel
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onRefresh={loadNotifications}
          style={{ position: 'fixed', top: '5rem', right: '1rem', zIndex: 9999 }}
        />
      )}
    </aside>
  )
}
