"use client"

import React from 'react'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import AdminFAQClient from './AdminFAQClient'

export default function AdminFAQPage() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <SuperAdminSidebar />
      <div className="flex-1 ml-64 p-8">
        <header className="bg-white border-b border-slate-200 mb-6">
          <div className="px-6 py-6">
            <h1 className="text-2xl font-bold">FAQ Beheer</h1>
            <p className="text-sm text-slate-600">Beheer de veelgestelde vragen die op de publieke site verschijnen.</p>
          </div>
        </header>

        <main>
          <AdminFAQClient />
        </main>
      </div>
    </div>
  )
}
