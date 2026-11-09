<script setup lang="ts">
import { ref, onMounted, onScopeDispose } from 'vue'
import { api } from '@/services/api'
import { errorMessage } from '@/services/backend-contract'
import { useAppStore } from '@/stores/app'
import type { RepairCount, DailyTrend, ProcessingDuration, OverdueSummary } from '@/services/s2-contract'
import PageHead from '@/components/PageHead.vue'
const store = useAppStore(), days = ref(30), busy = ref(false)
const repair = ref<RepairCount[] | null>(null), trend = ref<DailyTrend[] | null>(null), duration = ref<ProcessingDuration[] | null>(null), overdue = ref<OverdueSummary | null>(null)
const errors = ref<Record<string, string>>({})
let sequence = 0
async function load() {
  const ticket = ++sequence, epoch = store.epoch; busy.value = true; errors.value = {}; repair.value = null; trend.value = null; duration.value = null; overdue.value = null
  const tasks = [api.repairCounts({ days: days.value, limit: 10 }), api.dailyTrend({ days: days.value }), api.processingDuration({ days: days.value, limit: 10 }), api.overdueSummary()]
  const results = await Promise.allSettled(tasks)
  if (ticket !== sequence || epoch !== store.epoch) return
  const [a,b,c,d] = results
  if (a?.status === 'fulfilled') repair.value = a.value as RepairCount[]; else if (a?.status === 'rejected') errors.value.repair = errorMessage(a.reason)
  if (b?.status === 'fulfilled') trend.value = b.value as DailyTrend[]; else if (b?.status === 'rejected') errors.value.trend = errorMessage(b.reason)
  if (c?.status === 'fulfilled') duration.value = c.value as ProcessingDuration[]; else if (c?.status === 'rejected') errors.value.duration = errorMessage(c.reason)
  if (d?.status === 'fulfilled') overdue.value = d.value as OverdueSummary; else if (d?.status === 'rejected') errors.value.overdue = errorMessage(d.reason)
  busy.value = false
}
onMounted(load); onScopeDispose(() => sequence++)
</script>
<template><div><PageHead title="维护统计" description="了解工单与设备的维护情况。" eyebrow="OPERATIONS / INSIGHTS"/><section class="panel"><div class="filter-bar">统计最近 <el-input-number v-model="days" :min="1" :max="365" :precision="0"/> 天 <el-button :loading="busy" @click="load">查询</el-button></div></section><section class="panel"><h3>未完成工单逾期汇总</h3><p v-if="errors.overdue" class="inline-error">{{ errors.overdue }}</p><p v-else-if="!overdue">{{ busy ? '加载中…' : '暂无数据' }}</p><template v-else><p>逾期 {{ overdue.overdueCount }} · 待处理 {{ overdue.pendingOverdueCount }} · 维修中 {{ overdue.inProgressOverdueCount }} · 待验收 {{ overdue.awaitingAcceptanceOverdueCount }} · 未设置截止时间 {{ overdue.withoutDeadlineCount }}</p><router-link :to="{path:'/orders',query:{overdueOnly:'true'}}">查看逾期工单</router-link><small>统计时间：{{ overdue.asOf }}</small></template></section><section class="panel"><h3>设备报修次数</h3><p class="muted">按工单创建次数统计，并非同类故障重复次数。</p><p v-if="errors.repair" class="inline-error">{{ errors.repair }}</p><p v-else-if="!repair">{{ busy ? '加载中…' : '暂无数据' }}</p><p v-else-if="!repair.length">暂无数据</p><table v-else class="data-table"><tbody><tr v-for="row in repair" :key="row.equipmentId"><td>{{ row.equipmentName }} · {{ row.assetCode }}</td><td>{{ row.workOrderCount }} 次</td></tr></tbody></table></section><section class="panel"><h3>每日新增与完成</h3><p v-if="errors.trend" class="inline-error">{{ errors.trend }}</p><p v-else-if="!trend">{{ busy ? '加载中…' : '暂无数据' }}</p><p v-else-if="!trend.length">暂无数据</p><table v-else class="data-table"><tbody><tr><th>日期</th><th>新增</th><th>完成</th></tr><tr v-for="row in trend" :key="row.date"><td>{{ row.date }}</td><td>{{ row.createdCount }}</td><td>{{ row.completedCount }}</td></tr></tbody></table></section><section class="panel"><h3>平均总处理时长</h3><p class="muted">从创建到验收完成，包含等待时间，不代表实际维修工时。</p><p v-if="errors.duration" class="inline-error">{{ errors.duration }}</p><p v-else-if="!duration">{{ busy ? '加载中…' : '暂无数据' }}</p><p v-else-if="!duration.length">暂无数据</p><table v-else class="data-table"><tbody><tr><th>设备</th><th>平均秒数</th><th>样本数</th></tr><tr v-for="row in duration" :key="row.equipmentId"><td>{{ row.equipmentName }} · {{ row.assetCode }}</td><td>{{ row.avgProcessingSeconds }}</td><td>{{ row.completedOrderCount }}</td></tr></tbody></table></section></div></template>
