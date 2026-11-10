export interface MaintenancePlan { id: number; equipmentId: number; equipmentName: string; equipmentAssetCode: string; name: string; planType: 'MAINTENANCE' | 'INSPECTION'; content: string; cycleDays: number; nextDueDate: string; assigneeUserId: number | string; assigneeName: string; enabled: boolean }
export interface MaintenanceInput { name: string; equipmentId: number; planType: 'MAINTENANCE' | 'INSPECTION'; content: string; cycleDays: number; nextDueDate: string; assigneeUserId: number | string }
export interface MaintenanceExecution { id: number; planName: string; planType: string; planContent: string; cycleDays: number; scheduledDate: string; executedAt: string; executedByName: string; result: string; nextDueDate: string; equipmentName: string; equipmentAssetCode: string }
export interface CompatibleEquipment { id: number; equipmentId: number; equipmentAssetCode: string; equipmentName: string; sparePartId: number; sparePartEnabled: boolean }
export interface CompatiblePart { id: number; sparePartId: number; sparePartCode: string; sparePartName: string; sparePartSpec: string | null; sparePartUnit: string | null; sparePartEnabled: boolean }
export interface RepairCount { equipmentId: number; assetCode: string; equipmentName: string; workOrderCount: number }
export interface DailyTrend { date: string; createdCount: number; completedCount: number }
export interface ProcessingDuration { equipmentId: number; assetCode: string; equipmentName: string; completedOrderCount: number; avgProcessingSeconds: number }
export interface OverdueSummary { asOf: string; overdueCount: number; pendingOverdueCount: number; inProgressOverdueCount: number; awaitingAcceptanceOverdueCount: number; withoutDeadlineCount: number }
