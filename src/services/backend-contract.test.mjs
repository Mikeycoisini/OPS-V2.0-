import test from 'node:test'
import assert from 'node:assert/strict'
import { queryPath, orderActionPath, allowedOrderActions, createMutationIntent, parseQuantity } from './backend-contract.ts'

test('queries preserve false and omit frontend-only ALL filters', () => {
  assert.equal(queryPath('/warehouse-stocks', { current: 1, size: 10, keyword: '  轴承 ', lowStockOnly: false, status: 'ALL', sparePartId: null }), '/warehouse-stocks?current=1&size=10&keyword=%E8%BD%B4%E6%89%BF&lowStockOnly=false')
  assert.equal(orderActionPath(12, 'submit'), '/work-orders/12/submit')
  assert.equal(orderActionPath(12, 'dispatch'), '/work-orders/12/dispatch')
  assert.throws(() => orderActionPath(0, 'start'), /ID/)
})

const order = { id: 10, status: 'AWAITING_ACCEPTANCE', assigneeUserId: 2, createdBy: 1 }
const user = (userId, roleCodes = []) => ({ userId, roleCodes })
test('assignee cannot self-accept, and administrator is not implicitly an acceptor', () => {
  assert.equal(allowedOrderActions(order, user(2, ['ACCEPTOR', 'TENANT_ADMIN'])).approve, false)
  assert.equal(allowedOrderActions(order, user(3, ['TENANT_ADMIN'])).approve, false)
  assert.equal(allowedOrderActions(order, user(1)).approve, true)
  assert.equal(allowedOrderActions(order, user(3, ['ACCEPTOR'])).reject, true)
  assert.equal(allowedOrderActions({ ...order, status: 'PENDING', assigneeUserId: null }, user(3, ['TENANT_ADMIN'])).dispatch, true)
  assert.equal(allowedOrderActions({ ...order, status: 'PENDING' }, user(2)).start, true)
  assert.equal(allowedOrderActions(order, null).approve, false)
})

test('returning unused material remains available after completion to the current assignee', () => {
  assert.equal(allowedOrderActions({ ...order, status: 'COMPLETED' }, user(2)).returnStock, true)
  assert.equal(allowedOrderActions({ ...order, status: 'COMPLETED' }, user(3, ['TENANT_ADMIN'])).returnStock, false)
  assert.equal(allowedOrderActions({ ...order, status: 'IN_PROGRESS' }, user(2)).issue, true)
  assert.equal(allowedOrderActions(order, user(2)).issue, false)
})

test('inventory retries retain the same key and immutable payload until explicitly reset', () => {
  let sequence = 0
  const intent = createMutationIntent(() => `request-${++sequence}`)
  const input = { warehouseId: 7, sparePartId: 3, quantity: 1 }
  const first = intent.prepare(input)
  assert.equal(first.key, 'request-1')
  assert.deepEqual(intent.prepare({ ...input }), first)
  input.quantity = 9
  assert.equal(first.body.quantity, 1)
  assert.throws(() => intent.prepare(input), /原请求/)
  intent.reset()
  assert.equal(intent.prepare(input).key, 'request-2')
})

test('stock quantities reject zero, precision overflow and misleading numeric input', () => {
  assert.equal(parseQuantity('1.125'), 1.125)
  assert.equal(parseQuantity('99999999999.999'), 99999999999.999)
  for (const value of ['0', '-1', '1.2345', '100000000000', '1e2', '', 'NaN']) assert.throws(() => parseQuantity(value))
})

test('restoring a pending stock operation reuses its key after closing or reloading the page', () => {
  const intent = createMutationIntent(() => 'unexpected-new-key', { key: 'saved-key', body: { quantity: 2, issueTransactionId: 18, note: '' } })
  assert.deepEqual(intent.prepare({ quantity: 2, issueTransactionId: 18, note: '' }), { key: 'saved-key', body: { quantity: 2, issueTransactionId: 18, note: '' } })
})

test('工单字符串ID保留精度，身份比较兼容字符串且不能自验收，受控改派仅管理员未结束前两态', () => {
 assert.equal(orderActionPath('2119840104873218049', 'dispatch'), '/work-orders/2119840104873218049/dispatch')
 assert.equal(allowedOrderActions({ ...order, assigneeUserId: '2' }, user(2, ['ACCEPTOR'])).approve, false)
 assert.equal(allowedOrderActions({ ...order, status: 'PENDING', assigneeUserId: '2' }, user(2)).start, true)
 for (const status of ['PENDING', 'IN_PROGRESS']) assert.equal(allowedOrderActions({ ...order, status }, user(3, ['TENANT_ADMIN'])).reassign, true)
 for (const status of ['AWAITING_ACCEPTANCE', 'COMPLETED']) assert.equal(allowedOrderActions({ ...order, status }, user(3, ['TENANT_ADMIN'])).reassign, false)
 assert.equal(allowedOrderActions({ ...order, status: 'PENDING' }, user(2)).reassign, false)
})
