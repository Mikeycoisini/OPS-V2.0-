import test from 'node:test'
import assert from 'node:assert/strict'
import { readBusinessFailure, readErrorMessage } from './api-response.ts'

test('preserves backend reasons for rejected deletes and validation failures', () => {
  assert.equal(readErrorMessage({ message: '设备正在运行中，不能删除' }, 409, 'DELETE'), '设备正在运行中，不能删除')
  assert.equal(readErrorMessage({ detail: '设备不存在' }, 404, 'PUT'), '设备不存在')
})

test('opaque errors describe the operation without inventing the cause', () => {
  assert.equal(readErrorMessage({ status: 409, error: 'Conflict' }, 409, 'DELETE'), '删除失败（409），后端未返回具体原因。')
  assert.equal(readErrorMessage({}, 409, 'POST'), '新增失败（409），后端未返回具体原因。')
})

test('Result.fail remains a failure even when delivered with HTTP 200', () => {
  assert.deepEqual(readBusinessFailure({ code: 409, message: '设备仍关联工单，不能删除' }), { code: 409, message: '设备仍关联工单，不能删除' })
})

test('Result.success with no data is valid for delete', () => {
  assert.equal(readBusinessFailure({ code: 200, message: '操作成功' }), null)
  assert.equal(readBusinessFailure({ code: 200, data: { id: 1 } }), null)
})
