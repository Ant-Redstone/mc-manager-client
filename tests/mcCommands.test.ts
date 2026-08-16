import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSuggestions, findCommand, isCommandName } from '../src/lib/mcCommands.ts'

// Apply the top suggestion the way the Console's Tab-complete does.
function applyFirst(input: string): string {
  const s = getSuggestions(input)
  return input.slice(0, s.replaceStart) + s.items[0].value + input.slice(s.replaceEnd)
}

test('suggests command names by prefix', () => {
  const s = getSuggestions('ga')
  const values = s.items.map((i) => i.value)
  assert.ok(values.includes('gamemode'))
  assert.ok(values.includes('gamerule'))
  assert.equal(s.replaceStart, 0)
})

test('empty input yields no suggestions', () => {
  assert.equal(getSuggestions('').items.length, 0)
})

test('completes enum arguments after a command', () => {
  const s = getSuggestions('gamemode ')
  assert.deepEqual(s.items.map((i) => i.value), ['survival', 'creative', 'adventure', 'spectator'])
  assert.equal(s.command?.name, 'gamemode')
})

test('narrows enum args by prefix and replaces the token cleanly', () => {
  const s = getSuggestions('gamemode c')
  assert.deepEqual(s.items.map((i) => i.value), ['creative'])
  assert.equal(applyFirst('gamemode c'), 'gamemode creative')
})

test('a leading slash is not tolerated (server-console style)', () => {
  assert.equal(getSuggestions('/ga').items.length, 0)
})

test('unknown commands yield no suggestions', () => {
  assert.equal(getSuggestions('zzzptql').items.length, 0)
  assert.equal(getSuggestions('zzzptql ').items.length, 0)
})

test('findCommand resolves case-insensitively by exact name', () => {
  assert.equal(findCommand('GAMEMODE')?.name, 'gamemode')
  assert.equal(findCommand('nope'), undefined)
})

test('isCommandName knows vanilla commands (incl. ones not in the suggestion list)', () => {
  assert.equal(isCommandName('list'), true)
  assert.equal(isCommandName('OP'), true)
  assert.equal(isCommandName('stop'), true)
  assert.equal(isCommandName('forceload'), true) // not in COMMANDS, still a command
  assert.equal(isCommandName('data'), true)
  assert.equal(isCommandName('hello'), false)
  assert.equal(isCommandName('selfrules'), false) // modded — reached via a leading slash
  assert.equal(isCommandName(''), false)
})
