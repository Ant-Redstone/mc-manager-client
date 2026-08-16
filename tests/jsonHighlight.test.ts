import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  highlightJson, highlightProperties, checkJson, languageFor, HIGHLIGHT_LIMIT,
} from '../src/lib/jsonHighlight.ts'

test('checkJson accepts valid and empty, rejects malformed', () => {
  assert.equal(checkJson('{"a":1}').ok, true)
  assert.equal(checkJson('').ok, true)
  assert.equal(checkJson('   ').ok, true)
  const bad = checkJson('{"a":1,}')
  assert.equal(bad.ok, false)
  assert.equal(typeof bad.error, 'string')
})

test('checkJson line number is a positive integer when the engine reports one', () => {
  const bad = checkJson('{\n  "a": 1\n  "b": 2\n}')
  assert.equal(bad.ok, false)
  // Best-effort: some engines omit a position, so line may be undefined.
  assert.ok(bad.line === undefined || (Number.isInteger(bad.line) && (bad.line ?? 0) >= 1))
})

test('highlightJson escapes HTML (XSS guard)', () => {
  const out = highlightJson('{"x":"<script>alert(1)</script>"}')
  assert.ok(out.includes('&lt;script&gt;'))
  assert.ok(!out.includes('<script>'))
})

test('highlightJson classifies every token kind', () => {
  const out = highlightJson('{"key": "val", "n": 3, "b": true, "z": null}')
  for (const cls of ['j-key', 'j-str', 'j-num', 'j-bool', 'j-null', 'j-punc']) {
    assert.ok(out.includes(`class="${cls}"`), `missing ${cls}`)
  }
})

test('highlightJson falls back to plain text past the size limit', () => {
  const big = '"' + 'x'.repeat(HIGHLIGHT_LIMIT) + '"'
  assert.ok(!highlightJson(big).includes('j-str'))
})

test('highlightProperties colours comments and key/value pairs', () => {
  const out = highlightProperties('# a comment\nkey=value\nother:thing')
  for (const cls of ['p-comment', 'p-key', 'p-eq', 'p-val']) {
    assert.ok(out.includes(`class="${cls}"`), `missing ${cls}`)
  }
})

test('highlightProperties keeps everything after the first separator in the value', () => {
  const out = highlightProperties('motd=a=b=c')
  assert.ok(out.includes('<span class="p-key">motd</span>'))
  assert.ok(out.includes('<span class="p-val">a=b=c</span>'))
})

test('highlightProperties escapes HTML in values', () => {
  const out = highlightProperties('x=<b>')
  assert.ok(out.includes('&lt;b&gt;'))
  assert.ok(!out.includes('<b>'))
})

test('languageFor maps extensions case-insensitively', () => {
  assert.equal(languageFor('a.json'), 'json')
  assert.equal(languageFor('server.properties'), 'properties')
  assert.equal(languageFor('notes.txt'), 'text')
  assert.equal(languageFor('A.JSON'), 'json')
  assert.equal(languageFor('X.PROPERTIES'), 'properties')
})
