export const REQUIRED_PROFILE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'street',
  'house_number',
  // house_number_addition is optional
  'postal_code',
  'city',
  'date_of_birth',
]

export function missingProfileFields(snapshot: Record<string, any> | null | undefined) {
  const missing: string[] = []
  const s = snapshot || {}
  for (const f of REQUIRED_PROFILE_FIELDS) {
    const v = s[f]
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      missing.push(f)
    }
  }
  return missing
}

export const FIELD_LABELS: Record<string, string> = {
  first_name: 'Voornaam',
  last_name: 'Achternaam',
  email: 'E-mailadres',
  phone_number: 'Telefoonnummer',
  street: 'Straat',
  house_number: 'Huisnummer',
  house_number_addition: 'Toevoeging',
  postal_code: 'Postcode',
  city: 'Plaats',
  date_of_birth: 'Geboortedatum',
}

export function profileFieldLabel(key: string) {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ')
}

export function isProfileComplete(snapshot: Record<string, any> | null | undefined) {
  return missingProfileFields(snapshot).length === 0
}

export default {
  REQUIRED_PROFILE_FIELDS,
  missingProfileFields,
  isProfileComplete,
}
