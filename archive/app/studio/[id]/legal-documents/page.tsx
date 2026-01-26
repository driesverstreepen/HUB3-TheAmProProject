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

        {/* The admin client has been archived in this trimmed deployment. */}
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm text-slate-700 mb-2">Beleidsdocumenten beheer is niet beschikbaar in deze omgeving.</div>
          <div className="text-xs text-slate-500">Neem contact op met de beheerder als je documenten wilt aanpassen.</div>
        </div>
      </div>
    </FeatureGate>
  )
}
