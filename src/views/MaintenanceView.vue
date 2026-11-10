<script setup lang="ts">
import { ref, reactive, onMounted, onScopeDispose } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/services/api'
import { errorMessage, formatTime } from '@/services/backend-contract'
import { newMaintenanceKey, positiveId } from '@/services/maintenance-intent'
import { useAppStore } from '@/stores/app'
import { usePage } from '@/composables/usePage'
import type { MaintenancePlan, MaintenanceInput, MaintenanceExecution } from '@/services/s2-contract'
import PageHead from '@/components/PageHead.vue'
import ResourceState from '@/components/ResourceState.vue'
import PagePager from '@/components/PagePager.vue'
import RecordPicker from '@/components/RecordPicker.vue'
const store = useAppStore(), resource = usePage(api.maintenancePlans, () => store.epoch)
const { records, page, loading, error } = resource
const filters = reactive({ keyword: '', planType: '', dueOnly: false })
const selected = ref<MaintenancePlan | null>(null), history = usePage((query) => api.maintenanceHistory(selected.value!.id, query), () => store.epoch)
const executionDetail = ref<MaintenanceExecution | null>(null), editor = ref(false), busy = ref(false), formError = ref(''), detailError = ref(''), result = ref('')
const editingId = ref<number | null>(null)
const form = reactive({ name: '', equipmentId: null as number | null, planType: 'MAINTENANCE' as 'MAINTENANCE' | 'INSPECTION', content: '', cycleDays: 30, nextDueDate: '', assigneeUserId: null as number | string | null })
let sequence = 0
const pending = ref<{ key: string; body: { result: string }; planId: number } | null>(null)
const storageKey = () => `equipops:maintenance:${store.user?.userId}:${store.user?.activeTenant?.id}`
function load(current = 1) { return resource.load({ ...filters, current }) }
function edit(row?: MaintenancePlan) { editingId.value = row?.id ?? null; Object.assign(form, row ? { name: row.name, equipmentId: row.equipmentId, planType: row.planType, content: row.content, cycleDays: row.cycleDays, nextDueDate: row.nextDueDate, assigneeUserId: row.assigneeUserId } : { name: '', equipmentId: null, planType: 'MAINTENANCE', content: '', cycleDays: 30, nextDueDate: '', assigneeUserId: null }); formError.value = ''; editor.value = true }
async function save() {
  if (busy.value) return
  if (!form.name.trim() || !form.content.trim() || !form.nextDueDate || !positiveId(form.equipmentId) || !positiveId(form.assigneeUserId) || !Number.isInteger(form.cycleDays) || form.cycleDays < 1 || form.cycleDays > 3650) { formError.value = '请完整填写名称、设备、内容、负责人、日期与 1～3650 天的整数周期。'; return }
  const body: MaintenanceInput = { ...form, name: form.name.trim(), content: form.content.trim(), equipmentId: form.equipmentId, assigneeUserId: form.assigneeUserId }
  busy.value = true; formError.value = ''
  try { await store.mutate(() => editingId.value === null ? api.createMaintenancePlan(body) : api.updateMaintenancePlan(editingId.value, body)); editor.value = false; ElMessage.success('计划已保存'); await load() }
  catch (e) { formError.value = errorMessage(e) } finally { busy.value = false }
}
async function open(row: MaintenancePlan) {
  const ticket = ++sequence, epoch = store.epoch; selected.value = null; detailError.value = ''
  try { const data = await api.maintenancePlan(row.id); if (ticket !== sequence || epoch !== store.epoch) return; selected.value = data; history.clear(); await history.load({ current: 1, size: 10 }) }
  catch (e) { if (ticket === sequence && epoch === store.epoch) detailError.value = errorMessage(e) }
}
async function toggle(row: MaintenancePlan) { if (busy.value) return; busy.value = true; detailError.value = ''; try { await store.mutate(() => api.setMaintenanceEnabled(row.id, !row.enabled)); await load(); if (selected.value?.id === row.id) await open(row) } catch (e) { detailError.value = errorMessage(e) } finally { busy.value = false } }
async function showExecution(id: number) { const ticket = ++sequence, epoch = store.epoch; try { const data = await api.maintenanceExecution(id); if (ticket === sequence && epoch === store.epoch) executionDetail.value = data } catch (e) { if (epoch === store.epoch) detailError.value = errorMessage(e) } }
function resetPending() { pending.value = null; sessionStorage.removeItem(storageKey()); result.value = '' }
function shanghaiToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
async function confirmReset() { try { await ElMessageBox.confirm('请先在执行历史中确认上次请求结果。开始新操作后将生成新的请求号，是否继续？', '确认请求结果', { type: 'warning' }); resetPending() } catch { /* 用户取消 */ } }
async function execute() {
  const plan = selected.value; if (!plan || busy.value) return
  const body = { result: result.value.trim() }; if (!body.result || body.result.length > 2000) { detailError.value = '执行结果不能为空且最多 2000 字。'; return }
  if (pending.value && (pending.value.planId !== plan.id || pending.value.body.result !== body.result)) { detailError.value = '上次请求结果尚未确认，请先按原内容重试或查询执行记录。'; return }
  if (!pending.value) { pending.value = { key: newMaintenanceKey(), body, planId: plan.id }; sessionStorage.setItem(storageKey(), JSON.stringify(pending.value)) }
  busy.value = true; detailError.value = ''
  try { const intent = pending.value; await store.mutate(() => api.createMaintenanceExecution(plan.id, intent!.key, intent!.body)); resetPending(); ElMessage.success('执行结果已登记'); await load(); await open(plan) }
  catch (e) { detailError.value = `${errorMessage(e)}；可按原内容重试，请先查询执行历史确认结果。` } finally { busy.value = false }
}
onMounted(() => { try { const saved = sessionStorage.getItem(storageKey()); if (saved) { pending.value = JSON.parse(saved); result.value = pending.value?.body.result ?? '' } } catch { /* 保持空状态 */ }; void load() })
onScopeDispose(() => sequence++)
</script>
<template><div><PageHead title="维护与巡检" description="安排周期计划，追溯每次执行结果。" eyebrow="MAINTENANCE / PLANS"><el-button v-if="store.isAdmin" type="primary" @click="edit()">新建计划</el-button></PageHead><section class="panel"><form class="filter-bar" @submit.prevent="load()"><el-input v-model="filters.keyword" maxlength="160" placeholder="搜索计划名称" /><el-select v-model="filters.planType" clearable placeholder="全部类型"><el-option label="维护" value="MAINTENANCE"/><el-option label="巡检" value="INSPECTION"/></el-select><el-checkbox v-model="filters.dueOnly">仅到期</el-checkbox><el-button native-type="submit" :loading="loading">查询</el-button></form><ResourceState :loading="loading" :error="error || detailError" :empty="!records.length" title="维护计划" description="当前条件下暂无计划。" @retry="load()" /><table v-if="records.length" class="data-table"><thead><tr><th>计划</th><th>设备</th><th>负责人</th><th>下次到期</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="row in records" :key="row.id"><td>{{ row.name }} · {{ row.planType === 'MAINTENANCE' ? '维护' : '巡检' }}</td><td>{{ row.equipmentName || row.equipmentAssetCode }}</td><td>{{ row.assigneeName || `用户 #${row.assigneeUserId}` }}</td><td>{{ row.nextDueDate }}</td><td>{{ row.enabled ? '启用' : '停用' }}</td><td><el-button link @click="open(row)">详情</el-button><el-button v-if="store.isAdmin" link :disabled="busy" @click="edit(row)">编辑</el-button><el-button v-if="store.isAdmin" link :disabled="busy" @click="toggle(row)">{{ row.enabled ? '停用' : '启用' }}</el-button></td></tr></tbody></table><PagePager :current="page.current" :size="page.size" :total="page.total" :loading="loading" @change="load" @resize="resource.load({ ...filters, current: 1, size: $event })" /></section>
<el-drawer :model-value="!!selected" title="维护计划详情" size="min(650px,100vw)" @close="selected = null"><template v-if="selected"><h2>{{ selected.name }}</h2><p>{{ selected.equipmentName }} · 每 {{ selected.cycleDays }} 天 · 下次到期 {{ selected.nextDueDate }}</p><p>{{ selected.content }}</p><p>负责人：{{ selected.assigneeName || selected.assigneeUserId }} · {{ selected.enabled ? '启用' : '停用' }}</p><p v-if="detailError" class="inline-error" role="alert">{{ detailError }}</p><section v-if="(selected.enabled && selected.assigneeUserId === store.user?.userId && selected.nextDueDate <= shanghaiToday()) || pending?.planId === selected.id"><h3>登记执行结果</h3><p class="muted">仅到期计划可登记；是否到期由服务端判断。</p><p v-if="pending && pending.planId !== selected.id" class="inline-error">另一计划有未确认请求，请先查看该计划并确认结果。</p><el-input v-model="result" type="textarea" maxlength="2000" show-word-limit :disabled="!!pending"/><el-button :loading="busy" @click="execute">{{ pending ? '按原内容重试' : '登记执行' }}</el-button><el-button v-if="pending" :disabled="busy" @click="confirmReset">已核实结果，开始新操作</el-button></section><h3>执行历史</h3><ResourceState :loading="history.loading.value" :error="history.error.value" :empty="!history.records.value.length" title="执行历史" description="暂无执行记录。" @retry="history.load()"/><ul><li v-for="item in history.records.value" :key="item.id">{{ formatTime(item.executedAt) }} · {{ item.executedByName }} <el-button link @click="showExecution(item.id)">查看快照</el-button></li></ul><PagePager :current="history.page.current" :size="history.page.size" :total="history.page.total" :loading="history.loading.value" @change="history.load({ current: $event })" @resize="history.load({ current: 1, size: $event })"/></template></el-drawer>
<el-dialog v-model="editor" :title="editingId === null ? '新建维护计划' : '编辑维护计划'"><el-form label-position="top"><el-form-item label="计划名称"><el-input v-model="form.name" maxlength="160"/></el-form-item><el-form-item label="设备"><RecordPicker v-model="form.equipmentId" kind="equipment" /></el-form-item><el-form-item label="类型"><el-select v-model="form.planType"><el-option label="维护" value="MAINTENANCE"/><el-option label="巡检" value="INSPECTION"/></el-select></el-form-item><el-form-item label="执行内容"><el-input v-model="form.content" type="textarea" maxlength="2000"/></el-form-item><el-form-item label="周期（天）"><el-input-number v-model="form.cycleDays" :min="1" :max="3650" :precision="0"/></el-form-item><el-form-item label="下次到期"><el-input v-model="form.nextDueDate" type="date"/></el-form-item><el-form-item label="负责人"><RecordPicker v-model="form.assigneeUserId" kind="member"/></el-form-item></el-form><p v-if="formError" class="inline-error">{{ formError }}</p><template #footer><el-button :disabled="busy" @click="editor=false">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存</el-button></template></el-dialog>
<el-dialog :model-value="!!executionDetail" title="执行记录快照" @close="executionDetail=null"><template v-if="executionDetail"><p>{{ executionDetail.planName }} · {{ executionDetail.equipmentName }} ({{ executionDetail.equipmentAssetCode }})</p><p>计划内容：{{ executionDetail.planContent }}</p><p>原定日期：{{ executionDetail.scheduledDate }} · 执行时间：{{ formatTime(executionDetail.executedAt) }}</p><p>执行人：{{ executionDetail.executedByName }}</p><p>执行结果：{{ executionDetail.result }}</p><p>周期：{{ executionDetail.cycleDays }} 天 · 下次到期：{{ executionDetail.nextDueDate }}</p></template></el-dialog></div></template>
