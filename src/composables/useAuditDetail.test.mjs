import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, reactive } from 'vue'
import { useAuditDetail } from './useAuditDetail.ts'
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function setup(fetch) {
  const context = reactive({ epoch: 1 })
  const scope = effectScope()
  const detail = scope.run(() => useAuditDetail(fetch, () => context.epoch))
  return { context, detail, stop: () => scope.stop() }
}
test('企业切换立即清空详情并丢弃晚到响应', async () => {
  const pending = deferred(), s = setup(() => pending.promise)
  try {
    const request = s.detail.show(1)
    s.context.epoch++
    assert.equal(s.detail.visible.value, false)
    assert.equal(s.detail.record.value, null)
    pending.resolve({ id: 1, changes: { before: 'A' } }); await request
    assert.equal(s.detail.record.value, null)
    assert.equal(s.detail.loading.value, false)
  } finally { s.stop() }
})
test('快速切换事件和关闭弹窗不让旧错误或成功覆盖新详情', async () => {
  const a = deferred(), b = deferred(), c = deferred(), queue = [a, b, c]
  const s = setup(() => queue.shift().promise)
  try {
    const first = s.detail.show(1), second = s.detail.show(2)
    b.resolve({ id: 2, changes: null }); await second
    a.reject(new Error('旧事件403')); await first
    assert.equal(s.detail.record.value.id, 2)
    assert.equal(s.detail.error.value, '')
    const third = s.detail.show(3)
    s.detail.visible.value = false
    c.resolve({ id: 3 }); await third
    assert.equal(s.detail.record.value, null)
  } finally { s.stop() }
})
test('详情保留真实错误并允许重新读取，离开页面丢弃晚到响应', async () => {
  const pending = deferred(); let count = 0
  const s = setup(() => ++count === 1 ? Promise.reject(new Error('404 记录不存在')) : pending.promise)
  await s.detail.show(99)
  assert.equal(s.detail.error.value, '404 记录不存在')
  const request = s.detail.show(99)
  s.stop()
  pending.resolve({ id: 99 }); await request
  assert.equal(s.detail.record.value, null)
  assert.equal(s.detail.loading.value, false)
})
