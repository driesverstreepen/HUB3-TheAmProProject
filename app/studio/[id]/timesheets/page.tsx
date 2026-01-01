import { redirect } from 'next/navigation'

export default function TimesheetsPage({ params }: { params: { id: string } }) {
  redirect(`/studio/${params.id}/finance`)
}
