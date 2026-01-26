import { supabase } from '@/lib/supabase'

export type AmproRole = 'admin' | 'user'

export type AmproProfileRequiredFields = {
  first_name?: string | null
  last_name?: string | null
  birth_date?: string | null
  street?: string | null
  house_number?: string | null
  postal_code?: string | null
  city?: string | null
}

export function isAmproProfileComplete(profile: AmproProfileRequiredFields | null | undefined): boolean {
  const v = profile || {}
  const nonEmpty = (s: any) => typeof s === 'string' && s.trim().length > 0
  return (
    nonEmpty(v.first_name) &&
    nonEmpty(v.last_name) &&
    nonEmpty(v.birth_date) &&
    nonEmpty(v.street) &&
    nonEmpty(v.house_number) &&
    nonEmpty(v.postal_code) &&
    nonEmpty(v.city)
  )
}

export type AmproFormField =
  | {
      key: string
      label: string
      type: 'text' | 'textarea' | 'date'
      required?: boolean
      placeholder?: string
    }
  | {
      key: string
      label: string
      type: 'select'
      required?: boolean
      options: Array<{ label: string; value: string }>
    }
  | {
      key: string
      label: string
      type: 'checkbox'
      required?: boolean
    }
  | {
      key: string
      label: string
      type: 'title'
    }
  | {
      key: string
      label: string
      type: 'info'
      text?: string
    }

export function parseAmproFormFields(value: unknown): AmproFormField[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw: any) => {
      if (!raw || typeof raw !== 'object') return null
      if (typeof raw.key !== 'string' || typeof raw.label !== 'string' || typeof raw.type !== 'string') return null
      const type = raw.type as AmproFormField['type']

      if (type === 'title') {
        return {
          key: raw.key,
          label: raw.label,
          type,
        } as AmproFormField
      }

      if (type === 'info') {
        return {
          key: raw.key,
          label: raw.label,
          type,
          text: typeof raw.text === 'string' ? raw.text : undefined,
        } as AmproFormField
      }

      if (type === 'select') {
        const options = Array.isArray(raw.options)
          ? raw.options
              .map((o: any) =>
                o && typeof o.label === 'string' && typeof o.value === 'string' ? { label: o.label, value: o.value } : null,
              )
              .filter(Boolean)
          : []
        return {
          key: raw.key,
          label: raw.label,
          type,
          required: Boolean(raw.required),
          options,
        } as AmproFormField
      }

      if (type === 'checkbox') {
        return {
          key: raw.key,
          label: raw.label,
          type,
          required: Boolean(raw.required),
        } as AmproFormField
      }

      if (type === 'text' || type === 'textarea' || type === 'date') {
        return {
          key: raw.key,
          label: raw.label,
          type,
          required: Boolean(raw.required),
          placeholder: typeof raw.placeholder === 'string' ? raw.placeholder : undefined,
        } as AmproFormField
      }

      return null
    })
    .filter(Boolean) as AmproFormField[]
}

export async function requireAmproSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const user = data?.session?.user
  if (!user) throw new Error('NOT_AUTHENTICATED')
  return user
}

export async function getMyAmproRole(): Promise<AmproRole | null> {
  const { data, error } = await supabase
    .from('ampro_user_roles')
    .select('role')
    .maybeSingle()

  if (error) return null
  const role = (data as any)?.role

  // Backwards compatible: older DBs may still have role = 'dancer'.
  if (role === 'dancer') return 'user'

  return role === 'admin' || role === 'user' ? role : null
}

export async function isAmproAdmin(): Promise<boolean> {
  const role = await getMyAmproRole()
  return role === 'admin'
}
