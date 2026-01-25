import Link from 'next/link'
import ContentContainer from '@/components/ContentContainer'
import AmproPublicPerformances from '@/components/ampro/AmproPublicPerformances'

export default function StartPage() {
  return (
    <div className="min-h-screen flex items-center bg-blue-500 text-white">
      <div className="relative overflow-hidden w-full">
        <div className="">
          <ContentContainer>
            <div className="flex flex-col items-center text-center">
              <span className="text-6xl md:text-6xl font-extrabold leading-tight mb-2 text-white">
                HUB<span className="text-blue-800">3</span>
              </span>

              <span className="text-2xl md:text-3xl font-extrabold mb-6 opacity-90">Het next level <span className="text-blue-800">dansnetwerk</span></span>

              <p className="max-w-2xl text-slate-100 mb-20">Van beginners tot professionals. Ontdek studios, boek lessen en beheer alles op één plek.</p>

              <Link href="/signup" className="inline-flex items-center gap-3 bg-white text-blue-600 px-8 py-4 rounded-full shadow-xl font-semibold hover:scale-105 transition-transform">
                Aan de slag
                <span aria-hidden>→</span>
              </Link>
            </div>
          </ContentContainer>
        </div>
      </div>
    </div>
  )
}
