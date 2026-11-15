export interface AvailabilityAlert {
  id: string
  ownerUserId: string
  evidence: string
  openedAt: string
  recoveredAt: string | null
  notifiedAt: string | null
  readAt: string | null
  acknowledgedAt: string | null
  resolvedAt: string | null
}

export type AvailabilityAction = 'READ' | 'ACKNOWLEDGE' | 'RESOLVE'

export const availabilityEvidence: Record<string, string> = {
  CONNECT_FAILED: '连接失败',
  TIMEOUT: '探测超时',
  HEALTH_STATUS_DOWN: '服务报告不可用',
  HTTP_UNEXPECTED_STATUS: 'HTTP 状态异常',
  HEALTH_INVALID_RESPONSE: '健康响应无法验证',
}
