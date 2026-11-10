import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, reactive } from 'vue'
import { useReassign } from './useReassign.ts'
const id = '2119840104873218049', userId = '2119840104873218050', teamId = '2119840104873218051', uuid = '12345678-1234-4234-8234-123456789abc'
const order = (version = 8, status = 'IN_PROGRESS') => ({ id, siteId: '21', status, assigneeUserId: userId, teamId: null, version })
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function setup(overrides = {}) {
 const context = reactive({ epoch: 1 }), scope = effectScope(), writes = []
 const api = { order: async () => order(), teams: async () => [{ id: teamId, enabled: true, siteIds: ['21'], membershipIds: ['11'], name: '交接团队' }], reassignOrder: async (target, body) => { writes.push({ target, body }); return order(9) }, ...overrides }
 const resource = scope.run(() => useReassign(api, () => context.epoch, async op => op(), () => uuid))
 return { resource, context, writes, stop: () => scope.stop() }
}
test('改派读取真实版本，个人接单发送null，原因及长ID不丢失', async () => {
 const s = setup(); try {
  await s.resource.show(id); s.resource.form.reason = '  现场交接  '
  assert.equal(await s.resource.save(), true)
  assert.deepEqual(s.writes, [{ target: id, body: { requestId: uuid, expectedVersion: 8, targetAssigneeUserId: userId, targetTeamId: null, reason: '现场交接' } }])
 } finally { s.stop() }
})
test('未读取完成、空原因、超长原因及待验收完成均不发送改派', async () => {
 const pending = deferred(), s = setup({ order: () => pending.promise })
 const read = s.resource.show(id); assert.equal(await s.resource.save(), false); pending.resolve(order()); await read
 assert.equal(await s.resource.save(), false); s.resource.form.reason = 'x'.repeat(1001); assert.equal(await s.resource.save(), false); assert.deepEqual(s.writes, []); s.stop()
 for (const status of ['AWAITING_ACCEPTANCE','COMPLETED']) { const x = setup({ order: async () => order(8,status) }); try { await x.resource.show(id); x.resource.form.reason='交接'; assert.equal(await x.resource.save(), false); assert.deepEqual(x.writes, []) } finally { x.stop() } }
})
test('指定团队保留团队ID，界面候选仅启用且覆盖该工单厂区，不代替后端个人资格判断', async () => {
 const s = setup({ teams: async () => [{ id: teamId, enabled: true, siteIds: ['21'] }, { id: '2', enabled: false, siteIds: ['21'] }, { id: '3', enabled: true, siteIds: ['22'] }] })
 try { await s.resource.show(id); assert.deepEqual(s.resource.teams.value.map(t => t.id), [teamId]); s.resource.form.targetTeamId=teamId; s.resource.form.reason='团队交接'; assert.equal(await s.resource.save(), true); assert.equal(s.writes[0].body.targetTeamId, teamId) } finally { s.stop() }
})
test('409保留后端原因并禁止覆盖，重载后取得新的版本', async () => {
 let version = 8, count = 0
 const s = setup({ order: async () => order(version), reassignOrder: async () => { if (++count === 1) throw Object.assign(new Error('409工单已被其他管理员交接'), {status:409}); return order(10) } })
 try { await s.resource.show(id); s.resource.form.reason='交接'; assert.equal(await s.resource.save(), false); assert.equal(s.resource.conflict.value, true); assert.match(s.resource.error.value,/其他管理员/); assert.equal(await s.resource.save(), false); assert.equal(count,1); version=9; await s.resource.reload(); assert.equal(s.resource.record.value.version,9); s.resource.form.reason='重新核对交接'; assert.equal(await s.resource.save(),true) } finally { s.stop() }
})
test('未知写入结果固定UUID及原参数，手动重试不会发修改后的原因', async () => {
 const bodies=[]; let count=0; const s=setup({ reassignOrder:async (target,body)=>{bodies.push(body);if(++count===1)throw new Error('写入响应超时');return order(9)} })
 try {await s.resource.show(id);s.resource.form.reason='原交接原因';assert.equal(await s.resource.save(),false);assert.equal(s.resource.frozen.value,true);assert.equal(s.resource.close(),false);s.resource.form.reason='更改内容';assert.equal(await s.resource.save(),true);assert.deepEqual(bodies[0],bodies[1])} finally{s.stop()}
})
test('企业切换、关闭与离开丢弃旧工单/团队响应', async()=>{
 const pending=deferred(),s=setup({order:()=>pending.promise});const read=s.resource.show(id);s.context.epoch++;pending.resolve(order());await read;assert.equal(s.resource.visible.value,false);assert.equal(s.resource.record.value,null);assert.equal(await s.resource.save(),false);s.stop()
 const late=deferred(),x=setup({teams:()=>late.promise});const request=x.resource.show(id);x.stop();late.resolve([]);await request;assert.equal(x.resource.record.value,null)
})
test('403或404清除改派缓存正文与选中目标，保留真实错误', async()=>{
 for(const status of [403,404]){const s=setup({reassignOrder:async()=>{throw Object.assign(new Error(`${status}工单已不可访问`),{status})}});try{await s.resource.show(id);s.resource.form.reason='交接';await s.resource.save();assert.equal(s.resource.record.value,null);assert.deepEqual(s.resource.teams.value,[]);assert.equal(s.resource.form.reason,'');assert.match(s.resource.error.value,/不可访问/);assert.equal(s.resource.denied.value,true)}finally{s.stop()}}
})
test('已关闭或新工单的晚到保存响应不能影响当前弹窗', async()=>{
 const pending=deferred(),s=setup({reassignOrder:()=>pending.promise});await s.resource.show(id);s.resource.form.reason='交接';const write=s.resource.save();s.context.epoch++;pending.resolve(order(9));assert.equal(await write,false);assert.equal(s.resource.visible.value,false);s.stop()
})
