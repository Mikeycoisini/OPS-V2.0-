import test from 'node:test'
import assert from 'node:assert/strict'
import { inventoryExportFilters, inventoryExportFileName, activeExport, cancellableExport } from './inventory-export.ts'
import { createHttpClient, ApiError } from './http.ts'

test('导出只发送筛选快照，不发送分页、企业、创建人或空筛选', () => {
  assert.deepEqual(inventoryExportFilters({ warehouseId: 7, sparePartId: null, transactionType: '', current: 3, size: 10, tenantId: 99, createdBy: 1 }), { warehouseId: 7 })
  assert.throws(() => inventoryExportFilters({ startTime: '2026-11-03T12:00:00', endTime: '2026-11-03T11:00:00' }), /开始时间/)
})
test('任务状态区分活动、可取消与终态', () => {
  assert.equal(activeExport('CANCEL_REQUESTED'), true)
  assert.equal(cancellableExport('CANCEL_REQUESTED'), false)
  for (const s of ['FAILED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'SUCCEEDED']) assert.equal(activeExport(s), false)
})
test('Excel下载携带会话、读取二进制和UTF8附件名称', async () => {
  let options
  const client = createHttpClient({ fetcher: async (url, init) => {
    options = init
    assert.equal(url, '/api/inventory/exports/9/file')
    return new Response(new Uint8Array([80, 75, 3, 4]), { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': "attachment; filename*=UTF-8''%E5%BA%93%E5%AD%98.xlsx",
    } })
  } })
  const file = await client.download('/inventory/exports/9/file')
  assert.equal(options.credentials, 'include')
  assert.equal(file.fileName, '库存.xlsx')
  assert.equal(file.blob.size, 4)
})
test('下载失败不保存JSON为Excel，401失效会话而410保留会话', async () => {
  let invalidations = 0, status = 410
  const client = createHttpClient({ onUnauthorized: () => invalidations++, fetcher: async () =>
    new Response(JSON.stringify({ message: '文件已过期' }), { status, headers: { 'Content-Type': 'application/json' } }) })
  await assert.rejects(client.download('/inventory/exports/9/file'), /文件已过期/)
  assert.equal(invalidations, 0)
  status = 401
  await assert.rejects(client.download('/inventory/exports/9/file'), ApiError)
  assert.equal(invalidations, 1)
  const invalid = createHttpClient({ fetcher: async () => new Response('{"code":500}', { headers: { 'Content-Type': 'application/json' } }) })
  await assert.rejects(invalid.download('/inventory/exports/9/file'), /未返回Excel/)
})
test('429保留任务编号供用户查询，不自动重试创建', async () => {
  let writes = 0
  const client = createHttpClient({ fetcher: async url => {
    if (url.endsWith('/auth/csrf')) return new Response('{"data":{"headerName":"X-CSRF-TOKEN","token":"abc"}}')
    writes++
    return new Response('{"message":"容量不足","data":{"taskId":9}}', { status: 429 })
  } })
  await assert.rejects(client.request('/inventory/exports', { method: 'POST', body: '{}' }), e => e.status === 429 && e.data.taskId === 9)
  assert.equal(writes, 1)
})
test('附件名移除路径分隔符，错误编码可回退', () => {
  assert.equal(inventoryExportFileName('attachment; filename="../a.xlsx"'), '.._a.xlsx')
  assert.equal(inventoryExportFileName("attachment; filename*=UTF-8''%XX"), '库存流水.xlsx')
})
