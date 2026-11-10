<script setup lang="ts">
import { computed, onMounted, onScopeDispose, reactive, ref } from 'vue'
import { PackagePlus, Plus, Search, RotateCcw } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { usePage } from '@/composables/usePage'
import { allowedOrderActions, errorMessage, formatTime } from '@/services/backend-contract'
import type { SparePart, SparePartUpsert, StockTransaction, Warehouse } from '@/domain'
import PageHead from '@/components/PageHead.vue'
import PagePager from '@/components/PagePager.vue'
import ResourceState from '@/components/ResourceState.vue'
import StatusPill from '@/components/StatusPill.vue'
import StockMutationDialog from '@/components/StockMutationDialog.vue'
import PartDetail from '@/components/PartDetail.vue'
import InventoryExports from '@/components/InventoryExports.vue'
const store = useAppStore()
const route = useRoute()
const tab = ref(['catalog', 'transactions'].includes(String(route.query.tab)) ? String(route.query.tab) : 'balances')
const balances = usePage(api.warehouseStocks, () => store.epoch)
const catalog = usePage(api.spareParts, () => store.epoch)
const transactions = usePage(api.transactions, () => store.epoch)
const { records: stocks } = balances
const { records: parts } = catalog
const { records: logs } = transactions
const active = computed(() => tab.value === 'catalog' ? catalog : tab.value === 'transactions' ? transactions : balances)
const loading = computed(() => active.value.loading.value)
const error = computed(() => active.value.error.value || (tab.value === 'balances' && !balances.ready.value ? warehouseError.value : ''))
const empty = computed(() => !active.value.records.value.length)
const warehouses = ref<Warehouse[]>([])
const warehouseId = ref<number | null>(null)
const warehouseLoading = ref(false)
const warehouseError = ref('')
const balanceFilters = reactive({ keyword: '', lowStockOnly: false })
const partFilters = reactive({ keyword: '', category: '', enabled: '' })
const transactionFilters = reactive({ sparePartId: null as number | null, workOrderId: typeof route.query.workOrderId === 'string' ? route.query.workOrderId : '', transactionType: '', referenceType: '', startTime: '', endTime: '' })
const editorOpen = ref(false)
const editingId = ref<number | undefined>()
const saving = ref(false)
const formError = ref('')
const partForm = reactive<SparePartUpsert>({ partCode: '', name: '', spec: '', category: '', location: '', minStockQuantity: 0, unit: '', enabled: true })
const stockOpen = ref(false)
const stockMode = ref<'in' | 'return'>('in')
const original = ref<StockTransaction | null>(null)
const detailPartId = ref<number | null>(null)
const selectedPart = ref<number | undefined>()
const selectedPartLabel = ref('')
const returnBusy = ref<number | null>(null)
let sequence = 0
const referenceLabels: Record<string, string> = { WORK_ORDER: '维修工单', PURCHASE_ORDER: '采购单', MANUAL: '手工记录', OTHER: '其他' }
function filters() { return tab.value === 'catalog' ? { ...partFilters } : tab.value === 'transactions' ? { ...transactionFilters, warehouseId: warehouseId.value } : { ...balanceFilters, warehouseId: warehouseId.value } }
function load(current = 1) {
  if (tab.value === 'transactions' && transactionFilters.startTime && transactionFilters.endTime && transactionFilters.startTime > transactionFilters.endTime) { ElMessage.warning('开始时间不能晚于结束时间'); return }
  return active.value.load({ ...filters(), current })
}
function changeTab(value: string) { tab.value = value; void load() }
function reset() {
  if (tab.value === 'catalog') Object.assign(partFilters, { keyword: '', category: '', enabled: '' })
  else if (tab.value === 'transactions') Object.assign(transactionFilters, { sparePartId: null, workOrderId: '', transactionType: '', referenceType: '', startTime: '', endTime: '' })
  else Object.assign(balanceFilters, { keyword: '', lowStockOnly: false })
  void load()
}
async function loadWarehouses() {
  const ticket = ++sequence
  warehouseLoading.value = true; warehouseError.value = ''
  try {
    const rows = await api.warehouses()
    if (ticket !== sequence) return
    warehouses.value = rows.filter(row => row.enabled)
    warehouseId.value = warehouses.value[0]?.id || null
    if (tab.value !== 'catalog') void load()
  } catch (reason) { if (ticket === sequence) warehouseError.value = errorMessage(reason) }
  finally { if (ticket === sequence) warehouseLoading.value = false }
}
function editPart(part?: SparePart) {
  editingId.value = part?.id; formError.value = ''
  Object.assign(partForm, { partCode: part?.partCode || '', name: part?.name || '', spec: part?.spec || '', category: part?.category || '', location: part?.location || '', minStockQuantity: part?.minStockQuantity ?? 0, unit: part?.unit || '', enabled: part?.enabled ?? true })
  editorOpen.value = true
}
async function savePart() {
  if (saving.value) return
  formError.value = ''
  const minStock = String(partForm.minStockQuantity)
  if (!partForm.partCode.trim() || !partForm.name.trim()) { formError.value = '请填写备件编号和名称'; return }
  if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(minStock)) { formError.value = '最低库存为非负数，整数最多 11 位、小数最多 3 位'; return }
  const body: SparePartUpsert = { partCode: partForm.partCode.trim(), name: partForm.name.trim(), spec: partForm.spec?.trim() || null, category: partForm.category?.trim() || null, location: partForm.location?.trim() || null, minStockQuantity: Number(minStock), unit: partForm.unit?.trim() || null, enabled: partForm.enabled }
  saving.value = true
  try { await store.mutate(() => api.savePart(body, editingId.value)); editorOpen.value = false; ElMessage.success('备件资料已保存'); await load(active.value.page.current) }
  catch (reason) { formError.value = errorMessage(reason) } finally { saving.value = false }
}
function stockIn(partId?: number, label = '') { stockMode.value = 'in'; original.value = null; selectedPart.value = partId; selectedPartLabel.value = label; stockOpen.value = true }
async function returnStock(transaction: StockTransaction) {
  if (!transaction.workOrderId || returnBusy.value) return
  const scope = store.epoch
  returnBusy.value = transaction.id
  try {
    const order = await api.order(transaction.workOrderId)
    if (scope !== store.epoch) return
    if (!allowedOrderActions(order, store.user).returnStock) { ElMessage.warning('只有当前工单负责人可以办理退料，工单须已开始维修'); return }
    original.value = transaction; stockMode.value = 'return'; stockOpen.value = true
  } catch (reason) { if (scope === store.epoch) ElMessage.error(errorMessage(reason)) } finally { returnBusy.value = null }
}
function viewTransactions(partId: number) { transactionFilters.sparePartId = partId; changeTab('transactions') }
function saved() { void load(active.value.page.current) }
onMounted(() => { void loadWarehouses(); if (tab.value === 'catalog' || tab.value === 'transactions') void load() })
onScopeDispose(() => sequence++)
</script>
<template><div><PageHead title="备件库存" description="看清仓库余额，追溯每一笔入库、领料与退回。" eyebrow="SPARE PARTS / INVENTORY"><el-button v-if="store.isAdmin" @click="editPart()"><Plus :size="15" />新增备件</el-button><el-button v-if="store.isAdmin" type="primary" @click="stockIn()"><PackagePlus :size="16" />备件入库</el-button></PageHead><div v-if="tab === 'transactions'" class="export-toolbar" style="display: flex; justify-content: flex-end; margin-bottom: 16px"><InventoryExports :filters="{ ...transactionFilters, warehouseId }" /></div><section class="panel"><div class="tabs-bar"><button v-for="item in [{ key: 'balances', label: '仓库余额' }, { key: 'catalog', label: '备件目录' }, { key: 'transactions', label: '出入库流水' }]" :key="item.key" class="tab-button" :class="{ active: tab === item.key }" @click="changeTab(item.key)">{{ item.label }}</button></div><div v-if="tab !== 'catalog'" class="stock-context"><strong>当前仓库</strong><el-select v-model="warehouseId" :loading="warehouseLoading" clearable placeholder="全部仓库" aria-label="筛选仓库" @change="load()"><el-option v-for="warehouse in warehouses" :key="warehouse.id" :label="`${warehouse.name} · ${warehouse.warehouseCode}`" :value="warehouse.id" /></el-select><span class="muted">仓库选项为当前企业已启用的默认仓库</span></div><p v-if="warehouseError && tab !== 'catalog'" class="inline-error inventory-warehouse-error">{{ warehouseError }} <el-button link type="primary" @click="loadWarehouses">重新读取</el-button><el-button link @click="warehouseId = null; load()">查询全部仓库记录</el-button></p><form class="filter-bar" @submit.prevent="load()"><template v-if="tab === 'balances'"><el-input v-model="balanceFilters.keyword" :prefix-icon="Search" clearable placeholder="搜索备件编号或名称" maxlength="160" aria-label="搜索仓库备件" /><el-checkbox v-model="balanceFilters.lowStockOnly">只看低库存</el-checkbox></template><template v-else-if="tab === 'catalog'"><el-input v-model="partFilters.keyword" :prefix-icon="Search" clearable placeholder="搜索备件编号或名称" maxlength="160" aria-label="搜索备件目录" /><el-input v-model="partFilters.category" clearable placeholder="备件分类" maxlength="100" aria-label="备件分类" /><el-select v-model="partFilters.enabled" clearable placeholder="全部启用状态" aria-label="备件启用状态"><el-option label="已启用" value="true" /><el-option label="已停用" value="false" /></el-select></template><template v-else><el-input-number v-model="transactionFilters.sparePartId" :min="1" :precision="0" :controls="false" placeholder="备件 ID" aria-label="流水备件 ID" /><el-input v-model="transactionFilters.workOrderId" inputmode="numeric" maxlength="19" clearable placeholder="工单 ID" aria-label="流水工单 ID" /><el-select v-model="transactionFilters.transactionType" clearable placeholder="全部流水类型" aria-label="流水类型"><el-option label="入库（含退料）" value="INBOUND" /><el-option label="出库" value="OUTBOUND" /><el-option label="调整" value="ADJUSTMENT" /></el-select><el-select v-model="transactionFilters.referenceType" clearable placeholder="全部来源" aria-label="流水来源"><el-option v-for="(label, value) in referenceLabels" :key="value" :label="label" :value="value" /></el-select><el-date-picker v-model="transactionFilters.startTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="开始时间" style="width:190px" /><el-date-picker v-model="transactionFilters.endTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="结束时间" style="width:190px" /></template><el-button native-type="submit" :loading="loading">查询</el-button><el-button text @click="reset"><RotateCcw :size="14" />重置</el-button></form><ResourceState :loading="loading || (warehouseLoading && tab === 'balances')" :error="error" :empty="empty" :title="tab === 'balances' ? '仓库余额' : tab === 'catalog' ? '备件目录' : '库存流水'" description="当前筛选下暂无记录，调整查询条件后重试。" @retry="load(active.page.current)" /><div v-if="!loading && !error && !empty" class="table-wrap"><table v-if="tab === 'balances'" class="data-table"><thead><tr><th>备件名称 / 编号</th><th>仓库</th><th>库存余额</th><th>最低库存</th><th>库存状态</th><th>最近更新</th><th>操作</th></tr></thead><tbody><tr v-for="stock in stocks" :key="stock.id"><td><strong class="row-primary">{{ stock.partName }}</strong><span class="row-secondary">{{ stock.partCode }} · {{ stock.spec || '未填写规格' }}</span></td><td>{{ stock.warehouseName }}</td><td><b class="stock-quantity">{{ stock.quantity }}</b><span class="part-unit">{{ stock.unit }}</span></td><td>{{ stock.minStockQuantity }}<span class="part-unit">{{ stock.unit }}</span></td><td><StatusPill :value="stock.lowStock ? 'LOW' : 'NORMAL_STOCK'" /></td><td class="mono">{{ formatTime(stock.updatedAt) }}</td><td><div class="row-actions"><el-button link type="primary" @click="viewTransactions(stock.sparePartId)">流水</el-button><el-button v-if="store.isAdmin && stock.sparePartEnabled && stock.warehouseEnabled" link type="primary" @click="stockIn(stock.sparePartId, stock.partName)">入库</el-button></div></td></tr></tbody></table><table v-else-if="tab === 'catalog'" class="data-table"><thead><tr><th>备件名称 / 编号</th><th>规格</th><th>分类</th><th>目录库位</th><th>最低库存</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="part in parts" :key="part.id"><td><button class="row-link" @click="detailPartId = part.id"><span class="row-primary">{{ part.name }}</span><span class="row-secondary">{{ part.partCode }}</span></button></td><td>{{ part.spec || '—' }}</td><td>{{ part.category || '—' }}</td><td>{{ part.location || '—' }}</td><td>{{ part.minStockQuantity }} {{ part.unit }}</td><td><StatusPill :value="part.enabled ? 'ENABLED' : 'DISABLED'" /></td><td><div class="row-actions"><el-button link type="primary" @click="detailPartId = part.id">适配设备</el-button><el-button v-if="store.isAdmin" link type="primary" @click="editPart(part)">编辑</el-button><el-button link type="primary" @click="viewTransactions(part.id)">流水</el-button></div></td></tr></tbody></table><table v-else class="data-table"><thead><tr><th>流水编号</th><th>类型</th><th>备件 / 仓库</th><th>数量</th><th>业务来源</th><th>记录时间</th><th>操作</th></tr></thead><tbody><tr v-for="log in logs" :key="log.id"><td><span class="row-primary mono">{{ log.transactionNo }}</span><span class="row-secondary">{{ log.note || log.referenceText || '—' }}</span></td><td><StatusPill :value="log.issueTransactionId ? 'RETURN' : log.transactionType" /></td><td><span class="row-primary mono">备件 #{{ log.sparePartId }}</span><span class="row-secondary">仓库 #{{ log.warehouseId }}</span></td><td><b class="stock-quantity">{{ log.quantity }}</b></td><td>{{ referenceLabels[log.referenceType] || log.referenceType }}<span v-if="log.workOrderId" class="row-secondary">工单 #{{ log.workOrderId }}</span><span v-if="log.issueTransactionId" class="row-secondary">原领料 #{{ log.issueTransactionId }}</span></td><td><span class="mono">{{ formatTime(log.createdAt) }}</span><span class="row-secondary">操作人 #{{ log.createdBy }}</span></td><td><el-button v-if="log.transactionType === 'OUTBOUND' && log.referenceType === 'WORK_ORDER' && !log.issueTransactionId && log.workOrderId" link type="primary" :loading="returnBusy === log.id" :disabled="returnBusy !== null" @click="returnStock(log)">退回余料</el-button><span v-else class="muted">—</span></td></tr></tbody></table></div><PagePager v-if="!error" :current="active.page.current" :size="active.page.size" :total="active.page.total" :loading="loading" @change="load" @resize="active.load({ ...filters(), current: 1, size: $event })" /></section><p class="page-footnote">{{ tab === 'catalog' ? '备件目录维护名称、规格和预警值；实际库存以仓库余额为准。' : tab === 'balances' ? '每行对应一个仓库与一种备件。不同单位不合计；没有余额记录不等于确认库存为零。' : '退料关联原领料流水；可退数量和操作权限按当前工单及已退记录核验。' }}</p><PartDetail :part-id="detailPartId" @close="detailPartId = null" /><StockMutationDialog v-model="stockOpen" :mode="stockMode" :original="original" :part-id="selectedPart" :part-label="selectedPartLabel" :warehouse-id="warehouseId || undefined" @saved="saved" /><el-dialog v-model="editorOpen" :title="editingId ? '编辑备件目录' : '新增备件目录'" width="min(620px,94vw)" :show-close="!saving" :close-on-click-modal="!saving" :close-on-press-escape="!saving"><p class="dialog-intro">维护备件基础资料；此操作不会修改仓库库存数量。</p><el-form label-position="top" :model="partForm" :disabled="saving"><div class="form-grid"><el-form-item label="备件编号" required><el-input v-model="partForm.partCode" maxlength="64" /></el-form-item><el-form-item label="备件名称" required><el-input v-model="partForm.name" maxlength="160" /></el-form-item><el-form-item label="规格"><el-input v-model="partForm.spec" maxlength="160" /></el-form-item><el-form-item label="分类"><el-input v-model="partForm.category" maxlength="100" /></el-form-item><el-form-item label="目录库位"><el-input v-model="partForm.location" maxlength="120" /></el-form-item><el-form-item label="单位"><el-input v-model="partForm.unit" maxlength="24" placeholder="例如：个、套" /></el-form-item><el-form-item label="最低库存数量"><el-input v-model="partForm.minStockQuantity" inputmode="decimal" /></el-form-item><el-form-item label="启用状态"><el-switch v-model="partForm.enabled" active-text="启用" inactive-text="停用" /></el-form-item></div></el-form><p v-if="formError" class="inline-error" role="alert">{{ formError }}</p><template #footer><el-button :disabled="saving" @click="editorOpen = false">取消</el-button><el-button type="primary" :loading="saving" @click="savePart">保存资料</el-button></template></el-dialog></div></template>
