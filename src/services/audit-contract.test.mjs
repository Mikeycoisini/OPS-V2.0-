import test from 'node:test'
import assert from 'node:assert/strict'
import { createHttpClient, ApiError } from './http.ts'
import { createAuditApi } from './audit-contract.ts'

test('审计只读查询使用真实Result分页，发送筛选但不接收企业范围参数', async () => {
  const requests = []
  const record = { id: 31, action: 'MEMBER_ADDED', summary: null }
  const http = createHttpClient({ fetcher: async (url, options) => {
    requests.push({ url, method: options.method })
    return Response.json({ code: 200, data: url.includes('?') ? { records: [record], current: 2, size: 20, total: 21, pages: 2 } : { ...record, changes: { errorCode: 'MEMBER_DISABLED' } } })
  } })
  const api = createAuditApi(http.request)
  const page = await api.auditEvents({ current: 2, size: 20, action: 'MEMBER_ADDED', objectType: 'MEMBER', objectId: '11', actorUserId: '7', outcome: 'SUCCESS', occurredFrom: '2026-11-09T00:00:00', occurredTo: '2026-11-09T23:59:59', tenantId: 999 })
  assert.deepEqual(page.records, [record])
  const url = new URL(requests[0].url, 'http://test')
  assert.equal(url.pathname, '/api/audit-events')
  assert.deepEqual(Object.fromEntries(url.searchParams), { current: '2', size: '20', action: 'MEMBER_ADDED', actorUserId: '7', objectType: 'MEMBER', objectId: '11', outcome: 'SUCCESS', occurredFrom: '2026-11-09T00:00:00', occurredTo: '2026-11-09T23:59:59' })
  assert.deepEqual((await api.auditEvent(31)).changes, { errorCode: 'MEMBER_DISABLED' })
  assert.deepEqual(requests.map(r => r.method), ['GET', 'GET'])
  assert.equal(requests[1].url, '/api/audit-events/31')
})
for (const status of [400, 403, 404]) test(`审计查询保留后端${status}错误`, async () => {
  const http = createHttpClient({ fetcher: async () => Response.json({ message: `审计错误${status}` }, { status }) })
  const api = createAuditApi(http.request)
  await assert.rejects(api.auditEvent(1), e => e instanceof ApiError && e.status === status && e.message.includes(String(status)))
})

test('BIGINT字符串ID经过列表、详情读取和详情URL后保持原值', async () => {
  const id = '2119840104873218049'
  const paths = []
  const http = createHttpClient({ fetcher: async url => {
    paths.push(url)
    return Response.json({ code: 200, data: url.includes('?')
      ? { records: [{ id, actorUserId: '2119840104873218050', objectId: '2119840104873218051' }], current: 1, size: 10, total: 1, pages: 1 }
      : { id, changes: { userId: '2119840104873218050' } } })
  } })
  const api = createAuditApi(http.request)
  const page = await api.auditEvents()
  const detail = await api.auditEvent(page.records[0].id)
  assert.equal(paths[1], '/api/audit-events/2119840104873218049')
  assert.equal(detail.id, id)
  assert.equal(page.records[0].actorUserId, '2119840104873218050')
  assert.equal(page.records[0].objectId, '2119840104873218051')
  assert.equal(detail.changes.userId, '2119840104873218050')
})

test('审计ID类型接受BIGINT字符串并贯通详情组合函数', async () => {
  const ts = await import('typescript')
  const { fileURLToPath } = await import('node:url')
  const fixture = fileURLToPath(new URL('__audit_id_contract.ts', import.meta.url))
  const source = `import { createAuditApi, type AuditEvent, type AuditId } from './audit-contract.ts';
import { useAuditDetail } from '../composables/useAuditDetail.ts';
const id: AuditId = '2119840104873218049';
const api = createAuditApi(async <T>() => ({} as T));
api.auditEvent(id); api.auditEvent(1);
const event: Pick<AuditEvent, 'id' | 'actorUserId' | 'objectId'> = { id, actorUserId: id, objectId: id };
const siteEvent: Pick<AuditEvent, 'action' | 'objectType'> = { action: 'SITE_CREATED', objectType: 'SITE' };
useAuditDetail(api.auditEvent, () => 1).show(event.id);`
  const options = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true }
  const host = ts.createCompilerHost(options), readSource = host.getSourceFile.bind(host)
  host.getSourceFile = (name, language, ...args) => name === fixture ? ts.createSourceFile(name, source, language) : readSource(name, language, ...args)
  const program = ts.createProgram([fixture], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [])
})

test('成员厂区范围动作及前后集合按厂区ID清楚展示，空集合明确无授权', async () => {
  const { auditActionLabels, auditChangeLabel, auditChangeValue } = await import('./audit-contract.ts')
  assert.equal(auditActionLabels.MEMBER_SITE_SCOPES_CHANGED, '变更成员厂区范围')
  const changes = { field: 'siteIds', before: ['2119840104873218049', '12'], after: [] }
  assert.equal(auditChangeLabel('before', changes), '变更前厂区')
  assert.equal(auditChangeLabel('after', changes), '变更后厂区')
  assert.equal(auditChangeValue('field', changes), '厂区访问范围')
  assert.equal(auditChangeValue('before', changes), '厂区 #2119840104873218049、厂区 #12')
  assert.equal(auditChangeValue('after', changes), '无普通厂区授权')
  assert.equal(auditChangeValue('errorCode', { errorCode: 'BUSINESS_CONFLICT' }), 'BUSINESS_CONFLICT')
  assert.equal(auditChangeValue('unknown', { unknown: ['a'] }), '[\n  "a"\n]')
})

test('厂区创建更新审计按SITE筛选并保留最小变更字段，中文标签贯通', async () => {
  const { auditActionLabels, auditObjectLabels } = await import('./audit-contract.ts')
  assert.equal(auditActionLabels.SITE_CREATED, '创建厂区')
  assert.equal(auditActionLabels.SITE_UPDATED, '更新厂区')
  assert.equal(auditObjectLabels.SITE, '厂区')
  const paths = [], id = '2119840104873218051'
  const changes = { changedFields: ['name', 'address', 'enabled'], beforeEnabled: true, afterEnabled: false }
  const http = createHttpClient({ fetcher: async url => {
    paths.push(url)
    return Response.json({ code: 200, data: url.includes('?') ? { records: [{ id, action: 'SITE_UPDATED', objectType: 'SITE', objectId: id, summary: '更新厂区资料' }], current: 1, size: 10, total: 1, pages: 1 } : { id, action: 'SITE_UPDATED', objectType: 'SITE', changes } })
  } })
  const api = createAuditApi(http.request), page = await api.auditEvents({ action: 'SITE_UPDATED', objectType: 'SITE', objectId: id })
  assert.equal(new URL(paths[0], 'http://test').searchParams.get('objectType'), 'SITE')
  assert.equal(page.records[0].objectId, id)
  assert.deepEqual((await api.auditEvent(id)).changes, changes)
  assert.deepEqual(Object.keys(changes), ['changedFields', 'beforeEnabled', 'afterEnabled'])
})

test('A4团队与责任交接审计中文标签、集合和空团队含义保持准确，不展示原因正文', async () => {
 const { auditActionLabels, auditObjectLabels, auditChangeLabel, auditChangeValue } = await import('./audit-contract.ts')
 for (const [action, label] of Object.entries({ TEAM_CREATED: '创建团队', TEAM_UPDATED: '更新团队', TEAM_MEMBERS_CHANGED: '变更团队成员', TEAM_SITE_SCOPES_CHANGED: '变更团队工作厂区', WORK_ORDER_REASSIGNED: '工单受控改派' })) assert.equal(auditActionLabels[action], label)
 assert.equal(auditObjectLabels.TEAM,'团队'); assert.equal(auditObjectLabels.WORK_ORDER,'工单')
 const members={field:'membershipIds',before:['2119840104873218049'],after:[],version:1}
 assert.equal(auditChangeLabel('before',members,'TEAM_MEMBERS_CHANGED'),'变更前团队成员')
 assert.equal(auditChangeValue('before',members,'TEAM_MEMBERS_CHANGED'),'成员关系 #2119840104873218049')
 assert.equal(auditChangeValue('after',members,'TEAM_MEMBERS_CHANGED'),'无团队成员')
 const sites={field:'siteIds',before:['11'],after:[],version:2}
 assert.equal(auditChangeValue('after',sites,'TEAM_SITE_SCOPES_CHANGED'),'无工作厂区')
 assert.equal(auditChangeValue('after',sites,'MEMBER_SITE_SCOPES_CHANGED'),'无普通厂区授权')
 const handoff={beforeAssigneeUserId:null,afterAssigneeUserId:'2119840104873218049',beforeTeamId:null,afterTeamId:'2119840104873218050',beforeVersion:1,version:2,reasonPresent:true}
 assert.equal(auditChangeLabel('afterAssigneeUserId',handoff,'WORK_ORDER_REASSIGNED'),'交接后负责人')
 assert.equal(auditChangeValue('beforeTeamId',handoff,'WORK_ORDER_REASSIGNED'),'个人接单')
 assert.equal(auditChangeValue('afterTeamId',handoff,'WORK_ORDER_REASSIGNED'),'团队 #2119840104873218050')
 assert.equal(auditChangeValue('reasonPresent',handoff,'WORK_ORDER_REASSIGNED'),'已记录，正文见工单处理时间线')
})
