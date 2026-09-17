// Non-business carrier tests. No Host boot, model, production data, or timer tick.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough, Readable, Writable } from 'node:stream'
import { unrun } from 'unrun'
import { apply, Config } from '../index.js'

const { module: { createCronTransport } } = await unrun({ path: fileURLToPath(new URL('../src/client/transport.ts', import.meta.url)) })
const capability = () => Response.json({ ok: true, result: { transport: 'connection-fetch', version: 1 } })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

function fixture(t, realConnection, { web = true } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }) // record timers; never tick
  const dir = mkdtempSync(join(tmpdir(), 'cron-transport-'))
  const cleanup = [], routes = new Map(), legacy = []
  const calls = { resume: 0, followup: 0, read: 0 }
  const header = { id: 'cold', cwd: '/fixture', delegationDepth: 0 }
  const roots = []
  const ctx = {
    logger: { info() {}, warn() {} },
    agents: { roots: () => roots, resume: () => { calls.resume++; throw new Error('must not resume') } },
    tools: { register() {} },
    agentPresets: { mount() { throw new Error('must not mount') } },
    agentDefaultModel: { currentSelection() { throw new Error('must not select model') } },
    sessionPersistence: { stat: async () => { calls.read++; return { header, revision: '1' } } },
    on() {},
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') cleanup.push(dispose); return dispose },
    get: name => services[name],
    inject(names, activate) { if (names.every(name => services[name] !== undefined)) activate(ctx) },
  }
  const connection = realConnection ?? {
    fetch: { register(route) {
      assert.match(route.path, /^\/api\/[a-z/]+$/)
      assert.ok(route.methods.length > 0)
      assert.equal(route.requestBody, route.methods.includes('POST') ? 'streaming' : 'buffered')
      assert.ok(!routes.has(route.path), 'no duplicate exact routes')
      routes.set(route.path, route)
      return ctx.effect(() => () => routes.delete(route.path))
    } },
    requestRejection: request => request.headers.host === 'localhost' ? undefined : 401,
  }
  const services = {
    connection,
    webRuntime: { trustedHosts: [] },
    webServer: { register(route) { legacy.push(route); return () => legacy.splice(legacy.indexOf(route), 1) } },
  }
  if (!web) { delete services.webServer; delete services.webRuntime }
  Object.assign(ctx, { webServer: services.webServer, webRuntime: services.webRuntime })
  const storagePath = join(dir, 'tasks.json'), historyPath = join(dir, 'history.jsonl')
  apply(ctx, Config({ storagePath, historyPath, systemNotify: false, tasks: [
    { id: 'task-cold', sessionId: 'cold', prompt: 'fixture-only', every: 60 },
  ] }))
  const fetchRequest = request => {
    if (realConnection) return realConnection.createSharedFetchHandler('/api').fetch(request)
    const route = routes.get(new URL(request.url).pathname)
    return route?.methods.includes(request.method) ? route.fetch(request) : Promise.resolve(new Response('not found', { status: 404 }))
  }
  const post = (method, payload = {}, signal) => fetchRequest(new Request(`http://desktop.invalid/api/cron/${method}`, {
    method: 'POST', body: JSON.stringify(payload), signal,
  }))
  const close = () => { for (const dispose of cleanup.splice(0).reverse()) dispose(); rmSync(dir, { recursive: true, force: true }) }
  t.after(close)
  return { ctx, services, roots, routes, legacy, calls, post, fetchRequest, storagePath, historyPath, close }
}

async function assertReadOnly(f) {
  const before = [f.storagePath, f.historyPath].map(path => existsSync(path) ? readFileSync(path, 'utf8') : null)
  const cap = await f.fetchRequest(new Request('http://desktop.invalid/api/cron/capabilities'))
  assert.deepEqual(await cap.json(), { ok: true, result: { transport: 'connection-fetch', version: 1 } })
  assert.equal(cap.headers.get('cache-control'), 'no-store')
  const owners = await (await f.post('owners')).json()
  assert.equal(owners.result[0].sessionId, 'cold')
  assert.equal(owners.result[0].taskCount, 1)
  const list = await (await f.post('list', { sessionId: 'cold' })).json()
  assert.equal(list.result.tasks[0].id, 'task-cold')
  assert.deepEqual((await (await f.post('history', { sessionId: 'cold' })).json()).result, { records: [] })
  assert.deepEqual([f.storagePath, f.historyPath].map(path => existsSync(path) ? readFileSync(path, 'utf8') : null), before)
  assert.equal(f.calls.resume, 0)
  assert.equal(f.calls.followup, 0)
}

test('exact shared routes serve cold owners/list/history without Web services or business work', async t => {
  const f = fixture(t, undefined, { web: false })
  assert.equal(f.legacy.length, 0, 'Desktop never activates the Web injection')
  await assertReadOnly(f)
  assert.equal((await f.post('constructor')).status, 404)
  assert.equal((await f.post('toString')).status, 404)
  assert.equal((await f.post('__proto__')).status, 404)
  assert.equal((await f.post('owners', { sessionId: 'cold' })).status, 400)
  assert.equal((await f.post('add', { sessionId: 'cold', prompt: 'never create', every: 60 })).status, 400)
  const huge = await f.fetchRequest(new Request('http://desktop.invalid/api/cron/list', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) }))
  assert.equal(huge.status, 400)
  assert.match((await huge.json()).error.message, /too large/)
  f.close()
  assert.equal(f.routes.size, 0)
})

test('shared metadata subscribers coalesce; cancellation and owner verification stay fresh', async t => {
  const f = fixture(t), gate = deferred()
  let signal, count = 0
  f.ctx.sessionPersistence.stat = (_id, options) => { count++; signal = options.signal; return gate.promise }
  const a = new AbortController(), b = new AbortController()
  const one = f.post('list', { sessionId: 'cold' }, a.signal)
  const two = f.post('history', { sessionId: 'cold' }, b.signal)
  await flush()
  assert.equal(count, 1)
  a.abort()
  assert.equal((await one).status, 400)
  assert.equal(signal.aborted, false)
  b.abort()
  assert.equal((await two).status, 400)
  assert.equal(signal.aborted, true)
  assert.equal((await f.post('list', { sessionId: 'cold' })).status, 400)
  assert.equal(count, 1, 'ignored abort must not spawn another backend scan')
  gate.resolve({ header: { id: 'cold', cwd: '/fixture' }, revision: '1' })
  await flush()
  f.ctx.sessionPersistence.stat = async () => ({ header: { id: 'cold', origin: {} }, revision: '2' })
  assert.equal((await f.post('list', { sessionId: 'cold' })).status, 400, 'no settled owner authority cached')
})

test('transport disposal cancels outstanding body reads and owner scans', async t => {
  const f = fixture(t), gate = deferred()
  let signal
  f.ctx.sessionPersistence.stat = (_id, options) => { signal = options.signal; return gate.promise }
  const pending = f.post('list', { sessionId: 'cold' })
  await flush()
  const body = new ReadableStream({ start() {}, cancel() {} })
  const reading = f.fetchRequest(new Request('http://desktop.invalid/api/cron/list', { method: 'POST', body, duplex: 'half' }))
  f.close()
  assert.equal((await pending).status, 400)
  assert.equal((await reading).status, 400)
  assert.equal(signal.aborted, true)
  gate.resolve({ header: { id: 'cold' }, revision: '1' })
})

async function legacyRequest(route, method, host = 'localhost') {
  const req = Object.assign(new EventEmitter(), { method: 'POST', url: `/cron/api/${method}`, headers: { host }, destroy() {} })
  let status, body
  const res = Object.assign(new EventEmitter(), { headersSent: false, writeHead(code) { status = code; this.headersSent = true }, end(value) { body = value } })
  const pending = route.handler(req, res)
  req.emit('data', Buffer.from('{}')); req.emit('end')
  await pending
  return { status, body }
}

test('modern Web legacy alias reuses authentication, rejects inherited methods', async t => {
  const f = fixture(t)
  assert.equal((await legacyRequest(f.legacy[0], 'owners', 'untrusted')).status, 401)
  assert.equal((await legacyRequest(f.legacy[0], 'constructor')).status, 404)
  assert.equal((await legacyRequest(f.legacy[0], '__proto__')).status, 404)
  assert.equal((await legacyRequest(f.legacy[0], 'owners')).status, 200)
  delete f.services.connection
  assert.equal((await legacyRequest(f.legacy[0], 'owners')).status, 403, 'Connection withdrawal cannot downgrade modern alias authentication')
})

test('client only falls back on read-only capability 404/405, never auth/network/body failures', async () => {
  for (const status of [404, 405, 401, 403, 500, 200]) {
    const calls = []
    const transport = createCronTransport(async (url, options) => {
      calls.push([url, options.method])
      if (options.method === 'GET') return new Response(status === 200 ? '<html>not a capability</html>' : '', { status })
      return Response.json({ ok: true, result: {} })
    })
    if ([404, 405].includes(status)) {
      await transport.request('add', { sessionId: 'fixture' })
      assert.deepEqual(calls, [['/api/cron/capabilities', 'GET'], ['/cron/api/add', 'POST']])
    } else {
      await assert.rejects(transport.request('add', { sessionId: 'fixture' }))
      assert.equal(calls.length, 1)
    }
  }
  const transport = createCronTransport(async () => { throw new Error('offline') })
  await assert.rejects(transport.request('run'), /offline/)
})

test('client mutation is sent once even for lost or missing-route responses; next call re-probes', async () => {
  const calls = []
  const transport = createCronTransport(async (url, options) => {
    calls.push([url, options.method])
    if (options.method === 'GET') return capability()
    return new Response('not found', { status: 404 })
  })
  await assert.rejects(transport.request('add', {}))
  await assert.rejects(transport.request('run', {}))
  assert.deepEqual(calls, [['/api/cron/capabilities', 'GET'], ['/api/cron/add', 'POST'], ['/api/cron/capabilities', 'GET'], ['/api/cron/run', 'POST']])
})

test('client discovery single-flight cancellation does not cancel another subscriber', async () => {
  const gate = deferred(), calls = []; let probeSignal
  const transport = createCronTransport(async (url, options) => {
    calls.push(url)
    if (options.method === 'GET') { probeSignal = options.signal; return gate.promise }
    return Response.json({ ok: true, result: [] })
  })
  const a = new AbortController(), b = new AbortController()
  const one = transport.request('owners', {}, a.signal), two = transport.request('owners', {}, b.signal)
  a.abort()
  await assert.rejects(one)
  assert.equal(probeSignal.aborted, false)
  gate.resolve(capability())
  await two
  assert.deepEqual(calls, ['/api/cron/capabilities', '/api/cron/owners'])
})

test('cancelled non-settling capability remains bounded; reset cannot release a late POST', async () => {
  const gate = deferred(), calls = []
  const transport = createCronTransport(async (url) => { calls.push(url); return gate.promise })
  const one = transport.request('add', {})
  transport.reset()
  await assert.rejects(one)
  await assert.rejects(transport.request('add', {}), /cancellation pending/)
  gate.resolve(capability())
  await flush()
  assert.deepEqual(calls, ['/api/cron/capabilities'])
})

test('shared CRUD preserves envelopes and live-root ownership without scheduling', async t => {
  const f = fixture(t, undefined, { web: false })
  f.roots.push({ session: { id: 'owner' }, followup() { f.calls.followup++ } })
  const added = await (await f.post('add', { id: 'dynamic', sessionId: 'owner', prompt: 'synthetic', every: 60 })).json()
  assert.equal(added.ok, true)
  assert.equal(added.result.task.id, 'dynamic')
  assert.equal(added.result.task.sessionId, 'owner')
  assert.equal((await f.post('update', { id: 'dynamic', sessionId: 'cold', prompt: 'forged' })).status, 400)
  const updated = await (await f.post('update', { id: 'dynamic', sessionId: 'owner', prompt: 'updated fixture' })).json()
  assert.equal(updated.result.task.prompt, 'updated fixture')
  const toggled = await (await f.post('toggle', { id: 'dynamic', sessionId: 'owner', enabled: false })).json()
  assert.equal(toggled.result.task.enabled, false)
  const removed = await (await f.post('remove', { id: 'dynamic', sessionId: 'owner' })).json()
  assert.equal(removed.ok, true)
  assert.equal((await (await f.post('list', { sessionId: 'owner' })).json()).result.tasks.length, 0)
  assert.equal(f.calls.resume, 0)
  assert.equal(f.calls.followup, 0)
})

test('capability discovery deadline bounds callers even when carrier ignores cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const gate = deferred(); let count = 0
  const transport = createCronTransport(async () => { count++; return gate.promise })
  const operation = transport.request('run')
  const rejected = assert.rejects(operation, /timed out/)
  t.mock.timers.tick(30_000)
  await rejected
  await assert.rejects(transport.request('run'), /cancellation pending/)
  assert.equal(count, 1)
  gate.resolve(capability())
  await flush()
})

test('Host replacement is rediscovered; no settled legacy selection survives', async () => {
  const calls = []; let modern = false
  const transport = createCronTransport(async (url, options) => {
    calls.push(url)
    if (options.method === 'GET') return modern ? capability() : new Response('', { status: 404 })
    return Response.json({ ok: true, result: [] })
  })
  await transport.request('owners')
  modern = true
  await transport.request('owners')
  assert.deepEqual(calls, ['/api/cron/capabilities', '/cron/api/owners', '/api/cron/capabilities', '/api/cron/owners'])
})

test('pinned legacy public Connection + API Proxy return 404 for capability GET without API calls', async t => {
  const require = createRequire(import.meta.url)
  const fromWeb = createRequire(require.resolve('@deepseek-ai/dsh-web'))
  const connectionPath = fromWeb.resolve('@deepseek-ai/dsh-client-connection')
  const fromConnection = createRequire(connectionPath)
  const { HostConnectionService } = await import(pathToFileURL(connectionPath).href)
  const { toFetchHandler } = await import(pathToFileURL(fromConnection.resolve('@deepseek-ai/dsh-host-apiproxy')).href)
  const { Context } = await import(pathToFileURL(fromConnection.resolve('@deepseek-ai/cordis')).href)
  const owner = new Context()
  const connection = new HostConnectionService(owner, [])
  t.after(() => owner.fiber.dispose())
  assert.equal(connection.fetch, undefined, 'pinned baseline does not have the modern exact registry')
  const shared = connection.createSharedFetchHandler('/api', toFetchHandler(new Proxy({}, {
    get() { assert.fail('capability GET must not access API Proxy business methods') },
  })))
  const f = fixture(t, connection)
  const calls = []
  const transport = createCronTransport(async (url, options) => {
    calls.push([url, options.method])
    assert.equal(options.redirect, 'error', 'no redirect can replay a POST or disguise a failed capability')
    if (options.method === 'GET') return shared.fetch(new Request(`http://localhost${url}`, options))
    const result = await legacyRequest(f.legacy[0], 'owners')
    return new Response(result.body, { status: result.status, headers: { 'content-type': 'application/json' } })
  })
  assert.equal((await transport.request('owners'))[0].sessionId, 'cold')
  assert.deepEqual(calls, [['/api/cron/capabilities', 'GET'], ['/cron/api/owners', 'POST']])
  assert.equal(f.calls.resume, 0)
  assert.equal(f.calls.followup, 0)
})

// Mandatory CI path executes a fixed immutable Core source closure, including
// its real Cordis and HTTP bridge, without upgrading the legacy npm baseline.
// Missing source/object/dependencies fail: no skip and no installed fallback.
async function modernConnection() {
  if (!process.env.DSH_CONNECTION_MODULE) return import('./fixtures/modern-connection/upstream.mjs')
  // Explicit local artifact audit only. Public package exports do not include
  // bridge; this mode verifies registry/body-mode + live stream consumption.
  console.log('AUDIT OVERRIDE: installed public Connection module; not the default tagged CI bridge')
  const url = pathToFileURL(process.env.DSH_CONNECTION_MODULE)
  const { HostConnectionService } = await import(url.href)
  const require = createRequire(url)
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  return { Context, HostConnectionService }
}

test('real modern public Connection registry accepts Cron exact routes', async t => {
  const { HostConnectionService, Context } = await modernConnection()
  const owner = new Context()
  let authorized = false
  const connection = new HostConnectionService(owner, [], { isAuthenticated: () => authorized })
  t.after(() => owner.fiber.dispose())
  const f = fixture(t, connection)
  // Direct shared Fetch = Desktop's private carrier (no forged localhost).
  await assertReadOnly(f)
  assert.equal(connection.requestRejection({ headers: { host: 'localhost', origin: 'https://evil.invalid' } }), 403)
  assert.equal(connection.requestRejection({ headers: { host: 'localhost', 'sec-fetch-site': 'cross-site' } }), 403)
  assert.equal(connection.requestRejection({ headers: { host: 'evil.invalid' } }), 403)
  assert.equal((await legacyRequest(f.legacy[0], 'owners')).status, 401)
  authorized = true
  assert.equal((await legacyRequest(f.legacy[0], 'owners')).status, 200)
  await owner.fiber.dispose()
  assert.equal((await connection.createSharedFetchHandler('/api').fetch(new Request('http://desktop.invalid/api/cron/capabilities'))).status, 404)
})

test('real body-mode selection rejects an unfinished streaming upload at 1 MiB plus one byte', async t => {
  const { HostConnectionService, Context, bridge } = await modernConnection()
  const owner = new Context()
  const connection = new HostConnectionService(owner, [], { isAuthenticated: () => true })
  t.after(() => owner.fiber.dispose())
  const f = fixture(t, connection, { web: false })
  const shared = connection.createSharedFetchHandler('/api')
  const endpoint = new URL('http://localhost/api/cron/list')
  assert.equal(shared.requestBodyMode({ method: 'POST', url: endpoint }), 'streaming',
    'the real Web bridge must not take its 300 MiB aggregate-buffer branch')
  assert.equal(shared.requestBodyMode({ method: 'GET', url: new URL('http://localhost/api/cron/capabilities') }), 'buffered',
    'GET capability must not cause the bridge to attach a Request body')
  const upload = new PassThrough()
  upload.on('error', () => {}) // Readable.toWeb cancellation destroys the Node source.
  t.after(() => upload.destroy())
  let operation, responseHeaders
  if (bridge) {
    // Execute the actual tagged Web carrier, not a copied branch: Node-shaped
    // streams stand in for the socket only. The upload is never ended/buffered.
    Object.assign(upload, { method: 'POST', url: endpoint.pathname, headers: {} })
    const chunks = []
    let status
    const response = new Writable({ write(chunk, _encoding, next) { chunks.push(Buffer.from(chunk)); next() } })
    response.writeHead = (code, headers) => { status = code; responseHeaders = headers }
    operation = bridge(upload, response, shared).then(() => new Response(Buffer.concat(chunks), { status }))
  } else {
    // Explicit installed-module audit: only public registry exports exist.
    const request = new Request(endpoint, { method: 'POST', body: Readable.toWeb(upload), duplex: 'half' })
    operation = shared.fetch(request)
  }
  let settled = false
  const response = operation.then(value => { settled = true; return value })
  upload.write(Buffer.alloc(1024 * 1024, 0x20))
  await new Promise(setImmediate)
  assert.equal(settled, false, 'at the cap, keep reading rather than parsing partial JSON')
  assert.equal(upload.writableEnded, false)
  upload.write(Buffer.from('x')) // cross the cap; never send EOF or remaining body
  const rejected = await response
  assert.equal(rejected.status, 400)
  assert.match((await rejected.json()).error.message, /request body too large/)
  assert.equal(upload.writableEnded, false, 'response precedes upload completion')
  assert.equal(upload.readableEnded, false, 'the whole upload was never consumed')
  assert.equal(upload.destroyed, true, 'Cron cancels the source immediately on overflow')
  if (bridge) assert.equal(responseHeaders.connection, 'close', 'real bridge prevents reuse of an unread request connection')
  assert.equal(f.calls.read, 0, 'invalid upload never reaches owner metadata')
  assert.equal(f.calls.resume, 0)
  assert.equal(f.calls.followup, 0)
})
