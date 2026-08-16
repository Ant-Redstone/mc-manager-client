import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRestartPlan, planDuration, formatCountdown, WARN_OPTIONS } from '../src/lib/restartPlan.ts'

// This schedule decides when a server with people on it goes down, so the
// arithmetic gets pinned rather than eyeballed in the UI.

test('the restart lands at the longest warning, not the sum of them', () => {
  // Picking "10 min" and "1 min" means ONE countdown where players hear it
  // twice. Summing would restart 11 minutes out and contradict the label.
  const plan = buildRestartPlan([600, 60])

  assert.equal(planDuration([600, 60]), 600)
  assert.equal(plan.length, 3)
  assert.deepEqual(
    plan.map((s) => [s.at, s.remaining]),
    [
      [0, 600], // "in 10 minutes", immediately
      [540, 60], // "in 1 minute", 9 minutes later
      [600, 0], // down
    ],
  )
  assert.equal(plan[plan.length - 1].say, null, 'the final step is the restart, not a message')
})

test('order of ticking does not change the schedule', () => {
  const a = buildRestartPlan([30, 300, 5])
  const b = buildRestartPlan([5, 30, 300])
  assert.deepEqual(a, b)
})

test('duplicates collapse', () => {
  assert.deepEqual(buildRestartPlan([60, 60, 60]), buildRestartPlan([60]))
})

test('no warnings selected restarts immediately', () => {
  const plan = buildRestartPlan([])
  assert.equal(plan.length, 1)
  assert.equal(plan[0].at, 0)
  assert.equal(plan[0].say, null)
  assert.equal(planDuration([]), 0)
})

test('every offered option produces a coherent plan', () => {
  for (const o of WARN_OPTIONS) {
    const plan = buildRestartPlan([o])
    assert.equal(planDuration([o]), o, `option ${o} should restart at ${o}s`)
    assert.equal(plan[0].at, 0, 'the first warning fires immediately')
    assert.ok(plan[0].say?.includes(formatCountdown(o)))
  }
})

test('all options together warn seven times in one ten-minute countdown', () => {
  const plan = buildRestartPlan([...WARN_OPTIONS])
  assert.equal(planDuration([...WARN_OPTIONS]), 600)
  assert.equal(plan.filter((s) => s.say !== null).length, WARN_OPTIONS.length)
  // Strictly increasing fire times: no two warnings land at the same instant.
  const times = plan.map((s) => s.at)
  assert.deepEqual(times, [...times].sort((x, y) => x - y))
  assert.equal(new Set(times).size, times.length)
})

test('countdown wording reads naturally in pt-BR', () => {
  assert.equal(formatCountdown(5), '5 segundos')
  assert.equal(formatCountdown(1), '1 segundo')
  assert.equal(formatCountdown(60), '1 minuto')
  assert.equal(formatCountdown(120), '2 minutos')
  assert.equal(formatCountdown(600), '10 minutos')
  assert.equal(formatCountdown(90), '1m 30s')
})
