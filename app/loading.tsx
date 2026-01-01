import { LoadingState } from '@/components/ui/LoadingState'

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <LoadingState label="Laden…" className="py-0" />
    </div>
  )
}
