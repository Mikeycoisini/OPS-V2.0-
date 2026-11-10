import test from 'node:test'
import assert from 'node:assert/strict'
import { createHttpClient, ApiError } from './http.ts'
import { createSiteApi } from './site-contract.ts'

test('默认厂区与范围目录分开，成员范围替换保留BIGINT字符串及空集合', async () => {
  const calls = []
  const member = '2119840104873218049', site = '2119840104873218051'
  const http = createHttpClient({ fetcher: async (url, options) => {
    if (url.endsWith('/auth/csrf')) return Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 'test-token' } })
    calls.push({ url, method: options.method, body: options.body && JSON.parse(options.body) })
    return Response.json({ code: 200, data: url.includes('site-scopes') ? { membershipId: member, version: 3, siteIds: [site] } : [] })
  } })
  const api = createSiteApi(http.request)
  await api.defaultSites(); await api.siteCatalog()
  assert.equal((await api.memberSiteScopes(member)).siteIds[0], site)
  await api.saveMemberSiteScopes(member, { expectedVersion: 3, siteIds: [site], tenantId: 123 })
  await api.saveMemberSiteScopes(member, { expectedVersion: 4, siteIds: [] })
  assert.deepEqual(calls, [
    { url: '/api/sites', method: 'GET', body: undefined },
    { url: '/api/sites/catalog', method: 'GET', body: undefined },
    { url: `/api/tenant-members/${member}/site-scopes`, method: 'GET', body: undefined },
    { url: `/api/tenant-members/${member}/site-scopes`, method: 'PUT', body: { expectedVersion: 3, siteIds: [site] } },
    { url: `/api/tenant-members/${member}/site-scopes`, method: 'PUT', body: { expectedVersion: 4, siteIds: [] } },
  ])
})
test('厂区维护只发送允许字段，保留地址清空和停用', async () => {
  const calls = [], http = createHttpClient({ fetcher: async (url, options) => { if (url.endsWith('/auth/csrf')) return Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 'test-token' } }); calls.push({ url, method: options.method, body: JSON.parse(options.body) }); return Response.json({ code: 200, data: { id: '9' } }) } })
  const api = createSiteApi(http.request)
  const body = { siteCode: 'S-2', name: '厂区二', address: null, enabled: false, tenantId: 888, isDefault: true }
  await api.createSite(body); await api.updateSite('2119840104873218051', body)
  assert.deepEqual(calls.map(c => c.body), [0, 1].map(() => ({ siteCode: 'S-2', name: '厂区二', address: null, enabled: false })))
  assert.deepEqual(calls.map(c => [c.url, c.method]), [['/api/sites', 'POST'], ['/api/sites/2119840104873218051', 'PUT']])
})
test('范围ID与版本拒绝精度丢失及非法输入，后端409原因原样保留', async () => {
  let requests = 0
  const api = createSiteApi(createHttpClient({ fetcher: async url => { if (url.endsWith('/auth/csrf')) return Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 'test-token' } }); requests++; return Response.json({ message: '范围已被其他管理员修改，请重新加载' }, { status: 409 }) } }).request)
  for (const id of [0, -1, 1.5, '1/2', '0', Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(async () => api.memberSiteScopes(id), /ID/)
  for (const body of [{ expectedVersion: -1, siteIds: [] }, { expectedVersion: 0, siteIds: [1, '1'] }, { expectedVersion: 0, siteIds: [Number.MAX_SAFE_INTEGER + 1] }]) await assert.rejects(async () => api.saveMemberSiteScopes('1', body))
  assert.equal(requests, 0)
  await assert.rejects(api.saveMemberSiteScopes('1', { expectedVersion: 1, siteIds: [] }), e => e instanceof ApiError && e.status === 409 && e.message.includes('其他管理员'))
})
