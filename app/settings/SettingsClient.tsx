'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Bell, ChevronDown, ChevronUp, User as UserIcon } from 'lucide-react'
import PushNotificationsToggle from '@/components/PushNotificationsToggle'
import Select from '@/components/Select'
import { useNotification } from '@/contexts/NotificationContext'

type Channel = 'none' | 'in_app' | 'push'
type NewProgramsScope = 'all' | 'workshops'

type Preferences = {
  disable_all: boolean
  new_programs_scope: NewProgramsScope
  new_programs_channel: Channel
  program_updates_channel: Channel
}

const DEFAULT_PREFS: Preferences = {
  disable_all: false,
  new_programs_scope: 'all',
  new_programs_channel: 'push',
  program_updates_channel: 'push',
}

type TabKey = 'profile' | 'notifications'

type CategoryKey = 'account' | 'notifications'

type CategoryConfig = Array<{
  key: CategoryKey
  label: string
  items: Array<{ key: TabKey; label: string; icon: any }>
}>

export default function SettingsClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { showSuccess, showError } = useNotification()

  const tab = (searchParams?.get('tab') || '') as TabKey

  const [active, setActive] = useState<TabKey>('notifications')
  const [expandedCategory, setExpandedCategory] = useState<CategoryKey | null>('notifications')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS)

  useEffect(() => {
    const next: TabKey = tab === 'profile' || tab === 'notifications' ? tab : 'notifications'
    setActive(next)
  }, [tab])

  useEffect(() => {
    if (active === 'profile') setExpandedCategory('account')
    else setExpandedCategory('notifications')
  }, [active])

  const categoryConfig: CategoryConfig = useMemo(
    () => [
      {
        key: 'account',
        label: 'Account',
        items: [{ key: 'profile', label: 'Profiel', icon: UserIcon }],
      },
      {
        key: 'notifications',
        label: 'Notificaties',
        items: [{ key: 'notifications', label: 'Notificaties', icon: Bell }],
      },
    ],
    [],
  )

  const onNavigateTab = (nextTab: TabKey) => {
    setActive(nextTab)
    try {
      const next = new URLSearchParams(searchParams?.toString())
      next.set('tab', nextTab)
      router.push(`${pathname}?${next.toString()}`)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/notification-preferences', { method: 'GET', credentials: 'include' })
        const json = await res.json().catch(() => ({} as any))
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/auth/login?redirect=/settings')
            return
          }
          throw new Error(json?.error || 'Kon instellingen niet laden')
        }

        if (!cancelled) {
          setPrefs({ ...DEFAULT_PREFS, ...(json?.preferences || {}) })
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Fout bij laden')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router, showError])

  const save = async () => {
    try {
      setSaving(true)
      const res = await fetch('/api/notification-preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })
      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/auth/login?redirect=/settings')
          return
        }
        throw new Error(json?.error || 'Opslaan mislukt')
      }
      showSuccess('Instellingen opgeslagen')
    } catch (e: any) {
      showError(e?.message || 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  const channelLabel = (c: Channel) => (c === 'none' ? 'Geen' : c === 'in_app' ? 'In-app' : 'Push')

  const renderTabContent = (key: TabKey) => {
    if (key === 'profile') {
      return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Profiel</h2>
          <p className="text-sm text-slate-600 mb-4">Beheer je profielgegevens op de profielpagina.</p>
          <button
            onClick={() => router.push('/profile')}
            className="px-4 py-2 border border-slate-300 dark:border-slate-700/60 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            Ga naar Profiel
          </button>
        </div>
      )
    }

    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Notificaties</h2>

        {loading ? (
          <div className="text-slate-600">Laden…</div>
        ) : (
          <>
            <label className="flex items-center gap-3 mb-6">
              <input
                type="checkbox"
                checked={!!prefs.disable_all}
                onChange={(e) => setPrefs((p) => ({ ...p, disable_all: e.target.checked }))}
              />
              <span className="text-slate-700 dark:text-slate-200">Alles uitschakelen</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white mb-1">Nieuwe programma&apos;s van studios die je volgt</div>
                <div className="text-sm text-slate-600 mb-3">Kies welke nieuwe programma&apos;s je wil ontvangen.</div>

                <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Type</label>
                <Select
                  value={prefs.new_programs_scope}
                  onChange={(e) => setPrefs((p) => ({ ...p, new_programs_scope: e.target.value as any }))}
                  className="w-full"
                  disabled={prefs.disable_all}
                >
                  <option value="all">Alle nieuwe programma&apos;s</option>
                  <option value="workshops">Enkel workshops</option>
                </Select>

                <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1 mt-4">Kanaal</label>
                <Select
                  value={prefs.new_programs_channel}
                  onChange={(e) => setPrefs((p) => ({ ...p, new_programs_channel: e.target.value as any }))}
                  className="w-full"
                  disabled={prefs.disable_all}
                >
                  <option value="in_app">{channelLabel('in_app')}</option>
                  <option value="push">{channelLabel('push')}</option>
                  <option value="none">{channelLabel('none')}</option>
                </Select>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white mb-1">Wijzigingen aan programma&apos;s waar je ingeschreven bent</div>
                <div className="text-sm text-slate-600 mb-3">Bijv. wijziging van locatie of uur.</div>

                <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Kanaal</label>
                <Select
                  value={prefs.program_updates_channel}
                  onChange={(e) => setPrefs((p) => ({ ...p, program_updates_channel: e.target.value as any }))}
                  className="w-full"
                  disabled={prefs.disable_all}
                >
                  <option value="in_app">{channelLabel('in_app')}</option>
                  <option value="push">{channelLabel('push')}</option>
                  <option value="none">{channelLabel('none')}</option>
                </Select>

                <div className="mt-4">
                  <div className="text-sm font-medium text-slate-900 dark:text-white mb-1">Push inschakelen (browser)</div>
                  <div className="text-sm text-slate-600 mb-2">Nodig als je kanaal op Push zet.</div>
                  <PushNotificationsToggle variant="button" />
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-60"
              >
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const mobileAccordionGroups = useMemo(() => {
    return [
      {
        key: 'account' as const,
        label: 'Account',
        items: [{ key: 'profile' as const, label: 'Profiel', icon: UserIcon }],
      },
      {
        key: 'notifications' as const,
        label: 'Notificaties',
        items: [{ key: 'notifications' as const, label: 'Notificaties', icon: Bell }],
      },
    ]
  }, [])

  const [openMobilePanels, setOpenMobilePanels] = useState<Partial<Record<TabKey, boolean>>>({})
  const [mountedMobilePanels, setMountedMobilePanels] = useState<Partial<Record<TabKey, boolean>>>({})

  const toggleMobilePanel = (key: TabKey) => {
    setOpenMobilePanels((prev) => {
      const isCurrentlyOpen = !!prev?.[key]
      return isCurrentlyOpen ? {} : { [key]: true }
    })
    setMountedMobilePanels((prev) => ({ ...prev, [key]: true }))
  }

  useEffect(() => {
    // When deep-linking with ?tab=..., open that panel on mobile
    if (!tab) return
    if (tab === 'profile' || tab === 'notifications') {
      setOpenMobilePanels({ [tab]: true })
      setMountedMobilePanels((prev) => ({ ...prev, [tab]: true }))
    }
  }, [tab])

  return (
    <div className="max-w-7xl mx-auto text-slate-900">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Instellingen</h1>
      </div>

      {/* Mobile */}
      <div className="lg:hidden">
        <div className="space-y-6">
          {mobileAccordionGroups.map((group) => (
            <div
              key={group.key}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden"
            >
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700/60">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{group.label}</div>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-700/60">
                {group.items.map((item) => {
                  const isOpen = !!openMobilePanels[item.key]
                  const ItemIcon = item.icon
                  const Chevron = isOpen ? ChevronUp : ChevronDown
                  const isMounted = !!mountedMobilePanels[item.key]
                  return (
                    <div key={item.key}>
                      <button
                        type="button"
                        onClick={() => toggleMobilePanel(item.key)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ItemIcon size={16} className="text-slate-500 flex-none" />
                          <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.label}</span>
                        </div>
                        <Chevron size={16} className="text-slate-500 flex-none" />
                      </button>

                      {isOpen ? (
                        <div className="px-4 pb-4">
                          {isMounted ? <div className="pt-4">{renderTabContent(item.key)}</div> : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:flex gap-6">
        <aside className="w-72 flex-none">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
            <div className="p-2">
              {categoryConfig.map((category) => {
                const isExpanded = expandedCategory === category.key
                const Chevron = isExpanded ? ChevronUp : ChevronDown
                return (
                  <div key={category.key} className="mb-2 last:mb-0">
                    <button
                      type="button"
                      onClick={() => setExpandedCategory((cur) => (cur === category.key ? null : category.key))}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{category.label}</span>
                      <Chevron size={16} className="text-slate-500" />
                    </button>

                    {isExpanded ? (
                      <div className="mt-1 pl-1">
                        {category.items.map((item) => {
                          const ItemIcon = item.icon
                          const isActive = active === item.key
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => onNavigateTab(item.key)}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                                isActive
                                  ? 'bg-blue-50 text-blue-900 border border-blue-200'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <ItemIcon size={16} className={isActive ? 'text-blue-700' : 'text-slate-500'} />
                              {item.label}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">{renderTabContent(active)}</div>
      </div>
    </div>
  )
}
