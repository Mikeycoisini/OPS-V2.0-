import test from 'node:test'
import assert from 'node:assert/strict'
import { usePage } from './usePage.ts'

const page = id => ({ records: [{ id }], current: 1, size: 10, total: 1, pages: 1 })
test('late queries cannot overwrite the latest search or its loading state', async () => {
  const pending = []
  const resource = usePage(() => new Promise(resolve => pending.push(resolve)), () => 1)
  const first = resource.load()
  const second = resource.load()
  pending[1](page(2))
  await second
  pending[0](page(1))
  await first
  assert.deepEqual(resource.records.value, [{ id: 2 }])
  assert.equal(resource.loading.value, false)
})

test('an old enterprise response is discarded even if the user switches back to the same enterprise', async () => {
  let epoch = 1
  let resolve
  const resource = usePage(() => new Promise(done => resolve = done), () => epoch)
  const pending = resource.load()
  epoch = 3
  resource.clear()
  resolve(page(7))
  await pending
  assert.deepEqual(resource.records.value, [])
  assert.equal(resource.loading.value, false)
})
