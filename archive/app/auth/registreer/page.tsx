"use client"

import SignUpPage from './SignUpPage'
import { NotificationProvider } from '@/contexts/NotificationContext'

export default function RegisterPageWrapper() {
  return (
    <NotificationProvider>
      <SignUpPage />
    </NotificationProvider>
  )
}
