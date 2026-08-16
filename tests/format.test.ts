import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBytes, formatWhen } from '../src/lib/format.ts'
import { formatPlaytime, formatSessionLength } from '../src/lib/playtime.ts'

test('formatBytes scales units', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1023), '1023 B')
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(1048576), '1.0 MB')
})

test('formatWhen is relative and deterministic with a fixed now', () => {
  const t = Date.parse('2024-01-01T00:00:00Z')
  assert.equal(formatWhen('2024-01-01T00:00:00Z', t + 30_000), 'just now')
  assert.equal(formatWhen('2024-01-01T00:00:00Z', t + 90_000), '1m ago')
  assert.equal(formatWhen('2024-01-01T00:00:00Z', t + 3_600_000), '1h ago')
  assert.equal(formatWhen('not-a-date', t), 'not-a-date')
})

test('formatPlaytime converts ticks to a compact duration', () => {
  assert.equal(formatPlaytime(72_000), '1h 0m')    // 20 ticks/s -> 3600 s
  assert.equal(formatPlaytime(24_000), '20m')       // 1200 s
  assert.equal(formatPlaytime(1_728_000), '1d 0h')  // 86400 s
  assert.equal(formatPlaytime(0), '< 1m')
})

test('formatSessionLength measures elapsed time; null on bad input', () => {
  const start = Date.parse('2024-01-01T00:00:00Z')
  assert.equal(formatSessionLength('2024-01-01T00:00:00Z', start + (2 * 3600 + 15 * 60) * 1000), '2h 15m')
  assert.equal(formatSessionLength('2024-01-01T00:00:00Z', start + 5 * 60 * 1000), '5m')
  assert.equal(formatSessionLength('nope', start), null)
})
