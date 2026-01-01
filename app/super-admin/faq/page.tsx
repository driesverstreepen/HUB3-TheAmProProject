"use client"

import React from 'react'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import AdminFAQClient from '@/app/admin/faq/AdminFAQClient'
import SuperAdminGuard from '@/components/admin/SuperAdminGuard'

export default function SuperAdminFAQPage() {
  return (
    <SuperAdminGuard>
      <div className="min-h-screen bg-slate-50 overflow-x-auto">
        <SuperAdminSidebar />
        <div className="w-full min-w-0 sm:ml-64 p-4 sm:p-8">
          <header className="bg-white border-b border-slate-200 mb-6">
            <div className="px-4 sm:px-6 py-4 sm:py-6">
              <h1 className="text-2xl font-bold">FAQ Beheer</h1>
              <p className="text-sm text-slate-600">Beheer de veelgestelde vragen die op de publieke site verschijnen.</p>
            </div>
          </header>

          <main>
            <AdminFAQClient />
          </main>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
