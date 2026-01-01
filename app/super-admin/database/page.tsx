import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import SuperAdminGuard from '@/components/admin/SuperAdminGuard'

export default function SuperAdminDatabasePage() {
  return (
    <SuperAdminGuard>
      <div className="min-h-screen bg-slate-50 overflow-x-auto">
        <SuperAdminSidebar />

        <div className="w-full min-w-0 sm:ml-64">
          <header className="bg-white border-b border-slate-200">
            <div className="px-4 sm:px-8 py-4 sm:py-6">
              <h1 className="text-2xl font-bold text-slate-900">Database</h1>
              <p className="text-sm text-slate-600">Database tools (coming soon)</p>
            </div>
          </header>

          <main className="px-4 sm:px-8 py-6 sm:py-8">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <p className="text-slate-600">Coming soon.</p>
            </div>
          </main>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
