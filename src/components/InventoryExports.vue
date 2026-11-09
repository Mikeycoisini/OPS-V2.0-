<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, ElTable, ElTableColumn, ElAlert } from 'element-plus'
import { api, ApiError } from '@/services/api'
import { errorMessage, formatTime, type Query } from '@/services/backend-contract'
import { useAppStore } from '@/stores/app'
import { activeExport, cancellableExport, exportStatusLabels, inventoryExportFilters, type InventoryExportTask } from '@/services/inventory-export'
import PagePager from '@/components/PagePager.vue'

const props = defineProps<{ filters: Query }>()
const store = useAppStore()
const open = ref(false), submitting = ref(false), loading = ref(false), error = ref('')
const rows = ref<InventoryExportTask[]>([]), total = ref(0), current = ref(1), size = ref(10), status = ref('')
const cancelling = ref<number | null>(null), downloading = ref<number | null>(null)
let sequence = 0, disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
let downloadController: AbortController | undefined
function stopPoll() { if (timer) clearTimeout(timer); timer = undefined }
async function load(page = current.value) {
  stopPoll()
  if (!open.value || disposed) return
  current.value = page
  const ticket = ++sequence, epoch = store.epoch
  loading.value = true; error.value = ''
  try {
    const result = await api.inventoryExports({ current: page, size: size.value, status: status.value })
    if (ticket !== sequence || epoch !== store.epoch || !open.value || disposed) return
    rows.value = result.records; total.value = result.total
    current.value = result.current; size.value = result.size
    if (rows.value.some(row => activeExport(row.status))) timer = setTimeout(() => { void load() }, 2000)
  } catch (e) {
    if (ticket === sequence && epoch === store.epoch && !disposed) error.value = errorMessage(e)
  } finally {
    if (ticket === sequence && epoch === store.epoch && !disposed) loading.value = false
  }
}
async function submit() {
  if (submitting.value) return
  const epoch = store.epoch
  submitting.value = true; error.value = ''
  try {
    const body = inventoryExportFilters(props.filters)
    const task = await store.mutate(() => api.createInventoryExport(body))
    if (epoch !== store.epoch || disposed) return
    ElMessage.success(`导出任务 #${task.id} 已提交，可在“我的导出”查看结果`)
    status.value = ''; current.value = 1
    if (open.value) await load(1)
    else open.value = true
  } catch (e) {
    if (epoch !== store.epoch || disposed) return
    const id = e instanceof ApiError ? (e.data as { taskId?: number } | undefined)?.taskId : undefined
    error.value = errorMessage(e) + (id ? `（任务 #${id}，请查询任务状态）` : '；请先查看“我的导出”确认结果，避免重复提交。')
    if (!open.value) open.value = true
  } finally { submitting.value = false }
}
async function cancel(row: InventoryExportTask) {
  if (!store.isAdmin || cancelling.value !== null) return
  const epoch = store.epoch
  try {
    await ElMessageBox.confirm(`取消导出任务 #${row.id}？正在执行的任务需要等待后台停止。`, '取消导出', { type: 'warning' })
    if (epoch !== store.epoch || disposed || !open.value) return
    cancelling.value = row.id
    const task = await store.mutate(() => api.cancelInventoryExport(row.id))
    if (epoch !== store.epoch || disposed) return
    ElMessage.success(task.status === 'CANCEL_REQUESTED' ? '取消请求已提交，等待后台停止' : '任务已取消')
    await load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close' && epoch === store.epoch && !disposed) error.value = errorMessage(e)
  } finally { cancelling.value = null }
}
async function download(row: InventoryExportTask) {
  if (downloading.value !== null) return
  const epoch = store.epoch
  const controller = new AbortController(); downloadController = controller
  downloading.value = row.id; error.value = ''
  try {
    const file = await api.downloadInventoryExport(row.id, controller.signal)
    if (epoch !== store.epoch || disposed || !open.value || controller.signal.aborted) return
    const url = URL.createObjectURL(file.blob)
    const link = document.createElement('a'); link.href = url; link.download = file.fileName
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    if (!controller.signal.aborted && epoch === store.epoch && !disposed) error.value = errorMessage(e)
  } finally {
    if (downloadController === controller) { downloading.value = null; downloadController = undefined }
  }
}
watch(open, value => {
  sequence++; stopPoll()
  if (value) { if (!error.value) void load(1) }
  else { downloadController?.abort(); rows.value = []; error.value = ''; loading.value = false }
})
watch(() => store.epoch, () => {
  sequence++; stopPoll(); downloadController?.abort()
  rows.value = []; total.value = 0; open.value = false; error.value = ''; loading.value = false
})
onScopeDispose(() => { disposed = true; sequence++; stopPoll(); downloadController?.abort() })
</script>

<template>
  <div class="export-actions">
    <el-button :loading="submitting" :disabled="store.switching" @click="submit">导出 Excel</el-button>
    <el-button @click="open = true">我的导出</el-button>
  </div>
  <el-drawer v-model="open" title="我的导出" size="min(860px, 96vw)">
    <p class="muted">仅显示本人在当前企业创建的任务。导出当前筛选条件下的全部流水，最多10万条；文件保留24小时。</p>
    <div class="filter-bar">
      <el-select v-model="status" clearable placeholder="全部状态" aria-label="筛选导出状态" style="width: 160px" @change="load(1)">
        <el-option v-for="(label, value) in exportStatusLabels" :key="value" :label="label" :value="value" />
      </el-select>
      <el-button :loading="loading" @click="load()">刷新</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-table :data="rows" empty-text="暂无导出任务，可按当前流水筛选条件创建导出。" style="width: 100%">
      <el-table-column label="任务" min-width="145"><template #default="{ row }">#{{ row.id }}<div class="muted">{{ formatTime(row.createdAt) }}</div></template></el-table-column>
      <el-table-column label="状态" min-width="95"><template #default="{ row }">{{ exportStatusLabels[row.status as keyof typeof exportStatusLabels] || row.status }}</template></el-table-column>
      <el-table-column label="已处理" width="85"><template #default="{ row }">{{ row.processedRows ?? 0 }} 条</template></el-table-column>
      <el-table-column label="结果" min-width="180"><template #default="{ row }">{{ row.errorMessage || row.fileName || '—' }}<div v-if="row.expiresAt" class="muted">到期：{{ formatTime(row.expiresAt) }}</div></template></el-table-column>
      <el-table-column label="操作" width="140"><template #default="{ row }">
        <el-button v-if="row.status === 'SUCCEEDED'" link type="primary" :loading="downloading === row.id" :disabled="downloading !== null" @click="download(row as InventoryExportTask)">下载 Excel</el-button>
        <el-button v-if="store.isAdmin && cancellableExport(row.status)" link type="danger" :loading="cancelling === row.id" :disabled="cancelling !== null" @click="cancel(row as InventoryExportTask)">取消</el-button>
        <span v-if="row.status === 'CANCEL_REQUESTED'" class="muted">等待后台停止</span>
      </template></el-table-column>
    </el-table>
    <PagePager :current="current" :size="size" :total="total" :loading="loading" @change="load" @resize="size = $event; load(1)" />
  </el-drawer>
</template>

<style scoped>
.export-actions { display: inline-flex; gap: 8px; flex-wrap: wrap; }
.filter-bar { margin: 16px 0; }
.muted { font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
</style>
