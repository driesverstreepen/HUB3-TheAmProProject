'use client'

import { useRouter } from 'next/navigation'
import ProgramDetailModal from '@/components/ProgramDetailModal'

export default function DashboardProgramDetailPage({ params }: { params: { programId: string } }) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <ProgramDetailModal
          isOpen={true}
          onClose={() => router.back()}
          programId={params.programId}
          view="user"
          renderMode="page"
        />
      </div>
    </div>
  )
}
