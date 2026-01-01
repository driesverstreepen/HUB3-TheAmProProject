'use client'

import { useEffect, useMemo, useState } from 'react'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import SuperAdminGuard from '@/components/admin/SuperAdminGuard'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { TYPOGRAPHY_VARIANTS, TypographyConfig, defaultTypographyConfig, normalizeTypographyConfig, typographyConfigToCss } from '@/lib/typography'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'hub3.typographyCss'

function isHexColor(value: string) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())
}

async function getAuthHeaders() {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    return {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }
  } catch {
    return {}
  }
}

type ApiGetResponse = {
  config: TypographyConfig
  stored?: boolean
  updated_at?: string | null
  updated_by?: string | null
  error?: string
}

export default function SuperAdminTypographyPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [config, setConfig] = useState<TypographyConfig>(() => normalizeTypographyConfig(defaultTypographyConfig))

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const authHeaders = await getAuthHeaders()
        const res = await fetch('/api/super-admin/typography', {
          method: 'GET',
          credentials: 'include',
          headers: authHeaders,
        })
        const json = (await res.json().catch(() => null)) as ApiGetResponse | null

        if (!res.ok) {
          throw new Error(json?.error || `Failed loading typography (${res.status})`)
        }

        if (!cancelled) {
          setConfig(normalizeTypographyConfig(json?.config || defaultTypographyConfig))
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed loading typography')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const canSave = useMemo(() => {
    return !!config
  }, [config])

  const update = (
    device: 'mobile' | 'desktop',
    key: (typeof TYPOGRAPHY_VARIANTS)[number]['key'],
    field: 'size' | 'color',
    value: string,
  ) => {
    setConfig((prev) => ({
      ...prev,
      [device]: {
        ...prev[device],
        [key]: {
          ...prev[device][key],
          [field]: value,
        },
      },
    }))
  }

  const onSave = async () => {
    if (!canSave) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/super-admin/typography', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ config }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        throw new Error(json?.error || `Failed saving typography (${res.status})`)
      }

      setConfig(json?.config || config)
      setSuccess('Opgeslagen. Dit wordt meteen toegepast (ook in andere tabs).')

      // Apply immediately in this tab (and broadcast to other tabs)
      try {
        const css = typographyConfigToCss(json?.config || config)
        window.localStorage.setItem(STORAGE_KEY, css)
        let el = document.getElementById('hub3-typography-vars-live') as HTMLStyleElement | null
        if (!el) {
          el = document.createElement('style')
          el.id = 'hub3-typography-vars-live'
          document.head.appendChild(el)
        }
        el.textContent = css
      } catch {
        // ignore
      }

      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  const onResetDefaults = () => {
    setError(null)
    setSuccess(null)
    setConfig(normalizeTypographyConfig(defaultTypographyConfig))
  }

  return (
    <SuperAdminGuard>
      <div className="min-h-screen bg-slate-50 overflow-x-auto">
        <SuperAdminSidebar />

        <div className="w-full min-w-0 sm:ml-64">
          <header className="bg-white border-b border-slate-200">
            <div className="px-4 sm:px-8 py-4 sm:py-6">
              <h1 className="text-2xl font-bold text-slate-900">Typography</h1>
              <p className="text-sm text-slate-600">Stel tekstgroottes en kleuren in (mobile/desktop apart)</p>
            </div>
          </header>

          <main className="px-4 sm:px-8 py-6 sm:py-8">
            {loading ? (
              <div className="min-h-[40vh] flex items-center justify-center">
                <LoadingSpinner size={48} label="Laden" indicatorClassName="border-b-purple-600" />
              </div>
            ) : (
              <div className="space-y-6">
                {error ? (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800">{error}</div>
                ) : null}

                {success ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800">{success}</div>
                ) : null}

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Lettertype categorieën</h2>
                      <p className="text-sm text-slate-600">Startwaarden zijn gelijk aan de huidige stijl (ongeveer)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={onResetDefaults}
                        disabled={saving || loading}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border ${saving || loading ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                      >
                        Reset naar standaard
                      </button>
                      <button
                        onClick={onSave}
                        disabled={saving || !canSave}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${saving || !canSave ? 'bg-slate-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                      >
                        {saving ? 'Opslaan…' : 'Opslaan'}
                      </button>
                    </div>
                  </div>

                  <div className="p-6 overflow-x-auto">
                    <table className="min-w-[920px] w-full">
                      <thead>
                        <tr className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          <th className="pb-3 pr-4">Categorie</th>
                          <th className="pb-3 pr-4">Mobile grootte</th>
                          <th className="pb-3 pr-4">Mobile kleur</th>
                          <th className="pb-3 pr-4">Desktop grootte</th>
                          <th className="pb-3 pr-4">Desktop kleur</th>
                          <th className="pb-3">Preview</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {TYPOGRAPHY_VARIANTS.map((v) => {
                          const m = config.mobile[v.key]
                          const d = config.desktop[v.key]

                          return (
                            <tr key={v.key}>
                              <td className="py-4 pr-4">
                                <div className="text-sm font-medium text-slate-900">{v.label}</div>
                                <div className="text-xs text-slate-500">{v.key}</div>
                              </td>

                              <td className="py-4 pr-4">
                                <input
                                  type="text"
                                  value={m.size}
                                  onChange={(e) => update('mobile', v.key, 'size', e.target.value)}
                                  className="w-40 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900"
                                  placeholder="1rem"
                                />
                              </td>

                              <td className="py-4 pr-4">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={isHexColor(m.color) ? m.color : '#000000'}
                                    onChange={(e) => update('mobile', v.key, 'color', e.target.value)}
                                    className="h-10 w-14 rounded border border-slate-200 bg-white"
                                    aria-label={`${v.label} mobile kleur`}
                                    disabled={!isHexColor(m.color)}
                                    title={isHexColor(m.color) ? undefined : 'Gebruik hex (#rrggbb) of bewerk als tekst'}
                                  />
                                  <input
                                    type="text"
                                    value={m.color}
                                    onChange={(e) => update('mobile', v.key, 'color', e.target.value)}
                                    className="w-56 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono text-slate-900"
                                    placeholder="#0f172a of var(--typo-fg)"
                                    aria-label={`${v.label} mobile kleur (tekst)`}
                                  />
                                </div>
                              </td>

                              <td className="py-4 pr-4">
                                <input
                                  type="text"
                                  value={d.size}
                                  onChange={(e) => update('desktop', v.key, 'size', e.target.value)}
                                  className="w-40 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900"
                                  placeholder="1rem"
                                />
                              </td>

                              <td className="py-4 pr-4">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={isHexColor(d.color) ? d.color : '#000000'}
                                    onChange={(e) => update('desktop', v.key, 'color', e.target.value)}
                                    className="h-10 w-14 rounded border border-slate-200 bg-white"
                                    aria-label={`${v.label} desktop kleur`}
                                    disabled={!isHexColor(d.color)}
                                    title={isHexColor(d.color) ? undefined : 'Gebruik hex (#rrggbb) of bewerk als tekst'}
                                  />
                                  <input
                                    type="text"
                                    value={d.color}
                                    onChange={(e) => update('desktop', v.key, 'color', e.target.value)}
                                    className="w-56 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono text-slate-900"
                                    placeholder="#0f172a of var(--typo-fg)"
                                    aria-label={`${v.label} desktop kleur (tekst)`}
                                  />
                                </div>
                              </td>

                              <td className="py-4">
                                <div className="space-y-2">
                                  <div
                                    className="rounded-lg border border-slate-200 px-3 py-2"
                                    style={{ fontSize: m.size, color: m.color, fontWeight: v.key.startsWith('h') || v.key === 'display' ? 700 : 500 }}
                                  >
                                    Mobile — Voorbeeldtekst ({m.size}, {m.color})
                                  </div>
                                  <div
                                    className="rounded-lg border border-slate-200 px-3 py-2"
                                    style={{ fontSize: d.size, color: d.color, fontWeight: v.key.startsWith('h') || v.key === 'display' ? 700 : 500 }}
                                  >
                                    Desktop — Voorbeeldtekst ({d.size}, {d.color})
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Manual</h3>

                  <div className="space-y-3 text-sm text-slate-700">
                    <div>
                      <div className="font-semibold text-slate-900">Grootte (size)</div>
                      <div className="text-slate-600">
                        Je mag elke geldige CSS lengte gebruiken, bv. <span className="font-mono">16px</span>, <span className="font-mono">1rem</span>, <span className="font-mono">1.125rem</span>.
                      </div>
                      <div className="text-slate-600">
                        <span className="font-mono">rem</span> schaalt mee met de browser/OS toegankelijkheidsinstellingen (meestal fijner). <span className="font-mono">px</span> werkt ook prima als je liever exact werkt.
                      </div>
                    </div>

                    <div>
                      <div className="font-semibold text-slate-900">Kleur (color)</div>
                      <div className="text-slate-600">
                        Je kan een hex-kleur invullen (bv. <span className="font-mono">#0f172a</span>) of een CSS variable gebruiken.
                      </div>
                      <div className="text-slate-600">
                        Aanrader voor automatische dark mode: gebruik <span className="font-mono">var(--typo-fg)</span>, <span className="font-mono">var(--typo-muted)</span>, <span className="font-mono">var(--typo-subtle)</span>.
                        Die variabelen veranderen automatisch in dark mode.
                      </div>
                      <div className="text-slate-600">
                        De kleurpicker werkt alleen voor echte hex-kleuren; bij <span className="font-mono">var(...)</span> is hij bewust uitgeschakeld.
                      </div>
                    </div>

                    <div>
                      <div className="font-semibold text-slate-900">Toepassing in de app</div>
                      <div className="text-slate-600">
                        De globale styling wordt gezet via CSS-variables. Om het overal consistent te maken,
                        vervangen we stap voor stap losse Tailwind <span className="font-mono">text-*</span> classes door de <span className="font-mono">.t-*</span> labels.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
