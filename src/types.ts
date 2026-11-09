/** 设备契约；企业、工单和库存的实际后端类型见 domain.ts。 */
export type EquipmentStatus = 'RUNNING' | 'NEEDS_ATTENTION' | 'STOPPED'
export type EquipmentStatusFilter = 'ALL' | EquipmentStatus

/** Completed work orders returned by the equipment history endpoint. */
export interface MaintenanceHistoryRecord {
  id: number
  orderNo: string
  title: string
  equipmentId: number
  description: string | null
  priority: 'URGENT' | 'HIGH' | 'NORMAL'
  status: 'PENDING' | 'IN_PROGRESS' | 'AWAITING_ACCEPTANCE' | 'COMPLETED'
  assigneeUserId: number | null
  dueAt: string | null
  completedAt: string | null
  createdBy: number | null
  createdAt: string | null
  updatedAt: string | null
}

export interface Equipment {
  id: number
  assetCode: string
  name: string
  model: string | null
  location: string | null
  category: string | null
  status: EquipmentStatus
  health: number | null
  nextMaintenanceAt: string | null
  runtimeHours: number | null
  imageRef: string | null
  installedAt: string | null
  managerUserId: number | null
  createdAt: string | null
  updatedAt: string | null
}

export interface EquipmentUpsert {
  assetCode: string
  name: string
  model?: string | null
  location?: string | null
  category?: string | null
  status?: EquipmentStatus | null
  health?: number | null
  nextMaintenanceAt?: string | null
  runtimeHours?: number | null
  imageRef?: string | null
  installedAt?: string | null
  managerUserId?: number | null
}

export interface EquipmentPage<T = Equipment> {
  records: T[]
  current: number
  size: number
  total: number
  pages: number
}

