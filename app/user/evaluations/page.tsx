'use client'

import UserSidebar from '@/components/user/UserSidebar'
import UserEvaluationsTab from '@/components/user/UserEvaluationsTab'

export default function UserEvaluationsPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <UserSidebar />
      <div className="flex-1">
        <UserEvaluationsTab />
      </div>
    </div>
  )
}
