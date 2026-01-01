import AdminLegalDocs from '@/app/admin/legal-documents/AdminLegalDocsClient'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import SuperAdminGuard from '@/components/admin/SuperAdminGuard'

export default function Page() {
  return (
    <SuperAdminGuard>
      <div className="min-h-screen bg-slate-50 overflow-x-auto">
        <SuperAdminSidebar />

        <div className="w-full min-w-0 sm:ml-64">
          <header className="bg-white border-b border-slate-200">
            <div className="px-4 sm:px-8 py-4 sm:py-6">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Legal Documents</h1>
                  <p className="text-sm text-slate-600">Beheer juridische documenten (alleen super_admins kunnen wijzigen)</p>
                </div>
              </div>
            </div>
          </header>

          <main className="px-4 sm:px-8 py-6 sm:py-8 w-full">
            <div className="max-w-7xl mx-auto">
              <div className="w-full overflow-x-auto">
                <AdminLegalDocs />
              </div>
            </div>
          </main>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
