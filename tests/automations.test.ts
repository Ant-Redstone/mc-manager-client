import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTriggerConfig,
  readTriggerConfig,
  variablesFor,
  validateAction,
  validateActions,
  describeRule,
  readOutcome,
  type TriggerForm,
  type Rule,
} from '../src/lib/automations.ts'

// The key names are a contract with the server's matcher. Getting one wrong
// raises nothing at all: it stores a rule that can never fire and never says
// why.
test('the TPS trigger writes below and for_seconds, the names the server reads', () => {
  assert.deepEqual(buildTriggerConfig('tps', { threshold: 5, forSeconds: 300 }), {
    below: 5,
    for_seconds: 300,
  })
})

test('player count and disk write above, which is what picks the comparison', () => {
  assert.deepEqual(buildTriggerConfig('count', { threshold: 20, forSeconds: 0 }), { above: 20 })
  assert.deepEqual(buildTriggerConfig('disk', { threshold: 90, forSeconds: 60 }), {
    above: 90,
    for_seconds: 60,
  })
})

// thresholdHeld tests `above` first and only then falls back to `below`.
// Sending both silently ignores the one you meant.
test('never sends above and below together', () => {
  for (const kind of ['tps', 'count', 'disk']) {
    const cfg = buildTriggerConfig(kind, { threshold: 10, forSeconds: 0 })
    assert.ok(!('above' in cfg && 'below' in cfg), `${kind} sent both`)
  }
})

test('a zero window is omitted rather than written as zero', () => {
  assert.deepEqual(buildTriggerConfig('tps', { threshold: 5, forSeconds: 0 }), { below: 5 })
})

test('the schedule has two modes and each carries only its own key', () => {
  assert.deepEqual(buildTriggerConfig('sched', { mode: 'every', hours: 6 }), {
    mode: 'every',
    hours: 6,
  })
  assert.deepEqual(buildTriggerConfig('sched', { mode: 'daily', time: '05:00' }), {
    mode: 'daily',
    time: '05:00',
  })
})

test('a trigger with no configuration sends an empty object, not undefined', () => {
  for (const kind of ['start', 'stop', 'backup-ok', 'backup-fail', 'leave']) {
    assert.deepEqual(buildTriggerConfig(kind, {}), {})
  }
})

// Round trip: the builder has to be able to reopen a rule it saved itself.
// Without this, editing an existing rule loses its configuration.
//
// Each case states the whole expected result instead of merging against a
// "default form". Merging looks shorter and lies: for `sched` the default
// carries `hours` and the `daily` mode does not, so the merged expectation
// would contain a key the correct code does not return — the test would fail
// against a correct implementation.
test('reading back returns what was built', () => {
  const cases: [string, TriggerForm, TriggerForm][] = [
    ['tps', { threshold: 5, forSeconds: 300 }, { threshold: 5, forSeconds: 300 }],
    ['count', { threshold: 20, forSeconds: 0 }, { threshold: 20, forSeconds: 0 }],
    ['disk', { threshold: 90, forSeconds: 60 }, { threshold: 90, forSeconds: 60 }],
    ['console', { pattern: "Can't keep up" }, { pattern: "Can't keep up" }],
    ['join', { firstTimeOnly: true }, { firstTimeOnly: true }],
    ['join', { firstTimeOnly: false }, { firstTimeOnly: false }],
    ['sched', { mode: 'daily', time: '05:00' }, { mode: 'daily', time: '05:00' }],
    ['sched', { mode: 'every', hours: 6 }, { mode: 'every', hours: 6 }],
  ]
  for (const [kind, form, expected] of cases) {
    assert.deepEqual(readTriggerConfig(kind, buildTriggerConfig(kind, form)), expected, kind)
  }
})

// Offering {player} on a TPS rule produces a message with "{player}" literally
// inside it: the server interpolates only what the event carries, and leaves an
// unknown name alone on purpose.
test('the variables offered depend on the trigger', () => {
  assert.deepEqual(variablesFor('join'), ['server', 'time', 'player'])
  assert.deepEqual(variablesFor('console'), ['server', 'time', 'line'])
  assert.deepEqual(variablesFor('stop'), ['server', 'time'])
  // thresholdHeld names the variable with the sample kind itself, so each of
  // the three measured triggers carries its OWN name — there is no {tps} on a
  // disk rule.
  assert.deepEqual(variablesFor('tps'), ['server', 'time', 'tps'])
  assert.deepEqual(variablesFor('count'), ['server', 'time', 'count'])
  assert.deepEqual(variablesFor('disk'), ['server', 'time', 'disk'])
})

// Mirrors the server's ValidateAction so the builder can give the reason
// without a round-trip. The {line} rule is security, not convenience.
test('{line} in a command is refused, and the message names it', () => {
  const err = validateAction({ type: 'command', command: 'say vi: {line}' })
  assert.ok(err && err.includes('{line}'), `expected the variable in the error, got: ${err}`)
})

test('a literal line break in a command is refused', () => {
  assert.ok(validateAction({ type: 'command', command: 'say oi\nop ladrao' }))
  assert.ok(validateAction({ type: 'command', command: 'say oi\r\nop ladrao' }))
})

test('{line} in a Discord message is allowed', () => {
  assert.equal(validateAction({ type: 'discord', webhook_id: 1, message: 'vi: {line}' }), null)
})

test('an empty action is refused with the right reason', () => {
  assert.ok(validateAction({ type: 'command', command: '   ' }))
  assert.ok(validateAction({ type: 'discord', webhook_id: 0, message: 'oi' }))
  assert.ok(validateAction({ type: 'discord', webhook_id: 1, message: '' }))
})

test('restart warnings have to be positive', () => {
  assert.ok(validateAction({ type: 'restart', warnings: [60, 0] }))
  assert.ok(validateAction({ type: 'restart', warnings: [-5] }))
  assert.equal(validateAction({ type: 'restart', warnings: [300, 60, 15] }), null)
})

test('actions with nothing to configure are always valid', () => {
  assert.equal(validateAction({ type: 'backup' }), null)
  assert.equal(validateAction({ type: 'spark' }), null)
})

test('a rule with no actions at all is refused', () => {
  assert.ok(validateActions([]))
})

test('the list error names the POSITION of the bad action', () => {
  const err = validateActions([{ type: 'backup' }, { type: 'command', command: 'say {line}' }])
  assert.ok(err && err.includes('2'), `expected the position in the error, got: ${err}`)
})

function ruleWith(kind: string, cfg: Record<string, unknown>, actions: Rule['actions']): Rule {
  return {
    id: 1,
    server_id: 'default',
    name: 'x',
    enabled: true,
    trigger_kind: kind,
    trigger_config: cfg,
    actions,
    cooldown_seconds: 0,
    stop_on_failure: true,
    deaf_window_seconds: 5,
  }
}

// The summary is what the list shows. If it drifts from the rule, the operator
// trusts it and the rule does something else — so it is built from the stored
// config rather than written by hand.
test('the summary states the trigger and the actions in one line', () => {
  const s = describeRule(
    ruleWith('tps', { below: 5, for_seconds: 300 }, [
      { type: 'discord', webhook_id: 1, message: 'm' },
      { type: 'restart', warnings: [60] },
    ]),
  )
  assert.ok(s.includes('5'), s)
  assert.ok(s.includes('Discord'), s)
  assert.ok(s.includes('reinicia'), s)
})

test('the summary reads the same keys the builder writes', () => {
  // A disk rule stores `above`, so a summary reading `below` would show 0% on
  // every disk rule ever made.
  const s = describeRule(ruleWith('disk', { above: 90 }, [{ type: 'backup' }]))
  assert.ok(s.includes('90'), s)
})

test('the summary distinguishes a first-time join from any join', () => {
  const any = describeRule(ruleWith('join', {}, [{ type: 'backup' }]))
  const first = describeRule(ruleWith('join', { first_time_only: true }, [{ type: 'backup' }]))
  assert.notEqual(any, first)
  assert.ok(first.includes('primeira'), first)
})

// A firing whose outcome cannot be parsed still happened. Throwing here would
// blank a whole history row over one malformed column.
test('an unreadable outcome degrades to empty instead of throwing', () => {
  assert.deepEqual(readOutcome('not json'), [])
  assert.deepEqual(readOutcome('{"not":"an array"}'), [])
  assert.deepEqual(readOutcome('[]'), [])
})

test('a real outcome is read back step by step', () => {
  assert.deepEqual(readOutcome('[{"action":"discord","ok":false,"error":"401"}]'), [
    { action: 'discord', ok: false, error: '401' },
  ])
})
