import AdminLegalDocs from '@/app/admin/legal-documents/AdminLegalDocsClient'
import { FeatureGate } from '@/components/FeatureGate'

interface PageProps {
  params: Promise<{ id: string }>
}

// Server wrapper so the page renders inside the studio admin layout/sidebar
export default async function StudioLegalDocsPage({ params }: PageProps) {
  // resolved studio id is available but the AdminLegalDocs client currently
  // manages global `legal_documents` and does not require the studio id.
  // Keeping the param handling here for future per-studio scoping.
  await params

  return (
    <FeatureGate flagKey="studio.legal-documents" mode="page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Beleidsdocumenten</h1>
        <p className="text-sm text-slate-600 mb-6">Hier kun je de applicatie Privacy Policy en Terms &amp; Conditions beheren.</p>

        {/* Reuse the existing admin client used by global admin screens */}
        {/* This component uses the Supabase client to list/create legal_documents */}
        <AdminLegalDocs />
      </div>
    </FeatureGate>
  )
}
