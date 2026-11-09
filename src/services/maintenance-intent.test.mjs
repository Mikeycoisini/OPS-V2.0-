import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newMaintenanceKey, positiveId } from './maintenance-intent.ts'
test('maintenance keys are valid and distinct', () => {
  const first = newMaintenanceKey(), second = newMaintenanceKey()
  assert.match(first, /^[A-Za-z0-9_-]{1,64}$/)
  assert.notEqual(first, second)
})
test('maintenance identifiers must be safe positive integers', () => {
  assert.equal(positiveId(1), true)
  for (const value of [0, -1, 1.5, null, '1', Number.MAX_SAFE_INTEGER + 1]) assert.equal(positiveId(value), false)
})
