import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { createPinia, setActivePinia } from 'pinia'

// 加载真实Pinia store；仅替换网络传输，使用可控Promise复现旧企业响应晚到。
// 不修改app.ts、不把替身API当作真实后端验收。
globalThis.window = { addEventListener() {} }
globalThis.localStorage = globalThis.sessionStorage = { removeItem() {} }
const api = {}
globalThis.__equipopsTenantTestApi = api
const stub = 'data:text/javascript,' + encodeURIComponent('export const api=globalThis.__equipopsTenantTestApi; export class ApiError extends Error {}')
const source = await readFile(new URL('../stores/app.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
  .replace(/from ['"]pinia['"]/g, `from '${import.meta.resolve('pinia')}'`)
  .replace(/from ['"]@\/services\/api['"]/g, `from '${stub}'`)
const { useAppStore } = await import('data:text/javascript,' + encodeURIComponent(compiled))

const identity = (id, admin = false) => ({ userId: 1, account: 'test', name: 'test', activeTenant: { id }, roleCodes: admin ? ['TENANT_ADMIN'] : [] })
const page = (id, tenantId) => ({ records: [{ id, tenantId }], current: 1, size: 10, total: 1, pages: 1 })
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function store() {
  setActivePinia(createPinia())
  api.activateTenant = async id => identity(id)
  const result = useAppStore()
  result.user = identity(91001, true)
  return result
}

test('tenant switch clears old equipment, filters and admin role', async () => {
  const s = store()
  s.equipment = [{ id: 92001, tenantId: 91001 }]
  Object.assign(s.equipmentPage, { current: 3, total: 20, keyword: 'A-only', status: 'STOPPED' })
  s.resources.equipment.ready = true
  const before = s.epoch
  await s.activateTenant(91002)
  assert.equal(s.epoch, before + 1)
  assert.deepEqual(s.equipment, [])
  assert.equal(s.equipmentPage.current, 1)
  assert.equal(s.equipmentPage.total, 0)
  assert.equal(s.equipmentPage.keyword, '')
  assert.equal(s.equipmentPage.status, 'ALL')
  assert.equal(s.resources.equipment.ready, false)
  assert.equal(s.user.activeTenant.id, 91002)
  assert.equal(s.isAdmin, false)
})

test('late successful enterprise A request cannot overwrite enterprise B records', async () => {
  const s = store(), a = deferred(), b = deferred()
  api.equipment = () => a.promise
  const old = s.loadEquipmentPage()
  await s.activateTenant(91002)
  api.equipment = () => b.promise
  const current = s.loadEquipmentPage()
  b.resolve(page(92901, 91002)); await current
  a.resolve(page(92001, 91001)); await old
  assert.deepEqual(s.equipment, [{ id: 92901, tenantId: 91002 }])
  assert.equal(s.resources.equipment.loading, false)
  assert.equal(s.resources.equipment.error, '')
})

test('late enterprise A error cannot change enterprise B loading or error state', async () => {
  const s = store(), a = deferred(), b = deferred()
  api.equipment = () => a.promise
  const old = s.loadEquipmentPage()
  await s.activateTenant(91002)
  api.equipment = () => b.promise
  const current = s.loadEquipmentPage()
  a.reject(new Error('old enterprise error')); await old
  assert.equal(s.resources.equipment.loading, true)
  assert.equal(s.resources.equipment.error, '')
  b.resolve(page(92901, 91002)); await current
  assert.equal(s.resources.equipment.loading, false)
  assert.deepEqual(s.equipment, [{ id: 92901, tenantId: 91002 }])
})

test('pending business write blocks tenant switching', async () => {
  const s = store(), pending = deferred()
  const write = s.mutate(() => pending.promise)
  assert.equal(s.mutationCount, 1)
  await assert.rejects(s.activateTenant(91002), /等待当前操作/)
  assert.equal(s.user.activeTenant.id, 91001)
  pending.resolve('saved'); await write
  assert.equal(s.mutationCount, 0)
  await s.activateTenant(91002)
  assert.equal(s.user.activeTenant.id, 91002)
})

test('pending tenant switch blocks new business writes', async () => {
  const s = store(), pending = deferred()
  api.activateTenant = () => pending.promise
  const switching = s.activateTenant(91002)
  let invoked = false
  await assert.rejects(s.mutate(async () => { invoked = true }), /正在切换企业/)
  assert.equal(invoked, false)
  pending.resolve(identity(91002)); await switching
  assert.equal(s.switching, false)
  assert.equal(s.user.activeTenant.id, 91002)
})
