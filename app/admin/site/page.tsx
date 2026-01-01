import AdminSiteClient from './AdminSiteClient'
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
                <h1 className="text-2xl font-bold text-slate-900">Site instellingen</h1>
                <p className="text-sm text-slate-600">Beheer logo, support e-mail en welkomsttekst</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-8 py-8 w-full">
          <div className="max-w-4xl mx-auto">
            <AdminSiteClient />
          </div>
        </main>
      </div>
    </div>
  )
}
