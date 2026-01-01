import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'

export default async function AmproAdminLayout({ children }: { children: React.ReactNode }) {
  const modeRaw = (process.env.APP_MODE || process.env.NEXT_PUBLIC_APP_MODE || 'hub3') as string
  const mode = modeRaw.trim().toLowerCase()

  // Hard block outside AmPro mode.
  if (mode !== 'ampro') {
    redirect('/')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_AMPRO_SUPABASE_URL || ''
  const supabaseAnonKey = process.env.NEXT_PUBLIC_AMPRO_SUPABASE_ANON_KEY || ''
  if (!supabaseUrl || !supabaseAnonKey) {
    redirect('/ampro')
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: '', ...options })
      },
    },
  })

  const { data } = await supabase.auth.getSession()
  const user = data?.session?.user
  if (!user) {
    redirect('/ampro/login?next=/ampro/admin')
  }

  // RLS should ensure only own role row is visible.
  const { data: roleRow } = await supabase.from('ampro_user_roles').select('role').maybeSingle()
  if ((roleRow as any)?.role !== 'admin') {
    redirect('/ampro')
  }

  return <>{children}</>
}
