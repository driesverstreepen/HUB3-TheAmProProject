import Link from 'next/link'
import ContentContainer from '@/components/ContentContainer'

export default function StartPage() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-transparent text-white">
      <div className="h-full w-full flex items-center justify-center">
        <div className="relative overflow-hidden w-full">
        <ContentContainer>
          <div className="flex flex-col items-center text-center px-4 py-10 sm:py-12 md:py-14">
            <span className="text-6xl md:text-6xl font-extrabold leading-tight mb-2 text-zinc-950 dark:text-white!">
              HUB<span className="text-blue-600">3</span>
            </span>

            <span className="text-2xl md:text-3xl text-zinc-950 dark:text-white! font-extrabold mb-6 opacity-90">
              Het next level <span className="text-blue-600 dark:text-blue-600!">dansnetwerk</span>
            </span>

            <p className="max-w-2xl text-zinc-900 dark:text-white! mb-10 md:mb-12">
              Van beginners tot professionals. Ontdek programma’s en schrijf je in als danser.
            </p>

            <Link
              href="/ampro"
              className="inline-flex items-center gap-3 bg-blue-600! text-white! px-8 py-4 mb-4 rounded-full shadow-3xl font-semibold hover:bg-blue-700 hover:text-gray-50 transition-colors"
            >
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
