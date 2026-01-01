export function getStudioPermissionKeyForPath(studioId: string | undefined, pathname: string | null): string | null {
  if (!studioId || !pathname) return null

  const base = `/studio/${studioId}`
  if (!pathname.startsWith(base)) return null

  const rest = pathname.slice(base.length) || '/'

  // Most specific first
  if (rest.startsWith('/settings')) return 'studio.settings'
  if (rest.startsWith('/finance')) return 'studio.finance'
  if (rest.startsWith('/emails')) return 'studio.emails'
  if (rest.startsWith('/notes')) return 'studio.notes'
  if (rest.startsWith('/members')) return 'studio.members'
  if (rest.startsWith('/evaluations')) return 'studio.evaluations'
  if (rest.startsWith('/attendance')) return 'studio.attendance'
  if (rest.startsWith('/replacements')) return 'studio.replacements'
  if (rest.startsWith('/class-passes')) return 'studio.class-passes'
  if (rest.startsWith('/lessons')) return 'studio.lessons'
  if (rest.startsWith('/programs')) return 'studio.programs'
  if (rest.startsWith('/public-profile')) return 'studio.public-profile'
  if (rest.startsWith('/profile')) return 'studio.profile'

  // Dashboard default
  if (rest === '/' || rest === '') return 'studio.dashboard'

  // Unknown studio subpage => conservative: require settings permission
  return 'studio.settings'
}
