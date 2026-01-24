import AdminLegalDocs from './AdminLegalDocsClient'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'

export default function Page() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <SuperAdminSidebar />

      <div className="flex-1 ml-64">
        <header className="bg-white border-b border-slate-200">
          <div className="px-8 py-6">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Legal Documents</h1>
                <p className="text-sm text-slate-600">Beheer juridische documenten (alleen super_admins kunnen wijzigen)</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-8 py-8 w-full">
          <div className="max-w-7xl mx-auto">
            <AdminLegalDocs />
          </div>
        </main>
      </div>
    </div>
  )
}
