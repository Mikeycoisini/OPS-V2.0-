/** 与当前后端 VO/DTO 对齐；列表不补造详情字段或演示数据。 */
import type { Equipment } from './types'

export interface Page<T> { records: T[]; current: number; size: number; total: number; pages: number }
export interface Tenant { id: number; tenantCode: string; name: string; enabled: boolean }
export interface AuthUser { userId: number; account: string; name: string; activeTenant: Tenant | null; membershipId: number | null; roleCodes: string[] }
export interface Role { id: number; roleCode: string; name: string }
export interface Member { id: number | string; tenantId: number | string; userId: number | string; account: string; displayName: string; enabled: boolean; roles: Role[]; joinedAt: string; createdAt: string }
export type OrderStatus = 'PENDING' | 'IN_PROGRESS' | 'AWAITING_ACCEPTANCE' | 'COMPLETED'
export type OrderPriority = 'NORMAL' | 'HIGH' | 'URGENT'
export interface OrderLog { id: number; workOrderId: number; eventType: string; fromStatus: OrderStatus | null; toStatus: OrderStatus | null; title: string; detail: string; actorUserId: number; createdAt: string }
export interface OrderPart { id: number; workOrderId: number; sparePartId: number; partCode: string; partName: string; spec: string | null; unit: string | null; plannedQuantity: number; issuedQuantity: number; returnedQuantity: number }
export interface Order {
  id: number; tenantId: number; orderNo: string; title: string; equipmentId: number; description: string | null
  priority: OrderPriority; status: OrderStatus; assigneeUserId: number | null; createdBy: number | null
  dueAt: string | null; completedAt: string | null; createdAt: string; updatedAt: string
  timeline?: OrderLog[]; equipment?: Equipment | null; parts?: OrderPart[]
}
export interface OrderCreate { title: string; equipmentId: number; description: string; priority: OrderPriority; dueAt: string | null }
export interface WorkspaceSummary {
  tenantId: number; totalOrderCount: number; pendingDispatchCount: number; pendingStartCount: number
  inProgressCount: number; awaitingAcceptanceCount: number; completedCount: number
  lowStockCount: number | null; lowStockAvailable: boolean; lowStockUnavailableReason: string | null
}
export interface SparePart {
  id: number; tenantId: number; partCode: string; name: string; spec: string | null; category: string | null
  location: string | null; minStockQuantity: number; unit: string | null; enabled: boolean; createdAt: string; updatedAt: string
}
export type SparePartUpsert = Pick<SparePart, 'partCode' | 'name' | 'spec' | 'category' | 'location' | 'minStockQuantity' | 'unit' | 'enabled'>
export interface Warehouse { id: number; tenantId: number; warehouseCode: string; name: string; location: string | null; enabled: boolean; isDefault: boolean }
export interface WarehouseStock {
  id: number; tenantId: number; warehouseId: number; warehouseCode: string; warehouseName: string; warehouseEnabled: boolean
  sparePartId: number; partCode: string; partName: string; spec: string | null; unit: string | null; sparePartEnabled: boolean
  quantity: number; minStockQuantity: number; lowStock: boolean; updatedAt: string
}
export type TransactionType = 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT'
export interface StockTransaction {
  id: number; tenantId: number; warehouseId: number; requestId: string; issueTransactionId: number | null
  transactionNo: string; sparePartId: number; transactionType: TransactionType; quantity: number
  referenceType: 'WORK_ORDER' | 'PURCHASE_ORDER' | 'MANUAL' | 'OTHER'; referenceText: string | null
  workOrderId: number | null; createdBy: number; note: string | null; createdAt: string
}
export interface StockInput { warehouseId: number; sparePartId: number; quantity: number; referenceText?: string; note: string }
export interface StockIssue extends Omit<StockInput, 'referenceText'> { workOrderId: number }
export interface StockReturn { issueTransactionId: number; quantity: number; note: string }
