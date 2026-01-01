import FormsManagement from '../FormsClient';
import { FeatureGate } from '@/components/FeatureGate';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const resolvedParams = await params;
  const studioId = resolvedParams?.id || '';
  if (studioId) {
    redirect(`/studio/${studioId}/settings?tab=forms`);
  }
  return (
    <FeatureGate flagKey="studio.settings" mode="page">
      <FormsManagement studioId={studioId} />
    </FeatureGate>
  );
}
