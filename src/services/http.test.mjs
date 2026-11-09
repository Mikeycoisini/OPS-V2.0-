import test from 'node:test'
import assert from 'node:assert/strict'
import { createHttpClient } from './http.ts'

const result = (data, status = 200) => new Response(JSON.stringify({ code: status, data, message: status === 200 ? '成功' : '当前账号无权操作' }), { status })

test('Session writes obtain CSRF and carry cookies, without storing a bearer token', async () => {
  const sent = []
  const client = createHttpClient({ fetcher: async (url, init) => {
    sent.push({ url, ...init })
    return url.endsWith('/auth/csrf') ? result({ headerName: 'X-CSRF-TOKEN', token: 'csrf-a' }) : result({ id: 8 })
  } })
  assert.deepEqual(await client.request('/equipment', { method: 'POST', body: '{"name":"设备"}' }), { id: 8 })
  assert.equal(sent.length, 2)
  assert.equal(sent[0].url, '/api/auth/csrf')
  assert.equal(sent[1].credentials, 'include')
  assert.equal(new Headers(sent[1].headers).get('X-CSRF-TOKEN'), 'csrf-a')
  assert.equal(new Headers(sent[1].headers).get('Authorization'), null)
})

test('a write after login obtains the rotated CSRF token', async () => {
  let csrf = 'before-login'
  const writeHeaders = []
  const client = createHttpClient({ fetcher: async (url, init) => {
    if (url.endsWith('/auth/csrf')) return result({ headerName: 'X-CSRF-TOKEN', token: csrf })
    writeHeaders.push(new Headers(init.headers).get('X-CSRF-TOKEN'))
    if (url.endsWith('/auth/login')) csrf = 'after-login'
    return result({ userId: 1 })
  } })
  await client.request('/auth/login', { method: 'POST', body: '{}' })
  await client.request('/auth/active-tenant', { method: 'POST', body: '{"tenantId":7}' })
  assert.deepEqual(writeHeaders, ['before-login', 'after-login'])
})

test('403 preserves the session and does not retry a mutation; 401 invalidates identity', async () => {
  let invalidations = 0
  let writes = 0
  let status = 403
  const client = createHttpClient({ onUnauthorized: () => invalidations++, fetcher: async url => {
    if (url.endsWith('/auth/csrf')) return result({ headerName: 'X-CSRF-TOKEN', token: 'csrf' })
    writes++
    return result(null, status)
  } })
  await assert.rejects(client.request('/equipment/1', { method: 'DELETE' }), /当前账号无权操作/)
  assert.equal(invalidations, 0)
  assert.equal(writes, 1)
  status = 401
  await assert.rejects(client.request('/auth/me'), /当前账号无权操作/)
  assert.equal(invalidations, 1)
})

test('HTTP 200 business failures remain failures, and GET preserves pagination', async () => {
  const client = createHttpClient({ fetcher: async url => url.includes('fail')
    ? new Response('{"code":409,"message":"工单状态已变化"}')
    : result({ records: [{ id: 3 }], current: 2, size: 10, total: 11, pages: 2 }) })
  await assert.rejects(client.request('/fail'), /工单状态已变化/)
  assert.deepEqual(await client.request('/work-orders?current=2'), { records: [{ id: 3 }], current: 2, size: 10, total: 11, pages: 2 })
})

test('concurrent anonymous 401 responses invalidate once instead of repeatedly remounting developer pages', async () => {
  let invalidations = 0
  const client = createHttpClient({ onUnauthorized: () => invalidations++, fetcher: async url => {
    if (url.endsWith('/auth/csrf')) return result({ headerName: 'X-CSRF-TOKEN', token: 'csrf' })
    if (url.endsWith('/auth/login')) return result({ userId: 1 })
    return result(null, 401)
  } })
  await Promise.allSettled([client.request('/work-orders'), client.request('/equipment')])
  assert.equal(invalidations, 1)
  await client.request('/auth/login', { method: 'POST', body: '{}' })
  await assert.rejects(client.request('/work-orders'))
  assert.equal(invalidations, 2)
})
