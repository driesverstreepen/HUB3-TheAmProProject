'use client';

import { usePathname } from 'next/navigation';
import { PublicFooter } from '@/components/PublicFooter';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';

export default function Navigation() {
  const pathname = usePathname();
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags();

  // Only show navigation on the welcome page (root path)
  // On all other pages (including studio pages), don't show anything
  if (pathname !== '/') {
    return null;
  }

  return (
    <>
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="shrink-0 flex items-center">
                <a href="/" className="t-h3 font-bold text-blue-600">
                  HUB3
                </a>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {(() => {
                  if (isHidden('welcome.studios', false)) return null
                  const disabled = !isEnabled('welcome.studios', true)
                  const badge = getComingSoonLabel('welcome.studios', 'Soon')
                  return disabled ? (
                    <div className="inline-flex items-center gap-2 px-1 pt-1 t-label font-medium text-gray-400 cursor-not-allowed">
                      <span>Studios</span>
                      <span className="t-caption bg-slate-100 px-2 py-0.5 rounded">{badge}</span>
                    </div>
                  ) : (
                    <a
                      href="/studio"
                      className="border-transparent inline-flex items-center px-1 pt-1 border-b-2 t-label font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    >
                      Studios
                    </a>
                  )
                })()}
                {(() => {
                  if (isHidden('welcome.programmas', false)) return null
                  const disabled = !isEnabled('welcome.programmas', true)
                  const badge = getComingSoonLabel('welcome.programmas', 'Soon')
                  return disabled ? (
                    <div className="inline-flex items-center gap-2 px-1 pt-1 t-label font-medium text-gray-400 cursor-not-allowed">
                      <span>Programma&apos;s</span>
                      <span className="t-caption bg-slate-100 px-2 py-0.5 rounded">{badge}</span>
                    </div>
                  ) : (
                    <a
                      href="/programmas"
                      className="border-transparent inline-flex items-center px-1 pt-1 border-b-2 t-label font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    >
                      Programma&apos;s
                    </a>
                  )
                })()}
              </div>
            </div>
              <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-2">
              {(() => {
                if (isHidden('auth.login', false)) return null
                const disabled = !isEnabled('auth.login', true)
                const badge = getComingSoonLabel('auth.login', 'Soon')
                return disabled ? (
                  <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md t-label font-medium text-gray-400 cursor-not-allowed">
                    <span>Inloggen</span>
                    <span className="t-caption bg-slate-100 px-2 py-0.5 rounded">{badge}</span>
                  </div>
                ) : (
                  <a
                    href="/auth/login"
                    className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md t-label font-medium"
                  >
                    Inloggen
                  </a>
                )
              })()}
              {(() => {
                if (isHidden('auth.signup', false)) return null
                const disabled = !isEnabled('auth.signup', true)
                const badge = getComingSoonLabel('auth.signup', 'Soon')
                return disabled ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md t-label font-medium text-gray-400 cursor-not-allowed border border-slate-200">
                    <span>Registreer</span>
                    <span className="t-caption bg-slate-100 px-2 py-0.5 rounded">{badge}</span>
                  </div>
                ) : (
                  <a
                    href="/auth/registreer"
                    className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md t-button font-medium"
                  >
                    Registreer
                  </a>
                )
              })()}
            </div>
          </div>
        </div>
      </nav>
      <PublicFooter />
    </>
  );
}