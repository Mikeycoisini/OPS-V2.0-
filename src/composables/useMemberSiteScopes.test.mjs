import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, reactive } from 'vue'
import { useMemberSiteScopes } from './useMemberSiteScopes.ts'
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const member = id => ({ id, account: `m${id}`, displayName: `成员${id}`, roles: [] })
const snapshot = (id = '1', ids = ['11'], version = 2) => ({ membershipId: id, siteIds: ids, version })
const site = { id: '11', name: '厂区一', enabled: true }
function setup(overrides = {}) {
  const context = reactive({ epoch: 1 }), scope = effectScope(), writes = []
  const api = { memberSiteScopes: async id => snapshot(id), siteCatalog: async () => [site], saveMemberSiteScopes: async (id, body) => { writes.push({ id, body }); return snapshot(id, body.siteIds, body.expectedVersion + 1) }, ...overrides }
  const editor = scope.run(() => useMemberSiteScopes(api, () => context.epoch, async op => op()))
  return { context, editor, writes, stop: () => scope.stop() }
}
test('读取授权后可保存空集合，成员和厂区长ID不丢精度', async () => {
  const s = setup(), id = '2119840104873218049'
  try {
    await s.editor.show(member(id))
    assert.deepEqual(s.editor.selectedIds.value, ['11'])
    s.editor.selectedIds.value = []
    assert.equal(await s.editor.save(), true)
    assert.deepEqual(s.writes, [{ id, body: { expectedVersion: 2, siteIds: [] } }])
    assert.equal(s.editor.visible.value, false)
  } finally { s.stop() }
})
test('范围未加载或已关闭时不能提交', async () => {
  const p = deferred(), s = setup({ memberSiteScopes: () => p.promise })
  try {
    const pending = s.editor.show(member('1'))
    assert.equal(await s.editor.save(), false)
    s.editor.close(); p.resolve(snapshot()); await pending
    assert.equal(s.editor.record.value, null)
    assert.equal(await s.editor.save(), false)
    assert.deepEqual(s.writes, [])
  } finally { s.stop() }
})
test('切换成员后旧成功和错误不覆盖新授权，关闭丢弃在途目录', async () => {
  const a = deferred(), b = deferred(), c = deferred(), q = [a, b, c]
  const s = setup({ memberSiteScopes: () => q.shift().promise })
  try {
    const first = s.editor.show(member('1')), second = s.editor.show(member('2'))
    b.resolve(snapshot('2', [])); await second
    a.reject(new Error('旧企业403')); await first
    assert.equal(s.editor.record.value.membershipId, '2')
    assert.equal(s.editor.error.value, '')
    const third = s.editor.show(member('3'))
    s.editor.visible.value = false; c.resolve(snapshot('3')); await third
    assert.equal(s.editor.record.value, null)
    assert.deepEqual(s.editor.sites.value, [])
  } finally { s.stop() }
})
test('企业切换立即清空授权、选择和成员，晚到响应不能提交', async () => {
  const pending = deferred(), s = setup({ siteCatalog: () => pending.promise })
  try {
    const read = s.editor.show(member('1'))
    s.context.epoch++
    pending.resolve([site]); await read
    assert.equal(s.editor.member.value, null)
    assert.equal(s.editor.visible.value, false)
    assert.deepEqual(s.editor.selectedIds.value, [])
    assert.equal(await s.editor.save(), false)
  } finally { s.stop() }
})
test('409冲突保留真实原因并阻止旧版本再次提交，重新加载后才可保存', async () => {
  let count = 0
  const s = setup({ saveMemberSiteScopes: async () => { count++; if (count === 1) throw Object.assign(new Error('其他管理员已更新，请重新加载'), { status: 409 }); return snapshot() } })
  try {
    await s.editor.show(member('1'))
    assert.equal(await s.editor.save(), false)
    assert.match(s.editor.error.value, /其他管理员/)
    assert.equal(s.editor.conflict.value, true)
    assert.equal(await s.editor.save(), false)
    assert.equal(count, 1)
    await s.editor.reload()
    assert.equal(s.editor.conflict.value, false)
    assert.equal(await s.editor.save(), true)
  } finally { s.stop() }
})
test('离开组件和保存期间会话变化均不接受晚到结果', async () => {
  const pending = deferred(), s = setup({ saveMemberSiteScopes: () => pending.promise })
  await s.editor.show(member('1'))
  const write = s.editor.save()
  s.stop()
  pending.resolve(snapshot()); assert.equal(await write, false)
  assert.equal(s.editor.record.value, null)
  assert.equal(s.editor.saving.value, false)
})
test('未加载目录或响应成员不符时不允许提交，保留真实读取错误', async () => {
  const s = setup({ siteCatalog: async () => { throw new Error('403目录不可见') } })
  try {
    await s.editor.show(member('1'))
    assert.match(s.editor.error.value, /403/)
    assert.equal(await s.editor.save(), false)
    assert.deepEqual(s.writes, [])
  } finally { s.stop() }
  const other = setup({ memberSiteScopes: async () => snapshot('99') })
  try { await other.editor.show(member('1')); assert.equal(await other.editor.save(), false); assert.match(other.editor.error.value, /成员/) } finally { other.stop() }
})

test('保存时403或404撤权清除已加载授权正文，不继续显示旧厂区', async () => {
  for (const status of [403, 404]) {
    const s = setup({ saveMemberSiteScopes: async () => { throw Object.assign(new Error(`${status}范围已不可访问`), { status }) } })
    try {
      await s.editor.show(member('1'))
      assert.equal(await s.editor.save(), false)
      assert.equal(s.editor.record.value, null)
      assert.deepEqual(s.editor.sites.value, [])
      assert.deepEqual(s.editor.selectedIds.value, [])
      assert.match(s.editor.error.value, /范围已不可访问/)
    } finally { s.stop() }
  }
})
