<script setup lang="ts">
import { onMounted, onScopeDispose, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, ClipboardList, ClipboardCheck, Clock3, Layers3, Plus, Wrench } from 'lucide-vue-next'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { usePage } from '@/composables/usePage'
import { errorMessage, formatTime } from '@/services/backend-contract'
import type { WorkspaceSummary } from '@/domain'
import PageHead from '@/components/PageHead.vue'
import ResourceState from '@/components/ResourceState.vue'
import StatusPill from '@/components/StatusPill.vue'
const store = useAppStore()
const router = useRouter()
const summary = ref<WorkspaceSummary | null>(null)
const loading = ref(false)
const error = ref('')
const orders = usePage(api.workOrders, () => store.epoch)
const { records, loading: ordersLoading, error: ordersError } = orders
let sequence = 0
const metrics = [
  { key: 'pendingDispatchCount', title: '待派单', icon: ClipboardList, status: 'PENDING', note: '尚未指定维修负责人' },
  { key: 'pendingStartCount', title: '待开工', icon: Clock3, status: 'PENDING', note: '已有负责人，等待开始维修' },
  { key: 'inProgressCount', title: '维修中', icon: Wrench, status: 'IN_PROGRESS', note: '现场正在处理的维修任务' },
  { key: 'awaitingAcceptanceCount', title: '待验收', icon: ClipboardCheck, status: 'AWAITING_ACCEPTANCE', note: '维修完成，等待确认结果' },
] as const
async function loadSummary() {
  const ticket = ++sequence
  const scope = store.epoch
  loading.value = true; error.value = ''
  try { const result = await api.summary(); if (ticket === sequence && scope === store.epoch) summary.value = result }
  catch (reason) { if (ticket === sequence && scope === store.epoch) error.value = errorMessage(reason) }
  finally { if (ticket === sequence && scope === store.epoch) loading.value = false }
}
function goOrders(status?: string) { void router.push({ path: '/orders', query: status ? { status } : {} }) }
onMounted(() => { void loadSummary(); void orders.load({ current: 1, size: 5 }) })
onScopeDispose(() => sequence++)
</script>
<template><div><PageHead title="工作台" description="从当前企业的待办开始，让每一次维修有序推进。" eyebrow="WORKSPACE / OVERVIEW"><span class="muted mono">{{ new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) }}</span></PageHead><section class="welcome-panel"><div><span class="page-eyebrow">YOUR MAINTENANCE WORKSPACE</span><h2>{{ store.user?.name || store.user?.account || '你好' }}，今天也让维护有条不紊。</h2><p>在这里关注待办、跟进现场处理，让设备与团队保持同一步调。</p><div class="welcome-actions"><el-button type="primary" @click="router.push('/orders?create=1')"><Plus :size="15" />报修建单</el-button><el-button link type="primary" @click="goOrders()">查看全部工单<ArrowRight :size="14" /></el-button></div></div><Layers3 class="welcome-icon" :size="79" :stroke-width="1" /></section><ResourceState v-if="loading || error" :loading="loading" :error="error" :empty="false" title="运维汇总" @retry="loadSummary" /><div v-else-if="summary" class="stat-grid"><button v-for="metric in metrics" :key="metric.key" class="stat-card" @click="goOrders(metric.status)"><div class="stat-top">{{ metric.title }}<span><component :is="metric.icon" :size="15" /></span></div><div class="stat-value">{{ summary[metric.key] }}</div><div class="stat-note">{{ metric.note }}</div></button></div><div v-if="summary" class="workspace-summary-note"><span>本企业工单总数 <b>{{ summary.totalOrderCount }}</b> · 已完成 <b>{{ summary.completedCount }}</b></span><span v-if="summary.lowStockAvailable">低库存记录 {{ summary.lowStockCount ?? '—' }}</span><span v-else>低库存汇总暂不可用 <span :title="summary.lowStockUnavailableReason || ''">ⓘ</span></span></div><div class="workspace-grid"><section class="panel"><div class="panel-heading"><h2>最新维修工单<small>RECENT WORK ORDERS</small></h2><el-button link type="primary" @click="goOrders()">查看全部<ArrowRight :size="13" /></el-button></div><ResourceState :loading="ordersLoading" :error="ordersError" :empty="!records.length" title="维修工单" description="发现设备问题时，可以从“报修建单”发起一次维修协作。" @retry="orders.load()" /><div v-if="!ordersLoading && !ordersError && records.length" class="table-wrap"><table class="data-table"><thead><tr><th>工单</th><th>状态</th><th>创建时间</th><th></th></tr></thead><tbody><tr v-for="order in records" :key="order.id"><td><button class="row-link" @click="router.push(`/orders?detail=${order.id}`)"><span class="row-primary">{{ order.title }}</span><span class="order-number">{{ order.orderNo }}</span></button></td><td><StatusPill :value="order.status" /></td><td class="mono">{{ formatTime(order.createdAt) }}</td><td><el-button link type="primary" @click="router.push(`/orders?detail=${order.id}`)">查看</el-button></td></tr></tbody></table></div></section><section class="panel"><div class="panel-heading"><h2>下一步，从这里开始</h2></div><div class="workflow-list"><div class="workflow-item"><span>01</span><div><strong>让问题进入协作流程</strong><small>选择设备、描述故障，建立可追踪的报修工单。</small></div><el-button link type="primary" @click="router.push('/orders?create=1')"><ArrowRight :size="16" /></el-button></div><div class="workflow-item"><span>02</span><div><strong>查看设备的维修上下文</strong><small>统一查看设备资料、运行状态与已完成的维修履历。</small></div><el-button link type="primary" @click="router.push('/equipment')"><ArrowRight :size="16" /></el-button></div><div class="workflow-item"><span>03</span><div><strong>把每一笔用料记录清楚</strong><small>按仓库查余额，按原领料流水退回剩余备件。</small></div><el-button link type="primary" @click="router.push('/inventory')"><ArrowRight :size="16" /></el-button></div></div></section></div><p class="page-footnote">待派单、待开工统计均来自企业汇总；点击后进入“待处理”列表，在列表中查看负责人分配情况。</p></div></template>
