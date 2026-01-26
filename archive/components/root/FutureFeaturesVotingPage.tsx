"use client"

import { useEffect, useMemo, useState } from 'react'
import ContentContainer from '@/components/ContentContainer'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { supabase } from '@/lib/supabase'

type InterfaceType = 'user' | 'studio'

type FutureFeatureRow = {
  id: string
  interface: InterfaceType
  title: string
  description: string | null
  vote_count: number
  created_at: string
}

type Props = {
  interfaceType: InterfaceType
}

export default function FutureFeaturesVotingPage({ interfaceType }: Props) {
  const [loading, setLoading] = useState(true)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [features, setFeatures] = useState<FutureFeatureRow[]>([])
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)

  const title = useMemo(() => {
    return interfaceType === 'studio' ? 'Future features (Studio)' : 'Future features'
  }, [interfaceType])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      const { data: authData } = await supabase.auth.getUser()
      const user = authData?.user
      if (!user) {
        if (!cancelled) {
          setNeedsLogin(true)
          setFeatures([])
          setVotedIds(new Set())
          setLoading(false)
        }
        return
      }

      setNeedsLogin(false)

      const { data: ffRows, error: ffErr } = await supabase
        .from('future_features')
        .select('id, interface, title, description, vote_count, created_at')
        .eq('interface', interfaceType)
        .order('created_at', { ascending: false })

      if (ffErr) {
        if (!cancelled) {
          setError(ffErr.message)
          setFeatures([])
          setVotedIds(new Set())
          setLoading(false)
        }
        return
      }

      const nextFeatures = (ffRows ?? []) as FutureFeatureRow[]

      const featureIds = nextFeatures.map((f) => f.id)
      let voted = new Set<string>()

      if (featureIds.length > 0) {
        const { data: voteRows, error: voteErr } = await supabase
          .from('future_feature_votes')
          .select('feature_id')
          .in('feature_id', featureIds)
          .eq('user_id', user.id)

        if (!voteErr && voteRows) {
          voted = new Set((voteRows as any[]).map((r) => String(r.feature_id)))
        }
      }

      if (!cancelled) {
        setFeatures(nextFeatures)
        setVotedIds(voted)
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [interfaceType])

  const vote = async (featureId: string) => {
    if (votedIds.has(featureId)) return

    setVotingId(featureId)
    setError(null)

    const { data: count, error: voteErr } = await supabase.rpc('vote_future_feature', {
      p_feature_id: featureId,
    })

    if (voteErr) {
      setVotingId(null)
      setError(voteErr.message)
      return
    }

    setFeatures((prev) =>
      prev.map((f) => (f.id === featureId ? { ...f, vote_count: typeof count === 'number' ? count : f.vote_count + 1 } : f))
    )
    setVotedIds((prev) => new Set([...Array.from(prev), featureId]))
    setVotingId(null)
  }

  return (
    <ContentContainer className="py-10">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">
          Stem anoniem op features die je graag in deze interface zou zien. Elke gebruiker kan 1 keer stemmen per feature.
        </p>

        {needsLogin ? (
          <div className="mt-6 p-4 border border-slate-200 rounded-lg bg-white text-slate-700">
            Log in om te kunnen stemmen.
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 p-4 border border-red-200 rounded-lg bg-white text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="mt-6 text-slate-600 flex items-center gap-2">
            <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
            <span>Laden…</span>
          </div>
        ) : features.length === 0 ? (
          <div className="mt-6 p-4 border border-slate-200 rounded-lg bg-white text-slate-700">
            Er zijn nog geen future features toegevoegd.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {features.map((f) => {
              const hasVoted = votedIds.has(f.id)
              const isVoting = votingId === f.id

              return (
                <div key={f.id} className="p-4 border border-slate-200 rounded-lg bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{f.title}</div>
                      {f.description ? <div className="mt-1 text-sm text-slate-600">{f.description}</div> : null}
                      <div className="mt-3 text-sm text-slate-600">Stemmen: {f.vote_count}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => vote(f.id)}
                      disabled={needsLogin || hasVoted || isVoting}
                      className={
                        hasVoted
                          ? 'px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-500 bg-slate-50 cursor-not-allowed'
                          : 'px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 active:bg-blue-700 active:border-blue-700'
                      }
                      aria-label={hasVoted ? 'Je hebt al gestemd' : 'Stem op deze feature'}
                    >
                      {hasVoted ? 'Gestemd' : isVoting ? 'Stemmen…' : 'Stem'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </ContentContainer>
  )
}
