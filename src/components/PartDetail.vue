<script setup lang="ts">
import { ref, watch, onScopeDispose } from 'vue'
import { api, ApiError } from '@/services/api'
import { errorMessage } from '@/services/backend-contract'
import { useAppStore } from '@/stores/app'
import type { SparePart } from '@/domain'
import type { CompatibleEquipment } from '@/services/s2-contract'
import ResourceState from '@/components/ResourceState.vue'
const props = defineProps<{ partId: number | null }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()
const part = ref<SparePart | null>(null), rows = ref<CompatibleEquipment[]>([]), loading = ref(false), error = ref('')
let sequence = 0
async function load() {
  const id = props.partId, epoch = store.epoch, ticket = ++sequence
  part.value = null; rows.value = []; error.value = ''; loading.value = false
  if (id === null) return
  loading.value = true
  try {
    const detail = await api.sparePart(id)
    if (ticket !== sequence || epoch !== store.epoch || id !== props.partId) return
    part.value = detail
    try {
      const result = await api.compatibleEquipment(id)
      if (!Array.isArray(result)) throw new Error('适配设备接口未返回有效列表，请核对后端响应。')
      if (ticket === sequence && epoch === store.epoch && id === props.partId) rows.value = result
    } catch (reason) {
      if (ticket === sequence && epoch === store.epoch) error.value = reason instanceof ApiError && reason.status === 404
        ? '备件详情可读取，但适配设备接口返回 404；请核对接口是否已部署，或刷新确认备件仍可访问。'
        : errorMessage(reason)
    }
  } catch (reason) {
    if (ticket === sequence && epoch === store.epoch) error.value = reason instanceof ApiError && reason.status === 404 ? '备件不存在，或当前企业无权访问该备件。' : errorMessage(reason)
  } finally { if (ticket === sequence && epoch === store.epoch) loading.value = false }
}
watch(() => [props.partId, store.epoch], () => { void load() }, { immediate: true })
onScopeDispose(() => sequence++)
</script>
<template><el-drawer :model-value="partId !== null" title="备件详情" size="min(650px,100vw)" @close="emit('close')"><template v-if="part"><h2>{{ part.name }}</h2><p>{{ part.partCode }} · {{ part.enabled ? '启用' : '已停用' }}</p><dl class="details-grid"><div><dt>规格</dt><dd>{{ part.spec || '—' }}</dd></div><div><dt>分类</dt><dd>{{ part.category || '—' }}</dd></div><div><dt>单位</dt><dd>{{ part.unit || '—' }}</dd></div><div><dt>目录库位</dt><dd>{{ part.location || '—' }}</dd></div></dl></template><section class="drawer-section"><h3>适配设备</h3><p class="muted">展示当前企业中与该备件关联的设备；停用备件及停机设备的已有关系仍会显示。</p><ResourceState :loading="loading" :error="error" :empty="!rows.length" title="适配设备" description="暂无适配设备。" @retry="load"/><ul v-if="!loading && !error"><li v-for="row in rows" :key="row.id"><router-link :to="{ path: '/equipment', query: { equipmentId: row.equipmentId } }">{{ row.equipmentName }} · {{ row.equipmentAssetCode }}</router-link></li></ul></section></el-drawer></template>
