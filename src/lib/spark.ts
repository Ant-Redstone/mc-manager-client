// Parsers and classifiers for spark (spark.lucko.me) console output. spark has
// no HTTP API — the Performance page samples the server by sending spark
// commands over the console WebSocket and parsing the reply lines. Shapes
// below are verified against a real capture (see PLAN-spark-performance.md),
// not guessed: `spark tps`/`spark ping` print one fully-prefixed "[⚡]" line
// per line of output, but `spark health`/`spark gc` print ONE prefixed
// trigger line followed by a single raw multi-line message — every line after
// that has no per-line prefix or timestamp of its own (a Java logger only
// tags the first line of a multi-line log call). Parsers stay tolerant
// (anchor on stable substrings, extract numbers) since exact spacing varies.

const SPARK_PREFIX = /^(?:\[?⚡\]?|\[spark\])\s*/iu

/**
 * Strip spark's own line decoration: an optional "[⚡]"/"[spark]" tag, and —
 * because health/gc reports render their section headers as raw "> Title"
 * continuation lines with no tag at all — an optional leading "> " too. The
 * "> " that means "the admin's own typed command" is intercepted separately
 * in sparkFoldCategory before this ever runs, so the two never collide.
 */
export function stripSpark(content: string): { prefixed: boolean; rest: string } {
  const m = SPARK_PREFIX.exec(content)
  const prefixed = !!m && m[0].length > 0
  const rest = (prefixed ? content.slice(m[0].length) : content).replace(/^>\s*/, '')
  return { prefixed, rest }
}

// ---- Section headers -------------------------------------------------------
// None of these anchor to the start of the (stripped) line unless noted — the
// header text itself is distinctive enough, and staying unanchored means they
// match whether or not stripSpark actually had anything to strip.

export const isTpsHeader = (content: string): boolean => /TPS from last/i.test(content)
export const isMsptHeader = (content: string): boolean => /Tick durations/i.test(content)
export const isCpuHeader = (content: string): boolean => /CPU usage from last/i.test(content)
export const isMemoryHeader = (content: string): boolean => /^Memory usage:?\s*$/i.test(stripSpark(content).rest)
export const isDiskHeader = (content: string): boolean => /^Disk usage:?\s*$/i.test(stripSpark(content).rest)
export const isGcHeader = (content: string): boolean => /Garbage Collector statistics/i.test(content)
export const isPingHeader = (content: string): boolean => /Average Pings?\b/i.test(content)

// ---- Value-line parsers -----------------------------------------------------

export interface TpsSample { t5s: number; t10s: number; t1m: number; t5m: number; t15m: number }

/** " *20.0, *20.0, *20.0, *20.0, *20.0" → the five TPS windows. The "*"
 *  marks a window spark considers not-yet-reliable; it carries no numeric
 *  meaning and is simply not part of the digit match. */
export function parseTpsValues(content: string): TpsSample | null {
  const { rest } = stripSpark(content)
  if (!/^[\s*]*\d/.test(rest)) return null
  if (/[^\d.,*\s]/.test(rest)) return null
  const nums = rest.match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 5) return null
  const [t5s, t10s, t1m, t5m, t15m] = nums.slice(0, 5).map(Number)
  return { t5s, t10s, t1m, t5m, t15m }
}

/** "14.7/16.7/19.9/31.1;  14.7/17.0/20.3/35.9" → the first (shorter) window. */
function parseSlashQuad(rest: string): { a: number; b: number; c: number; d: number } | null {
  const m = /(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/.exec(rest)
  return m ? { a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), d: Number(m[4]) } : null
}

export interface MsptWindow { min: number; med: number; p95: number; max: number }

export function parseMsptValues(content: string): MsptWindow | null {
  const q = parseSlashQuad(stripSpark(content).rest)
  return q ? { min: q.a, med: q.b, p95: q.c, max: q.d } : null
}

export interface PingWindow { min: number; med: number; p95: number; max: number }

/** Bare `spark ping` reports one min/med/95%ile/max window AGGREGATED across
 *  every connected player — not a per-player breakdown. Same shape as MSPT. */
export function parsePingValues(content: string): PingWindow | null {
  const q = parseSlashQuad(stripSpark(content).rest)
  return q ? { min: q.a, med: q.b, p95: q.c, max: q.d } : null
}

export interface CpuSample { c10s: number; c1m: number; c15m: number; scope: 'system' | 'process' | null }

/** " 41%, 41%, 40%  (system)" → the three CPU windows plus which scope it is. */
export function parseCpuValues(content: string): CpuSample | null {
  const { rest } = stripSpark(content)
  if (!rest.includes('%')) return null
  const nums = rest.match(/\d+(?:\.\d+)?(?=\s*%)/g)
  if (!nums || nums.length < 3) return null
  const scope = /system/i.test(rest) ? 'system' : /process/i.test(rest) ? 'process' : null
  return { c10s: Number(nums[0]), c1m: Number(nums[1]), c15m: Number(nums[2]), scope }
}

export interface UsagePair { used: number; max: number; pct: number }

const UNIT: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }

/** "859.2 MB / 2.0 GB   (41%)" → bytes used/max + percentage. */
export function parseUsagePair(content: string): UsagePair | null {
  const { rest } = stripSpark(content)
  const m = /(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\s*\/\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/i.exec(rest)
  if (!m) return null
  const used = Number(m[1]) * UNIT[m[2].toUpperCase()]
  const max = Number(m[3]) * UNIT[m[4].toUpperCase()]
  const pm = /\((\d+(?:\.\d+)?)\s*%\)/.exec(rest)
  const pct = pm ? Number(pm[1]) : max > 0 ? (used / max) * 100 : 0
  return { used, max, pct }
}

// ---- Garbage collector stats -------------------------------------------------
// Real shape (each collector is 1–3 lines, no single combined line exists):
//   G1 Young Generation collector:
//     12.2 ms avg, 264 total collections
//     36s avg frequency
//   G1 Old Generation collector:
//     0 collections

export interface GcStats { collections: number | null; avgMs: number | null; avgFreqS: number | null }

/** "G1 Young Generation collector:" (any leading indent) → the bare name. */
export function parseGcCollectorName(content: string): string | null {
  const { rest } = stripSpark(content)
  const m = /^\s*([A-Za-z0-9 ._'-]{2,48}?)\s+collector:\s*$/.exec(rest)
  return m ? m[1].trim() : null
}

/** "12.2 ms avg, 264 total collections" → the pair spark prints together. */
export function parseGcAvgAndCount(content: string): { avgMs: number; collections: number } | null {
  const { rest } = stripSpark(content)
  const m = /(\d+(?:\.\d+)?)\s*ms\s+avg,\s*(\d+)\s+total\s+collections?/i.exec(rest)
  return m ? { avgMs: Number(m[1]), collections: Number(m[2]) } : null
}

/** "36s avg frequency" → seconds between collections. */
export function parseGcFrequency(content: string): number | null {
  const { rest } = stripSpark(content)
  const m = /(\d+(?:\.\d+)?)\s*s\s+avg\s+frequency/i.exec(rest)
  return m ? Number(m[1]) : null
}

/** A collector with no activity prints just "0 collections" on its own —
 *  no "ms avg" / "total" wording, no frequency line follows. */
export function parseGcZeroCollections(content: string): number | null {
  const { rest } = stripSpark(content)
  const m = /^\s*(\d+)\s+collections?\s*$/i.exec(rest)
  return m ? Number(m[1]) : null
}

// ---- Report links ------------------------------------------------------------

/** A spark viewer link is a host plus one short opaque code and nothing else
 *  — this deliberately excludes things like the "…/docs/misc/…" help link
 *  spark sometimes prints alongside a profiler result, which is a real URL on
 *  a real spark line but not a report. */
function isReportUrl(url: string): boolean {
  return /^https?:\/\/[^/\s]+\/[A-Za-z0-9]{6,}(?:\?\S*)?$/i.test(url)
}

/** The report URL on a line, if any. */
export function parseSparkUrl(content: string): string | null {
  const m = /https?:\/\/\S+/.exec(content)
  if (!m) return null
  const url = m[0].replace(/[).,;]+$/, '')
  return isReportUrl(url) ? url : null
}

/** Vanilla's reply when spark isn't loaded and the command doesn't exist. */
export const isUnknownCommandReply = (content: string): boolean =>
  /^Unknown or incomplete command/i.test(content)

// ---- Console folding ---------------------------------------------------------
// The Performance page's sampling generates spark lines in EVERY admin's
// console. These let the Console fold them (per-category prefs, folded by
// default) so moderators aren't spammed. Kept separate from QUIET_RULES,
// which is reserved for the mcm.* stat queries.

export type SparkFoldCategory = 'echo' | 'response' | 'monitor'

const RESPONSE_ANCHORS: readonly RegExp[] = [
  /TPS from last/i,
  /Tick durations/i,
  /CPU usage from last/i,
  /Average Pings?\b/i,
  /Garbage Collector statistics/i,
  /ms\s+avg,\s*\d+\s+total\s+collections?/i,
  /avg\s+frequency/i,
  /^\s*\d+\s+collections?\s*$/i,
  /Starting a new profiler|Stopping the background profiler|Profiler is now running|profiler has completed|Uploading results|Profiler stopped/i,
  /Heap dump summ+ary/i,
  /Generating server health report|Health report:/i,
  /Java agent has been loaded dynamically/i,
  /spark\.lucko\.me|bytebin/i,
  // Bare value lines that can arrive with no prefix at all (health-report
  // continuation lines): the TPS five-number row, or an MSPT/ping-shaped quad.
  /^[*\s]*\d+(?:\.\d+)?(?:,\s*\*?\d+(?:\.\d+)?){4}\s*$/,
  /^\s*\d+(?:\.\d+)?\/\d+(?:\.\d+)?\/\d+(?:\.\d+)?\/\d+(?:\.\d+)?(?:;.*)?$/,
  /\d\s*(?:GB|MB|KB|TB)\s*\/\s*\d.*\(\d+(?:\.\d+)?%\)/i,
  /\d+(?:\.\d+)?%,\s*\d+(?:\.\d+)?%,\s*\d+(?:\.\d+)?%\s*\(\s*(?:system|process)\s*\)/i,
]

const MONITOR_ANCHORS: readonly RegExp[] = [
  /^Tick\s*#\d+/i,
  /GC lasted/i,
  /^(?:Tick|GC) monitor/i,
  /monitoring (?:enabled|disabled|started|stopped)/i,
]

/** Which fold bucket a self-contained console line belongs to, or null. Only
 *  covers lines classifiable on their own — see foldSparkBlocks for the raw,
 *  un-prefixed multi-line reports (health/gc) this can't anchor line-by-line. */
export function sparkFoldCategory(content: string): SparkFoldCategory | null {
  if (/^>\s*\/?spark\b/i.test(content)) return 'echo'
  const { prefixed, rest } = stripSpark(content)
  if (MONITOR_ANCHORS.some((r) => r.test(rest))) return 'monitor'
  if (prefixed) return 'response'
  if (RESPONSE_ANCHORS.some((r) => r.test(rest))) return 'response'
  return null
}

export interface FoldableLine { content: string; time?: string }

const BLOCK_TRIGGERS: readonly RegExp[] = [
  /Generating server health report/i,
  /Calculating GC statistics/i,
  /Creating a new heap dump summary/i,
]

/**
 * Mark every line that belongs to one of spark's raw multi-line reports
 * (health/gc). Those print ONE prefixed trigger line, then a single Java log
 * call containing many embedded newlines — every line after the first has NO
 * per-line timestamp of its own, so individual-line anchors can't catch every
 * sub-line (per-pool breakdowns, gauge bars, network stats). This tracks
 * "still inside that one message" instead: once a trigger fires, every line
 * without its own fresh timestamp is folded, until a timestamped, non-blank
 * line closes the block.
 */
export function foldSparkBlocks(lines: readonly FoldableLine[]): boolean[] {
  const out: boolean[] = new Array(lines.length).fill(false)
  let blockOpen = false
  for (let i = 0; i < lines.length; i++) {
    const { content, time } = lines[i]
    const { rest } = stripSpark(content)
    if (BLOCK_TRIGGERS.some((r) => r.test(rest))) {
      out[i] = true
      blockOpen = true
      continue
    }
    if (blockOpen) {
      if (time === undefined || rest.trim() === '') {
        out[i] = true
        continue
      }
      blockOpen = false
    }
  }
  return out
}
