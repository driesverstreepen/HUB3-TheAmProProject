import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import SuperAdminGuard from '@/components/admin/SuperAdminGuard'
import SuperAdminMobileUiToggle from '@/components/admin/SuperAdminMobileUiToggle'

export default function SuperAdminSettingsPage() {
  return (
    <SuperAdminGuard>
      <div className="min-h-screen bg-slate-50 overflow-x-auto">
        <SuperAdminSidebar />

        <div className="w-full min-w-0 sm:ml-64">
          <header className="bg-white border-b border-slate-200">
            <div className="px-4 sm:px-8 py-4 sm:py-6">
              <h1 className="text-2xl font-bold text-slate-900">Platform Settings</h1>
              <p className="text-sm text-slate-600">Instellingen voor het platform</p>
            </div>
          </header>

          <main className="px-4 sm:px-8 py-6 sm:py-8">
            <div className="space-y-6">
              <SuperAdminMobileUiToggle />

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <p className="text-slate-600">Overige platform settings: coming soon.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
