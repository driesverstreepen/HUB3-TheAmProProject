import SettingsClient from './SettingsClient';
import { FeatureGate } from '@/components/FeatureGate';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Server wrapper: extract studio id and render the client SettingsClient which
// contains tabs (Features, Locations, Forms, Payments)
export default async function Page({ params }: PageProps) {
  const resolvedParams = await params;
  const studioId = resolvedParams?.id || '';
  return (
    <FeatureGate flagKey="studio.settings" mode="page">
      <SettingsClient studioId={studioId} />
    </FeatureGate>
  );
}
