import Link from 'next/link'
import ContentContainer from '@/components/ContentContainer'
import AmproPublicPerformances from '@/components/ampro/AmproPublicPerformances'

export default function StartPage() {
  return (
    <div className="min-h-screen bg-blue-500 text-white">
      <div className="relative overflow-hidden">
        <div className="py-20">
          <ContentContainer>
            <div className="flex flex-col items-center text-center">
              <div className="w-32 h-32 bg-white/90 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <span className="text-3xl font-extrabold text-blue-600">HB</span>
              </div>

              <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-2">
                HUB<span className="text-blue-800">3</span>
              </h1>

              <h2 className="text-2xl md:text-3xl font-extrabold mb-6 opacity-90">Het next level <span className="text-blue-800">dansnetwerk</span></h2>

              <p className="max-w-2xl text-slate-100 mb-8">Van beginners tot professionals. Ontdek studios, boek lessen en beheer alles op één plek.</p>

              <Link href="/signup" className="inline-flex items-center gap-3 bg-white text-blue-600 px-8 py-4 rounded-full shadow-xl font-semibold hover:scale-105 transition-transform">
                Aan de slag
                <span aria-hidden>→</span>
              </Link>

              <p className="text-sm text-white/80 mt-6 max-w-md">Door verder te gaan ga je akkoord met onze <Link href="/terms-of-service" className="underline">Voorwaarden</Link> en <Link href="/privacy-policy" className="underline">Privacybeleid</Link>.</p>
            </div>
          </ContentContainer>
        </div>
      </div>
    </div>
  )
}
