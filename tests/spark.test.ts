import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stripSpark, isTpsHeader, isMsptHeader, isCpuHeader, isMemoryHeader, isDiskHeader,
  isGcHeader, isPingHeader, parseTpsValues, parseMsptValues, parseCpuValues,
  parseUsagePair, parsePingValues, parseGcCollectorName, parseGcAvgAndCount,
  parseGcFrequency, parseGcZeroCollections, parseSparkUrl, isUnknownCommandReply,
  sparkFoldCategory, foldSparkBlocks,
} from '../src/lib/spark.ts'
import { parseConsoleInput } from '../src/lib/consoleInput.ts'
import { isCommandName } from '../src/lib/mcCommands.ts'

// Fixtures below are the `content` a console line has AFTER contentOf() strips
// the "[HH:MM:SS] [thread/LEVEL]: " prefix — captured verbatim from a real
// server running spark (see PLAN-spark-performance.md's revision notes).
// `spark tps`/`spark ping` tag every line with "[⚡]"; `spark health`/`spark gc`
// print one "[⚡]"-tagged trigger line, then a SINGLE raw multi-line message —
// every line after that has no tag and no per-line timestamp of its own,
// which is why foldSparkBlocks exists alongside the per-line classifier.

test('stripSpark peels the lightning tag and, separately, a "> " section-header marker', () => {
  assert.deepEqual(stripSpark('[⚡] TPS from last 5s, 10s, 1m, 5m, 15m:'), { prefixed: true, rest: 'TPS from last 5s, 10s, 1m, 5m, 15m:' })
  assert.deepEqual(stripSpark('> TPS from last 5s, 10s, 1m, 5m, 15m:'), { prefixed: false, rest: 'TPS from last 5s, 10s, 1m, 5m, 15m:' })
  assert.deepEqual(stripSpark('plain line'), { prefixed: false, rest: 'plain line' })
})

test('headers match the real wording, tag or no tag', () => {
  assert.equal(isTpsHeader('[⚡] TPS from last 5s, 10s, 1m, 5m, 15m:'), true)
  assert.equal(isTpsHeader('> TPS from last 5s, 10s, 1m, 5m, 15m:'), true)
  assert.equal(isMsptHeader('[⚡] Tick durations (min/med/95%ile/max ms) from last 10s, 1m:'), true)
  assert.equal(isMsptHeader('> Tick durations (min/med/95%ile/max ms) from last 10s, 1m:'), true)
  assert.equal(isCpuHeader('[⚡] CPU usage from last 10s, 1m, 15m:'), true)
  assert.equal(isCpuHeader('> CPU usage from last 10s, 1m, 15m:'), true)
  // Memory/Disk headers are anchored — this is exactly why stripSpark needs to
  // eat the "> " too, not just the ⚡ tag.
  assert.equal(isMemoryHeader('> Memory usage:'), true)
  assert.equal(isDiskHeader('> Disk usage:'), true)
  assert.equal(isGcHeader('[⚡] Calculating GC statistics...'), false) // that's the trigger line, not the header
  assert.equal(isGcHeader('> Garbage Collector statistics'), true)
  assert.equal(isPingHeader('[⚡] Average Pings (min/med/95%ile/max ms) from now, last 15m:'), true)
  assert.equal(isTpsHeader('<Notch> TPS is bad'), false)
})

test('parseTpsValues reads the five windows — all-starred (bare tps) and one-starred (health report) both occur for real', () => {
  assert.deepEqual(parseTpsValues('[⚡]  *20.0, *20.0, *20.0, *20.0, *20.0'), { t5s: 20, t10s: 20, t1m: 20, t5m: 20, t15m: 20 })
  assert.deepEqual(parseTpsValues('    20.0, 20.0, 20.0, 20.0, *20.0'), { t5s: 20, t10s: 20, t1m: 20, t5m: 20, t15m: 20 })
  assert.equal(parseTpsValues('[⚡] TPS from last 5s, 10s, 1m, 5m, 15m:'), null)
})

test('parseMsptValues reads the first (shorter) window, semicolon-separated', () => {
  assert.deepEqual(parseMsptValues('[⚡]  14.7/16.7/19.9/31.1;  14.7/17.0/20.3/35.9'), { min: 14.7, med: 16.7, p95: 19.9, max: 31.1 })
  assert.deepEqual(parseMsptValues('    14.3/16.2/18.5/544.4; 14.3/16.8/20.2/544.4'), { min: 14.3, med: 16.2, p95: 18.5, max: 544.4 })
})

test('parsePingValues reads the aggregate window — spark ping has no per-player output', () => {
  assert.deepEqual(parsePingValues('[⚡]  164/177/177/177;  161/165/171/204'), { min: 164, med: 177, p95: 177, max: 177 })
})

test('parseCpuValues reads windows and scope, tag or no tag', () => {
  assert.deepEqual(parseCpuValues('[⚡]  41%, 41%, 40%  (system)'), { c10s: 41, c1m: 41, c15m: 40, scope: 'system' })
  assert.deepEqual(parseCpuValues('[⚡]  11%, 11%, 11%  (process)'), { c10s: 11, c1m: 11, c15m: 11, scope: 'process' })
  assert.deepEqual(parseCpuValues('    40%, 41%, 40%  (system)'), { c10s: 40, c1m: 41, c15m: 40, scope: 'system' })
})

test('parseUsagePair converts units to bytes and reads the percentage', () => {
  const mem = parseUsagePair('    859.2 MB / 2.0 GB   (41%)')
  assert.ok(mem)
  assert.equal(Math.round(mem.used / 1024 / 1024), 859)
  assert.equal(mem.max, 2 * 1024 ** 3)
  assert.equal(mem.pct, 41)
  const disk = parseUsagePair('    41.6 GB / 97.9 GB   (42%)')
  assert.ok(disk)
  assert.equal(disk.pct, 42)
  assert.equal(parseUsagePair('    [┃┃┃┃┃┃┃╻╻╻╻╻╻]'), null)
})

test('GC parsing follows the real 3-line-per-collector shape, including the zero-collections case', () => {
  assert.equal(parseGcCollectorName('    G1 Young Generation collector:'), 'G1 Young Generation')
  assert.equal(parseGcCollectorName('    G1 Concurrent GC collector:'), 'G1 Concurrent GC')
  assert.equal(parseGcCollectorName('    G1 Old Generation collector:'), 'G1 Old Generation')
  assert.equal(parseGcCollectorName('> Garbage Collector statistics'), null)

  assert.deepEqual(parseGcAvgAndCount('      12.2 ms avg, 264 total collections'), { avgMs: 12.2, collections: 264 })
  assert.deepEqual(parseGcAvgAndCount('      5.33 ms avg, 174 total collections'), { avgMs: 5.33, collections: 174 })
  assert.equal(parseGcAvgAndCount('      0 collections'), null)

  assert.equal(parseGcFrequency('      36s avg frequency'), 36)
  assert.equal(parseGcFrequency('      54s avg frequency'), 54)

  assert.equal(parseGcZeroCollections('      0 collections'), 0)
  assert.equal(parseGcZeroCollections('      12.2 ms avg, 264 total collections'), null)
})

test('parseSparkUrl finds report links but excludes the docs help link spark prints alongside them', () => {
  assert.equal(
    parseSparkUrl('[22:46:04] [ForkJoinPool.commonPool-worker-3/INFO]: https://spark.lucko.me/JjkPxtNI7Y'),
    'https://spark.lucko.me/JjkPxtNI7Y',
  )
  assert.equal(parseSparkUrl('https://spark.lucko.me/JjkPxtNI7Y'), 'https://spark.lucko.me/JjkPxtNI7Y')
  assert.equal(parseSparkUrl('https://spark.lucko.me/OLtFTFJQkd'), 'https://spark.lucko.me/OLtFTFJQkd')
  assert.equal(parseSparkUrl('https://spark.lucko.me/XSxVYzs2TC'), 'https://spark.lucko.me/XSxVYzs2TC')
  // The real distractor: a genuine spark.lucko.me URL that is NOT a report.
  assert.equal(parseSparkUrl('See here for more information: https://spark.lucko.me/docs/misc/Java-agent-warning'), null)
  assert.equal(parseSparkUrl('If you see a warning above that says "WARNING: A Java agent has been loaded dynamically", it can be safely ignored.'), null)
})

test('isUnknownCommandReply flags the vanilla missing-command reply', () => {
  assert.equal(isUnknownCommandReply('Unknown or incomplete command, see below for error'), true)
  assert.equal(isUnknownCommandReply('some other line'), false)
})

test('sparkFoldCategory buckets self-contained lines (spark tps/ping, which tag every line)', () => {
  assert.equal(sparkFoldCategory('> spark tps'), 'echo')
  assert.equal(sparkFoldCategory('> /spark profiler start --timeout 30'), 'echo')
  assert.equal(sparkFoldCategory('[⚡] TPS from last 5s, 10s, 1m, 5m, 15m:'), 'response')
  assert.equal(sparkFoldCategory('[⚡]  *20.0, *20.0, *20.0, *20.0, *20.0'), 'response')
  assert.equal(sparkFoldCategory('[⚡]  14.7/16.7/19.9/31.1;  14.7/17.0/20.3/35.9'), 'response')
  assert.equal(sparkFoldCategory('[⚡]  41%, 41%, 40%  (system)'), 'response')
  assert.equal(sparkFoldCategory('[⚡] Average Pings (min/med/95%ile/max ms) from now, last 15m:'), 'response')
  assert.equal(sparkFoldCategory('https://spark.lucko.me/JjkPxtNI7Y'), 'response')
  assert.equal(sparkFoldCategory('See here for more information: https://spark.lucko.me/docs/misc/Java-agent-warning'), 'response')
  assert.equal(sparkFoldCategory('If you see a warning above that says "WARNING: A Java agent has been loaded dynamically", it can be safely ignored.'), 'response')
  assert.equal(sparkFoldCategory('<Steve> spark is cool'), null)
  assert.equal(sparkFoldCategory('Steve joined the game'), null)
})

test('foldSparkBlocks folds an entire real health-report dump, and closes on the next real line', () => {
  // Verbatim shape from a real `spark health --memory` capture: one tagged
  // trigger, one tagged-but-empty separator, then ~30 raw continuation lines
  // with no timestamp of their own, then ordinary traffic resumes.
  const lines = [
    { content: '[⚡] Generating server health report...', time: '22:45:10' },
    { content: '', time: '22:45:10' },
    { content: '> TPS from last 5s, 10s, 1m, 5m, 15m:' },
    { content: '    20.0, 20.0, 20.0, 20.0, *20.0' },
    { content: '> Tick durations (min/med/95%ile/max ms) from last 10s, 1m:' },
    { content: '    14.3/16.2/18.5/544.4; 14.3/16.8/20.2/544.4' },
    { content: '> CPU usage from last 10s, 1m, 15m:' },
    { content: '    40%, 41%, 40%  (system)' },
    { content: '    10%, 11%, 11%  (process)' },
    { content: '> Memory usage:' },
    { content: '    859.2 MB / 2.0 GB   (41%)' },
    { content: '    [┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻╻]' },
    { content: '> Non-heap memory usage:' },
    { content: '    195.4 MB' },
    { content: '> G1 Eden Space pool usage:' },
    { content: '    151.0 MB / 731.0 MB   (20%)' },
    { content: '     - Usage at last GC: 0 bytes' },
    { content: '> Network usage: (system, last 15m)' },
    { content: '    6.2 KB/s / 100 pps (eth0 rx)' },
    { content: '> Disk usage:' },
    { content: '    41.6 GB / 97.9 GB   (42%)' },
    { content: '<Notch> anyone else lagging?', time: '22:45:11' }, // ordinary chat, real timestamp, should NOT fold
  ]
  const folded = foldSparkBlocks(lines)
  assert.equal(folded.length, lines.length)
  // Everything up to and including "Disk usage" is inside the block.
  for (let i = 0; i < lines.length - 1; i++) {
    assert.equal(folded[i], true, `expected line ${i} (${JSON.stringify(lines[i].content)}) to be folded`)
  }
  // The genuinely new, timestamped chat line closes the block and is untouched.
  assert.equal(folded[lines.length - 1], false)
})

test('foldSparkBlocks folds a real `spark gc` dump the same way', () => {
  const lines = [
    { content: '[⚡] Calculating GC statistics...', time: '22:45:17' },
    { content: '', time: '22:45:17' },
    { content: '> Garbage Collector statistics' },
    { content: '    G1 Young Generation collector:' },
    { content: '      12.2 ms avg, 264 total collections' },
    { content: '      36s avg frequency' },
    { content: '    G1 Old Generation collector:' },
    { content: '      0 collections' },
    { content: '[⚡] Average Pings (min/med/95%ile/max ms) from now, last 15m:', time: '22:45:24' },
  ]
  const folded = foldSparkBlocks(lines)
  assert.deepEqual(folded.slice(0, 8), [true, true, true, true, true, true, true, true])
  // A fresh, tagged, timestamped, non-blank line closes the block — it isn't
  // marked by foldSparkBlocks (sparkFoldCategory handles it independently).
  assert.equal(folded[8], false)
})

test('foldSparkBlocks leaves ordinary console traffic alone', () => {
  const lines = [
    { content: 'Steve joined the game', time: '22:41:00' },
    { content: '<Steve> hello', time: '22:41:05' },
    { content: 'There are 2 of a max of 20 players online', time: '22:41:10' },
  ]
  assert.deepEqual(foldSparkBlocks(lines), [false, false, false])
})

test('the console input treats spark as a command, not chat', () => {
  assert.equal(isCommandName('spark'), true)
  assert.deepEqual(parseConsoleInput('spark tps', isCommandName), { kind: 'command', command: 'spark tps' })
  assert.deepEqual(
    parseConsoleInput('/spark profiler start --timeout 30', isCommandName),
    { kind: 'command', command: 'spark profiler start --timeout 30' },
  )
})
