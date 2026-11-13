import type { AlertEvent, AlertRule, AlertRuleInput, AlertAction, AlertNotice, AlertId } from './operations'
import type { InventoryExportTask } from './inventory-export'
import type { MaintenancePlan, MaintenanceInput, MaintenanceExecution, CompatiblePart, RepairCount, DailyTrend, ProcessingDuration, OverdueSummary } from './s2-contract'
import type { Equipment, EquipmentPage, EquipmentRuntimeReading, EquipmentStatusFilter, EquipmentUpsert, MaintenanceHistoryRecord } from '@/types'
import type { AuthUser, Member, Order, OrderCreate, OrderLog, OrderPart, Page, SparePart, SparePartUpsert, StockInput, StockIssue, StockReturn, StockTransaction, Tenant, Warehouse, WarehouseStock, WorkspaceSummary } from '@/domain'
import { createHttpClient } from './http'
import { createAuditApi } from './audit-contract'
import { createSiteApi } from './site-contract'
import { createTeamApi } from './team-contract'
import { resourceId, type ResourceId } from './resource-id'
import { compatibleEquipmentPath } from './compatibility-path'
import type { CompatibleEquipment } from './s2-contract'
import { assertOverduePage } from './overdue-contract'
import { queryPath, orderActionPath, type OrderAction, type Query } from './backend-contract'
import { equipmentHistoryPath, equipmentListPath, equipmentStatusPath, equipmentUpdateBody, readEquipmentPage } from './equipment-contract'
export { ApiError } from './http'

const { request, download } = createHttpClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '',
  onUnauthorized: () => window.dispatchEvent(new Event('equipops:unauthorized')),
})
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
async function paged<T>(path: string, query: Query = {}): Promise<Page<T>> {
  return readEquipmentPage<T>(await request<unknown>(queryPath(path, { current: 1, size: 10, ...query })))
}

export const api = {
  ...createAuditApi(request),
  ...createSiteApi(request),
  ...createTeamApi(request),
  alerts: (query: Query = {}) => paged<AlertEvent>('/operations/alerts', query),
  alert: (id: AlertId) => request<AlertEvent>(`/operations/alerts/${id}`),
  alertActions: (id: AlertId) => request<AlertAction[]>(`/operations/alerts/${id}/actions`),
  actOnAlert: (id: AlertId, action: 'acknowledge' | 'notes' | 'resolve', body: { expectedVersion: number; note: string }) => request<AlertEvent>(`/operations/alerts/${id}/${action}`, json('POST', body)),
  alertRule: () => request<AlertRule>('/operations/alert-rules/export-failures'),
  saveAlertRule: (body: AlertRuleInput) => request<AlertRule>('/operations/alert-rules/export-failures', json('PUT', body)),
  alertNotifications: (query: Query = {}) => paged<AlertNotice>('/operations/notifications', query),
  readAlertNotice: (id: AlertId) => request<void>(`/operations/notifications/${id}/read`, json('POST')),

  inventoryExports: (query: Query = {}) => paged<InventoryExportTask>('/inventory/exports', query),
  inventoryExport: (id: number) => request<InventoryExportTask>(`/inventory/exports/${id}`),
  createInventoryExport: (body: Query) => request<InventoryExportTask>('/inventory/exports', json('POST', body)),
  cancelInventoryExport: (id: number) => request<InventoryExportTask>(`/inventory/exports/${id}/cancel`, json('POST')),
  downloadInventoryExport: (id: number, signal?: AbortSignal) => download(`/inventory/exports/${id}/file`, signal),
  maintenancePlans: (query: Query = {}) => paged<MaintenancePlan>('/maintenance-plans', query),
  maintenancePlan: (id: number) => request<MaintenancePlan>(`/maintenance-plans/${id}`),
  createMaintenancePlan: (body: MaintenanceInput) => request<MaintenancePlan>('/maintenance-plans', json('POST', body)),
  updateMaintenancePlan: (id: number, body: MaintenanceInput) => request<MaintenancePlan>(`/maintenance-plans/${id}`, json('PUT', body)),
  setMaintenanceEnabled: (id: number, enabled: boolean) => request<void>(`/maintenance-plans/${id}/enabled`, json('PATCH', { enabled })),
  createMaintenanceExecution: (id: number, key: string, body: { result: string }) => request<MaintenanceExecution>(`/maintenance-plans/${id}/executions`, { ...json('POST', body), headers: { 'Idempotency-Key': key } }),
  maintenanceHistory: (id: number, query: Query = {}) => paged<MaintenanceExecution>(`/maintenance-plans/${id}/executions`, query),
  maintenanceExecution: (id: number) => request<MaintenanceExecution>(`/maintenance-executions/${id}`),
  runtimeReadings: (id: number) => request<EquipmentRuntimeReading[]>(`/equipment/${id}/runtime-readings`),
  recordRuntimeReading: (id: number, hours: number) =>
    request<EquipmentRuntimeReading>(`/equipment/${id}/runtime-readings`, json('POST', { hours })),
  compatibleParts: (id: number) => request<CompatiblePart[]>(`/equipment/${id}/compatible-spare-parts`),
  addCompatiblePart: (id: number, sparePartId: number) => request<CompatiblePart>(`/equipment/${id}/compatible-spare-parts`, json('POST', { sparePartId })),
  removeCompatiblePart: (id: number, sparePartId: number) => request<void>(`/equipment/${id}/compatible-spare-parts/${sparePartId}`, json('DELETE')),
  repairCounts: (query: Query) => request<RepairCount[]>(queryPath('/statistics/equipment/repair-counts', query)),
  dailyTrend: (query: Query) => request<DailyTrend[]>(queryPath('/statistics/work-orders/daily-trend', query)),
  processingDuration: (query: Query) => request<ProcessingDuration[]>(queryPath('/statistics/equipment/processing-duration', query)),
  overdueSummary: () => request<OverdueSummary>('/statistics/work-orders/overdue-summary'),
  me: () => request<AuthUser>('/auth/me'),
  login: (account: string, password: string) => request<{ userId: number; account: string; name: string }>('/auth/login', json('POST', { account, password })),
  logout: () => request<void>('/auth/logout', json('POST')),
  tenants: () => request<Tenant[]>('/tenants/mine'),
  activateTenant: (tenantId: number) => request<AuthUser>('/auth/active-tenant', json('POST', { tenantId })),
  summary: () => request<WorkspaceSummary>('/workspace/summary'),
  workOrders: async (query: Query = {}) => { const page = await paged<Order>('/work-orders', query); assertOverduePage(page, query.overdueOnly === true); return page },
  order: (id: ResourceId) => request<Order>(`/work-orders/${resourceId(id)}`),
  orderLogs: (id: ResourceId) => request<OrderLog[]>(`/work-orders/${resourceId(id)}/logs`),
  orderParts: (id: ResourceId) => request<OrderPart[]>(`/work-orders/${resourceId(id)}/parts`),
  createWorkOrder: (body: OrderCreate) => request<Order>('/work-orders', json('POST', body)),
  orderAction: (id: ResourceId, action: OrderAction, body?: unknown) => request<Order>(orderActionPath(id, action), json(action === 'dispatch' ? 'PUT' : 'POST', body)),
  equipmentDetail: (id: number) => request<Equipment>(`/equipment/${id}`),
  equipment: async (current = 1, size = 10, keyword = '', status: EquipmentStatusFilter = 'ALL'): Promise<EquipmentPage> =>
    readEquipmentPage<Equipment>(await request<unknown>(equipmentListPath(current, size, keyword, status))),
  createEquipment: (body: EquipmentUpsert) => request<Equipment>('/equipment', json('POST', body)),
  updateEquipment: (id: number, body: EquipmentUpsert) => request<Equipment>(`/equipment/${id}`, json('PUT', equipmentUpdateBody(body))),
  deleteEquipment: (id: number) => request<void>(`/equipment/${id}`, json('DELETE')),
  changeEquipmentStatus: (id: number, targetStatus: 'RUNNING' | 'STOPPED') => request<Equipment>(equipmentStatusPath(id, targetStatus), json('PUT')),
  equipmentHistory: async (id: number, current = 1, size = 5): Promise<EquipmentPage<MaintenanceHistoryRecord>> =>
    readEquipmentPage<MaintenanceHistoryRecord>(await request<unknown>(equipmentHistoryPath(id, current, size))),
  sparePart: (id: number) => request<SparePart>(`/spare-parts/${id}`),
  compatibleEquipment: (id: number) => request<CompatibleEquipment[]>(compatibleEquipmentPath(id)),
  spareParts: (query: Query = {}) => paged<SparePart>('/spare-parts', query),
  savePart: (body: SparePartUpsert, id?: number) => request<SparePart>(id ? `/spare-parts/${id}` : '/spare-parts', json(id ? 'PUT' : 'POST', body)),
  warehouses: () => request<Warehouse[]>('/warehouses'),
  warehouseStocks: (query: Query = {}) => paged<WarehouseStock>('/warehouse-stocks', query),
  transactions: (query: Query = {}) => paged<StockTransaction>('/inventory/transactions', query),
  stockIn: (key: string, body: StockInput) => request<StockTransaction>('/inventory/stock-ins', { ...json('POST', body), headers: { 'Idempotency-Key': key } }),
  stockIssue: (key: string, body: StockIssue) => request<StockTransaction>('/inventory/issues', { ...json('POST', body), headers: { 'Idempotency-Key': key } }),
  stockReturn: (key: string, body: StockReturn) => request<StockTransaction>('/inventory/returns', { ...json('POST', body), headers: { 'Idempotency-Key': key } }),
  members: (query: Query = {}) => paged<Member>('/tenant-members', query),
  addMember: (userId: number) => request<Member>('/tenant-members', json('POST', { userId, roleIds: [] })),
  memberStatus: (id: number | string, enabled: boolean) => request<Member>(`/tenant-members/${id}/status`, json('PATCH', { enabled })),
  user: (id: number) => request<{ id: number; account: string; displayName: string; enabled: boolean }>(queryPath('/users/id', { id })),
}
