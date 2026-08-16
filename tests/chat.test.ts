import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePlayerChat, isChatLine, type ChatLine } from '../src/lib/chat.ts'

function lines(...ls: string[]): ChatLine[] {
  return ls.map((line, i) => ({ seq: i, line }))
}

test('parses a vanilla chat line with a timestamp', () => {
  const out = parsePlayerChat(lines('[12:34:56] [Server thread/INFO]: <Notch> hello there'), 'Notch')
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'hello there')
  assert.equal(out[0].time, '12:34:56')
  assert.equal(out[0].id, 0)
})

test('parses a line without a timestamp; time is undefined', () => {
  const out = parsePlayerChat(lines('<Notch> hi'), 'Notch')
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'hi')
  assert.equal(out[0].time, undefined)
})

test('matches the exact name, not a substring', () => {
  const out = parsePlayerChat(lines('<Notch2> a', '<otch> b', '<Notch> c'), 'Notch')
  assert.deepEqual(out.map((m) => m.text), ['c'])
})

test('ignores non-chat console lines', () => {
  const out = parsePlayerChat(lines(
    '> list',
    '[12:00:00] [Server thread/INFO]: Notch joined the game',
    '[12:00:00] [Server thread/INFO]: [Server] hello',
    '* Notch waves',
    'Notch fell from a high place',
  ), 'Notch')
  assert.equal(out.length, 0)
})

test('captures angle brackets inside the message body', () => {
  const out = parsePlayerChat(lines('<Notch> use <F3> to debug'), 'Notch')
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'use <F3> to debug')
})

test('accepts names with digits and underscores', () => {
  const out = parsePlayerChat(lines('<xX_Steve_99Xx> yo'), 'xX_Steve_99Xx')
  assert.equal(out.length, 1)
})

test('rejects names longer than 16 characters', () => {
  const out = parsePlayerChat(lines('<abcdefghijklmnopq> hi'), 'abcdefghijklmnopq')
  assert.equal(out.length, 0)
})

test('empty input yields an empty array; order is preserved', () => {
  assert.deepEqual(parsePlayerChat([], 'Notch'), [])
  const out = parsePlayerChat(lines('<Notch> one', '<Steve> x', '<Notch> two'), 'Notch')
  assert.deepEqual(out.map((m) => m.text), ['one', 'two'])
})

test('isChatLine distinguishes chat from noise', () => {
  assert.equal(isChatLine('[12:00:00] [Server thread/INFO]: <Notch> hi'), true)
  assert.equal(isChatLine('> list'), false)
  assert.equal(isChatLine('[Server] announcement'), false)
})
