// Per-browser console display preferences (view mode, avatars, filters),
// persisted in localStorage so each admin keeps the console they prefer.

import type { LineType } from './consoleLines'
import type { SparkFoldCategory } from './spark'

export type ConsoleView = 'feed' | 'term' | 'raw'

export interface ConsolePrefs {
  view: ConsoleView
  /** Show player-head avatars on chat lines (feed view). */
  heads: boolean
  /** Show event-type icons in the gutter (feed view). */
  icons: boolean
  /** Reveal folded lines: the built-in mcm.* queries plus the user's hide rules. */
  showQuiet: boolean
  /** Per-event-type visibility. */
  show: Record<LineType, boolean>
  /** User patterns (plain text, or /regex/) whose matching lines are folded. */
  hideRules: string[]
  /** Per-category visibility of spark lines (true = shown), same convention
   *  as `show` above — off by default so moderators aren't spammed while the
   *  Performance page samples the server. */
  sparkShow: Record<SparkFoldCategory, boolean>
}

const KEY = 'mcm.console.prefs'

export const DEFAULT_PREFS: ConsolePrefs = {
  view: 'feed',
  heads: true,
  icons: true,
  showQuiet: false,
  show: {
    chat: true, join: true, leave: true, adv: true, death: true,
    warn: true, error: true, cmd: true, system: true,
  },
  hideRules: [],
  sparkShow: { echo: false, response: false, monitor: false },
}

export function loadConsolePrefs(): ConsolePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<ConsolePrefs>
    return {
      ...DEFAULT_PREFS,
      ...p,
      show: { ...DEFAULT_PREFS.show, ...(p.show ?? {}) },
      hideRules: Array.isArray(p.hideRules) ? p.hideRules.filter((r) => typeof r === 'string') : [],
      sparkShow: { ...DEFAULT_PREFS.sparkShow, ...(p.sparkShow ?? {}) },
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function saveConsolePrefs(p: ConsolePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Storage full/blocked — preferences just won't persist.
  }
}
