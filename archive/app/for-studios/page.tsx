'use client'

import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

export default function ForStudiosPage() {
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags()

  const flagKey = 'welcome.for-studios'
  const hidden = isHidden(flagKey, false)
  const enabled = isEnabled(flagKey, true)

  // The dedicated Studio welcome page was removed. When the feature flag
  // is enabled we show a static hero explaining availability instead.
  if (enabled) {
    const label = getComingSoonLabel(flagKey)
    return (
      <div className="min-h-screen bg-slate-50 overflow-x-hidden">
        <div className="relative bg-linear-to-br from-blue-600 via-blue-700 to-blue-900 text-white overflow-hidden min-h-[60vh] flex items-center">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-white to-transparent" />

          <div className="relative w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 text-center">
            <div className="text-sm font-medium text-white/80">{label}</div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold leading-tight text-white">Voor studio’s komt binnenkort</h1>
            <p className="mt-4 text-slate-100">Deze feature staat wel zichtbaar, maar is nog in ontwikkeling.</p>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-slate-50 to-transparent" />
        </div>
      </div>
    )
  }

  if (hidden) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl p-6">
          <div className="mt-2 text-lg font-semibold text-slate-900">Voor studios komt binnenkort</div>
          <p className="mt-2 text-slate-600">Deze pagina is niet beschikbaar.</p>
        </div>
      </div>
    )
  }

  return null
}
