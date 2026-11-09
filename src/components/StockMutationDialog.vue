<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { allowedOrderActions, createMutationIntent, errorMessage, parseQuantity } from '@/services/backend-contract'
import type { Order, StockInput, StockIssue, StockReturn, StockTransaction, Warehouse } from '@/domain'
import RecordPicker from './RecordPicker.vue'
const props = defineProps<{ modelValue: boolean; mode: 'in' | 'issue' | 'return'; order?: Order; original?: StockTransaction | null; partId?: number; partLabel?: string; warehouseId?: number }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [StockTransaction] }>()
const store = useAppStore()
const busy = ref(false)
const loading = ref(false)
const error = ref('')
const warehouseError = ref('')
const warehouses = ref<Warehouse[]>([])
const frozen = ref(false)
const requestKey = ref('')
const form = reactive({ warehouseId: null as number | null, sparePartId: null as number | null, quantity: '', referenceText: '', note: '' })
const title = computed(() => props.mode === 'in' ? '备件入库' : props.mode === 'issue' ? '维修工单领料' : '退回剩余备件')
const storageKey = computed(() => `equipops:stock-intent:${store.user?.userId}:${store.user?.activeTenant?.id}:${props.mode}:${props.original?.id || props.order?.id || 'catalog'}`)
let intent = createMutationIntent()
let sequence = 0
let restored: { key: string; body: Record<string, unknown> } | undefined
function readPending() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey.value) || 'null')
    return parsed && typeof parsed.key === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(parsed.key) && parsed.body && typeof parsed.body === 'object' ? parsed as { key: string; body: Record<string, unknown> } : undefined
  } catch { return undefined }
}
function setVisible(value: boolean) { if (!busy.value) emit('update:modelValue', value) }
async function loadWarehouses() {
  const ticket = ++sequence
  loading.value = true; warehouseError.value = ''
  try {
    const rows = await api.warehouses()
    if (ticket !== sequence) return
    warehouses.value = rows.filter(item => item.enabled)
    if (!form.warehouseId && !frozen.value) form.warehouseId = warehouses.value[0]?.id || null
  } catch (reason) { if (ticket === sequence) warehouseError.value = errorMessage(reason) }
  finally { if (ticket === sequence) loading.value = false }
}
function open() {
  sequence++; error.value = ''; warehouseError.value = ''; requestKey.value = ''
  Object.assign(form, { warehouseId: props.warehouseId || null, sparePartId: props.partId || null, quantity: '', referenceText: '', note: '' })
  restored = readPending()
  intent = createMutationIntent(undefined, restored)
  frozen.value = !!restored
  if (restored) {
    requestKey.value = restored.key
    Object.assign(form, { warehouseId: restored.body.warehouseId || null, sparePartId: restored.body.sparePartId || null, quantity: String(restored.body.quantity), referenceText: restored.body.referenceText || '', note: restored.body.note || '' })
  }
  if (props.mode !== 'return') void loadWarehouses()
}
async function resetIntent() {
  try {
    await ElMessageBox.confirm('重新填写将开始一笔新操作。请先查询流水，确认上次是否已经成功，避免重复入库、领料或退料。', '开始新操作', { confirmButtonText: '已核对，重新填写', cancelButtonText: '继续原请求', type: 'warning' })
    sessionStorage.removeItem(storageKey.value); intent.reset(); frozen.value = false; requestKey.value = ''; restored = undefined; error.value = ''
  } catch { /* 取消时保留原参数与请求号。 */ }
}
async function submit() {
  if (busy.value) return
  error.value = ''
  try {
    const quantity = parseQuantity(form.quantity)
    if (props.mode === 'issue' && (!props.order || !allowedOrderActions(props.order, store.user).issue)) throw new Error('只有维修中的工单负责人可以领料')
    if (props.mode === 'in' && !store.isAdmin) throw new Error('只有企业管理员可以办理入库')
    if (props.mode === 'return' && (!props.original?.id || quantity > Number(props.original.quantity))) throw new Error('退料须关联原领料流水，数量不能超过原领料数量')
    if (props.mode !== 'return' && (!form.warehouseId || !form.sparePartId)) throw new Error('请选择仓库和启用的备件')
    const body: StockInput | StockIssue | StockReturn = restored?.body as unknown as StockInput | StockIssue | StockReturn || (props.mode === 'return'
      ? { issueTransactionId: props.original!.id, quantity, note: form.note.trim() }
      : props.mode === 'issue'
        ? { workOrderId: props.order!.id, warehouseId: form.warehouseId!, sparePartId: form.sparePartId!, quantity, note: form.note.trim() }
        : { warehouseId: form.warehouseId!, sparePartId: form.sparePartId!, quantity, referenceText: form.referenceText.trim(), note: form.note.trim() })
    const prepared = intent.prepare(body)
    // 写请求发出前保存；关闭弹窗、刷新或重试仍使用同一份参数。
    sessionStorage.setItem(storageKey.value, JSON.stringify(prepared))
    requestKey.value = prepared.key; frozen.value = true; busy.value = true
    const saved = await store.mutate(() => props.mode === 'in' ? api.stockIn(prepared.key, prepared.body as StockInput)
      : props.mode === 'issue' ? api.stockIssue(prepared.key, prepared.body as StockIssue) : api.stockReturn(prepared.key, prepared.body as StockReturn))
    sessionStorage.removeItem(storageKey.value); intent.reset(); frozen.value = false; requestKey.value = ''; restored = undefined
    emit('update:modelValue', false); emit('saved', saved); ElMessage.success(`${title.value}成功，流水 ${saved.transactionNo}`)
  } catch (reason) { error.value = errorMessage(reason) } finally { busy.value = false }
}
watch(() => props.modelValue, value => { if (value) open() }, { immediate: true })
onScopeDispose(() => sequence++)
</script>
<template><el-dialog :model-value="modelValue" :title="title" width="min(570px,94vw)" append-to-body :show-close="!busy" :close-on-click-modal="!busy" :close-on-press-escape="!busy" @update:model-value="setVisible"><p v-if="mode === 'issue'" class="dialog-intro">{{ order?.orderNo }} · {{ order?.title }}<br />领料后扣减所选仓库余额，并计入这张工单的用料记录。</p><p v-else-if="mode === 'return'" class="dialog-intro">原领料流水 {{ original?.transactionNo }} · 仓库 #{{ original?.warehouseId }} · 备件 #{{ original?.sparePartId }}<br />原领数量 {{ original?.quantity }}；退回原仓库，本次不得超过剩余未退数量。</p><p v-else class="dialog-intro">选择备件与默认仓库，记录本次实际到库数量。</p><div v-if="frozen" class="info-note">已保留本次请求的原参数。未确认成功时，可使用原请求号重试。<small class="request-key">{{ requestKey }}</small></div><el-form label-position="top" :model="form" :disabled="busy || frozen"><template v-if="mode !== 'return'"><el-form-item label="入出库仓库" required><el-select v-model="form.warehouseId" :loading="loading" placeholder="选择默认仓库"><el-option v-if="frozen && !warehouses.some(item => item.id === form.warehouseId)" :value="form.warehouseId!" :label="`原请求仓库 #${form.warehouseId}`" /><el-option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id" :label="`${warehouse.name} · ${warehouse.warehouseCode}`" /></el-select></el-form-item><el-form-item label="备件" required><RecordPicker v-model="form.sparePartId" kind="part" :selected-label="frozen ? undefined : partLabel" :disabled="busy || frozen" /></el-form-item></template><el-form-item label="本次数量" required><el-input v-model="form.quantity" inputmode="decimal" placeholder="大于 0，最多 3 位小数" /></el-form-item><el-form-item v-if="mode === 'in'" label="来源单号 / 参考信息"><el-input v-model="form.referenceText" maxlength="160" placeholder="可填写采购单号或到货说明" /></el-form-item><el-form-item label="备注"><el-input v-model="form.note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item></el-form><p v-if="warehouseError" class="inline-error">{{ warehouseError }} <el-button link type="primary" @click="loadWarehouses">重新读取仓库</el-button></p><p v-if="error" class="inline-error" role="alert">{{ error }}</p><template #footer><el-button v-if="frozen" :disabled="busy" @click="resetIntent">重新填写</el-button><el-button :disabled="busy" @click="emit('update:modelValue', false)">{{ frozen ? '稍后继续' : '取消' }}</el-button><el-button type="primary" :loading="busy" :disabled="loading && !frozen" @click="submit">{{ frozen ? '按原请求重试' : '确认提交' }}</el-button></template></el-dialog></template>
