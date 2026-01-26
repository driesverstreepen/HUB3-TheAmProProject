"use client"

import { useEffect } from 'react'
import Link from 'next/link'
import ContentContainer from '@/components/ContentContainer'

export default function StartPage() {
  
  // ... in je component ...
  useEffect(() => {
    // Pas de body-kleur aan naar de startkleur van je gradient (blue-700)
      document.body.style.backgroundColor = 'var(--color-blue-500)';

    const previousThemeColor =
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = '#1d4ed8'
    
    // Zet het terug naar de globals.css waarde als je de pagina verlaat
    return () => {
      document.body.style.backgroundColor = 'var(--color-slate-50)';

      const current = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      if (current) {
        if (previousThemeColor === null) current.remove()
        else current.content = previousThemeColor
      }
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center bg-blue-500 text-white">
      <div className="relative overflow-hidden w-full">
        <div className="">
          <ContentContainer>
            <div className="flex flex-col items-center text-center">
              <span className="text-6xl md:text-6xl font-extrabold leading-tight mb-2 text-white">
                HUB<span className="text-blue-700">3</span>
              </span>

              <span className="text-2xl md:text-3xl font-extrabold mb-6 opacity-90">Het next level <span className="text-blue-700">dansnetwerk</span></span>

              <p className="max-w-2xl text-slate-100 mb-20">Van beginners tot professionals. Ontdek studios, boek lessen en beheer alles op één plek.</p>

              <Link href="/signup" className="inline-flex items-center gap-3 bg-white text-blue-600 px-8 py-4 mb-4 rounded-full shadow-lg font-semibold hover:bg-blue-700 hover:text-gray-50 transition-colors">
                The AmProProject
                <span aria-hidden>→</span>
              </Link>
            </div>
          </ContentContainer>
        </div>
      </div>
    </div>
  )
}
