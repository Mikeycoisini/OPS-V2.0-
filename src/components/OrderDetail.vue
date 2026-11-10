<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { allowedOrderActions, errorMessage, formatTime, orderStatusLabel, type OrderAction } from '@/services/backend-contract'
import type { Order, OrderLog, OrderPart } from '@/domain'
import ResourceState from './ResourceState.vue'
import StatusPill from './StatusPill.vue'
import RecordPicker from './RecordPicker.vue'
import StockMutationDialog from './StockMutationDialog.vue'
const props = defineProps<{ id: number | null }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const store = useAppStore()
const order = ref<Order | null>(null)
const logs = ref<OrderLog[]>([])
const parts = ref<OrderPart[]>([])
const tab = ref('overview')
const loading = ref(false)
const error = ref('')
const childLoading = ref(false)
const childError = ref('')
const busy = ref(false)
const action = ref<OrderAction | null>(null)
const actionOpen = ref(false)
const assignee = ref<number | string | null>(null)
const detail = ref('')
const actionError = ref('')
const stockOpen = ref(false)
const actions = computed(() => order.value ? allowedOrderActions(order.value, store.user) : null)
const actionTitles: Record<OrderAction, string> = { dispatch: '派发维修工单', start: '开始维修', 'repair-notes': '补充维修记录', submit: '提交验收', approve: '通过验收', reject: '退回维修' }
let sequence = 0
let childSequence = 0
async function load() {
  if (!props.id) return
  const ticket = ++sequence
  const scope = store.epoch
  loading.value = true; error.value = ''
  try { const result = await api.order(props.id); if (ticket === sequence && scope === store.epoch) order.value = result }
  catch (reason) { if (ticket === sequence && scope === store.epoch) error.value = errorMessage(reason) }
  finally { if (ticket === sequence && scope === store.epoch) loading.value = false }
}
async function loadTab() {
  const id = props.id
  const currentTab = tab.value
  if (!id || currentTab === 'overview') return
  const ticket = ++childSequence
  const scope = store.epoch
  childLoading.value = true; childError.value = ''
  try {
    const result = currentTab === 'timeline' ? await api.orderLogs(id) : await api.orderParts(id)
    if (ticket !== childSequence || scope !== store.epoch || props.id !== id) return
    if (currentTab === 'timeline') logs.value = result as OrderLog[]
    else parts.value = result as OrderPart[]
  } catch (reason) { if (ticket === childSequence && scope === store.epoch) childError.value = errorMessage(reason) }
  finally { if (ticket === childSequence && scope === store.epoch) childLoading.value = false }
}
function openAction(value: OrderAction) { action.value = value; assignee.value = order.value?.assigneeUserId || null; detail.value = ''; actionError.value = ''; actionOpen.value = true }
async function execute() {
  if (!props.id || !action.value || busy.value) return
  actionError.value = ''
  if (action.value === 'dispatch' && !assignee.value) { actionError.value = '请选择启用的企业成员'; return }
  if (['repair-notes', 'reject'].includes(action.value) && !detail.value.trim()) { actionError.value = action.value === 'reject' ? '请填写退回原因' : '请填写维修记录'; return }
  const body = action.value === 'dispatch' ? { assigneeUserId: assignee.value } : action.value === 'repair-notes' ? { detail: detail.value.trim() } : action.value === 'reject' ? { reason: detail.value.trim() } : undefined
  busy.value = true
  try {
    await store.mutate(() => api.orderAction(props.id!, action.value!, body))
    actionOpen.value = false; ElMessage.success('工单操作已完成'); emit('changed'); await load(); await loadTab()
  } catch (reason) { actionError.value = errorMessage(reason) } finally { busy.value = false }
}
async function confirm(value: OrderAction) {
  try { await ElMessageBox.confirm(value === 'approve' ? '确认维修结果符合要求并通过验收？' : value === 'submit' ? '确认维修记录已补充完整，提交工单验收？' : '确认由你开始处理这张工单？', actionTitles[value], { confirmButtonText: '确认', cancelButtonText: '取消', type: 'info' }); openAction(value); await execute() }
  catch (reason) { if (reason !== 'cancel' && reason !== 'close') ElMessage.error(errorMessage(reason)) }
}
function closed() { if (!busy.value) emit('close') }
async function stockSaved() { emit('changed'); await load(); if (tab.value === 'parts') await loadTab() }
watch(() => props.id, () => { sequence++; childSequence++; order.value = null; logs.value = []; parts.value = []; error.value = ''; tab.value = 'overview'; actionOpen.value = false; stockOpen.value = false; if (props.id) void load() }, { immediate: true })
watch(tab, () => { childSequence++; childError.value = ''; void loadTab() })
onScopeDispose(() => { sequence++; childSequence++ })
</script>
<template><el-drawer :model-value="id !== null" title="维修工单详情" size="min(700px, 100vw)" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @close="closed"><ResourceState :loading="loading" :error="error" :empty="false" title="工单详情" @retry="load" /><template v-if="order && !loading && !error"><div class="drawer-section"><span class="drawer-subtitle">{{ order.orderNo }}</span><h2 class="drawer-title">{{ order.title }}</h2><div class="detail-badges"><StatusPill :value="order.status" /><StatusPill :value="order.priority" /><span class="muted mono">创建于 {{ formatTime(order.createdAt) }}</span></div><div class="order-stage"><template v-for="(label, state, index) in orderStatusLabel" :key="state"><span :class="{ current: state === order.status }"><b>{{ index + 1 }}</b>{{ label }}</span><span v-if="index < 3">—</span></template></div></div><div class="tabs-bar"><button v-for="item in [{ key: 'overview', title: '工单概览' }, { key: 'parts', title: '工单用料' }, { key: 'timeline', title: '处理时间线' }]" :key="item.key" class="tab-button" :class="{ active: tab === item.key }" @click="tab = item.key">{{ item.title }}</button></div><div v-if="tab === 'overview'" class="drawer-section"><dl class="details-grid"><div><dt>关联设备</dt><dd>{{ order.equipment?.name || `设备 #${order.equipmentId}` }}<span v-if="order.equipment?.assetCode" class="muted"> · {{ order.equipment.assetCode }}</span></dd></div><div><dt>维修负责人</dt><dd>{{ order.assigneeUserId ? `用户 #${order.assigneeUserId}` : '尚未派单' }}</dd></div><div><dt>报修人</dt><dd>{{ order.createdBy ? `用户 #${order.createdBy}` : '—' }}</dd></div><div><dt>计划完成时间</dt><dd>{{ formatTime(order.dueAt) }}</dd></div><div><dt>实际完成时间</dt><dd>{{ formatTime(order.completedAt) }}</dd></div><div><dt>最近更新</dt><dd>{{ formatTime(order.updatedAt) }}</dd></div><div class="full"><dt>故障描述</dt><dd class="text-content">{{ order.description || '未填写故障描述' }}</dd></div></dl><p v-if="order.status === 'PENDING'" class="info-note detail-note">{{ order.assigneeUserId ? '已派单，等待负责人开始维修。' : '等待企业管理员指定维修负责人。' }}</p><p v-if="order.status === 'AWAITING_ACCEPTANCE'" class="info-note detail-note">由报修人或具有验收角色的成员验收，当前维修负责人不能验收自己的工单。</p></div><div v-else class="drawer-section"><ResourceState :loading="childLoading" :error="childError" :empty="tab === 'timeline' ? !logs.length : !parts.length" :title="tab === 'timeline' ? '处理记录' : '工单用料'" @retry="loadTab" /><ol v-if="tab === 'timeline' && !childLoading && !childError" class="timeline"><li v-for="log in logs" :key="log.id"><h4>{{ log.title || log.eventType }}</h4><small>{{ formatTime(log.createdAt) }} · 用户 #{{ log.actorUserId }}</small><p>{{ log.detail }}</p><span v-if="log.toStatus" class="muted mono">{{ log.fromStatus ? orderStatusLabel[log.fromStatus] + ' → ' : '' }}{{ orderStatusLabel[log.toStatus] }}</span></li></ol><div v-if="tab === 'parts' && parts.length && !childLoading && !childError" class="table-wrap"><table class="data-table"><thead><tr><th>备件</th><th>已领</th><th>已退</th><th>净用量</th></tr></thead><tbody><tr v-for="part in parts" :key="part.id"><td><strong class="row-primary">{{ part.partName }}</strong><span class="row-secondary">{{ part.partCode }}</span></td><td>{{ part.issuedQuantity }} {{ part.unit }}</td><td>{{ part.returnedQuantity }} {{ part.unit }}</td><td>{{ Number((Number(part.issuedQuantity) - Number(part.returnedQuantity)).toFixed(3)) }} {{ part.unit }}</td></tr></tbody></table></div><p v-if="tab === 'parts'" class="page-footnote">退回备件请到“备件库存 → 出入库流水”，选择原领料流水操作。</p></div><div v-if="actions" class="drawer-actions"><el-button v-if="actions.dispatch" type="primary" :disabled="busy" @click="openAction('dispatch')">{{ order.assigneeUserId ? '重新派单' : '派发工单' }}</el-button><el-button v-if="actions.start" type="primary" :disabled="busy" @click="confirm('start')">开始维修</el-button><el-button v-if="actions.note" :disabled="busy" @click="openAction('repair-notes')">补充维修记录</el-button><el-button v-if="actions.issue" :disabled="busy" @click="stockOpen = true">工单领料</el-button><el-button v-if="actions.submit" type="primary" :disabled="busy" @click="confirm('submit')">提交验收</el-button><el-button v-if="actions.reject" :disabled="busy" @click="openAction('reject')">退回维修</el-button><el-button v-if="actions.approve" type="primary" :disabled="busy" @click="confirm('approve')">通过验收</el-button><span v-if="!Object.values(actions).some(Boolean)" class="muted mono">当前状态下，你可以查看工单记录。</span></div></template></el-drawer><el-dialog v-model="actionOpen" :title="action ? actionTitles[action] : '工单操作'" width="min(510px,94vw)" append-to-body :show-close="!busy" :close-on-click-modal="!busy" :close-on-press-escape="!busy"><el-form label-position="top" :disabled="busy"><el-form-item v-if="action === 'dispatch'" label="维修负责人" required><RecordPicker v-model="assignee" kind="member" placeholder="搜索当前企业启用的成员" /></el-form-item><el-form-item v-else-if="action === 'repair-notes' || action === 'reject'" :label="action === 'reject' ? '退回原因' : '维修记录'" required><el-input v-model="detail" type="textarea" :rows="5" maxlength="5000" show-word-limit /></el-form-item><p v-else class="dialog-intro">正在更新工单，请等待处理结果。</p></el-form><p v-if="actionError" class="inline-error" role="alert">{{ actionError }}</p><template #footer><el-button :disabled="busy" @click="actionOpen = false">取消</el-button><el-button type="primary" :loading="busy" @click="execute">确认提交</el-button></template></el-dialog><StockMutationDialog v-if="order" v-model="stockOpen" mode="issue" :order="order" @saved="stockSaved" /></template>
