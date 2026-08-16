import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serverPath, parseMemSpecMb } from '../src/lib/servers.ts'

test('serverPath: a null id returns the flat legacy path untouched', () => {
  assert.equal(serverPath(null, '/status'), '/status')
  assert.equal(serverPath(null, '/console'), '/console')
  assert.equal(serverPath(null, '/players'), '/players')
  assert.equal(serverPath(null, '/properties'), '/properties')
})

test('serverPath: a real id namespaces under /servers/<id>/...', () => {
  assert.equal(serverPath('survival', '/status'), '/servers/survival/status')
  assert.equal(serverPath('creative', '/console'), '/servers/creative/console')
  assert.equal(serverPath('survival', '/start'), '/servers/survival/start')
})

test('serverPath: works whether or not the suffix already has a leading slash', () => {
  assert.equal(serverPath(null, 'status'), '/status')
  assert.equal(serverPath('survival', 'status'), '/servers/survival/status')
})

test('serverPath: never produces a double slash or a missing leading slash', () => {
  const cases: [string | null, string][] = [
    [null, '/status'],
    [null, 'status'],
    ['survival', '/status'],
    ['survival', 'status'],
    ['survival', '/files?path=a/b'],
    [null, '/files?path=a/b'],
    ['a-b_c.9', '/backups'],
  ]
  for (const [id, suffix] of cases) {
    const path = serverPath(id, suffix)
    assert.ok(path.startsWith('/'), `expected a leading slash: "${path}"`)
    assert.ok(!path.includes('//'), `expected no double slash: "${path}"`)
  }
})

test('serverPath: percent-encodes special characters in the id', () => {
  assert.equal(serverPath('a b', '/status'), '/servers/a%20b/status')
})

test('parseMemSpecMb: reads the registry\'s -Xms/-Xmx spec format', () => {
  assert.equal(parseMemSpecMb('1G'), 1024)
  assert.equal(parseMemSpecMb('2G'), 2048)
  assert.equal(parseMemSpecMb('512M'), 512)
  assert.equal(parseMemSpecMb('512m'), 512)
  assert.equal(parseMemSpecMb('1024K'), 1)
})

test('parseMemSpecMb: returns null for anything it can\'t parse', () => {
  assert.equal(parseMemSpecMb(''), null)
  assert.equal(parseMemSpecMb('lots'), null)
  assert.equal(parseMemSpecMb('1'), null)
})
