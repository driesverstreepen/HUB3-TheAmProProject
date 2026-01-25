import React from 'react'
import AdminLegalDocs from '@/archive/app/admin/legal-documents/AdminLegalDocsClient'

export default function AdminLegalDocsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Beheer documenten</h1>
      <AdminLegalDocs />
    </div>
  )
}
