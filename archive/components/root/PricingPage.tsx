'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { PRICING, getYearlySavings, type SubscriptionTier, type SubscriptionPeriod } from '@/types/subscription'

interface PricingCardProps {
  tier: SubscriptionTier
  period: SubscriptionPeriod
  currentTier?: SubscriptionTier
  onSelect: (_tier: SubscriptionTier) => void
  popular?: boolean
  marketing?: boolean
}

export function PricingCard({ tier, period, currentTier, onSelect, popular, marketing = false }: PricingCardProps) {
  const config = PRICING[tier]
  const price = config[period]
  const isCurrent = currentTier === tier
  const savings = period === 'yearly' ? getYearlySavings(tier) : 0
  const yearlyPrice = config.yearly
  const yearlySavings = getYearlySavings(tier)

  const cardClassName = (() => {
    if (popular) {
      return 'bg-white rounded-2xl shadow-xl p-8 border-2 border-blue-600 relative hover:shadow-2xl transition-all flex flex-col'
    }
    if (isCurrent) {
      return 'bg-white rounded-2xl shadow-lg p-8 border-2 border-green-500 transition-all flex flex-col'
    }
    return 'bg-white rounded-2xl shadow-lg p-8 border-2 border-slate-200 hover:border-blue-300 transition-all flex flex-col'
  })()

  return (
    <div className={cardClassName}>
      {popular && (
        <div className={`${marketing ? 'm-caption' : 'text-sm'} absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full font-semibold`}>
          Meest gekozen
        </div>
      )}
      
      {isCurrent && (
        <div className={`${marketing ? 'm-caption' : 'text-sm'} absolute -top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-1 rounded-full font-semibold`}>
          Huidig Plan
        </div>
      )}

      <div className="text-center mb-6">
        <h3 className={`${marketing ? 'm-cardTitle' : 'text-2xl'} font-bold text-slate-900 mb-2`}>{config.name}</h3>
        <div className="flex items-baseline justify-center gap-1">
          <span className={`${marketing ? 'm-sectionTitle' : 'text-4xl'} font-bold text-slate-900`}>€{price}</span>
          <span className="text-slate-600">/{period === 'monthly' ? 'maand' : 'jaar'}</span>
        </div>

        {period === 'monthly' && yearlyPrice && yearlySavings > 0 && (
          <p className={`${marketing ? 'm-bodySm' : 'text-sm'} text-green-600 font-medium mt-2`}>
            of €{yearlyPrice}/jaar (bespaar €{yearlySavings})
          </p>
        )}

        {period === 'yearly' && savings > 0 && (
          <p className={`${marketing ? 'm-bodySm' : 'text-sm'} text-green-600 font-medium mt-2`}>
            Bespaar €{savings}/jaar
          </p>
        )}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {config.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <span className={`${marketing ? 'm-bodySm' : 'text-sm'} text-slate-700`}>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(tier)}
        disabled={isCurrent}
        className={`${marketing ? 'm-button ' : ''}w-full py-3 px-6 rounded-lg font-medium transition-all ${
          isCurrent
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : popular
            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
            : 'bg-slate-100 text-slate-900 hover:bg-slate-200 font-semibold'
        }`}
      >
        {isCurrent ? 'Huidig Plan' : 'Selecteer Plan'}
      </button>
    </div>
  )
}

interface PricingPageProps {
  studioId?: string
  currentTier?: SubscriptionTier
  onSelectPlan?: (_tier: SubscriptionTier, _period: SubscriptionPeriod) => void
  isPublic?: boolean
}

export default function PricingPage({ currentTier, onSelectPlan, isPublic = false }: PricingPageProps) {
  const [period, setPeriod] = useState<SubscriptionPeriod>('monthly')
  const router = useRouter()

  const handleSelectPlan = (tier: SubscriptionTier, period: SubscriptionPeriod) => {
    if (onSelectPlan) {
      onSelectPlan(tier, period)
    } else if (isPublic) {
      // Redirect to signup page for public users
      router.push(`/?signup=studio&plan=${tier}&period=${period}`)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className={`${isPublic ? 'm-sectionTitle' : 'text-4xl'} font-bold text-slate-900 mb-4`}>
          Kies het juiste plan voor jouw studio
        </h1>
        <p className={`${isPublic ? 'm-bodyLg' : 'text-xl'} text-slate-600 mb-8`}>
          Transparante prijzen. Geen verborgen kosten. Altijd opzegbaar.
        </p>
        <p className={`${isPublic ? 'm-bodySm' : 'text-sm'} text-slate-500 mb-8`}>
          💡 Reguliere gebruikers hebben altijd gratis toegang tot de HUB3
        </p>

        {/* Period Toggle */}
        <div className="inline-flex items-center gap-3 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setPeriod('monthly')}
            className={`px-6 py-2 rounded-md font-medium transition-all ${
              period === 'monthly'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Maandelijks
          </button>
          <button
            onClick={() => setPeriod('yearly')}
            className={`px-6 py-2 rounded-md font-medium transition-all ${
              period === 'yearly'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Jaarlijks
            <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Bespaar tot €60
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8 mb-12">
        <PricingCard
          tier="basic"
          period={period}
          currentTier={currentTier}
          onSelect={(tier) => handleSelectPlan(tier, period)}
          marketing={isPublic}
        />
        <PricingCard
          tier="plus"
          period={period}
          currentTier={currentTier}
          onSelect={(tier) => handleSelectPlan(tier, period)}
          marketing={isPublic}
        />
        <PricingCard
          tier="pro"
          period={period}
          currentTier={currentTier}
          onSelect={(tier) => handleSelectPlan(tier, period)}
          popular
          marketing={isPublic}
        />
      </div>

      {/* FAQ Section */}
      <div className="mt-16 border-t pt-12">
        <h2 className={`${isPublic ? 'm-kpi' : 'text-2xl'} font-bold text-slate-900 mb-6 text-center`}>
          Veelgestelde vragen
        </h2>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div>
            <h3 className={`${isPublic ? 'm-bodyLg' : ''} font-semibold text-slate-900 mb-2`}>
              Kan ik later van plan wisselen?
            </h3>
            <p className={`${isPublic ? 'm-bodySm' : 'text-sm'} text-slate-600`}>
              Ja, je kunt altijd upgraden of downgraden. Bij een upgrade betaal je direct het verschil. Bij een downgrade gaat de wijziging in bij de volgende factuurperiode.
            </p>
          </div>
          <div>
            <h3 className={`${isPublic ? 'm-bodyLg' : ''} font-semibold text-slate-900 mb-2`}>
              Is er een proefperiode?
            </h3>
            <p className={`${isPublic ? 'm-bodySm' : 'text-sm'} text-slate-600`}>
              Ja! Nieuwe studio's krijgen automatisch 14 dagen gratis toegang tot alle Pro features om de platform te verkennen.
            </p>
          </div>
          <div>
            <h3 className={`${isPublic ? 'm-bodyLg' : ''} font-semibold text-slate-900 mb-2`}>
              Moet ik mijn creditcard opgeven voor de trial?
            </h3>
            <p className={`${isPublic ? 'm-bodySm' : 'text-sm'} text-slate-600`}>
              Nee, de 14-dagen trial is volledig gratis zonder creditcard. Na afloop kun je een plan kiezen.
            </p>
          </div>
          <div>
            <h3 className={`${isPublic ? 'm-bodyLg' : ''} font-semibold text-slate-900 mb-2`}>
              Betalen mijn leden ook?
            </h3>
            <p className={`${isPublic ? 'm-bodySm' : 'text-sm'} text-slate-600`}>
              Nee! Reguliere gebruikers hebben altijd gratis toegang tot de HUB3 om studio's te ontdekken en zich in te schrijven. Alleen studio eigenaren betalen voor management features.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
