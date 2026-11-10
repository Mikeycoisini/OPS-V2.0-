import type { Page } from '../domain'
import { queryPath, type Query } from './backend-contract.ts'
import { readEquipmentPage } from './equipment-contract.ts'

/** BIGINT由后端以字符串返回；保留数字兼容旧接口，禁止转为Number。 */
export type AuditId = number | string
export type AuditAction = 'MEMBER_ADDED' | 'MEMBER_ROLES_CHANGED' | 'MEMBER_STATUS_CHANGED' | 'MEMBER_SITE_SCOPES_CHANGED' | 'SITE_CREATED' | 'SITE_UPDATED' | 'TEAM_CREATED' | 'TEAM_UPDATED' | 'TEAM_MEMBERS_CHANGED' | 'TEAM_SITE_SCOPES_CHANGED' | 'WORK_ORDER_REASSIGNED'
export type AuditObjectType = 'MEMBER' | 'SITE' | 'TEAM' | 'WORK_ORDER'
export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED'
export interface AuditEvent {
  id: AuditId; actorUserId: AuditId | null; actorName: string | null; actorType: string
  action: AuditAction; objectType: AuditObjectType; objectId: AuditId | null; outcome: AuditOutcome
  requestId: string | null; occurredAt: string; summary: string | null
}
export interface AuditEventDetail extends AuditEvent { changes: Record<string, unknown> | null }
export const auditActionLabels: Record<AuditAction, string> = { MEMBER_ADDED: '添加成员', MEMBER_ROLES_CHANGED: '变更成员角色', MEMBER_STATUS_CHANGED: '变更成员状态', MEMBER_SITE_SCOPES_CHANGED: '变更成员厂区范围', SITE_CREATED: '创建厂区', SITE_UPDATED: '更新厂区', TEAM_CREATED: '创建团队', TEAM_UPDATED: '更新团队', TEAM_MEMBERS_CHANGED: '变更团队成员', TEAM_SITE_SCOPES_CHANGED: '变更团队工作厂区', WORK_ORDER_REASSIGNED: '工单受控改派' }
export const auditObjectLabels: Record<AuditObjectType, string> = { MEMBER: '成员', SITE: '厂区', TEAM: '团队', WORK_ORDER: '工单' }
export const auditOutcomeLabels: Record<AuditOutcome, string> = { SUCCESS: '成功', FAILURE: '失败', DENIED: '拒绝' }


/** 执行流程：1.识别范围变更；2.展示前后厂区集合；3.保留其他动作的原有字段。 */
export function auditChangeLabel(key: string, changes: Record<string, unknown>, action?: AuditAction) {
  if (changes.field === 'membershipIds') return ({ field: '变更字段', before: '变更前团队成员', after: '变更后团队成员' } as Record<string, string>)[key] || key // 成员关系ID不冒充用户姓名。
  if (action === 'TEAM_SITE_SCOPES_CHANGED') return ({ field: '变更字段', before: '变更前工作厂区', after: '变更后工作厂区', version: '变更后版本' } as Record<string, string>)[key] || key // 团队工作范围与个人授权分开解释。
  if (action === 'WORK_ORDER_REASSIGNED') return ({ beforeAssigneeUserId: '交接前负责人', afterAssigneeUserId: '交接后负责人', beforeTeamId: '交接前团队', afterTeamId: '交接后团队', beforeVersion: '交接前版本', version: '交接后版本', reasonPresent: '交接原因记录' } as Record<string, string>)[key] || key // 理由正文由工单业务历史展示。
  if (changes.field === 'siteIds') return ({ field: '变更字段', before: '变更前厂区', after: '变更后厂区' } as Record<string, string>)[key] || key // 厂区ID不冒充厂区名称。
  return key === 'errorCode' ? '错误码 (errorCode)' : key // 其他动作保持原字段可追溯。
}
/** 执行流程：1.保留长ID字符串；2.明确空集合无普通授权；3.其他结构沿用JSON可读展示。 */
export function auditChangeValue(key: string, changes: Record<string, unknown>, action?: AuditAction) {
  const value = changes[key] // 只读取后端已脱敏的变更详情。
  if (changes.field === 'membershipIds' && key === 'field') return '团队成员范围' // 团队成员集合不等于个人厂区范围。
  if (changes.field === 'membershipIds' && (key === 'before' || key === 'after') && Array.isArray(value)) return value.length ? value.map(id => `成员关系 #${String(id)}`).join('、') : '无团队成员' // 保留成员关系长ID。
  if (action === 'WORK_ORDER_REASSIGNED' && (key === 'beforeTeamId' || key === 'afterTeamId')) return value == null ? '个人接单' : `团队 #${String(value)}` // 空团队是显式个人接单。
  if (action === 'WORK_ORDER_REASSIGNED' && (key === 'beforeAssigneeUserId' || key === 'afterAssigneeUserId')) return value == null ? '未分配' : `用户 #${String(value)}` // 不转换责任人长ID。
  if (action === 'WORK_ORDER_REASSIGNED' && key === 'reasonPresent' && value === true) return '已记录，正文见工单处理时间线' // 统一审计不展示理由正文。
  if (changes.field === 'siteIds' && key === 'field') return action === 'TEAM_SITE_SCOPES_CHANGED' ? '团队工作厂区范围' : '厂区访问范围' // 使用业务含义显示字段。
  if (changes.field === 'siteIds' && (key === 'before' || key === 'after') && Array.isArray(value)) return value.length ? value.map(id => `厂区 #${String(id)}`).join('、') : action === 'TEAM_SITE_SCOPES_CHANGED' ? '无工作厂区' : '无普通厂区授权' // 不转换为Number，也不暗示管理员例外被撤销。
  return value == null ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value) // 保留已有详情展示行为。
}

/** 执行流程：1.仅发送契约筛选；2.复用会话请求；3.保留整页和真实错误。 */
export function createAuditApi(request: <T>(path: string) => Promise<T>) {
  return {
    async auditEvents(query: Query = {}): Promise<Page<AuditEvent>> {
      const filters: Query = { current: query.current ?? 1, size: query.size ?? 10 } // 设置默认分页。
      for (const key of ['action', 'actorUserId', 'objectType', 'objectId', 'outcome', 'occurredFrom', 'occurredTo']) filters[key] = query[key] // 企业范围由后端会话确定。
      return readEquipmentPage<AuditEvent>(await request<unknown>(queryPath('/audit-events', filters))) // 解包后的数据仍须满足分页契约。
    },
    auditEvent: (id: AuditId) => request<AuditEventDetail>(`/audit-events/${id}`), // 详情仅提供GET入口。
  }
}
