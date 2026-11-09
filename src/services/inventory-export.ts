import type { Query } from './backend-contract'

export type InventoryExportStatus = 'QUEUED' | 'RUNNING' | 'CANCEL_REQUESTED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED'
export interface InventoryExportTask {
  id: number
  status: InventoryExportStatus
  processedRows: number | null
  fileName: string | null
  fileSize: number | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  expiresAt: string | null
}
export const exportStatusLabels: Record<InventoryExportStatus, string> = {
  QUEUED: '排队中', RUNNING: '生成中', CANCEL_REQUESTED: '取消中', SUCCEEDED: '已完成',
  FAILED: '失败', CANCELLED: '已取消', REJECTED: '未接收', EXPIRED: '已过期',
}
export function activeExport(status: InventoryExportStatus): boolean {
  return ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(status)
}
export function cancellableExport(status: InventoryExportStatus): boolean {
  return status === 'QUEUED' || status === 'RUNNING'
}
/** 只提交后端支持的筛选；不能将分页、企业身份或任务状态混入创建请求。 */
export function inventoryExportFilters(query: Query): Query {
  const body: Query = {}
  for (const field of ['warehouseId', 'sparePartId', 'workOrderId', 'transactionType', 'referenceType', 'startTime', 'endTime']) {
    const value = query[field]
    if (value !== '' && value !== null && value !== undefined) body[field] = value
  }
  if (body.startTime && body.endTime && String(body.startTime) > String(body.endTime)) {
    throw new Error('开始时间不能晚于结束时间')
  }
  return body
}
/** 使用响应中的附件文件名；路径和控制字符不能进入下载名称。 */
export function inventoryExportFileName(header: string | null): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  let name = header?.match(/filename="([^"]+)"/i)?.[1] || '库存流水.xlsx'
  if (encoded) { try { name = decodeURIComponent(encoded) } catch { /* 无效编码使用普通文件名。 */ } }
  name = name.replace(/[\\/\u0000-\u001f]/g, '_')
  return name.toLowerCase().endsWith('.xlsx') ? name : '库存流水.xlsx'
}
