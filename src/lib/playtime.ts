// Minecraft records play time in ticks (20 ticks = 1 second).
const TICKS_PER_SECOND = 20

/** Format a tick count as a compact human duration, e.g. "3d 4h", "12m". */
export function formatPlaytime(ticks: number): string {
  const totalSeconds = Math.floor(ticks / TICKS_PER_SECOND)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return '< 1m'
}

/** Format the elapsed time since an ISO timestamp, e.g. "for 2h 15m". */
export function formatSessionLength(isoStart: string, now: number): string | null {
  const start = Date.parse(isoStart)
  if (Number.isNaN(start)) return null
  const totalSeconds = Math.max(0, Math.floor((now - start) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return '< 1m'
}
