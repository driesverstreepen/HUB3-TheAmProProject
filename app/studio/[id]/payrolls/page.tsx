import { redirect } from 'next/navigation'

export default function PayrollsPage({ params }: { params: { id: string } }) {
  redirect(`/studio/${params.id}/finance`)
}

