import type { Metadata } from 'next'

// Only on /start: force a HUB3-blue notch/statusbar color.
export const metadata: Metadata = {
  themeColor: '#2563eb',
}

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children
}
