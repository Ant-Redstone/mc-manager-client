/**
 * Builds the warn-then-restart schedule the Overview's Restart control runs.
 *
 * Kept out of the component so the arithmetic that decides WHEN a live server
 * goes down is unit-testable without rendering anything.
 */

/** The warning offsets offered, longest first — the order they're shown in. */
export const WARN_OPTIONS = [600, 300, 120, 60, 30, 15, 5] as const

export type WarnOffset = (typeof WARN_OPTIONS)[number]

export interface RestartStep {
  /** Seconds from "confirm" until this step fires. */
  at: number
  /** Seconds remaining when it fires; 0 is the restart itself. */
  remaining: number
  /** The console line to send, or null for the restart step. */
  say: string | null
}

export function formatCountdown(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (s === 0) return `${m} minuto${m === 1 ? '' : 's'}`
    return `${m}m ${s}s`
  }
  return `${seconds} segundo${seconds === 1 ? '' : 's'}`
}

/**
 * Turns the picked warning offsets into an ordered schedule.
 *
 * The restart happens at the LONGEST warning, not after all of them summed:
 * picking "10 min" and "1 min" means one countdown where players are told
 * twice, which is what an operator means by it. Summing would restart 11
 * minutes out and silently contradict the label they clicked.
 *
 * Duplicates are collapsed and the list is sorted, so the same schedule comes
 * out no matter what order the checkboxes were ticked in.
 */
export function buildRestartPlan(offsets: readonly number[]): RestartStep[] {
  const picked = [...new Set(offsets.filter((o) => o > 0))].sort((a, b) => b - a)
  if (picked.length === 0) {
    return [{ at: 0, remaining: 0, say: null }]
  }

  const total = picked[0]
  const steps: RestartStep[] = picked.map((remaining) => ({
    at: total - remaining,
    remaining,
    say: `Reiniciando em ${formatCountdown(remaining)}`,
  }))
  steps.push({ at: total, remaining: 0, say: null })
  return steps
}

/** Total wall-clock seconds between confirming and the server going down. */
export function planDuration(offsets: readonly number[]): number {
  const plan = buildRestartPlan(offsets)
  return plan[plan.length - 1].at
}
