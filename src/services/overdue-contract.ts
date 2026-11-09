export function assertOverduePage<T extends { dueAt: string | null; status: string }>(page: { records: T[] }, enabled: boolean): void {
  if (enabled && page.records.some(row => !row.dueAt || row.status === 'COMPLETED')) {
    throw new Error('服务返回了无截止时间或已完成的工单，当前后端可能尚未支持逾期筛选，请更新并核对接口。')
  }
}
