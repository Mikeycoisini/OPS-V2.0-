import type { Order } from '../domain'
import { resourceId, type ResourceId } from './resource-id.ts'
export interface Team { id: ResourceId; tenantId: ResourceId; teamCode: string; name: string; enabled: boolean; version: number; membershipIds: ResourceId[]; siteIds: ResourceId[] }
export interface TeamCreate { requestId: string; teamCode: string; name: string; enabled?: boolean }
export interface TeamUpdate { requestId: string; expectedVersion: number; name: string; enabled: boolean }
export interface TeamMembersInput { requestId: string; expectedVersion: number; membershipIds: ResourceId[] }
export interface TeamSitesInput { requestId: string; expectedVersion: number; siteIds: ResourceId[] }
export interface ReassignInput { requestId: string; expectedVersion: number; targetAssigneeUserId: ResourceId; targetTeamId: ResourceId | null; reason: string }
/** 执行流程：1.验证UUID；2.校验版本；3.仅输出服务端需要的幂等与并发字段。 */
function operation(requestId: string, expectedVersion?: number, requireVersion = false) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new Error('请求号必须是有效UUID') // 写入不接受临时计数器。
  if ((requireVersion || expectedVersion !== undefined) && (!Number.isSafeInteger(expectedVersion) || expectedVersion == null || expectedVersion < 0)) throw new Error('版本无效，请重新加载') // 版本不能隐式归零。
  return { requestId, ...(expectedVersion === undefined ? {} : { expectedVersion }) } // 不发送企业等外部范围参数。
}
/** 执行流程：1.校验集合上限；2.验证每个ID；3.拒绝重复，保留空数组撤清语义。 */
function ids(values: ResourceId[]) {
  if (!Array.isArray(values) || values.length > 500) throw new Error('集合最多500项') // 与团队接口约束一致。
  const keys = values.map(resourceId) // 校验安全整数及长ID。
  if (new Set(keys).size !== keys.length) throw new Error('集合不能包含重复ID') // 数字与同值字符串也属于重复。
  return [...values] // 不篡改调用方，也不省略空集合。
}
/** 执行流程：1.规范名称编号；2.校验长度；3.拒绝空白字段。 */
function text(value: string, name: string, max: number) {
  const normalized = typeof value === 'string' ? value.trim() : '' // 不把对象隐式转换成正文。
  if (!normalized || normalized.length > max) throw new Error(`${name}不能为空且最多${max}个字符`) // 前端仅作明确约束，资格仍由后端判断。
  return normalized // 统一首尾空白，稳定幂等载荷。
}
/** 执行流程：1.拆分各团队动作；2.显式限定请求体；3.保留真实后端拒绝与版本冲突。 */
export function createTeamApi(request: <T>(path: string, options?: RequestInit) => Promise<T>) {
  const write = <T>(path: string, method: string, body: unknown) => request<T>(path, { method, body: JSON.stringify(body) }) // 不自动重试写入。
  return {
    teams: () => request<Team[]>('/teams'), // 普通成员仅由后端返回自己参加的启用团队。
    team: (id: ResourceId) => request<Team>(`/teams/${resourceId(id)}`), // 读取真实版本和完整集合。
    createTeam: (body: TeamCreate) => write<Team>('/teams', 'POST', { ...operation(body.requestId), teamCode: text(body.teamCode, '团队编号', 64), name: text(body.name, '团队名称', 160), ...(body.enabled === undefined ? {} : { enabled: body.enabled }) }), // 不发送企业ID。
    updateTeam: (id: ResourceId, body: TeamUpdate) => write<Team>(`/teams/${resourceId(id)}`, 'PUT', { ...operation(body.requestId, body.expectedVersion, true), name: text(body.name, '团队名称', 160), enabled: body.enabled }), // 不修改团队编号。
    saveTeamMembers: (id: ResourceId, body: TeamMembersInput) => write<Team>(`/teams/${resourceId(id)}/members`, 'PUT', { ...operation(body.requestId, body.expectedVersion, true), membershipIds: ids(body.membershipIds) }), // 成员关系ID不等同于用户ID。
    saveTeamSites: (id: ResourceId, body: TeamSitesInput) => write<Team>(`/teams/${resourceId(id)}/site-scopes`, 'PUT', { ...operation(body.requestId, body.expectedVersion, true), siteIds: ids(body.siteIds) }), // 空数组完整撤销工作厂区。
    reassignOrder: (id: ResourceId, body: ReassignInput) => write<Order>(`/work-orders/${resourceId(id)}/reassign`, 'POST', { ...operation(body.requestId, body.expectedVersion, true), targetAssigneeUserId: resourceId(body.targetAssigneeUserId), targetTeamId: body.targetTeamId == null ? null : resourceId(body.targetTeamId), reason: text(body.reason, '交接原因', 1000) }), // 保留原状态，仅请求受控交接。
  }
}
