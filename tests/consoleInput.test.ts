import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseConsoleInput } from '../src/lib/consoleInput.ts'
import { isCommandName } from '../src/lib/mcCommands.ts'

// Parse with the real command-name table, the way the console does.
const parse = (raw: string) => parseConsoleInput(raw, isCommandName)

test('blank input is a no-op', () => {
  assert.deepEqual(parse(''), { kind: 'empty' })
  assert.deepEqual(parse('   '), { kind: 'empty' })
  assert.deepEqual(parse('/'), { kind: 'empty' })
  assert.deepEqual(parse('/   '), { kind: 'empty' })
})

test('plain text is a broadcast', () => {
  assert.deepEqual(parse('hello everyone'), { kind: 'broadcast', message: 'hello everyone' })
  assert.deepEqual(parse('  server restart in 5  '), { kind: 'broadcast', message: 'server restart in 5' })
})

test('a recognised command word without a slash still runs', () => {
  assert.deepEqual(parse('list'), { kind: 'command', command: 'list' })
  assert.deepEqual(parse('op Notch'), { kind: 'command', command: 'op Notch' })
  assert.deepEqual(parse('stop'), { kind: 'command', command: 'stop' })
  // A modern command missing from the curated suggestion list still counts.
  assert.deepEqual(parse('forceload add 0 0'), { kind: 'command', command: 'forceload add 0 0' })
})

test('a leading slash forces a command, even an unknown/modded one', () => {
  assert.deepEqual(parse('/list'), { kind: 'command', command: 'list' })
  assert.deepEqual(parse('/selfrules set doFireTick false'), {
    kind: 'command',
    command: 'selfrules set doFireTick false',
  })
})

test('say is intercepted into a broadcast, with or without a slash', () => {
  assert.deepEqual(parse('say hi team'), { kind: 'broadcast', message: 'hi team' })
  assert.deepEqual(parse('/say hi team'), { kind: 'broadcast', message: 'hi team' })
  assert.deepEqual(parse('SAY  spaced  out'), { kind: 'broadcast', message: 'spaced  out' })
  // Bare say with nothing to say is a no-op, not an empty broadcast.
  assert.deepEqual(parse('say'), { kind: 'empty' })
  assert.deepEqual(parse('say   '), { kind: 'empty' })
})

test('a word that merely starts with "say" is not the say command', () => {
  assert.deepEqual(parse('saying hello'), { kind: 'broadcast', message: 'saying hello' })
})
