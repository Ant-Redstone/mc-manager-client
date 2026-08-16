// localStorage persistence for the Performance page: the sampled-vitals ring
// buffer, the saved spark-report links, and the page's own preferences.

export interface PerfSample {
  t: number
  tps: number | null
  mspt: number | null
  cpu: number | null
  mem: number | null
}

const HISTORY_KEY = 'mcm.spark.history'
export const HISTORY_MAX = 720 // ~3h at a 15s interval

export function loadHistory(): PerfSample[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((s): s is PerfSample => !!s && typeof (s as PerfSample).t === 'number')
  } catch {
    return []
  }
}

export function pushSample(list: PerfSample[], s: PerfSample): PerfSample[] {
  const next = [...list, s].slice(-HISTORY_MAX)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // Storage full/blocked — history just won't persist.
  }
  return next
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    // ignore
  }
}

export interface SparkReport {
  id: string
  url: string
  kind: 'profiler' | 'heap' | 'health' | 'unknown'
  at: number
  note: string
}

const REPORTS_KEY = 'mcm.spark.reports'
const REPORTS_MAX = 100

export function loadReports(): SparkReport[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((r): r is SparkReport => !!r && typeof (r as SparkReport).url === 'string')
  } catch {
    return []
  }
}

export function saveReports(list: SparkReport[]): void {
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(list.slice(-REPORTS_MAX)))
  } catch {
    // ignore
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Add a report unless the URL is already saved. */
export function addReport(
  list: SparkReport[],
  url: string,
  kind: SparkReport['kind'],
): { list: SparkReport[]; added: boolean } {
  if (list.some((r) => r.url === url)) return { list, added: false }
  const next = [...list, { id: newId(), url, kind, at: Date.now(), note: '' }].slice(-REPORTS_MAX)
  saveReports(next)
  return { list: next, added: true }
}

export interface PerfPrefs { intervalSec: number }

const PREFS_KEY = 'mcm.spark.prefs'
export const DEFAULT_PERF_PREFS: PerfPrefs = { intervalSec: 15 }

export function loadPerfPrefs(): PerfPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PERF_PREFS
    const p = JSON.parse(raw) as Partial<PerfPrefs>
    const intervalSec = typeof p.intervalSec === 'number' ? Math.min(600, Math.max(5, p.intervalSec)) : 15
    return { intervalSec }
  } catch {
    return DEFAULT_PERF_PREFS
  }
}

export function savePerfPrefs(p: PerfPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // ignore
  }
}
