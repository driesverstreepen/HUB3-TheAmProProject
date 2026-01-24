'use client'

import { useEffect, useMemo, useState } from 'react'
import ContentContainer from '@/components/ContentContainer'
import { supabase } from '@/lib/supabase'
import AmproPerformanceCard, { type AmproPerformanceCardModel } from '@/components/ampro/AmproPerformanceCard'

export default function AmproPublicPerformances({
  title = 'The AmProProject',
  subtitle = 'Powered by HUB3',
  showIntro = true,
}: {
  title?: string
  subtitle?: string
  showIntro?: boolean
}) {
  const renderSubtitle = (text: string) => {
    // Highlight any occurrence of "HUB3" with extra bold styling
    const parts = text.split(/(HUB3)/g)
    return parts.map((part, i) =>
      part === 'HUB3' ? (
        <span key={i} className="font-extrabold">
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      ),
    )
  }
  const [items, setItems] = useState<AmproPerformanceCardModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadUser = async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      setUserId(data?.session?.user?.id || null)
    }

    loadUser()

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadUser()
    })

    return () => {
      cancelled = true
      try {
        authListener?.subscription?.unsubscribe?.()
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error } = await supabase
          .from('ampro_programmas')
          .select('id,title,description,applications_open,application_deadline,rehearsal_period_start,rehearsal_period_end,performance_dates,region')
          .order('created_at', { ascending: false })

        if (error) throw error
        if (!cancelled) setItems((data || []) as any)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Kon voorstellingen niet laden')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const cards = useMemo(() => {
    return items.map((p) => {
      const applyPath = `/ampro/programmas/${encodeURIComponent(p.id)}/apply`
      const applyHref = userId ? applyPath : `/ampro/login?next=${encodeURIComponent(applyPath)}`
      return <AmproPerformanceCard key={p.id} performance={p} applyHref={applyHref} />
    })
  }, [items, userId])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 border-b border-slate-700">
        <ContentContainer className="py-8">
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl font-extrabold text-white! mb-2">{title}</h1>
              <p className="text-slate-200 text-lg mb-4">{renderSubtitle(subtitle)}</p>
              {showIntro ? (
                <div className="text-slate-200 text-sm">
                  Bekijk de programma’s en schrijf je in als danser.
                </div>
              ) : null}
            </div>
          </div>
        </ContentContainer>
      </div>

      <ContentContainer className="py-12">

        {loading ? <div className="mt-6 text-sm text-slate-600">Laden…</div> : null}
        {error ? <div className="mt-6 text-sm text-red-600">{error}</div> : null}

        {!loading && !error && items.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="text-xl font-semibold text-slate-900 mb-2">Nog geen programma’s</div>
            <p className="text-slate-600">Kom later terug.</p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">{cards}</div>
      </ContentContainer>
    </div>
  )
}
