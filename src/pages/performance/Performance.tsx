import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Gauge, Timer, Cpu, MemoryStick, Flame, Wifi, Recycle, Link2,
  Copy, ExternalLink, Trash2, RefreshCw, AlertTriangle, Pause, Play,
} from 'lucide-react'
import { useServer } from '../../context/ServerContext'
import { useToast } from '../../components/toast/ToastContext'
import { contentOf } from '../../lib/consoleLines'
import {
  stripSpark, isTpsHeader, isMsptHeader, isCpuHeader, isMemoryHeader, isDiskHeader,
  isGcHeader, isPingHeader, parseTpsValues, parseMsptValues, parseCpuValues,
  parseUsagePair, parsePingValues, parseGcCollectorName, parseGcAvgAndCount,
  parseGcFrequency, parseGcZeroCollections, parseSparkUrl, isUnknownCommandReply,
  sparkFoldCategory,
  type TpsSample, type MsptWindow, type CpuSample, type UsagePair, type PingWindow, type GcStats,
} from '../../lib/spark'
import {
  loadHistory, pushSample, clearHistory, loadReports, saveReports, addReport,
  loadPerfPrefs, savePerfPrefs, type PerfSample, type SparkReport,
} from '../../lib/sparkHistory'
import TrendChart from '../../components/charts/TrendChart'
import { formatBytes } from '../../lib/format'
import './Performance.css'

const SERIES_META = {
  tps: { label: 'TPS', color: '#4ecca3', domain: [0, 20] as [number, number], fmt: (v: number) => v.toFixed(1) },
  mspt: { label: 'MSPT', color: '#60a5fa', domain: undefined, fmt: (v: number) => `${v.toFixed(1)}ms` },
  cpu: { label: 'CPU', color: '#fbbf24', domain: [0, 100] as [number, number], fmt: (v: number) => `${Math.round(v)}%` },
  mem: { label: 'Memory', color: '#b98cf0', domain: [0, 100] as [number, number], fmt: (v: number) => `${Math.round(v)}%` },
} as const

type SeriesKey = keyof typeof SERIES_META

const INTERVALS = [10, 15, 30, 60] as const

interface GcEntry { name: string; stats: GcStats }

function formatWhenShort(t: number, now: number): string {
  const d = new Date(t)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = Math.floor((now - t) / 86_400_000)
  if (days <= 0) return `today ${hm}`
  if (days === 1) return `yesterday ${hm}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${hm}`
}

function pingClass(ms: number): string {
  return ms < 100 ? 'is-ok' : ms < 250 ? 'is-warn' : 'is-danger'
}

function Performance() {
  const { running, sendCommand, subscribe } = useServer()
  const { toast } = useToast()

  const [prefs, setPrefs] = useState(loadPerfPrefs)
  const [paused, setPaused] = useState(false)
  const [tps, setTps] = useState<TpsSample | null>(null)
  const [mspt, setMspt] = useState<MsptWindow | null>(null)
  const [cpuSystem, setCpuSystem] = useState<CpuSample | null>(null)
  const [cpuProcess, setCpuProcess] = useState<CpuSample | null>(null)
  const [mem, setMem] = useState<UsagePair | null>(null)
  const [disk, setDisk] = useState<UsagePair | null>(null)
  const [ping, setPing] = useState<PingWindow | null>(null)
  const [gc, setGc] = useState<GcEntry[]>([])
  const [history, setHistory] = useState<PerfSample[]>(loadHistory)
  const [reports, setReports] = useState<SparkReport[]>(loadReports)
  const [series, setSeries] = useState<SeriesKey>('tps')
  const [windowMin, setWindowMin] = useState<30 | 180 | 0>(30)
  const [sparkMissing, setSparkMissing] = useState(false)
  const [diag, setDiag] = useState<{ phase: 'idle' | 'profiling' | 'waiting' | 'done' | 'error'; secondsLeft?: number; url?: string }>({ phase: 'idle' })
  const [manualUrl, setManualUrl] = useState('')
  const [clearArmed, setClearArmed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const awaitingRef = useRef<'tps' | 'mspt' | 'cpu' | 'memory' | 'disk' | 'ping' | null>(null)
  const awaitingTtlRef = useRef(0)
  const gcActiveRef = useRef(false)
  const gcDraftRef = useRef<GcEntry[]>([])
  const expectKindRef = useRef<'profiler' | 'heap' | 'health' | null>(null)
  const seenUrlsRef = useRef<Set<string>>(new Set(loadReports().map((r) => r.url)))
  const sawSparkRef = useRef(false)
  const missPollsRef = useRef(0)
  const lastPollAtRef = useRef(0)
  const pushTimerRef = useRef<number | null>(null)
  const latestRef = useRef<{ tps: TpsSample | null; mspt: MsptWindow | null; cpuSystem: CpuSample | null; mem: UsagePair | null }>({ tps: null, mspt: null, cpuSystem: null, mem: null })
  const diagTimerRef = useRef<number | null>(null)
  const diagFailRef = useRef<number | null>(null)

  // Relative "when" labels in the reports table stay fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Commit the vitals gathered in the last ~1.5s into one history sample.
  const scheduleHistoryPush = useCallback(() => {
    if (pushTimerRef.current !== null) return
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null
      const l = latestRef.current
      if (!l.tps) return
      setHistory((prev) => pushSample(prev, {
        t: Date.now(),
        tps: l.tps ? l.tps.t10s : null,
        mspt: l.mspt ? l.mspt.med : null,
        cpu: l.cpuSystem ? l.cpuSystem.c10s : null,
        mem: l.mem ? l.mem.pct : null,
      }))
    }, 1500)
  }, [])

  // ---- The collector: parse every console line for spark output ------------
  useEffect(() => {
    const unsub = subscribe((line) => {
      const content = contentOf(line)
      const { prefixed } = stripSpark(content)
      const isSpark = prefixed || sparkFoldCategory(content) !== null
      if (isSpark) {
        sawSparkRef.current = true
        missPollsRef.current = 0
        setSparkMissing(false)
      }

      // Vanilla's "Unknown command" right after our poll → spark isn't loaded.
      if (isUnknownCommandReply(content) && Date.now() - lastPollAtRef.current < 3000) {
        setSparkMissing(true)
        return
      }

      // Section headers arm what the next value line(s) mean. Checked before
      // anything else so a fresh header always wins over a stale ttl window.
      if (isTpsHeader(content)) { awaitingRef.current = 'tps'; awaitingTtlRef.current = 2; return }
      if (isMsptHeader(content)) { awaitingRef.current = 'mspt'; awaitingTtlRef.current = 2; return }
      if (isCpuHeader(content)) { awaitingRef.current = 'cpu'; awaitingTtlRef.current = 3; return }
      if (isMemoryHeader(content)) { awaitingRef.current = 'memory'; awaitingTtlRef.current = 2; return }
      if (isDiskHeader(content)) { awaitingRef.current = 'disk'; awaitingTtlRef.current = 2; return }
      if (isPingHeader(content)) { awaitingRef.current = 'ping'; awaitingTtlRef.current = 2; return }
      if (isGcHeader(content)) { gcActiveRef.current = true; gcDraftRef.current = []; return }

      const awaiting = awaitingRef.current
      if (awaiting !== null) {
        awaitingTtlRef.current -= 1
        if (awaitingTtlRef.current < 0) awaitingRef.current = null
      }

      if (awaiting === 'tps' || isSpark) {
        const v = parseTpsValues(content)
        if (v) {
          latestRef.current.tps = v
          setTps(v)
          if (awaiting === 'tps') awaitingRef.current = null
          scheduleHistoryPush()
          return
        }
      }
      if (awaiting === 'mspt' || isSpark) {
        const v = parseMsptValues(content)
        if (v) {
          latestRef.current.mspt = v
          setMspt(v)
          if (awaiting === 'mspt') awaitingRef.current = null
          return
        }
      }
      if (awaiting === 'cpu' || isSpark) {
        const v = parseCpuValues(content)
        if (v) {
          if (v.scope === 'process') {
            setCpuProcess(v)
          } else {
            latestRef.current.cpuSystem = v
            setCpuSystem(v)
          }
          return
        }
      }
      if (awaiting === 'memory') {
        const v = parseUsagePair(content)
        if (v) { latestRef.current.mem = v; setMem(v); awaitingRef.current = null; return }
      }
      if (awaiting === 'disk') {
        const v = parseUsagePair(content)
        if (v) { setDisk(v); awaitingRef.current = null; return }
      }
      if (awaiting === 'ping' || isSpark) {
        const v = parsePingValues(content)
        if (v) { setPing(v); if (awaiting === 'ping') awaitingRef.current = null; return }
      }

      if (gcActiveRef.current) {
        const name = parseGcCollectorName(content)
        if (name) {
          gcDraftRef.current = [...gcDraftRef.current, { name, stats: { collections: null, avgMs: null, avgFreqS: null } }]
          setGc([...gcDraftRef.current])
          return
        }
        const draft = gcDraftRef.current
        if (draft.length > 0) {
          const avgCount = parseGcAvgAndCount(content)
          if (avgCount) {
            const next = [...draft]
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, stats: { ...last.stats, avgMs: avgCount.avgMs, collections: avgCount.collections } }
            gcDraftRef.current = next
            setGc(next)
            return
          }
          const freq = parseGcFrequency(content)
          if (freq !== null) {
            const next = [...draft]
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, stats: { ...last.stats, avgFreqS: freq } }
            gcDraftRef.current = next
            setGc(next)
            return
          }
          const zero = parseGcZeroCollections(content)
          if (zero !== null) {
            const next = [...draft]
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, stats: { ...last.stats, collections: zero } }
            gcDraftRef.current = next
            setGc(next)
            return
          }
        }
        // A blank separator or the section header itself — ignore without
        // closing gcActiveRef; the next `spark gc` resets the draft anyway.
      }

      if (isSpark) {
        const url = parseSparkUrl(content)
        if (url && !seenUrlsRef.current.has(url)) {
          seenUrlsRef.current.add(url)
          const kind = expectKindRef.current ?? 'unknown'
          expectKindRef.current = null
          setReports((prev) => addReport(prev, url, kind).list)
          toast('spark report saved to the library', 'success')
          if (diagFailRef.current !== null) { window.clearTimeout(diagFailRef.current); diagFailRef.current = null }
          setDiag((d) => (d.phase === 'profiling' || d.phase === 'waiting' ? { phase: 'done', url } : d))
        }
      }
    })
    return unsub
  }, [subscribe, scheduleHistoryPush, toast])

  // ---- Sampling loop -------------------------------------------------------
  useEffect(() => {
    if (!running || paused || sparkMissing) return
    let tick = 0
    const poll = () => {
      if (document.hidden) return
      if (tick > 0 && !sawSparkRef.current) {
        missPollsRef.current += 1
        if (missPollsRef.current >= 2) { setSparkMissing(true); return }
      }
      sawSparkRef.current = false
      lastPollAtRef.current = Date.now()
      sendCommand('spark tps')
      if (tick % 4 === 0) sendCommand('spark health --memory')
      tick += 1
    }
    poll()
    const id = window.setInterval(poll, prefs.intervalSec * 1000)
    return () => window.clearInterval(id)
  }, [running, paused, sparkMissing, prefs.intervalSec, sendCommand])

  // One-shot GC + ping load when the server is up and spark is answering.
  useEffect(() => {
    if (!running || sparkMissing) return
    sendCommand('spark gc')
    sendCommand('spark ping')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, sparkMissing])

  // Diagnosis countdown cleanup.
  useEffect(() => {
    if (diag.phase !== 'profiling' && diagTimerRef.current !== null) {
      window.clearInterval(diagTimerRef.current)
      diagTimerRef.current = null
    }
  }, [diag.phase])

  const canSample = running && !sparkMissing

  const startProfiler = () => {
    if (!canSample || diag.phase === 'profiling' || diag.phase === 'waiting') return
    expectKindRef.current = 'profiler'
    sendCommand('spark profiler start --timeout 30')
    setDiag({ phase: 'profiling', secondsLeft: 30 })
    diagTimerRef.current = window.setInterval(() => {
      setDiag((d) => {
        if (d.phase !== 'profiling') return d
        const left = (d.secondsLeft ?? 0) - 1
        return left <= 0 ? { phase: 'waiting' } : { ...d, secondsLeft: left }
      })
    }, 1000)
    diagFailRef.current = window.setTimeout(() => {
      setDiag((d) => (d.phase === 'done' ? d : { phase: 'error' }))
    }, 50_000)
  }

  const runHeap = () => {
    if (!canSample) return
    expectKindRef.current = 'heap'
    sendCommand('spark heapsummary')
    toast('Generating a heap summary… the link lands in Reports', 'info')
  }

  const runHealthReport = () => {
    if (!canSample) return
    expectKindRef.current = 'health'
    sendCommand('spark health --upload')
    toast('Uploading a health report… the link lands in Reports', 'info')
  }

  const retrySpark = () => {
    missPollsRef.current = 0
    sawSparkRef.current = false
    setSparkMissing(false)
  }

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied', 'success')
    } catch {
      toast('Couldn’t copy — open the report and copy the address', 'error')
    }
  }

  const deleteReport = (r: SparkReport) => {
    seenUrlsRef.current.delete(r.url)
    setReports((prev) => {
      const next = prev.filter((x) => x.id !== r.id)
      saveReports(next)
      return next
    })
  }

  const setNote = (id: string, note: string) => {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, note } : r)))
  }

  const persistNotes = () => saveReports(reports)

  const addManualReport = (e: React.FormEvent) => {
    e.preventDefault()
    const url = manualUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      toast('Enter a full report URL starting with http(s)://', 'error')
      return
    }
    if (seenUrlsRef.current.has(url)) {
      toast('That report is already in the library', 'info')
      return
    }
    seenUrlsRef.current.add(url)
    setReports((prev) => addReport(prev, url, 'unknown').list)
    setManualUrl('')
  }

  const doClearHistory = () => {
    if (!clearArmed) {
      setClearArmed(true)
      window.setTimeout(() => setClearArmed(false), 3000)
      return
    }
    clearHistory()
    setHistory([])
    setClearArmed(false)
    toast('History cleared', 'success')
  }

  const meta = SERIES_META[series]
  const chartValues = useMemo(() => {
    const cutoff = windowMin === 0 ? 0 : now - windowMin * 60_000
    return history
      .filter((s) => s.t >= cutoff)
      .map((s) => (series === 'tps' ? s.tps : series === 'mspt' ? s.mspt : series === 'cpu' ? s.cpu : s.mem))
  }, [history, series, windowMin, now])

  const tileTrend = useCallback(
    (key: SeriesKey) => history.slice(-40).map((s) => (key === 'tps' ? s.tps : key === 'mspt' ? s.mspt : key === 'cpu' ? s.cpu : s.mem)),
    [history],
  )

  const tpsClass = tps ? (tps.t10s >= 19.5 ? 'is-ok' : tps.t10s >= 18 ? 'is-warn' : 'is-danger') : ''

  return (
    <div className="perf-page">
      <div className="pf-head">
        <div>
          <h2><Activity size={18} className="pf-head-icon" /> Performance</h2>
          <p className="pf-sub">Live server vitals via spark — sampled over the console, folded out of everyone’s view.</p>
        </div>
        {canSample && (
          <div className="pf-sampling">
            {!paused && <span className="pf-live"><span className="pf-live-dot" />Sampling</span>}
            <label className="pf-interval">
              every
              <select
                value={prefs.intervalSec}
                onChange={(e) => {
                  const next = { intervalSec: Number(e.target.value) }
                  setPrefs(next)
                  savePerfPrefs(next)
                }}
                aria-label="Sampling interval"
              >
                {INTERVALS.map((s) => <option key={s} value={s}>{s}s</option>)}
              </select>
            </label>
            <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
              {paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        )}
      </div>

      {!running && (
        <div className="pf-empty">
          <Activity size={22} />
          <p>The server is stopped — start it to see live performance.</p>
        </div>
      )}

      {running && sparkMissing && (
        <div className="pf-empty pf-empty-warn">
          <AlertTriangle size={22} />
          <p>spark isn’t answering. It may still be loading, or it isn’t installed on this server.</p>
          <p className="pf-empty-sub">
            spark is a free profiler mod/plugin — see <a href="https://spark.lucko.me/download" target="_blank" rel="noreferrer">spark.lucko.me/download</a>.
            Once it responds to <code>spark tps</code> in the console, this page lights up.
          </p>
          <button type="button" className="pf-btn" onClick={retrySpark}><RefreshCw size={14} /> Try again</button>
        </div>
      )}

      {canSample && (
        <>
          <div className="pf-vitals">
            <div className="pf-tile stagger-item" style={{ '--i': 0 } as React.CSSProperties} aria-label={tps ? `TPS ${tps.t10s.toFixed(1)}` : 'TPS pending'}>
              <span className="pf-tile-label"><Gauge size={14} />TPS<span className="pf-tile-when">last 10s</span></span>
              <span className={`pf-tile-value ${tpsClass}`}>{tps ? tps.t10s.toFixed(1) : '—'}</span>
              <span className="pf-tile-sub">{tps ? `1m ${tps.t1m.toFixed(1)} · 5m ${tps.t5m.toFixed(1)} · 15m ${tps.t15m.toFixed(1)}` : 'waiting for the first sample'}</span>
              <div className="pf-tile-spark"><TrendChart mini values={tileTrend('tps')} color={SERIES_META.tps.color} domain={SERIES_META.tps.domain} label="TPS trend" /></div>
            </div>
            <div className="pf-tile stagger-item" style={{ '--i': 1 } as React.CSSProperties} aria-label={mspt ? `MSPT median ${mspt.med.toFixed(1)} milliseconds` : 'MSPT pending'}>
              <span className="pf-tile-label"><Timer size={14} />MSPT<span className="pf-tile-when">median</span></span>
              <span className="pf-tile-value">{mspt ? mspt.med.toFixed(1) : '—'}{mspt && <span className="pf-unit">ms</span>}</span>
              <span className="pf-tile-sub">{mspt ? `p95 ${mspt.p95.toFixed(1)}ms · max ${mspt.max.toFixed(1)}ms` : 'waiting for the first sample'}</span>
              <div className="pf-tile-spark"><TrendChart mini values={tileTrend('mspt')} color={SERIES_META.mspt.color} label="MSPT trend" /></div>
            </div>
            <div className="pf-tile stagger-item" style={{ '--i': 2 } as React.CSSProperties} aria-label={cpuSystem ? `CPU ${Math.round(cpuSystem.c10s)} percent` : 'CPU pending'}>
              <span className="pf-tile-label"><Cpu size={14} />CPU<span className="pf-tile-when">system</span></span>
              <span className="pf-tile-value">{cpuSystem ? Math.round(cpuSystem.c10s) : '—'}{cpuSystem && <span className="pf-unit">%</span>}</span>
              <span className="pf-tile-sub">{cpuProcess ? `process ${Math.round(cpuProcess.c10s)}% · ` : ''}{cpuSystem ? `1m ${Math.round(cpuSystem.c1m)}% · 15m ${Math.round(cpuSystem.c15m)}%` : 'waiting for the first sample'}</span>
              <div className="pf-tile-spark"><TrendChart mini values={tileTrend('cpu')} color={SERIES_META.cpu.color} domain={SERIES_META.cpu.domain} label="CPU trend" /></div>
            </div>
            <div className="pf-tile stagger-item" style={{ '--i': 3 } as React.CSSProperties} aria-label={mem ? `Memory ${formatBytes(mem.used)} of ${formatBytes(mem.max)}` : 'Memory pending'}>
              <span className="pf-tile-label"><MemoryStick size={14} />Memory<span className="pf-tile-when">heap</span></span>
              <span className="pf-tile-value">{mem ? formatBytes(mem.used) : '—'}{mem && <span className="pf-unit">/ {formatBytes(mem.max)}</span>}</span>
              <span className="pf-tile-sub">{mem ? `${Math.round(mem.pct)}% used` : 'refreshes with each health sample'}{disk ? ` · disk ${formatBytes(disk.used)} / ${formatBytes(disk.max)}` : ''}</span>
              <div className="pf-tile-spark"><TrendChart mini values={tileTrend('mem')} color={SERIES_META.mem.color} domain={SERIES_META.mem.domain} label="Memory trend" /></div>
            </div>
          </div>

          <section className="pf-card">
            <div className="pf-card-head">
              <h3><Activity size={15} /> History</h3>
              <span className="pf-spacer" />
              <div className="pf-seg" role="group" aria-label="Chart series">
                {(Object.keys(SERIES_META) as SeriesKey[]).map((k) => (
                  <button key={k} type="button" className={series === k ? 'on' : ''} aria-pressed={series === k} onClick={() => setSeries(k)}>
                    {SERIES_META[k].label}
                  </button>
                ))}
              </div>
              <div className="pf-seg" role="group" aria-label="Time window">
                {([[30, '30m'], [180, '3h'], [0, 'All']] as const).map(([m, l]) => (
                  <button key={l} type="button" className={windowMin === m ? 'on' : ''} aria-pressed={windowMin === m} onClick={() => setWindowMin(m)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="pf-chart">
              <TrendChart values={chartValues} color={meta.color} domain={meta.domain} label={`${meta.label} history`} format={meta.fmt} />
            </div>
            <div className="pf-chart-foot">
              <span>Sampled every {prefs.intervalSec}s while this page is open · history stays in this browser (~3h kept)</span>
              <button type="button" className="pf-linklike" onClick={doClearHistory}>
                {clearArmed ? 'Really clear?' : 'Clear history'}
              </button>
            </div>
          </section>

          <section className="pf-card">
            <div className="pf-card-head">
              <h3><Flame size={15} /> Find the cause of lag</h3>
            </div>
            <p className="pf-help">
              Runs spark’s profiler for 30 seconds while the server does whatever is hurting it, then gives you a link
              showing exactly which code ate the time — expandable down to mod level.
            </p>
            <div className="pf-actions">
              <button type="button" className="pf-btn pf-btn-primary" onClick={startProfiler} disabled={diag.phase === 'profiling' || diag.phase === 'waiting'}>
                <Flame size={15} /> Profile for 30 seconds
              </button>
              <button type="button" className="pf-btn" onClick={runHeap}>Heap summary</button>
              <button type="button" className="pf-btn" onClick={runHealthReport}>Health report</button>
            </div>
            {(diag.phase === 'profiling' || diag.phase === 'waiting') && (
              <div className="pf-progress">
                <div className="pf-progress-track">
                  <div className="pf-progress-fill" style={{ width: diag.phase === 'waiting' ? '100%' : `${((30 - (diag.secondsLeft ?? 0)) / 30) * 100}%` }} />
                </div>
                <p className="pf-progress-label" role="status">
                  {diag.phase === 'profiling' ? `Profiling… ${diag.secondsLeft}s left` : 'Waiting for the report link…'}
                </p>
              </div>
            )}
            {diag.phase === 'done' && diag.url && (
              <div className="pf-result" role="status">
                <Flame size={15} />
                <span>Report ready:</span>
                <a href={diag.url} target="_blank" rel="noreferrer">{diag.url}</a>
                <button type="button" className="pf-btn pf-btn-icon" onClick={() => copyLink(diag.url as string)} title="Copy link" aria-label="Copy report link"><Copy size={13} /></button>
                <span className="pf-result-note">saved to Reports below</span>
              </div>
            )}
            {diag.phase === 'error' && (
              <p className="pf-diag-error" role="status">
                No report link arrived. Check the Console for spark errors, then try again.
              </p>
            )}
            <p className="pf-privacy">
              <AlertTriangle size={13} /> Reports upload to spark’s public viewer — only people with the link can open them.
            </p>
          </section>

          <div className="pf-twocol">
            <section className="pf-card">
              <div className="pf-card-head">
                <h3><Wifi size={15} /> Player latency</h3>
                <span className="pf-spacer" />
                <button type="button" className="pf-btn pf-btn-icon" onClick={() => sendCommand('spark ping')} title="Refresh ping" aria-label="Refresh ping"><RefreshCw size={14} /></button>
              </div>
              {ping ? (
                <div className="pf-ping">
                  <span className={`pf-ping-value ${pingClass(ping.med)}`}>{ping.med}<span className="pf-unit">ms</span></span>
                  <span className="pf-ping-sub">median · p95 {ping.p95}ms · max {ping.max}ms</span>
                  <span className="pf-quiet pf-ping-note">Aggregate across every connected player — spark reports one number here, not a per-player list.</span>
                </div>
              ) : (
                <p className="pf-quiet">No ping data yet — refresh with players online.</p>
              )}
            </section>

            <section className="pf-card">
              <div className="pf-card-head">
                <h3><Recycle size={15} /> Garbage collection</h3>
                <span className="pf-spacer" />
                <button type="button" className="pf-btn pf-btn-icon" onClick={() => sendCommand('spark gc')} title="Refresh GC stats" aria-label="Refresh GC stats"><RefreshCw size={14} /></button>
              </div>
              {gc.length === 0 ? (
                <p className="pf-quiet">No GC data yet.</p>
              ) : (
                <div className="pf-gc">
                  {gc.map((g) => (
                    <div key={g.name} className="pf-gc-item">
                      <div className="pf-gc-name">{g.name}</div>
                      <div className="pf-gc-meta">
                        {g.stats.collections === null
                          ? 'no data yet'
                          : g.stats.avgMs !== null
                            ? `${g.stats.collections} collections · ${g.stats.avgMs.toFixed(1)}ms avg${g.stats.avgFreqS !== null ? ` · every ${g.stats.avgFreqS}s` : ''}`
                            : `${g.stats.collections} collections`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="pf-card">
            <div className="pf-card-head">
              <h3><Link2 size={15} /> Reports</h3>
              <span className="pf-spacer" />
              <span className="pf-quiet">links are captured automatically from the console</span>
            </div>
            {reports.length === 0 ? (
              <p className="pf-quiet">No reports yet. Run a diagnosis above, or paste a spark link below.</p>
            ) : (
              <table className="pf-table" aria-label="Saved spark reports">
                <thead>
                  <tr><th scope="col">Kind</th><th scope="col">When</th><th scope="col" className="pf-note-col">Note</th><th scope="col"><span className="pf-visually-hidden">Actions</span></th></tr>
                </thead>
                <tbody>
                  {[...reports].reverse().map((r) => (
                    <tr key={r.id}>
                      <td><span className={`pf-kind pf-kind-${r.kind}`}>{r.kind}</span></td>
                      <td className="pf-when">{formatWhenShort(r.at, now)}</td>
                      <td>
                        <input
                          className="pf-note-input"
                          value={r.note}
                          placeholder="add a note…"
                          aria-label={`Note for ${r.kind} report`}
                          onChange={(e) => setNote(r.id, e.target.value)}
                          onBlur={persistNotes}
                        />
                      </td>
                      <td>
                        <div className="pf-row-actions">
                          <a className="pf-btn pf-btn-icon" href={r.url} target="_blank" rel="noreferrer" title="Open report" aria-label="Open report"><ExternalLink size={13} /></a>
                          <button type="button" className="pf-btn pf-btn-icon" onClick={() => copyLink(r.url)} title="Copy link" aria-label="Copy link"><Copy size={13} /></button>
                          <button type="button" className="pf-btn pf-btn-icon pf-btn-danger" onClick={() => deleteReport(r)} title="Delete from library" aria-label="Delete from library"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form className="pf-add" onSubmit={addManualReport}>
              <input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://spark.lucko.me/…  (add a link manually)"
                aria-label="Add a report link manually"
                spellCheck={false}
              />
              <button type="submit" className="pf-btn" disabled={!manualUrl.trim()}>Add</button>
            </form>
          </section>

          <p className="pf-foot">
            Every number on this page is a real <code>spark</code> command sent over the same console WebSocket the
            terminal uses — no new backend. Moderators’ consoles fold these queries automatically
            (Console → the <strong>spark</strong> toggles).
          </p>
        </>
      )}
    </div>
  )
}

export default Performance
