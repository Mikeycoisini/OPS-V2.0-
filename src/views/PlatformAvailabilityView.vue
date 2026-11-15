<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/services/api'
import { errorMessage } from '@/services/backend-contract'
import { availabilityEvidence, type AvailabilityAction, type AvailabilityAlert } from '@/services/platform-availability'
import PageHead from '@/components/PageHead.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const alerts = ref<AvailabilityAlert[]>([])
const owner = ref('')
const inbox = ref(true)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const before = ref<string>()
const more = computed(() => alerts.value.length === 50)
const canView = computed(() => owner.value !== '')
let sequence = 0
const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Shanghai' })

function format(value: string | null) {
  return value ? date.format(new Date(value.endsWith('Z') ? value : value + 'Z')) : '—'
}

async function load(cursor?: string) {
  const ticket = ++sequence
  loading.value = true
  error.value = ''
  try {
    const actor = await api.platformOperator()
    const rows = await api.platformAvailabilityAlerts(inbox.value, cursor)
    if (ticket !== sequence) return
    owner.value = actor.userId
    alerts.value = rows
    before.value = cursor
  } catch (reason) {
    if (ticket !== sequence) return
    owner.value = ''
    alerts.value = []
    error.value = errorMessage(reason)
  } finally {
    if (ticket === sequence) loading.value = false
  }
}

async function act(alert: AvailabilityAlert, action: AvailabilityAction) {
  if (busy.value) return
  const epoch = store.epoch
  busy.value = true
  error.value = ''
  try {
    await store.mutate(() => api.actOnPlatformAvailability(alert.id, action))
    if (epoch === store.epoch) await load(before.value)
  } catch (reason) {
    if (epoch === store.epoch) error.value = errorMessage(reason)
  } finally {
    busy.value = false
  }
}

watch(() => [inbox.value, store.epoch], () => {
  owner.value = ''
  alerts.value = []
  void load()
}, { immediate: true })
</script>

<template>
  <main class="availability">
    <PageHead title="平台可用性告警" description="查看独立探针记录的故障与恢复证据。">
      <RouterLink :to="store.user?.activeTenant ? '/workspace' : '/select-tenant'">返回工作区</RouterLink>
    </PageHead>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取告警…</p>
    <div v-if="canView" class="filter-bar">
      <el-checkbox v-model="inbox" :disabled="busy">只看我的站内提醒</el-checkbox>
      <el-button :disabled="loading || busy" @click="load()">刷新</el-button>
    </div>
    <p v-if="canView && !loading && !alerts.length">当前没有告警。</p>
    <div v-if="alerts.length" class="table-wrap">
      <table class="data-table">
        <thead><tr><th>故障证据</th><th>确认时间（北京时间）</th><th>恢复时间（北京时间）</th><th>负责人</th><th>状态</th><th>处置</th></tr></thead>
        <tbody>
          <tr v-for="alert in alerts" :key="alert.id">
            <td>{{ availabilityEvidence[alert.evidence] ?? alert.evidence }}</td>
            <td>{{ format(alert.openedAt) }}</td>
            <td>{{ format(alert.recoveredAt) }}</td>
            <td>用户 #{{ alert.ownerUserId }}</td>
            <td>{{ alert.resolvedAt ? '已结案' : alert.acknowledgedAt ? '已接手' : '待接手' }}</td>
            <td v-if="alert.ownerUserId === owner">
              <el-button v-if="alert.notifiedAt && !alert.readAt" link :disabled="busy" @click="act(alert, 'READ')">标为已读</el-button>
              <el-button v-if="!alert.acknowledgedAt" link :disabled="busy" @click="act(alert, 'ACKNOWLEDGE')">确认接手</el-button>
              <el-button v-if="alert.acknowledgedAt && alert.recoveredAt && !alert.resolvedAt" link :disabled="busy" @click="act(alert, 'RESOLVE')">结案</el-button>
            </td>
            <td v-else>—</td>
          </tr>
        </tbody>
      </table>
    </div>
    <el-button v-if="before" :disabled="loading || busy" @click="load()">返回最新</el-button>
    <el-button v-if="more" :disabled="loading || busy" @click="load(alerts[alerts.length - 1]?.id)">更早告警</el-button>
  </main>
</template>

<style scoped>
.availability { max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
</style>
