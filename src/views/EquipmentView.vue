<script setup lang="ts">
import { computed, onMounted, onScopeDispose, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Play, Square, Pencil, Trash2, ArrowUpRight } from 'lucide-vue-next'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { errorMessage, formatTime } from '@/services/backend-contract'
import type { Equipment, EquipmentStatusFilter, EquipmentUpsert, MaintenanceHistoryRecord } from '@/types'
import PageHead from '@/components/PageHead.vue'
import PagePager from '@/components/PagePager.vue'
import StatusPill from '@/components/StatusPill.vue'
import ResourceState from '@/components/ResourceState.vue'
import CompatibleParts from '@/components/CompatibleParts.vue'
import EquipmentQr from '@/components/EquipmentQr.vue'
import { ApiError } from '@/services/api'
import { parseEquipmentId } from '@/services/equipment-link'
const store = useAppStore()
const route = useRoute()
const router = useRouter()
const keyword = ref(typeof route.query.q === 'string' ? route.query.q : '')
const status = ref<EquipmentStatusFilter>('ALL')
const selectedId = ref<number | null>(null)
const detailRecord = ref<Equipment | null>(null)
const selected = computed(() => store.equipment.find(item => item.id === selectedId.value) ?? (detailRecord.value?.id === selectedId.value ? detailRecord.value : undefined))
const linkError = ref('')
const linkLoading = ref(false)
const qrOpen = ref(false)
let detailSequence = 0
const editorOpen = ref(false)
const editingId = ref<number | null>(null)
const busy = ref(false)
const formError = ref('')
const operationError = ref('')
const form = reactive<EquipmentUpsert>(emptyForm())
const history = reactive({ records: [] as MaintenanceHistoryRecord[], current: 1, size: 5, total: 0, loading: false, error: '' })
let historySequence = 0
const states: { value: EquipmentStatusFilter; label: string }[] = [{ value: 'ALL', label: '全部设备' }, { value: 'RUNNING', label: '运行中' }, { value: 'NEEDS_ATTENTION', label: '需关注' }, { value: 'STOPPED', label: '未运行' }]
function emptyForm(): EquipmentUpsert { return { assetCode: '', name: '', model: '', location: '', category: '', status: 'STOPPED', health: null, nextMaintenanceAt: null, runtimeHours: null, imageRef: null, installedAt: null, managerUserId: null } }
function load(current = 1) { return store.loadEquipmentPage(current, keyword.value, status.value) }
function edit(item?: Equipment) {
  editingId.value = item?.id ?? null; formError.value = ''
  Object.assign(form, item ? { assetCode: item.assetCode, name: item.name, model: item.model, location: item.location, category: item.category, status: item.status, health: item.health, nextMaintenanceAt: item.nextMaintenanceAt, runtimeHours: item.runtimeHours, imageRef: item.imageRef, installedAt: item.installedAt, managerUserId: item.managerUserId } : emptyForm())
  editorOpen.value = true
}
async function open(item: Equipment) {
  detailSequence++; detailRecord.value = item; selectedId.value = item.id; linkError.value = ''; operationError.value = ''
  Object.assign(history, { records: [], current: 1, total: 0, loading: false, error: '' })
  await loadHistory()
}
async function loadHistory(current = 1) {
  const id = selectedId.value
  if (id === null) return
  const ticket = ++historySequence
  const scope = store.epoch
  history.loading = true; history.error = ''
  try {
    const page = await api.equipmentHistory(id, current, history.size)
    if (ticket !== historySequence || id !== selectedId.value || scope !== store.epoch) return
    Object.assign(history, { records: page.records, current: page.current, total: page.total })
  } catch (reason) { if (ticket === historySequence && scope === store.epoch) history.error = errorMessage(reason) }
  finally { if (ticket === historySequence && scope === store.epoch) history.loading = false }
}
function nullableText(value: string | null | undefined) { return value?.trim() || null }
function nullableNumber(value: number | null | undefined) { return value == null || String(value).trim() === '' ? null : Number(value) }
async function save() {
  if (busy.value) return
  formError.value = ''
  const assetCode = form.assetCode.trim()
  const name = form.name.trim()
  const health = nullableNumber(form.health)
  const runtimeHours = nullableNumber(form.runtimeHours)
  const managerUserId = nullableNumber(form.managerUserId)
  if (!assetCode || !name) { formError.value = '请填写设备资产编号和名称'; return }
  // 保留原设备字段校验，不把空数值转换成 0。
  if (health !== null && (!Number.isInteger(health) || health < 0 || health > 100)) { formError.value = '健康度应为 0 到 100 的整数'; return }
  if (runtimeHours !== null && (!Number.isFinite(runtimeHours) || runtimeHours < 0 || runtimeHours >= 1e12 || !/^\d+(?:\.\d{1,2})?$/.test(String(runtimeHours)))) { formError.value = '累计运行小时应为非负数，整数最多 12 位、小数最多 2 位'; return }
  if (managerUserId !== null && (!Number.isSafeInteger(managerUserId) || managerUserId < 1)) { formError.value = '负责人用户 ID 应为正整数；未指定时请留空'; return }
  const body: EquipmentUpsert = { assetCode, name, model: nullableText(form.model), location: nullableText(form.location), category: nullableText(form.category), status: editingId.value === null ? 'STOPPED' : form.status, health, runtimeHours, managerUserId, nextMaintenanceAt: form.nextMaintenanceAt || null, installedAt: form.installedAt || null, imageRef: nullableText(form.imageRef) }
  busy.value = true
  try {
    if (editingId.value === null) await store.createEquipment(body)
    else await store.updateEquipment(editingId.value, body)
    editorOpen.value = false; selectedId.value = null; ElMessage.success('设备档案已保存')
  } catch (reason) { formError.value = errorMessage(reason) } finally { busy.value = false }
}
async function changeStatus(target: 'RUNNING' | 'STOPPED') {
  const item = selected.value
  if (!item || busy.value) return
  // 沿用已支持的启停流转；需关注状态不直接启停。
  if (!((item.status === 'STOPPED' && target === 'RUNNING') || (item.status === 'RUNNING' && target === 'STOPPED'))) { operationError.value = '当前设备状态不允许执行该操作'; return }
  busy.value = true; operationError.value = ''
  try {
    await ElMessageBox.confirm(`确认${target === 'RUNNING' ? '启动' : '停止'}设备“${item.name}”？`, '设备运行状态', { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' })
    await store.changeEquipmentStatus(item.id, target); ElMessage.success('设备运行状态已更新')
  } catch (reason) { if (reason !== 'cancel' && reason !== 'close') operationError.value = errorMessage(reason) } finally { busy.value = false }
}
async function remove() {
  const item = selected.value
  if (!item || busy.value) return
  if (item.status === 'RUNNING') { operationError.value = '设备正在运行中，不能删除'; return }
  busy.value = true; operationError.value = ''
  try {
    await ElMessageBox.confirm(`确定删除设备“${item.name}”（${item.assetCode}）吗？`, '删除设备', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' })
    await store.deleteEquipment(item.id); selectedId.value = null; ElMessage.success('设备已删除')
  } catch (reason) { if (reason !== 'cancel' && reason !== 'close') operationError.value = errorMessage(reason) } finally { busy.value = false }
}
function linkedOrders() { if (selected.value) void router.push({ path: '/orders', query: { equipmentId: selected.value.id } }) }
async function openLink(value: unknown) {
  const ticket = ++detailSequence
  historySequence++
  selectedId.value = null; detailRecord.value = null; linkError.value = ''; linkLoading.value = false
  if (value === undefined) return
  const id = parseEquipmentId(value)
  if (id === null) {
    linkError.value = '设备链接无效，请检查设备编号。'; return
  }
  const scope = store.epoch
  linkLoading.value = true
  try {
    const item = await api.equipmentDetail(id)
    if (ticket !== detailSequence || scope !== store.epoch) return
    detailRecord.value = item; selectedId.value = item.id; operationError.value = ''
    Object.assign(history, { records: [], current: 1, total: 0, loading: false, error: '' })
    await loadHistory()
  } catch (reason) {
    if (ticket === detailSequence && scope === store.epoch) linkError.value = reason instanceof ApiError && reason.status === 404 ? '设备不存在，或当前企业无权访问该设备。' : errorMessage(reason)
  } finally { if (ticket === detailSequence && scope === store.epoch) linkLoading.value = false }
}
watch(() => [route.query.equipmentId, store.epoch], ([id]) => { void openLink(id) }, { immediate: true })
onMounted(() => { void load() })
onScopeDispose(() => { historySequence++; detailSequence++ })
</script>
<template><div><p v-if="linkLoading" class="info-note" role="status">正在读取设备档案…</p><p v-if="linkError" class="inline-error" role="alert">{{ linkError }}</p><PageHead title="设备档案" description="一台设备，一份完整档案。连接现场信息与每一次维修记录。" eyebrow="ASSETS / EQUIPMENT REGISTER"><el-button type="primary" :disabled="busy" @click="edit()"><Plus :size="16" />新增设备</el-button></PageHead><section class="panel"><div class="tabs-bar"><button v-for="state in states" :key="state.value" class="tab-button" :class="{ active: status === state.value }" @click="status = state.value; load()">{{ state.label }}</button></div><form class="filter-bar" @submit.prevent="load()"><el-input v-model="keyword" :prefix-icon="Search" clearable placeholder="搜索设备名称" aria-label="搜索设备名称" /><el-button native-type="submit" :loading="store.resources.equipment.loading">查询</el-button><el-button text @click="keyword = ''; status = 'ALL'; load()">重置</el-button><span class="filter-spacer"></span><span class="filter-count">设备资料与维修历史，一处追溯</span></form><ResourceState v-bind="store.resources.equipment" :empty="!store.equipment.length" title="设备档案" description="当前条件下暂无设备，可登记一台设备或调整筛选条件。" @retry="load(store.equipmentPage.current)" /><div v-if="!store.resources.equipment.loading && !store.resources.equipment.error && store.equipment.length" class="table-wrap"><table class="data-table"><thead><tr><th>设备名称 / 资产编号</th><th>型号 / 分类</th><th>现场位置</th><th>运行状态</th><th>下次保养</th><th>设备负责人</th><th>操作</th></tr></thead><tbody><tr v-for="item in store.equipment" :key="item.id"><td><button class="row-link" @click="open(item)"><span class="row-primary">{{ item.name }}</span><span class="order-number">{{ item.assetCode }}</span></button></td><td><span class="row-primary">{{ item.model || '—' }}</span><span class="row-secondary">{{ item.category || '未填写分类' }}</span></td><td>{{ item.location || '未填写' }}</td><td><StatusPill :value="item.status" /></td><td class="mono">{{ item.nextMaintenanceAt || '未安排' }}</td><td>{{ item.managerUserId ? `用户 #${item.managerUserId}` : '未指定' }}</td><td><el-button link type="primary" @click="open(item)">查看档案</el-button></td></tr></tbody></table></div><PagePager v-if="!store.resources.equipment.error" :current="store.equipmentPage.current" :size="store.equipmentPage.size" :total="store.equipmentPage.total" :loading="store.resources.equipment.loading || busy" @change="load" @resize="store.equipmentPage.size = $event; load()" /></section><p class="page-footnote">维修履历仅显示已完成的工单；设备详情可继续查询全部关联工单。</p><el-drawer :model-value="!!selected" title="设备数字档案" size="min(650px,100vw)" :show-close="!busy" :close-on-click-modal="!busy" :close-on-press-escape="!busy" @close="selectedId = null"><template v-if="selected"><div class="drawer-section"><span class="drawer-subtitle">{{ selected.assetCode }}</span><h2 class="drawer-title">{{ selected.name }}</h2><div class="detail-badges"><StatusPill :value="selected.status" /><span class="muted mono">{{ selected.model || '未填写型号' }}</span></div><p v-if="operationError" class="inline-error">{{ operationError }}</p><p v-if="selected.status === 'NEEDS_ATTENTION'" class="info-note">设备需关注，暂不支持直接启停。</p><dl class="details-grid"><div><dt>现场位置</dt><dd>{{ selected.location || '—' }}</dd></div><div><dt>设备分类</dt><dd>{{ selected.category || '—' }}</dd></div><div><dt>设备负责人</dt><dd>{{ selected.managerUserId ? `用户 #${selected.managerUserId}` : '未指定' }}</dd></div><div><dt>累计运行小时</dt><dd>{{ selected.runtimeHours ?? '—' }}</dd></div><div><dt>投产日期</dt><dd>{{ selected.installedAt || '—' }}</dd></div><div><dt>下次维护</dt><dd>{{ selected.nextMaintenanceAt || '未安排' }}</dd></div><div><dt>健康度</dt><dd>{{ selected.health != null ? `${selected.health}%` : '未提供' }}</dd></div><div><dt>最近更新</dt><dd>{{ formatTime(selected.updatedAt) }}</dd></div></dl></div><CompatibleParts :equipment-id="selected.id" /><div class="drawer-section equipment-history-section"><div class="detail-section-title"><h3>已完成的维修履历</h3><el-button link type="primary" @click="linkedOrders">全部关联工单<ArrowUpRight :size="13" /></el-button></div><ResourceState :loading="history.loading" :error="history.error" :empty="!history.records.length" title="维修履历" description="该设备尚无已完成的维修工单。" @retry="loadHistory(history.current)" /><ol v-if="!history.loading && !history.error" class="timeline"><li v-for="entry in history.records" :key="entry.id"><h4>{{ entry.title }}</h4><small>{{ entry.orderNo }} · 完成于 {{ formatTime(entry.completedAt) }}</small><p>{{ entry.description || '未填写维修说明' }}</p></li></ol><PagePager v-if="history.total > history.size && !history.error" :current="history.current" :size="history.size" :total="history.total" :loading="history.loading" @change="loadHistory" @resize="history.size = $event; loadHistory()" /></div><div class="drawer-actions"><el-button :disabled="busy" @click="qrOpen = true">查看二维码</el-button><el-button v-if="selected.status === 'STOPPED'" type="primary" :disabled="busy" @click="changeStatus('RUNNING')"><Play :size="14" />启动设备</el-button><el-button v-if="selected.status === 'RUNNING'" :disabled="busy" @click="changeStatus('STOPPED')"><Square :size="14" />停止运行</el-button><el-button :disabled="busy" @click="edit(selected)"><Pencil :size="14" />编辑档案</el-button><el-button type="danger" plain :disabled="busy || selected.status === 'RUNNING'" :title="selected.status === 'RUNNING' ? '运行中不能删除' : '删除设备'" @click="remove"><Trash2 :size="14" />删除</el-button></div></template></el-drawer><EquipmentQr v-if="selected" v-model="qrOpen" :equipment="selected" /><el-dialog v-model="editorOpen" :title="editingId === null ? '新增设备档案' : '编辑设备档案'" width="min(720px,94vw)" :show-close="!busy" :close-on-click-modal="!busy" :close-on-press-escape="!busy"><el-form label-position="top" :model="form" :disabled="busy"><div class="form-grid"><el-form-item label="资产编号" required><el-input v-model="form.assetCode" maxlength="64" /></el-form-item><el-form-item label="设备名称" required><el-input v-model="form.name" maxlength="160" /></el-form-item><el-form-item label="设备型号"><el-input v-model="form.model" maxlength="120" /></el-form-item><el-form-item label="设备分类"><el-input v-model="form.category" maxlength="100" /></el-form-item><el-form-item label="现场位置"><el-input v-model="form.location" maxlength="160" /></el-form-item><el-form-item label="运行状态"><el-select v-model="form.status" disabled><el-option v-for="state in states.slice(1)" :key="state.value" :label="state.label" :value="state.value" /></el-select></el-form-item><el-form-item label="健康度（%）"><el-input v-model.number="form.health" type="number" min="0" max="100" placeholder="0–100，可留空" /></el-form-item><el-form-item label="累计运行小时"><el-input v-model.number="form.runtimeHours" type="number" min="0" step="0.01" /></el-form-item><el-form-item label="下次维护日期"><el-input v-model="form.nextMaintenanceAt" type="date" /></el-form-item><el-form-item label="投产日期"><el-input v-model="form.installedAt" type="date" /></el-form-item><el-form-item label="负责人用户 ID"><el-input v-model.number="form.managerUserId" type="number" min="1" placeholder="可留空" /></el-form-item><el-form-item label="设备图片标识"><el-input v-model="form.imageRef" maxlength="500" /></el-form-item></div></el-form><p class="info-note">{{ editingId === null ? '新设备初始为未运行，保存后可从设备档案启动。' : '运行状态请在设备档案中使用启停操作。' }}</p><p v-if="formError" class="inline-error" role="alert">{{ formError }}</p><template #footer><el-button :disabled="busy" @click="editorOpen = false">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存档案</el-button></template></el-dialog></div></template>
