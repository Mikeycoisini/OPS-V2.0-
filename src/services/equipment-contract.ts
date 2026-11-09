export interface EquipmentPage<T> {
  records: T[]
  current: number
  size: number
  total: number
  pages: number
}

/** 编辑目录资料不改变运行状态；启停必须调用独立状态接口。 */
export function equipmentUpdateBody<T extends { status?: string | null }>(request: T): Omit<T, 'status'> {
  const { status: _status, ...body } = request
  return body
}

export function equipmentListPath(
  current = 1,
  size = 10,
  keyword = '',
  status: 'ALL' | 'RUNNING' | 'NEEDS_ATTENTION' | 'STOPPED' = 'ALL',
): string {
  const params = new URLSearchParams({ current: String(current), size: String(size) })
  if (keyword.trim()) params.set('keyword', keyword.trim())
  if (status !== 'ALL') params.set('status', status)
  return `/equipment?${params.toString()}`
}

function assertEquipmentId(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('设备 ID 无效')
}

export function equipmentStatusPath(id: number, targetStatus: 'RUNNING' | 'STOPPED'): string {
  assertEquipmentId(id)
  if (targetStatus !== 'RUNNING' && targetStatus !== 'STOPPED') throw new Error('不支持该启停目标状态')
  return `/equipment/${id}/status?${new URLSearchParams({ targetStatus }).toString()}`
}

export function equipmentHistoryPath(id: number, current = 1, size = 5): string {
  assertEquipmentId(id)
  const params = new URLSearchParams({ equipmentId: String(id), current: String(current), size: String(size) })
  return `/equipment/history?${params.toString()}`
}

export function readEquipmentPage<T>(payload: unknown): EquipmentPage<T> {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { records?: unknown }).records)) {
    throw new Error('分页结果格式不符合约定：缺少 records 数组。')
  }

  const page = payload as Record<string, unknown> & { records: T[] }
  return {
    records: page.records,
    current: Number(page.current) || 1,
    size: Number(page.size) || page.records.length || 10,
    total: Number(page.total) || 0,
    pages: Number(page.pages) || 0,
  }
}
