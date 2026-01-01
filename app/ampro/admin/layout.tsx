import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'

export default async function AmproAdminLayout({ children }: { children: React.ReactNode }) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
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
