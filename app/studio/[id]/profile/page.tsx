import StudioProfilePage from '@/components/StudioProfilePage'
import { FeatureGate } from '@/components/FeatureGate'

interface Props {
  params: { id: string } | Promise<{ id: string }>
}

export default async function StudioProfilePageWrapper({ params }: Props) {
  const resolvedParams = await Promise.resolve(params)
  const studioId = resolvedParams.id
  return (
    <FeatureGate flagKey="studio.profile" mode="page">
      <div className="max-w-3xl mx-auto">
        <StudioProfilePage studioId={studioId} />
      </div>
    </FeatureGate>
  )
}
