const AVATAR_COLORS = [
  '#7c3aed', '#e03e6a', '#2563eb', '#0891b2', '#059669',
  '#d97706', '#dc2626', '#7c3aed', '#4f46e5', '#0d9488',
]

/** A stable color for a name, so the same user always gets the same avatar tint. */
export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
