import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compatibleEquipmentPath } from './compatibility-path.ts'
test('reverse compatibility uses the spare part endpoint and a positive safe ID', () => {
  assert.equal(compatibleEquipmentPath(42), '/spare-parts/42/compatible-equipment')
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => compatibleEquipmentPath(id))
})
