import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEquipmentId } from './equipment-link.ts'

test('device links accept only safe positive integer identifiers', () => {
  assert.equal(parseEquipmentId('123'), 123)
  for (const value of [undefined, null, '', '0', '-1', '01', '1.5', '1e3', '9007199254740992', ['1']]) assert.equal(parseEquipmentId(value), null)
})
