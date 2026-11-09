import type { Page } from '../domain'
import { queryPath, type Query } from './backend-contract.ts'
import { readEquipmentPage } from './equipment-contract.ts'

/** BIGINT由后端以字符串返回；保留数字兼容旧接口，禁止转为Number。 */
export type AuditId = number | string
export type AuditAction = 'MEMBER_ADDED' | 'MEMBER_ROLES_CHANGED' | 'MEMBER_STATUS_CHANGED'
export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED'
export interface AuditEvent {
  id: AuditId; actorUserId: AuditId | null; actorName: string | null; actorType: string
  action: AuditAction; objectType: 'MEMBER'; objectId: AuditId | null; outcome: AuditOutcome
  requestId: string | null; occurredAt: string; summary: string | null
}
export interface AuditEventDetail extends AuditEvent { changes: Record<string, unknown> | null }
export const auditActionLabels: Record<AuditAction, string> = { MEMBER_ADDED: '添加成员', MEMBER_ROLES_CHANGED: '变更成员角色', MEMBER_STATUS_CHANGED: '变更成员状态' }
export const auditOutcomeLabels: Record<AuditOutcome, string> = { SUCCESS: '成功', FAILURE: '失败', DENIED: '拒绝' }

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
