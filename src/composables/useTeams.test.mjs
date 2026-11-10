import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, reactive } from 'vue'
import { useTeams } from './useTeams.ts'
const id = '2119840104873218049', uuid = '12345678-1234-4234-8234-123456789abc'
const team = (version = 7) => ({ id, tenantId: '1', teamCode: 'T1', name: '团队一', enabled: true, version, membershipIds: ['11'], siteIds: ['21'] })
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function setup(overrides = {}) {
 const context = reactive({ epoch: 1 }), scope = effectScope(), writes = []
 const write = async (target, body) => { writes.push({ target, body }); return team(8) }
 const api = { teams: async () => [team()], team: async () => team(), createTeam: async body => write(null, body), updateTeam: write, saveTeamMembers: write, saveTeamSites: write, members: async () => ({ records: [{ id: '11', userId: '31', displayName: '成员一', account: 'm1', enabled: true, roles: [] }], current: 1, size: 100, total: 1, pages: 1 }), siteCatalog: async () => [{ id: '21', name: '厂区一', enabled: true }], ...overrides }
 const resource = scope.run(() => useTeams(api, () => context.epoch, async op => op(), () => uuid))
 return { resource, context, writes, stop: () => scope.stop() }
}
test('团队管理读取详情真实版本，成员和厂区空数组完整撤清且保留UUID', async () => {
 const s = setup(); try {
  await s.resource.open('metadata', id); s.resource.form.name = '新名称'; assert.equal(await s.resource.save(), true)
  assert.deepEqual(s.writes[0], { target: id, body: { requestId: uuid, expectedVersion: 7, name: '新名称', enabled: true } })
  await s.resource.open('members', id); s.resource.selectedIds.value = []; assert.equal(await s.resource.save(), true)
  assert.deepEqual(s.writes[1].body, { requestId: uuid, expectedVersion: 7, membershipIds: [] })
  await s.resource.open('sites', id); s.resource.selectedIds.value = []; assert.equal(await s.resource.save(), true)
  assert.deepEqual(s.writes[2].body, { requestId: uuid, expectedVersion: 7, siteIds: [] })
 } finally { s.stop() }
})
test('未加载详情不能保存，旧企业读取和离开组件后响应均丢弃', async () => {
 const pending = deferred(), s = setup({ team: () => pending.promise })
 const read = s.resource.open('metadata', id); assert.equal(await s.resource.save(), false)
 s.context.epoch++; pending.resolve(team()); await read
 assert.equal(s.resource.record.value, null); assert.equal(s.resource.visible.value, false)
 assert.deepEqual(s.writes, []); s.stop()
})
test('409需重新加载后才允许保存，重载使用最新版本', async () => {
 let version = 7, count = 0
 const s = setup({ team: async () => team(version), updateTeam: async () => { if (++count === 1) throw Object.assign(new Error('409有未结束工单，请先交接'), { status: 409 }); return team(version + 1) } })
 try {
  await s.resource.open('metadata', id); s.resource.form.enabled = false
  assert.equal(await s.resource.save(), false); assert.match(s.resource.formError.value, /先交接/)
  assert.equal(s.resource.conflict.value, true); assert.equal(await s.resource.save(), false); assert.equal(count, 1)
  version = 8; await s.resource.reload(); assert.equal(s.resource.record.value.version, 8); assert.equal(await s.resource.save(), true)
 } finally { s.stop() }
})
test('传输不确定保留请求号与不可变参数，手动重试不因表单变化重复操作', async () => {
 let count = 0; const bodies = [], s = setup({ updateTeam: async (target, body) => { bodies.push(body); if (++count === 1) throw new Error('连接超时，结果需核对'); return team(8) } })
 try {
  await s.resource.open('metadata', id); s.resource.form.name = '原请求名称'
  assert.equal(await s.resource.save(), false); assert.equal(s.resource.frozen.value, true)
  assert.equal(s.resource.close(), false); s.resource.form.name = '不应发送的新名称'
  assert.equal(await s.resource.save(), true); assert.deepEqual(bodies[0], bodies[1]); assert.equal(bodies[1].name, '原请求名称')
 } finally { s.stop() }
})
test('403或404拒绝清除团队列表与编辑正文，保留原原因', async () => {
 for (const status of [403,404]) {
  const s = setup({ updateTeam: async () => { throw Object.assign(new Error(`${status}团队已不可访问`), { status }) } })
  try { await s.resource.load(); await s.resource.open('metadata', id); await s.resource.save(); assert.deepEqual(s.resource.records.value, []); assert.equal(s.resource.record.value, null); assert.equal(s.resource.visible.value, false); assert.match(s.resource.error.value, /不可访问/) } finally { s.stop() }
 }
})
test('读取普通成员团队详情不查询管理员成员目录或厂区目录', async () => {
 const s = setup({ members: async () => { throw Error('不应查询成员') }, siteCatalog: async () => { throw Error('不应查询厂区') } })
 try { await s.resource.open('view', id); assert.equal(s.resource.record.value.id, id); assert.equal(s.resource.formError.value, ''); assert.equal(await s.resource.save(), false) } finally { s.stop() }
})
test('成员候选分页与搜索不丢已选集合，成员关系ID不被用户ID替换', async () => {
 const calls = [], s = setup({ members: async query => { calls.push(query); return { records: [{ id: query.current === 1 ? '11' : '12', userId: '999', enabled: true }], current: query.current, size: 100, total: 101, pages: 2 } } })
 try { await s.resource.open('members', id); await s.resource.loadMembers('', true); assert.deepEqual(s.resource.memberOptions.value.map(m => m.id), ['11','12']); assert.deepEqual(s.resource.selectedIds.value, ['11']); assert.equal(calls[1].current, 2) } finally { s.stop() }
})
test('保存期间会话变化与组件销毁不接受晚到成功，不能刷新新企业', async () => {
 const pending = deferred(), s = setup({ updateTeam: () => pending.promise })
 await s.resource.open('metadata', id); const write = s.resource.save(); s.context.epoch++; pending.resolve(team(8))
 assert.equal(await write, false); assert.equal(s.resource.visible.value, false); assert.deepEqual(s.resource.records.value, []); s.stop()
})

test('详情读取暂时失败后仍可重试原团队，不依赖已成功record', async () => {
 let count=0;const s=setup({team:async()=>{if(++count===1)throw new Error('读取超时');return team()}})
 try{await s.resource.open('metadata',id);assert.equal(s.resource.record.value,null);await s.resource.reload();assert.equal(s.resource.record.value.id,id)}finally{s.stop()}
})

test('详情或成员目录读取403撤权时清除旧企业团队缓存正文', async () => {
 for(const endpoint of ['team','members']){
  const s=setup({[endpoint]:async()=>{throw Object.assign(new Error('403权限已撤销'),{status:403})}})
  try{await s.resource.load();await s.resource.open(endpoint==='team'?'metadata':'members',id);assert.deepEqual(s.resource.records.value,[]);assert.equal(s.resource.record.value,null);assert.match(s.resource.error.value,/权限已撤销/)}finally{s.stop()}
 }
})
