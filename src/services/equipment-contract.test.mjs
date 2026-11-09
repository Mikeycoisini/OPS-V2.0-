import test from 'node:test'
import assert from 'node:assert/strict'
import { equipmentHistoryPath, equipmentListPath, equipmentStatusPath, equipmentUpdateBody, readEquipmentPage } from './equipment-contract.ts'

test('reads MyBatis-Plus page records and metadata', () => {
  const result = readEquipmentPage({
    records: [{ id: 12, assetCode: 'EQ-12', status: 'RUNNING' }],
    current: 2,
    size: 10,
    total: 21,
    pages: 3,
  })
  assert.equal(result.records[0].id, 12)
  assert.equal(result.current, 2)
  assert.equal(result.total, 21)
})

test('rejects a non-page payload instead of silently treating it as a list', () => {
  assert.throws(() => readEquipmentPage([{ id: 1 }]), /分页结果格式/)
})

test('status is sent to the backend together with search and pagination', () => {
  const url = new URL(equipmentListPath(3, 20, ' 空压机 ', 'STOPPED'), 'http://localhost')
  assert.equal(url.searchParams.get('status'), 'STOPPED')
  assert.equal(url.searchParams.get('keyword'), '空压机')
  assert.equal(url.searchParams.get('current'), '3')
  assert.equal(url.searchParams.get('size'), '20')
})

test('ALL is a frontend filter value and is never passed as a Java enum', () => {
  const url = new URL(equipmentListPath(1, 10, ' ', 'ALL'), 'http://localhost')
  assert.equal(url.searchParams.has('status'), false)
  assert.equal(url.searchParams.has('keyword'), false)
})

test('start and stop bind targetStatus as a query parameter on the existing route', () => {
  assert.equal(equipmentStatusPath(12, 'RUNNING'), '/equipment/12/status?targetStatus=RUNNING')
  assert.equal(equipmentStatusPath(12, 'STOPPED'), '/equipment/12/status?targetStatus=STOPPED')
  assert.throws(() => equipmentStatusPath(12, 'NEEDS_ATTENTION'), /不支持/)
  assert.throws(() => equipmentStatusPath(0, 'RUNNING'), /设备 ID/)
})

test('history uses MaintenanceHistoryController query parameters and keeps its total', () => {
  const url = new URL(equipmentHistoryPath(12, 2, 5), 'http://localhost')
  assert.equal(url.pathname, '/equipment/history')
  assert.equal(url.searchParams.get('equipmentId'), '12')
  assert.equal(url.searchParams.get('current'), '2')
  const page = readEquipmentPage({ records: [], total: 14, current: 2, size: 5, pages: 3 })
  assert.equal(page.total, 14)
  assert.equal(page.records.length, 0)
})
test('editing equipment details preserves fields but cannot silently change runtime status', () => {
  const original = { assetCode: 'A-001', name: '压缩机', location: null, status: 'RUNNING' }
  assert.deepEqual(equipmentUpdateBody(original), { assetCode: 'A-001', name: '压缩机', location: null })
  assert.equal(original.status, 'RUNNING')
})
