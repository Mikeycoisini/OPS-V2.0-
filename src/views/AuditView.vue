<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ElTag, ElDescriptions, ElDescriptionsItem } from 'element-plus'
import { useAppStore } from '@/stores/app'
import { api } from '@/services/api'
import { auditActionLabels, auditOutcomeLabels, auditObjectLabels, auditChangeLabel, auditChangeValue, type AuditId } from '@/services/audit-contract'
import { formatTime } from '@/services/backend-contract'
import { usePage } from '@/composables/usePage'
import { useAuditDetail } from '@/composables/useAuditDetail'
import PageHead from '@/components/PageHead.vue'
import PagePager from '@/components/PagePager.vue'
import ResourceState from '@/components/ResourceState.vue'

const store = useAppStore()
const resource = usePage(api.auditEvents, () => store.epoch)
const { records, page, loading, error } = resource
const detail = useAuditDetail(api.auditEvent, () => store.epoch)
const { visible, record, loading: detailLoading, error: detailError } = detail
const selectedId = ref<AuditId | null>(null)
const filters = reactive({ action: '', actorUserId: '', objectType: '', objectId: '', outcome: '', occurredFrom: '', occurredTo: '' })

/** 执行流程：1.检查管理员入口；2.发送当前筛选；3.由usePage处理分页和旧响应。 */
function load(current = 1) {
  if (!store.isAdmin) return // 普通成员不触发审计查询。
  return resource.load({ ...filters, current }) // 时间按控件输出的本地ISO格式发送。
}
/** 执行流程：1.清空全部筛选；2.回到第一页读取真实记录。 */
function reset() {
  Object.assign(filters, { action: '', actorUserId: '', objectType: '', objectId: '', outcome: '', occurredFrom: '', occurredTo: '' }) // 避免残留隐藏条件。
  return load() // 默认读取第一页。
}
/** 执行流程：1.记住事件ID供失败重试；2.按当前企业读取详情。 */
function show(id: AuditId) {
  if (!store.isAdmin) return // 入口复用管理员权限。
  selectedId.value = id // 重试保持同一事件。
  return detail.show(id) // 弹窗不复用列表快照。
}
watch(() => store.epoch, () => {
  resource.clear(); detail.close(); selectedId.value = null // 企业切换立即移除旧列表和弹窗。
}, { flush: 'sync' })
onMounted(() => { void load() }) // 路由挂载后读取当前企业。
</script>

<template>
  <div>
    <PageHead title="操作审计" description="查看当前企业的成员、厂区、团队及工单交接记录。" eyebrow="ORGANIZATION / AUDIT" />
    <section v-if="store.isAdmin" class="panel">
      <div class="panel-heading"><h2>企业操作记录<small>{{ store.user?.activeTenant?.name }}</small></h2><span class="muted">只读记录</span></div>
      <form class="filter-bar audit-filters" @submit.prevent="load()">
        <el-select v-model="filters.action" clearable placeholder="全部动作" aria-label="审计动作"><el-option v-for="(label, value) in auditActionLabels" :key="value" :label="label" :value="value" /></el-select>
        <el-input v-model="filters.actorUserId" clearable placeholder="操作者用户 ID" aria-label="操作者用户 ID" inputmode="numeric" />
        <el-select v-model="filters.objectType" clearable placeholder="全部对象类型" aria-label="审计对象类型"><el-option v-for="(label, value) in auditObjectLabels" :key="value" :label="label" :value="value" /></el-select>
        <el-input v-model="filters.objectId" clearable placeholder="对象 ID（所选资源 ID）" aria-label="审计对象 ID" inputmode="numeric" />
        <el-select v-model="filters.outcome" clearable placeholder="全部结果" aria-label="审计结果"><el-option v-for="(label, value) in auditOutcomeLabels" :key="value" :label="label" :value="value" /></el-select>
        <el-date-picker v-model="filters.occurredFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="发生时间起" aria-label="发生时间下限" />
        <el-date-picker v-model="filters.occurredTo" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="发生时间止" aria-label="发生时间上限" />
        <div class="audit-filter-actions"><el-button native-type="submit" :loading="loading">查询</el-button><el-button text @click="reset">重置</el-button></div>
      </form>
      <ResourceState :loading="loading" :error="error" :empty="!records.length" title="操作审计记录" description="当前筛选条件下没有审计记录，可调整筛选条件后重试。" @retry="load(page.current)" />
      <div v-if="!loading && !error && records.length" class="table-wrap">
        <table class="data-table audit-table">
          <thead><tr><th>发生时间</th><th>动作</th><th>操作者</th><th>对象</th><th>结果</th><th>变更摘要</th><th>详情</th></tr></thead>
          <tbody><tr v-for="event in records" :key="event.id">
            <td class="mono">{{ formatTime(event.occurredAt) }}</td>
            <td>{{ auditActionLabels[event.action] || event.action }}</td>
            <td><span class="row-primary">{{ event.actorName || (event.actorType === 'SYSTEM' ? '系统' : '未知操作者') }}</span><span class="row-secondary">{{ event.actorUserId == null ? '—' : `用户 #${event.actorUserId}` }}</span></td>
            <td>{{ auditObjectLabels[event.objectType] || event.objectType }} #{{ event.objectId ?? '—' }}</td>
            <td><el-tag :type="event.outcome === 'SUCCESS' ? 'success' : event.outcome === 'DENIED' ? 'warning' : 'danger'" size="small">{{ auditOutcomeLabels[event.outcome] || event.outcome }}</el-tag></td>
            <td class="audit-summary">{{ event.summary || '—' }}</td>
            <td><el-button link type="primary" @click="show(event.id)">查看</el-button></td>
          </tr></tbody>
        </table>
      </div>
      <PagePager v-if="!error" :current="page.current" :size="page.size" :total="page.total" :loading="loading" @change="load" @resize="resource.params.size = $event; load()" />
    </section>
    <p v-else class="info-note">仅企业管理员可查看操作审计。</p>
    <p class="page-footnote">对象 ID 为所选资源的成员关系、厂区、团队或工单 ID。操作者姓名为当前企业显示名；时间筛选包含起止时刻。</p>
    <el-dialog v-model="visible" title="审计事件详情" width="min(760px,94vw)" destroy-on-close>
      <ResourceState :loading="detailLoading" :error="detailError" :empty="!record" title="审计事件详情" @retry="selectedId !== null && show(selectedId)" />
      <template v-if="!detailLoading && !detailError && record">
        <el-descriptions :column="2" border class="audit-detail">
          <el-descriptions-item label="事件 ID">{{ record.id }}</el-descriptions-item>
          <el-descriptions-item label="发生时间">{{ record.occurredAt?.replace('T', ' ') || '—' }}</el-descriptions-item>
          <el-descriptions-item label="动作">{{ auditActionLabels[record.action] || record.action }}</el-descriptions-item>
          <el-descriptions-item label="结果">{{ auditOutcomeLabels[record.outcome] || record.outcome }}</el-descriptions-item>
          <el-descriptions-item label="操作者">{{ record.actorName || '—' }} / {{ record.actorUserId ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="操作者类型">{{ record.actorType }}</el-descriptions-item>
          <el-descriptions-item label="对象">{{ auditObjectLabels[record.objectType] || record.objectType }} #{{ record.objectId ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="请求编号">{{ record.requestId || '—' }}</el-descriptions-item>
        </el-descriptions>
        <h3 class="audit-change-title">变更详情</h3>
        <dl v-if="record.changes && Object.keys(record.changes).length" class="audit-changes"><template v-for="(_, key) in record.changes" :key="key"><dt>{{ auditChangeLabel(String(key), record.changes, record.action) }}</dt><dd>{{ auditChangeValue(String(key), record.changes, record.action) }}</dd></template></dl>
        <p v-else class="info-note">暂无可展示的变更详情。</p>
      </template>
      <template #footer><el-button @click="detail.close()">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.audit-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.audit-filters :deep(.el-select), .audit-filters :deep(.el-input), .audit-filters :deep(.el-date-editor) { width: 100%; min-width: 0; }
.audit-filter-actions { display: flex; align-items: center; }
.audit-table { min-width: 880px; }
.audit-summary { min-width: 170px; max-width: 340px; white-space: normal; overflow-wrap: anywhere; }
.audit-detail { overflow-wrap: anywhere; }
.audit-change-title { margin: 22px 0 12px; font-size: 15px; }
.audit-changes { display: grid; grid-template-columns: minmax(100px, 150px) minmax(0, 1fr); border: 1px solid #e6eaf0; border-radius: 6px; overflow: hidden; }
.audit-changes dt, .audit-changes dd { margin: 0; padding: 12px; border-bottom: 1px solid #e6eaf0; overflow-wrap: anywhere; white-space: pre-wrap; }
.audit-changes dt { background: #f7f9fc; color: #64748b; }
</style>
