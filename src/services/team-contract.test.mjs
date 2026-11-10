import test from 'node:test'
import assert from 'node:assert/strict'
import { createTeamApi } from './team-contract.ts'
const uuid = '12345678-1234-4234-8234-123456789abc', id = '2119840104873218049'
function setup() { const calls = []; const api = createTeamApi(async (path, options = {}) => { calls.push({ path, method: options.method || 'GET', body: options.body && JSON.parse(options.body) }); return { id, version: 2, membershipIds: [], siteIds: [] } }); return { api, calls } }
test('团队读写路径、版本、请求号与完整替换集合保留长ID且不发送企业', async () => {
 const { api, calls } = setup()
 await api.teams(); await api.team(id)
 await api.createTeam({ requestId: uuid, teamCode: ' T1 ', name: ' 团队一 ', enabled: false, tenantId: 999 })
 await api.updateTeam(id, { requestId: uuid, expectedVersion: 2, name: '团队二', enabled: true, teamCode: '不允许修改' })
 await api.saveTeamMembers(id, { requestId: uuid, expectedVersion: 3, membershipIds: [id] })
 await api.saveTeamSites(id, { requestId: uuid, expectedVersion: 4, siteIds: [] })
 assert.deepEqual(calls, [
  { path: '/teams', method: 'GET', body: undefined }, { path: `/teams/${id}`, method: 'GET', body: undefined },
  { path: '/teams', method: 'POST', body: { requestId: uuid, teamCode: 'T1', name: '团队一', enabled: false } },
  { path: `/teams/${id}`, method: 'PUT', body: { requestId: uuid, expectedVersion: 2, name: '团队二', enabled: true } },
  { path: `/teams/${id}/members`, method: 'PUT', body: { requestId: uuid, expectedVersion: 3, membershipIds: [id] } },
  { path: `/teams/${id}/site-scopes`, method: 'PUT', body: { requestId: uuid, expectedVersion: 4, siteIds: [] } },
 ])
})
test('团队写入拒绝非法ID、重复集合、错误版本和UUID', async () => {
 const { api, calls } = setup()
 for (const value of [0, -1, '1/2', Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(async () => api.team(value), /ID/)
 for (const body of [{ requestId: 'bad', expectedVersion: 0, membershipIds: [] }, { requestId: uuid, expectedVersion: -1, membershipIds: [] }, { requestId: uuid, membershipIds: [] }, { requestId: uuid, expectedVersion: 0, membershipIds: ['1', 1] }, { requestId: uuid, expectedVersion: 0, membershipIds: Array(501).fill('1') }]) await assert.rejects(async () => api.saveTeamMembers(id, body))
 assert.deepEqual(calls, [])
})
test('受控改派只用POST，个人接单显式null，理由规范化且保留版本和长ID', async () => {
 const { api, calls } = setup()
 await api.reassignOrder(id, { requestId: uuid, expectedVersion: 8, targetAssigneeUserId: id, targetTeamId: null, reason: '  现场交接  ', tenantId: 123 })
 assert.deepEqual(calls, [{ path: `/work-orders/${id}/reassign`, method: 'POST', body: { requestId: uuid, expectedVersion: 8, targetAssigneeUserId: id, targetTeamId: null, reason: '现场交接' } }])
 for (const reason of ['', ' ', 'x'.repeat(1001)]) await assert.rejects(async () => api.reassignOrder(id, { requestId: uuid, expectedVersion: 0, targetAssigneeUserId: '1', targetTeamId: null, reason }))
 assert.equal(calls.length, 1)
})

test('工单身份、关联对象和版本类型贯通BIGINT字符串', async () => {
 const ts = await import('typescript'), { fileURLToPath } = await import('node:url')
 const fixture = fileURLToPath(new URL('__a4_id_contract.ts', import.meta.url))
 const source = `import type { Order, OrderLog, OrderPart, StockIssue } from '../domain.ts';
const id = '2119840104873218049';
const order: Pick<Order, 'id' | 'tenantId' | 'siteId' | 'equipmentId' | 'assigneeUserId' | 'createdBy' | 'teamId' | 'version'> = { id, tenantId:id, siteId:id, equipmentId:id, assigneeUserId:id, createdBy:id, teamId:id, version:0 };
const log: Pick<OrderLog, 'id' | 'workOrderId' | 'actorUserId'> = { id, workOrderId:id, actorUserId:id };
const part: Pick<OrderPart, 'id' | 'workOrderId'> = { id, workOrderId:id };
const issue: Pick<StockIssue, 'workOrderId'> = { workOrderId:id };`
 const options = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true }
 const host = ts.createCompilerHost(options), read = host.getSourceFile.bind(host)
 host.getSourceFile = (name, language, ...args) => name === fixture ? ts.createSourceFile(name, source, language) : read(name, language, ...args)
 assert.deepEqual(ts.getPreEmitDiagnostics(ts.createProgram([fixture], options, host)).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [])
})
