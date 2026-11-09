<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Search, RotateCcw } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { usePage } from '@/composables/usePage'
import { errorMessage, formatTime, orderStatusLabel, priorityLabel } from '@/services/backend-contract'
import type { OrderPriority, OrderCreate } from '@/domain'
import PageHead from '@/components/PageHead.vue'
import ResourceState from '@/components/ResourceState.vue'
import StatusPill from '@/components/StatusPill.vue'
import PagePager from '@/components/PagePager.vue'
import RecordPicker from '@/components/RecordPicker.vue'
import OrderDetail from '@/components/OrderDetail.vue'
const store = useAppStore()
const route = useRoute()
const resource = usePage(api.workOrders, () => store.epoch)
const { records, page, loading, error } = resource
const filters = reactive({ overdueOnly: route.query.overdueOnly === 'true', keyword: '', status: Object.prototype.hasOwnProperty.call(orderStatusLabel, String(route.query.status)) ? String(route.query.status) : '', priority: '', equipmentId: route.query.equipmentId ? Number(route.query.equipmentId) : null as number | null })
const selected = ref<number | null>(null)
const createOpen = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({ title: '', equipmentId: null as number | null, description: '', priority: 'NORMAL' as OrderPriority, dueAt: '' })
function load(current = 1) { return resource.load({ ...filters, current }) }
function reset() { Object.assign(filters, { overdueOnly: false, keyword: '', status: '', priority: '', equipmentId: null }); void load() }
function openCreate() { formError.value = ''; Object.assign(form, { title: '', equipmentId: null, description: '', priority: 'NORMAL', dueAt: '' }); createOpen.value = true }
async function create() {
  if (saving.value) return
  formError.value = ''
  if (!form.title.trim() || !form.equipmentId || !form.description.trim()) { formError.value = '请填写工单标题、关联设备和故障说明'; return }
  const body: OrderCreate = { title: form.title.trim(), equipmentId: form.equipmentId, description: form.description.trim(), priority: form.priority, dueAt: form.dueAt || null }
  saving.value = true
  try {
    const saved = await store.mutate(() => api.createWorkOrder(body))
    createOpen.value = false; ElMessage.success('报修工单已创建'); await load(); selected.value = saved.id
  } catch (reason) { formError.value = errorMessage(reason) } finally { saving.value = false }
}
onMounted(() => {
  void load()
  const id = Number(route.query.detail)
  if (Number.isSafeInteger(id) && id > 0) selected.value = id
  if (route.query.create === '1') openCreate()
})
</script>
<template><div><PageHead title="维修工单" description="从报修、派单到维修验收，每一步都有记录。" eyebrow="MAINTENANCE / WORK ORDERS"><el-button type="primary" @click="openCreate"><Plus :size="16" />报修建单</el-button></PageHead><section class="panel"><div class="tabs-bar"><button class="tab-button" :class="{ active: !filters.status }" @click="filters.status = ''; load()">全部工单</button><button v-for="(label, value) in orderStatusLabel" :key="value" class="tab-button" :class="{ active: filters.status === value }" @click="filters.status = value; load()">{{ label }}</button></div><form class="filter-bar" @submit.prevent="load()"><el-checkbox v-model="filters.overdueOnly">仅逾期</el-checkbox><el-input v-model="filters.keyword" placeholder="搜索工单编号或标题" clearable :prefix-icon="Search" maxlength="200" aria-label="搜索工单编号或标题" /><el-select v-model="filters.priority" clearable placeholder="全部优先级" aria-label="工单优先级"><el-option v-for="(label, value) in priorityLabel" :key="value" :label="label" :value="value" /></el-select><el-input-number v-model="filters.equipmentId" :min="1" :precision="0" :controls="false" placeholder="设备 ID" aria-label="按设备 ID 筛选" /><el-button native-type="submit" :loading="loading">查询</el-button><el-button text @click="reset"><RotateCcw :size="14" />重置</el-button><span class="filter-spacer"></span><span class="filter-count">按最近创建排序</span></form><div v-if="filters.status === 'PENDING'" class="selection-banner">待处理包含“待派单”和“已派单待开工”；可通过负责人一列区分。</div><ResourceState :loading="loading" :error="error" :empty="!records.length" title="维修工单" description="当前筛选下暂无工单，可调整条件或提交新的报修。" @retry="load(page.current)" /><div v-if="!loading && !error && records.length" class="table-wrap"><table class="data-table"><thead><tr><th>工单编号 / 标题</th><th>关联设备</th><th>优先级</th><th>状态</th><th>负责人</th><th>计划完成</th><th>操作</th></tr></thead><tbody><tr v-for="order in records" :key="order.id"><td><button class="row-link" @click="selected = order.id"><span class="row-primary">{{ order.title }}</span><span class="order-number">{{ order.orderNo }}</span></button></td><td><span class="mono">设备 #{{ order.equipmentId }}</span></td><td><StatusPill :value="order.priority" /></td><td><StatusPill :value="order.status" /></td><td><span :class="{ muted: order.assigneeUserId == null }">{{ order.assigneeUserId == null ? '待分配' : `用户 #${order.assigneeUserId}` }}</span></td><td class="mono">{{ formatTime(order.dueAt) }}</td><td><el-button link type="primary" @click="selected = order.id">查看详情</el-button></td></tr></tbody></table></div><PagePager v-if="!error" :current="page.current" :size="page.size" :total="page.total" :loading="loading" @change="load" @resize="resource.load({ ...filters, current: 1, size: $event })" /></section><p class="page-footnote">列表显示当前企业的真实工单；设备资料、用料及时间线在详情中按需读取。</p><OrderDetail :id="selected" @close="selected = null" @changed="load(page.current)" /><el-dialog v-model="createOpen" title="报修并创建工单" width="min(620px, 94vw)" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving"><p class="dialog-intro">描述现场问题，提交后由企业管理员安排维修负责人。</p><el-form :model="form" label-position="top" :disabled="saving"><el-form-item label="工单标题" required><el-input v-model="form.title" maxlength="200" show-word-limit placeholder="简要描述设备故障" /></el-form-item><el-form-item label="关联设备" required><RecordPicker v-model="form.equipmentId" kind="equipment" placeholder="搜索设备名称或资产编号" /></el-form-item><div class="form-grid"><el-form-item label="优先级"><el-select v-model="form.priority"><el-option v-for="(label, value) in priorityLabel" :key="value" :label="label" :value="value" /></el-select></el-form-item><el-form-item label="计划完成时间"><el-date-picker v-model="form.dueAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="可选" style="width:100%" /></el-form-item></div><el-form-item label="故障说明" required><el-input v-model="form.description" type="textarea" :rows="4" maxlength="5000" show-word-limit placeholder="描述故障现象、发生位置及影响情况" /></el-form-item></el-form><p v-if="formError" class="inline-error" role="alert">{{ formError }}</p><template #footer><el-button :disabled="saving" @click="createOpen = false">取消</el-button><el-button type="primary" :loading="saving" @click="create">提交报修</el-button></template></el-dialog></div></template>
