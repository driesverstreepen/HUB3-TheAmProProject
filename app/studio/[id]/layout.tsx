import StudioLayoutShell from '@/components/studio/StudioLayoutShell'

interface StudioLayoutProps {
  children: React.ReactNode;
  // Next's LayoutProps generic can include params as a resolved or unresolved
  // value depending on route handlers; accept any to avoid strict mismatch
  params: any;
}

export default async function StudioLayout({ children, params }: StudioLayoutProps) {
  // `params` can be a Promise in Next.js; await it to get the actual values.
  const resolvedParams: any = await params;
  const id = resolvedParams?.id;

  return (
    <StudioLayoutShell studioId={id}>{children}</StudioLayoutShell>
  );
}
