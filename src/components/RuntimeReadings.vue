<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import ResourceState from '@/components/ResourceState.vue'
import { api } from '@/services/api'
import { errorMessage } from '@/services/backend-contract'
import { useAppStore } from '@/stores/app'
import type { EquipmentRuntimeReading } from '@/types'

const props = defineProps<{ equipmentId: number }>()
const store = useAppStore()
const rows = ref<EquipmentRuntimeReading[]>([])
const hours = ref('')
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
let scope = 0
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Shanghai' })

async function load() {
  const ticket = ++scope
  loading.value = true
  loadError.value = ''
  try {
    const result = await api.runtimeReadings(props.equipmentId)
    if (ticket === scope) rows.value = result
  } catch (reason) {
    if (ticket === scope) loadError.value = errorMessage(reason)
  } finally {
    if (ticket === scope) loading.value = false
  }
}

async function save() {
  if (saving.value || loading.value) return
  const value = hours.value.trim()
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) {
    saveError.value = '请输入非负累计小时，最多 12 位整数和 2 位小数。'
    return
  }

  const ticket = scope
  const equipmentId = props.equipmentId
  saving.value = true
  saveError.value = ''
  try {
    await store.mutate(() => api.recordRuntimeReading(equipmentId, Number(value)))
    if (ticket === scope) {
      hours.value = ''
      await load()
    }
  } catch (reason) {
    if (ticket === scope) saveError.value = errorMessage(reason)
  } finally {
    saving.value = false
  }
}

watch(() => [props.equipmentId, store.epoch], () => {
  rows.value = []
  hours.value = ''
  saveError.value = ''
  void load()
}, { immediate: true })
onScopeDispose(() => scope++)
</script>

<template>
  <section class="drawer-section">
    <h3>运行小时读数</h3>
    <form class="filter-bar" @submit.prevent="save">
      <el-input v-model="hours" inputmode="decimal" aria-label="累计运行小时读数"
        placeholder="累计运行小时（h）" :disabled="saving" />
      <el-button native-type="submit" type="primary" :loading="saving" :disabled="loading">登记读数</el-button>
    </form>
    <p v-if="saveError" class="inline-error" role="alert">{{ saveError }}</p>
    <ResourceState :loading="loading" :error="loadError" :empty="!rows.length"
      title="运行小时读数" description="暂无读数。" @retry="load" />
    <div v-if="!loading && !loadError && rows.length" class="table-wrap">
      <table class="data-table">
        <thead><tr><th>累计小时</th><th>记录时间（北京时间）</th><th>录入人</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ row.hours }} h</td>
            <td>{{ dateTime.format(row.recordedAt) }}</td>
            <td>用户 #{{ row.recordedBy }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
