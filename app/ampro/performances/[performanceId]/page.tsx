import { redirect } from 'next/navigation'

export default function AmproPerformanceDetailPage({ params }: { params: { performanceId: string } }) {
  redirect(`/ampro/programmas/${encodeURIComponent(params.performanceId)}`)
}
