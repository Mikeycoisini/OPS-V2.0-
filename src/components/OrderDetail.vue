<script setup lang="ts">
import { faultCategoryLabels } from '@/services/fault-categories'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/services/api'
import { useReassign } from '@/composables/useReassign'
import { useAppStore } from '@/stores/app'
import { allowedOrderActions, errorMessage, formatTime, orderStatusLabel, type OrderAction } from '@/services/backend-contract'
import type { Order, OrderLog, OrderPart } from '@/domain'
import ResourceState from './ResourceState.vue'
import StatusPill from './StatusPill.vue'
import RecordPicker from './RecordPicker.vue'
import StockMutationDialog from './StockMutationDialog.vue'
const props = defineProps<{ id: number | string | null }>()
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
const reassign = useReassign(api, () => store.epoch, store.mutate) // 每次交接回查真实工单版本与团队。
const { visible: reassignOpen, loading: reassignLoading, saving: reassignSaving, error: reassignError, conflict: reassignConflict, frozen: reassignFrozen, record: reassignRecord, teams: reassignTeams, form: reassignForm } = reassign // 模板使用顶层ref。
const locked = computed(() => busy.value || reassignSaving.value || reassignFrozen.value) // 交接处理中禁止关闭或发起另一动作。
/** 执行流程：1.限制管理员及可交接状态；2.回查最新版本；3.打开受控改派。 */
function openReassign() {
  if (!store.isAdmin || !props.id || !order.value || !['PENDING', 'IN_PROGRESS'].includes(order.value.status) || locked.value) return // 保留后端状态边界。
  void reassign.show(props.id) // 目标资格由后端再次核验。
}
/** 执行流程：1.检查管理员入口；2.提交固定版本与请求号；3.成功后回查业务历史和列表。 */
async function saveReassign() {
  if (!store.isAdmin) return // 普通成员不触发写入。
  if (await reassign.save()) { ElMessage.success('工单责任交接已完成'); emit('changed'); await load(); await loadTab() } // 不重写旧用料和历史。
}
watch(reassignRecord, value => { if (value && String(value.id) === String(props.id)) order.value = value }) // 已受企业代次保护的回查结果同步更新当前详情。
watch(reassign.denied, value => { if (value) { order.value = null; logs.value = []; parts.value = []; actionOpen.value = false; stockOpen.value = false; error.value = reassignError.value } }) // 撤权后不在抽屉保留缓存正文。
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
function closed() { if (!locked.value) emit('close') }
async function stockSaved() { emit('changed'); await load(); if (tab.value === 'parts') await loadTab() }
watch(() => props.id, () => { reassign.close(true); sequence++; childSequence++; order.value = null; logs.value = []; parts.value = []; error.value = ''; tab.value = 'overview'; actionOpen.value = false; stockOpen.value = false; if (props.id) void load() }, { immediate: true })
watch(tab, () => { childSequence++; childError.value = ''; void loadTab() })
onScopeDispose(() => { sequence++; childSequence++ })
</script>
<template><el-drawer :model-value="id !== null" title="维修工单详情" size="min(700px, 100vw)" :close-on-click-modal="!locked" :close-on-press-escape="!locked" :show-close="!locked" @close="closed"><ResourceState :loading="loading" :error="error" :empty="false" title="工单详情" @retry="load" /><template v-if="order && !loading && !error"><div class="drawer-section"><span class="drawer-subtitle">{{ order.orderNo }}</span><h2 class="drawer-title">{{ order.title }}</h2><div class="detail-badges"><StatusPill :value="order.status" /><StatusPill :value="order.priority" /><span v-if="order.faultCategory" class="muted">{{ faultCategoryLabels[order.faultCategory] }}</span><span class="muted mono">创建于 {{ formatTime(order.createdAt) }}</span></div><div class="order-stage"><template v-for="(label, state, index) in orderStatusLabel" :key="state"><span :class="{ current: state === order.status }"><b>{{ index + 1 }}</b>{{ label }}</span><span v-if="index < 3">—</span></template></div></div><div class="tabs-bar"><button v-for="item in [{ key: 'overview', title: '工单概览' }, { key: 'parts', title: '工单用料' }, { key: 'timeline', title: '处理时间线' }]" :key="item.key" class="tab-button" :class="{ active: tab === item.key }" @click="tab = item.key">{{ item.title }}</button></div><div v-if="tab === 'overview'" class="drawer-section"><dl class="details-grid"><div><dt>关联设备</dt><dd>{{ order.equipment?.name || `设备 #${order.equipmentId}` }}<span v-if="order.equipment?.assetCode" class="muted"> · {{ order.equipment.assetCode }}</span></dd></div><div><dt>责任团队 / 版本</dt><dd>{{ order.teamId ? `团队 #${order.teamId}` : '个人接单' }} · {{ order.version }}</dd></div><div><dt>维修负责人</dt><dd>{{ order.assigneeUserId ? `用户 #${order.assigneeUserId}` : '尚未派单' }}</dd></div><div><dt>报修人</dt><dd>{{ order.createdBy ? `用户 #${order.createdBy}` : '—' }}</dd></div><div><dt>计划完成时间</dt><dd>{{ formatTime(order.dueAt) }}</dd></div><div><dt>实际完成时间</dt><dd>{{ formatTime(order.completedAt) }}</dd></div><div><dt>最近更新</dt><dd>{{ formatTime(order.updatedAt) }}</dd></div><div class="full"><dt>故障描述</dt><dd class="text-content">{{ order.description || '未填写故障描述' }}</dd></div></dl><p v-if="order.status === 'PENDING'" class="info-note detail-note">{{ order.assigneeUserId ? '已派单，等待负责人开始维修。' : '等待企业管理员指定维修负责人。' }}</p><p v-if="order.status === 'AWAITING_ACCEPTANCE'" class="info-note detail-note">由报修人或具有验收角色的成员验收，当前维修负责人不能验收自己的工单。</p></div><div v-else class="drawer-section"><ResourceState :loading="childLoading" :error="childError" :empty="tab === 'timeline' ? !logs.length : !parts.length" :title="tab === 'timeline' ? '处理记录' : '工单用料'" @retry="loadTab" /><ol v-if="tab === 'timeline' && !childLoading && !childError" class="timeline"><li v-for="log in logs" :key="log.id"><h4>{{ log.title || log.eventType }}</h4><small>{{ formatTime(log.createdAt) }} · 用户 #{{ log.actorUserId }}</small><p>{{ log.detail }}</p><span v-if="log.toStatus" class="muted mono">{{ log.fromStatus ? orderStatusLabel[log.fromStatus] + ' → ' : '' }}{{ orderStatusLabel[log.toStatus] }}</span></li></ol><div v-if="tab === 'parts' && parts.length && !childLoading && !childError" class="table-wrap"><table class="data-table"><thead><tr><th>备件</th><th>已领</th><th>已退</th><th>净用量</th></tr></thead><tbody><tr v-for="part in parts" :key="part.id"><td><strong class="row-primary">{{ part.partName }}</strong><span class="row-secondary">{{ part.partCode }}</span></td><td>{{ part.issuedQuantity }} {{ part.unit }}</td><td>{{ part.returnedQuantity }} {{ part.unit }}</td><td>{{ Number((Number(part.issuedQuantity) - Number(part.returnedQuantity)).toFixed(3)) }} {{ part.unit }}</td></tr></tbody></table></div><p v-if="tab === 'parts'" class="page-footnote">退回备件请到“备件库存 → 出入库流水”，选择原领料流水操作。</p></div><div v-if="actions" class="drawer-actions"><el-button v-if="actions.reassign" type="primary" :disabled="locked" @click="openReassign">受控改派</el-button><el-button v-if="actions.dispatch" type="primary" :disabled="locked" @click="openAction('dispatch')">派发工单</el-button><el-button v-if="actions.start" type="primary" :disabled="locked" @click="confirm('start')">开始维修</el-button><el-button v-if="actions.note" :disabled="locked" @click="openAction('repair-notes')">补充维修记录</el-button><el-button v-if="actions.issue" :disabled="locked" @click="stockOpen = true">工单领料</el-button><el-button v-if="actions.submit" type="primary" :disabled="locked" @click="confirm('submit')">提交验收</el-button><el-button v-if="actions.reject" :disabled="locked" @click="openAction('reject')">退回维修</el-button><el-button v-if="actions.approve" type="primary" :disabled="locked" @click="confirm('approve')">通过验收</el-button><span v-if="!Object.values(actions).some(Boolean)" class="muted mono">当前状态下，你可以查看工单记录。</span></div></template></el-drawer><el-dialog v-model="actionOpen" :title="action ? actionTitles[action] : '工单操作'" width="min(510px,94vw)" append-to-body :show-close="!locked" :close-on-click-modal="!locked" :close-on-press-escape="!locked"><el-form label-position="top" :disabled="locked"><el-form-item v-if="action === 'dispatch'" label="维修负责人" required><RecordPicker v-model="assignee" kind="member" placeholder="搜索当前企业启用的成员" /></el-form-item><el-form-item v-else-if="action === 'repair-notes' || action === 'reject'" :label="action === 'reject' ? '退回原因' : '维修记录'" required><el-input v-model="detail" type="textarea" :rows="5" maxlength="5000" show-word-limit /></el-form-item><p v-else class="dialog-intro">正在更新工单，请等待处理结果。</p></el-form><p v-if="actionError" class="inline-error" role="alert">{{ actionError }}</p><template #footer><el-button :disabled="locked" @click="actionOpen = false">取消</el-button><el-button type="primary" :loading="busy" @click="execute">确认提交</el-button></template></el-dialog><StockMutationDialog v-if="order" v-model="stockOpen" mode="issue" :order="order" @saved="stockSaved" />
<el-dialog v-model="reassignOpen" title="工单受控改派" width="min(580px,94vw)" append-to-body :show-close="!reassignSaving && !reassignFrozen" :close-on-click-modal="!reassignSaving && !reassignFrozen" :close-on-press-escape="!reassignSaving && !reassignFrozen" destroy-on-close>
  <ResourceState :loading="reassignLoading" error="" :empty="false" title="改派信息" />
  <p v-if="reassignError" class="inline-error" role="alert">{{ reassignError }}</p>
  <template v-if="reassignRecord && !reassignLoading">
    <p class="dialog-intro">{{ reassignRecord.orderNo }} · 厂区 #{{ reassignRecord.siteId }} · 当前版本 {{ reassignRecord.version }}</p>
    <p class="info-note">仅待处理或维修中工单可以改派。目标负责人必须拥有工单厂区的个人授权；指定团队时，还需同时属于启用团队且该团队负责此厂区。交接保留原用料及处理历史。</p>
    <p v-if="reassignFrozen" class="info-note">写入结果尚未确认，原请求号与参数已锁定。请按原请求重试，或重新加载核对服务器记录后再发起新交接。</p>
    <el-form label-position="top" :disabled="reassignSaving || reassignFrozen || reassignConflict" @submit.prevent="saveReassign">
      <el-form-item label="目标负责人" required><RecordPicker v-model="reassignForm.targetAssigneeUserId" kind="member" placeholder="搜索本企业启用成员，资格由后端实时核验" /></el-form-item>
      <el-form-item label="接单团队"><el-select :model-value="reassignForm.targetTeamId ?? ''" clearable placeholder="个人接单" style="width:100%" @update:model-value="reassignForm.targetTeamId = $event === '' || $event == null ? null : $event"><el-option label="个人接单" value="" /><el-option v-for="team in reassignTeams" :key="team.id" :value="String(team.id)" :label="`${team.name} · ${team.teamCode}`" /><el-option v-if="reassignForm.targetTeamId != null && !reassignTeams.some(team => String(team.id) === String(reassignForm.targetTeamId))" :value="reassignForm.targetTeamId" :label="`原团队 #${reassignForm.targetTeamId}（当前不可用，请重新选择）`" disabled /></el-select></el-form-item>
      <el-form-item label="交接原因" required><el-input v-model="reassignForm.reason" type="textarea" :rows="4" maxlength="1000" show-word-limit placeholder="说明责任交接原因，1—1000个字符" /></el-form-item>
    </el-form>
  </template>
  <template #footer><el-button :disabled="reassignSaving || reassignFrozen" @click="reassign.close()">取消</el-button><el-button :disabled="reassignSaving" :loading="reassignLoading" @click="reassign.reload">{{ reassignFrozen ? '重新加载并核对' : '重新加载' }}</el-button><el-button v-if="store.isAdmin" type="primary" :loading="reassignSaving" :disabled="!reassignRecord || reassignLoading || reassignConflict || !['PENDING', 'IN_PROGRESS'].includes(reassignRecord.status)" @click="saveReassign">{{ reassignFrozen ? '按原请求重试' : '确认交接' }}</el-button></template>
</el-dialog>
</template>
