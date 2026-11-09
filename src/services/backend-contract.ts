import type { AuthUser, Order } from '../domain'

export type Query = Record<string, string | number | boolean | null | undefined>
export function queryPath(path: string, query: Query = {}) {
  const params = new URLSearchParams()
  for (const [key, raw] of Object.entries(query)) {
    const value = typeof raw === 'string' ? raw.trim() : raw
    if (value !== null && value !== undefined && value !== '' && value !== 'ALL') params.set(key, String(value))
  }
  return path + (params.size ? `?${params}` : '')
}

export type OrderAction = 'dispatch' | 'start' | 'repair-notes' | 'submit' | 'approve' | 'reject'
export function orderActionPath(id: number, action: OrderAction) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('工单 ID 必须为正整数')
  return `/work-orders/${id}/${action}`
}

/** 前端只控制操作入口，最终权限与状态仍由后端实时校验。 */
export function allowedOrderActions(order: Pick<Order, 'status' | 'assigneeUserId' | 'createdBy'>, user: Pick<AuthUser, 'userId' | 'roleCodes'> | null) {
  const own = !!user && order.assigneeUserId === user.userId
  const acceptance = !!user && !own && (order.createdBy === user.userId || user.roleCodes.includes('ACCEPTOR'))
  return {
    dispatch: order.status === 'PENDING' && !!user?.roleCodes.includes('TENANT_ADMIN'),
    start: order.status === 'PENDING' && own,
    note: order.status === 'IN_PROGRESS' && own,
    submit: order.status === 'IN_PROGRESS' && own,
    approve: order.status === 'AWAITING_ACCEPTANCE' && acceptance,
    reject: order.status === 'AWAITING_ACCEPTANCE' && acceptance,
    issue: order.status === 'IN_PROGRESS' && own,
    returnStock: ['IN_PROGRESS', 'AWAITING_ACCEPTANCE', 'COMPLETED'].includes(order.status) && own,
  }
}

export function parseQuantity(value: string): number {
  const input = value.trim()
  if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(input) || Number(input) <= 0) throw new Error('数量必须大于 0，整数最多 11 位，小数最多 3 位')
  return Number(input)
}

/** 原请求失败后锁住快照；重试不能悄悄更换数量、仓库或请求号。 */
export function createMutationIntent(keyFactory: () => string = () => crypto.randomUUID(), initial?: { key: string; body: Record<string, unknown> }) {
  let current: { key: string; body: Record<string, unknown>; fingerprint: string } | null = initial
    ? { key: initial.key, body: structuredClone(initial.body), fingerprint: JSON.stringify(initial.body) } : null
  function prepare<T extends object>(body: T): { key: string; body: T } {
    const fingerprint = JSON.stringify(body)
    if (current && current.fingerprint !== fingerprint) throw new Error('请使用原请求重试，或先确认上次结果再开始新操作')
    if (!current) current = { key: keyFactory(), body: structuredClone(body) as Record<string, unknown>, fingerprint }
    return { key: current.key, body: structuredClone(current.body) as T }
  }
  return { prepare, reset: () => { current = null } }
}

export const orderStatusLabel = { PENDING: '待处理', IN_PROGRESS: '维修中', AWAITING_ACCEPTANCE: '待验收', COMPLETED: '已完成' } as const
export const priorityLabel = { NORMAL: '普通', HIGH: '高', URGENT: '紧急' } as const
export function formatTime(value: string | null | undefined) { return value ? value.replace('T', ' ').slice(0, 16) : '—' }
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : '请求失败，请稍后重试' }
