<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import { api } from '@/services/api'
import { errorMessage } from '@/services/backend-contract'
import { useAppStore } from '@/stores/app'
import type { EquipmentRuntimeMaintenance } from '@/types'

const props = defineProps<{ equipmentId: number; refresh: number }>()
const store = useAppStore()
const plan = ref<EquipmentRuntimeMaintenance>()
const threshold = ref('')
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
let sequence = 0

async function load() {
  const ticket = ++sequence
  loading.value = true
  loadError.value = ''
  try {
    const result = await api.runtimeMaintenance(props.equipmentId)
    if (ticket === sequence) plan.value = result
  } catch (reason) {
    if (ticket === sequence) loadError.value = errorMessage(reason)
  } finally {
    if (ticket === sequence) loading.value = false
  }
}

async function save() {
  if (saving.value || loading.value || loadError.value || !plan.value) return
  const value = threshold.value.trim()
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
    saveError.value = '请输入正数阈值，最多 12 位整数和 2 位小数。'
    return
  }
  const epoch = store.epoch
  const id = props.equipmentId
  const version = plan.value.version
  saving.value = true
  saveError.value = ''
  try {
    await store.mutate(() => api.configureRuntimeMaintenance(id, Number(value), version))
    if (epoch === store.epoch && id === props.equipmentId) {
      threshold.value = ''
      await load()
    }
  } catch (reason) {
    if (epoch === store.epoch && id === props.equipmentId) saveError.value = errorMessage(reason)
  } finally {
    saving.value = false
  }
}

watch(() => [props.equipmentId, store.epoch], () => {
  plan.value = undefined
  threshold.value = ''
  saveError.value = ''
  void load()
}, { immediate: true })
watch(() => props.refresh, load)
onScopeDispose(() => sequence++)
</script>

<template>
  <section class="drawer-section">
    <h3>小时维护计划</h3>
    <p v-if="loading" role="status">正在查询维护阈值…</p>
    <p v-else-if="loadError" class="inline-error" role="alert">
      {{ loadError }} <el-button link @click="load">重试</el-button>
    </p>
    <template v-else>
      <p v-if="plan?.thresholdHours == null">尚未设置维护阈值。</p>
      <p v-else>累计 {{ plan.thresholdHours }} h
        <template v-if="plan.workOrderId">
          · 已生成 <RouterLink :to="{ name: 'orders', query: { detail: plan.workOrderId } }">维护工单</RouterLink>
        </template>
        <template v-else> · 待触发</template>
      </p>
    </template>
    <form v-if="store.isAdmin" class="filter-bar" @submit.prevent="save">
      <el-input v-model="threshold" inputmode="decimal" aria-label="维护累计小时阈值"
        placeholder="累计小时阈值（h）" :disabled="saving" />
      <el-button native-type="submit" :loading="saving" :disabled="loading || !!loadError || !plan">保存阈值</el-button>
    </form>
    <p v-if="saveError" class="inline-error" role="alert">
      {{ saveError }} <el-button link :disabled="loading" @click="load">刷新阈值</el-button>
    </p>
  </section>
</template>
