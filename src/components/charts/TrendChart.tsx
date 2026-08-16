import { useId } from 'react'

// Dependency-free SVG trend chart. Fixed internal coordinate space stretched
// to the wrapper (preserveAspectRatio="none"); the stroke stays crisp via
// vector-effect, and axis labels are HTML overlays so they never distort.

interface TrendChartProps {
  values: (number | null)[]
  /** Stroke/fill color as a hex literal (SVG gradient stops need a literal). */
  color: string
  /** Fixed y-domain, e.g. [0, 20] for TPS. Omit for auto (min/max padded). */
  domain?: [number, number]
  /** Tile variant: no grid, no labels. */
  mini?: boolean
  label: string
  format?: (v: number) => string
}

const W = 600
const H = 100

function TrendChart({ values, color, domain, mini = false, label, format }: TrendChartProps) {
  const gid = useId()
  const fmt = format ?? ((v: number) => v.toFixed(1))
  const present = values.filter((v): v is number => v !== null)

  if (present.length < 2) {
    return (
      <div className={`tc ${mini ? 'tc-mini' : ''}`} role="img" aria-label={`${label}: collecting samples`}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        </svg>
        {!mini && <span className="tc-empty">Collecting samples…</span>}
      </div>
    )
  }

  const lo = domain ? domain[0] : Math.min(...present)
  const hiRaw = domain ? domain[1] : Math.max(...present)
  const hi = hiRaw === lo ? lo + 1 : hiRaw
  const pad = domain ? 0 : (hi - lo) * 0.1
  const y = (v: number) => H - 4 - ((Math.min(hi, Math.max(lo, v)) - (lo - pad)) / (hi + pad - (lo - pad))) * (H - 8)
  const x = (i: number) => (i / (values.length - 1)) * W

  // Build path segments; a null sample breaks the line (a real gap in data).
  let line = ''
  let started = false
  values.forEach((v, i) => {
    if (v === null) {
      started = false
      return
    }
    line += `${started ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
    started = true
  })
  const area = `${line}L${W} ${H} L0 ${H} Z`
  const latest = present[present.length - 1]

  return (
    <div className={`tc ${mini ? 'tc-mini' : ''}`} role="img" aria-label={`${label}: latest ${fmt(latest)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.26" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {!mini && [0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(255,255,255,0.06)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {!mini && (
        <>
          <span className="tc-axis tc-axis-top">{fmt(hi)}</span>
          <span className="tc-axis tc-axis-bottom">{fmt(lo)}</span>
        </>
      )}
    </div>
  )
}

export default TrendChart
