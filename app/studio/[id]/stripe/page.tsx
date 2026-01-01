import { redirect } from 'next/navigation'

export default function Page({ params }: { params: { id: string } }) {
  // Redirect to the settings page (payments are now part of the settings tab)
  redirect(`/studio/${params.id}/settings`)
}
