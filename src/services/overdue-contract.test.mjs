import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertOverduePage } from './overdue-contract.ts'
test('overdue page rejects records that cannot be overdue', () => {
  assert.throws(() => assertOverduePage({ records: [{ dueAt: null, status: 'PENDING' }] }, true))
  assert.throws(() => assertOverduePage({ records: [{ dueAt: '2020-01-01', status: 'COMPLETED' }] }, true))
  assert.doesNotThrow(() => assertOverduePage({ records: [{ dueAt: null, status: 'PENDING' }] }, false))
  assert.doesNotThrow(() => assertOverduePage({ records: [] }, true))
})
