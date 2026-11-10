import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, reactive } from 'vue'
import { useSites } from './useSites.ts'
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const site = { id: '2119840104873218049', siteCode: 'S2', name: '二厂', address: '旧地址', enabled: true, isDefault: false }
function setup(overrides = {}) {
  const context = reactive({ epoch: 1 }), scope = effectScope(), writes = []
  const api = { siteCatalog: async () => [site], createSite: async body => { writes.push({ body }); return site }, updateSite: async (id, body) => { writes.push({ id, body }); return site }, ...overrides }
  const resource = scope.run(() => useSites(api, () => context.epoch, async op => op()))
  return { context, resource, writes, stop: () => scope.stop() }
}
test('厂区编辑保留字符串ID和固定编号，允许清空地址；新建不发送旧ID', async () => {
  const s = setup()
  try {
    await s.resource.load(); s.resource.edit(site)
    s.resource.form.name = '二厂更新'; s.resource.form.siteCode = '篡改编号'; s.resource.form.address = ' '
    assert.equal(await s.resource.save(), true)
    assert.deepEqual(s.writes[0], { id: site.id, body: { siteCode: 'S2', name: '二厂更新', address: null, enabled: true } })
    s.resource.create(); Object.assign(s.resource.form, { siteCode: ' S3 ', name: ' 三厂 ' })
    assert.equal(await s.resource.save(), true)
    assert.deepEqual(s.writes[1], { body: { siteCode: 'S3', name: '三厂', address: null, enabled: true } })
  } finally { s.stop() }
})
test('新建必填字段或超长字段无效时不发请求，关闭弹窗不能保存', async () => {
  const s = setup()
  try {
    s.resource.create(); assert.equal(await s.resource.save(), false)
    assert.match(s.resource.formError.value, /编号/)
    Object.assign(s.resource.form, { siteCode: 'S3', name: 'x'.repeat(161) })
    assert.equal(await s.resource.save(), false)
    s.resource.close(); assert.equal(await s.resource.save(), false)
    assert.deepEqual(s.writes, [])
  } finally { s.stop() }
})
test('厂区请求乱序、旧企业错误及销毁后的响应均不能覆盖当前目录', async () => {
  const a = deferred(), b = deferred(), c = deferred(), q = [a, b, c], s = setup({ siteCatalog: () => q.shift().promise })
  const first = s.resource.load(); s.context.epoch++
  const second = s.resource.load(); a.reject(new Error('旧企业403')); await first
  assert.equal(s.resource.error.value, '')
  assert.equal(s.resource.loading.value, true)
  b.resolve([site]); await second
  assert.equal(s.resource.records.value[0].id, site.id)
  const third = s.resource.load(); s.stop(); c.resolve([site]); await third
  assert.deepEqual(s.resource.records.value, [])
})
test('企业切换清空厂区表单，旧表单不能写入新企业', async () => {
  const s = setup()
  try {
    await s.resource.load(); s.resource.edit(site)
    s.context.epoch++
    assert.equal(s.resource.visible.value, false)
    assert.equal(s.resource.form.name, '')
    assert.deepEqual(s.resource.records.value, [])
    assert.equal(await s.resource.save(), false)
    assert.deepEqual(s.writes, [])
  } finally { s.stop() }
})
test('保存失败保留真实原因且不关闭，晚到保存成功不触发当前企业刷新', async () => {
  let count = 0; const pending = deferred(), s = setup({ createSite: async () => { if (++count === 1) throw new Error('409厂区编号已存在'); return pending.promise } })
  try {
    s.resource.create(); Object.assign(s.resource.form, { siteCode: 'S3', name: '三厂' })
    assert.equal(await s.resource.save(), false); assert.match(s.resource.formError.value, /409/)
    assert.equal(s.resource.visible.value, true)
    const write = s.resource.save(); s.context.epoch++; pending.resolve(site)
    assert.equal(await write, false); assert.equal(s.resource.visible.value, false)
  } finally { s.stop() }
})

test('保存时403或404撤权移除目录及旧厂区表单，保留拒绝原因', async () => {
  for (const status of [403, 404]) {
    const s = setup({ updateSite: async () => { throw Object.assign(new Error(`${status}厂区已不可访问`), { status }) } })
    try {
      await s.resource.load(); s.resource.edit(site)
      assert.equal(await s.resource.save(), false)
      assert.deepEqual(s.resource.records.value, [])
      assert.equal(s.resource.form.name, '')
      assert.equal(s.resource.visible.value, false)
      assert.match(s.resource.error.value, /厂区已不可访问/)
    } finally { s.stop() }
  }
})
