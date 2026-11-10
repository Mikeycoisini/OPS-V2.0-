<script setup lang="ts" generic="T extends number | string">
import { computed, onScopeDispose, ref } from 'vue'
import { api } from '@/services/api'
import { errorMessage } from '@/services/backend-contract'
const props = defineProps<{ modelValue: T | null | undefined; kind: 'equipment' | 'member' | 'part'; placeholder?: string; disabled?: boolean; selectedLabel?: string }>()
const emit = defineEmits<{ 'update:modelValue': [T | null] }>()
const options = ref<{ id: number | string; label: string }[]>([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const current = ref(0)
const total = ref(0)
const loaded = ref(false)
let sequence = 0
const fallback = computed(() => props.modelValue != null && !options.value.some(option => String(option.id) === String(props.modelValue)))
async function load(search = keyword.value, append = false) {
  const ticket = ++sequence
  keyword.value = search
  loading.value = true; error.value = ''
  const pageNumber = append ? current.value + 1 : 1
  try {
    let result: { options: { id: number | string; label: string }[]; total: number }
    if (props.kind === 'equipment') {
      const page = await api.equipment(pageNumber, 20, search)
      result = { options: page.records.map(item => ({ id: item.id, label: `${item.name} · ${item.assetCode}` })), total: page.total }
    } else if (props.kind === 'member') {
      const page = await api.members({ current: pageNumber, size: 20, keyword: search, enabled: true })
      result = { options: page.records.map(item => ({ id: item.userId, label: `${item.displayName || item.account} · #${item.userId}` })), total: page.total }
    } else {
      const page = await api.spareParts({ current: pageNumber, size: 20, keyword: search, enabled: true })
      result = { options: page.records.map(item => ({ id: item.id, label: `${item.name} · ${item.partCode}${item.unit ? `（${item.unit}）` : ''}` })), total: page.total }
    }
    if (ticket !== sequence) return
    options.value = append ? [...options.value, ...result.options] : result.options
    current.value = pageNumber; total.value = result.total; loaded.value = true
  } catch (reason) { if (ticket === sequence) error.value = errorMessage(reason) }
  finally { if (ticket === sequence) loading.value = false }
}
/** 执行流程：1.清空时返回null；2.保留选项原始ID类型；3.成员长ID不经过Number转换。 */
function select(value: number | string | undefined) { emit('update:modelValue', value === '' || value == null ? null : value as T) } // 选项ID来自各自后端契约，兼容字符串成员ID。
onScopeDispose(() => sequence++)
</script>
<template><el-select :model-value="modelValue" :aria-label="placeholder || '搜索并选择记录'" :placeholder="placeholder || '输入关键字搜索'" filterable remote clearable :remote-method="(value: string) => load(value)" :loading="loading" :disabled="disabled" @update:model-value="select" @visible-change="(visible: boolean) => { if (visible && !loaded) load() }"><el-option v-if="fallback" :value="modelValue!" :label="selectedLabel || `已选择 #${modelValue}`" /><el-option v-for="option in options" :key="option.id" :label="option.label" :value="option.id" /><template #footer><div v-if="error" class="picker-error">{{ error }} <el-button link type="primary" @click="load()">重试</el-button></div><el-button v-else-if="options.length < total" link type="primary" :loading="loading" @click="load(keyword, true)">加载更多（{{ options.length }} / {{ total }}）</el-button><small v-else class="muted">{{ loaded ? `已加载 ${options.length} 项` : '展开后读取可选记录' }}</small></template></el-select></template>
