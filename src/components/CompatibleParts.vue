<script setup lang="ts">
import { ref, watch, onScopeDispose } from 'vue'
import { ElMessageBox } from 'element-plus'
import { api } from '@/services/api'
import { errorMessage } from '@/services/backend-contract'
import { useAppStore } from '@/stores/app'
import type { CompatiblePart } from '@/services/s2-contract'
import ResourceState from '@/components/ResourceState.vue'
import RecordPicker from '@/components/RecordPicker.vue'
const props = defineProps<{ equipmentId: number }>()
const store = useAppStore()
const rows = ref<CompatiblePart[]>([]), loading = ref(false), error = ref(''), busy = ref(false), partId = ref<number | null>(null)
let sequence = 0
async function load() {
  const ticket = ++sequence, epoch = store.epoch, id = props.equipmentId
  loading.value = true; error.value = ''; rows.value = []
  try { const result = await api.compatibleParts(id); if (ticket === sequence && epoch === store.epoch && id === props.equipmentId) rows.value = result }
  catch (e) { if (ticket === sequence && epoch === store.epoch) error.value = errorMessage(e) }
  finally { if (ticket === sequence && epoch === store.epoch) loading.value = false }
}
async function add() {
  if (!partId.value || busy.value) return
  busy.value = true; error.value = ''
  try { await store.mutate(() => api.addCompatiblePart(props.equipmentId, partId.value!)); partId.value = null; await load() }
  catch (e) { error.value = errorMessage(e) } finally { busy.value = false }
}
async function remove(row: CompatiblePart) {
  if (busy.value) return
  try { await ElMessageBox.confirm(`解除与“${row.sparePartName}”的适配关系？`, '解除适配', { type: 'warning' }); busy.value = true; await store.mutate(() => api.removeCompatiblePart(props.equipmentId, row.sparePartId)); await load() }
  catch (e) { if (e !== 'cancel' && e !== 'close') error.value = errorMessage(e) } finally { busy.value = false }
}
watch(() => [props.equipmentId, store.epoch], () => { partId.value = null; void load() }, { immediate: true })
onScopeDispose(() => sequence++)
</script>
<template><section class="drawer-section"><h3>适配备件</h3><p class="muted">适配关系不代表仓库库存或实际领用。</p><div v-if="store.isAdmin" class="filter-bar"><RecordPicker v-model="partId" kind="part" placeholder="选择启用备件" :disabled="busy" /><el-button :loading="busy" :disabled="!partId" @click="add">添加适配</el-button></div><ResourceState :loading="loading" :error="error" :empty="!rows.length" title="适配备件" description="尚无适配备件。" @retry="load" /><ul v-if="!loading"><li v-for="row in rows" :key="row.id">{{ row.sparePartName }} · {{ row.sparePartCode }} <span v-if="!row.sparePartEnabled">（已停用）</span> <span v-if="row.sparePartSpec">{{ row.sparePartSpec }}</span><el-button v-if="store.isAdmin" link type="danger" :disabled="busy" @click="remove(row)">解除</el-button></li></ul></section></template>
