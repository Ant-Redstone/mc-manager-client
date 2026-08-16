import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { apiFetch, failureMessage, type ApiResult } from '../src/lib/api.ts'

const realFetch = globalThis.fetch

function stubFetch(status: number, body: string, contentType = 'application/json') {
  globalThis.fetch = (async () =>
    new Response(body, { status, headers: { 'content-type': contentType } })) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
})

test('403 is its own kind, not folded into error or unsupported', async () => {
  stubFetch(403, JSON.stringify({ success: false, error: 'missing permission: servers.view' }))
  const r = await apiFetch('/servers')
  assert.equal(r.kind, 'forbidden')
  assert.equal(r.kind === 'forbidden' && r.message, 'missing permission: servers.view')
})

test('403 behind a proxy that answers HTML still classifies as forbidden', async () => {
  // Cloudflare and nginx answer with an HTML body, so res.json() throws. The
  // status has to decide the kind, never the parse.
  stubFetch(403, '<html><body>403 Forbidden</body></html>', 'text/html')
  const r = await apiFetch('/servers')
  assert.equal(r.kind, 'forbidden')
  assert.equal(r.kind === 'forbidden' && r.message, 'You do not have permission to do that')
})

test('404 stays unsupported and 401 stays unauthorized', async () => {
  stubFetch(404, '404 page not found', 'text/plain')
  assert.equal((await apiFetch('/nope')).kind, 'unsupported')

  stubFetch(401, JSON.stringify({ success: false, error: 'missing Authorization header' }))
  assert.equal((await apiFetch('/players')).kind, 'unauthorized')
})

test('a successful envelope is unwrapped', async () => {
  stubFetch(200, JSON.stringify({ success: true, data: [{ id: 'default' }] }))
  const r = await apiFetch<{ id: string }[]>('/servers')
  assert.equal(r.kind, 'ok')
  assert.deepEqual(r.kind === 'ok' && r.data, [{ id: 'default' }])
})

// The regression this guards: call sites used to write
// `r.kind === 'error' ? r.message : fallback`, so the day 403 stopped being an
// `error` they would all have silently swapped the server's real reason for a
// generic "Failed to ...".
test('failureMessage prefers the real reason for both error and forbidden', () => {
  const forbidden: ApiResult<never> = { kind: 'forbidden', message: 'missing permission: servers.view' }
  const failed: ApiResult<never> = { kind: 'error', message: 'world is locked' }

  assert.equal(failureMessage(forbidden, 'Failed to load servers'), 'missing permission: servers.view')
  assert.equal(failureMessage(failed, 'Failed to load servers'), 'world is locked')
})

test('failureMessage falls back for kinds that carry no message', () => {
  assert.equal(failureMessage({ kind: 'network' }, 'Failed to load servers'), 'Failed to load servers')
  assert.equal(failureMessage({ kind: 'unsupported' }, 'Failed to load servers'), 'Failed to load servers')
  assert.equal(failureMessage({ kind: 'unauthorized' }, 'Failed to load servers'), 'Failed to load servers')
})
