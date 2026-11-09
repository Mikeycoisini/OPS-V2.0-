export type AlertId = number | string
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
export interface AlertEvent {
  id: AlertId; ruleId: AlertId; ruleCode: string; errorCode: string; status: AlertStatus
  recoveryStatus: 'UNVERIFIED' | 'RECOVERED'; occurrenceCount: number; ownerUserId: AlertId
  firstSeenAt: string; lastSeenAt: string; acknowledgedAt?: string; recoveredAt?: string; resolvedAt?: string; version: number
}
export interface AlertRule {
  id?: AlertId; enabled: boolean; thresholdCount: number; windowSeconds: number; cooldownSeconds: number; ownerUserId: AlertId; version: number
}
export interface AlertRuleInput extends Omit<AlertRule, 'id' | 'version'> { expectedVersion?: number }
export interface AlertAction { id: AlertId; actorUserId: AlertId; actionType: string; note: string; createdAt: string }
export interface AlertNotice { id: AlertId; eventId: AlertId; title: string; message: string; readAt?: string; createdAt: string }
export const alertStatusText: Record<AlertStatus, string> = { OPEN: '待处理', ACKNOWLEDGED: '已接手', RESOLVED: '已结案' }
