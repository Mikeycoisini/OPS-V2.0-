import type { FaultCategory } from '@/domain'

export const faultCategoryLabels: Record<FaultCategory, string> = {
  MECHANICAL: '机械',
  ELECTRICAL: '电气',
  CONTROL: '控制与仪表',
  HYDRAULIC: '液压与气动',
  OTHER: '其他',
}
