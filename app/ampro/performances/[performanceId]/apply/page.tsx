import { redirect } from 'next/navigation'

export default function AmproApplyPage({ params }: { params: { performanceId: string } }) {
  redirect(`/ampro/programmas/${encodeURIComponent(params.performanceId)}/apply`)
}
