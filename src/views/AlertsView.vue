<script setup lang="ts">
import { onScopeDispose, reactive, ref, watch } from 'vue'
import { ElMessage, ElTable, ElTableColumn, ElAlert, ElDialog, ElButton, ElInput, ElSwitch, ElInputNumber, ElSelect, ElOption } from 'element-plus'
import type { Member } from '@/domain'
import { api, ApiError } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { usePage } from '@/composables/usePage'
import { errorMessage, formatTime } from '@/services/backend-contract'
import { alertStatusText, type AlertEvent, type AlertRuleInput, type AlertAction, type AlertId } from '@/services/operations'
import PageHead from '@/components/PageHead.vue'
import PagePager from '@/components/PagePager.vue'

const store = useAppStore()
const events = reactive(usePage(api.alerts, () => store.epoch))
const notices = reactive(usePage(api.alertNotifications, () => store.epoch))
const ruleOpen = ref(false), detailOpen = ref(false), busy = ref(false), error = ref(''), ruleError = ref(''), detailError = ref('')
const detail = ref<AlertEvent | null>(null), actions = ref<AlertAction[]>([]), note = ref(''), selectedStatus = ref('')
const ownerOptions = ref<Member[]>([])
const ownerLoading = ref(false)
const actionText: Record<string, string> = { ACKNOWLEDGE: '确认接手', ADD_NOTE: '处置备注', RESOLVE: '结案' }
let ownerSequence = 0
const rule = reactive<AlertRuleInput>({ enabled: false, thresholdCount: 3, windowSeconds: 600, cooldownSeconds: 300, ownerUserId: '' })
let disposed = false, detailSequence = 0, ruleSequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
function stopPoll() { if (timer) clearTimeout(timer); timer = undefined }
async function refresh() {
  stopPoll()
  if (!store.isAdmin || disposed) return
  await Promise.all([events.load(), notices.load()])
  if (!disposed && store.isAdmin) timer = setTimeout(() => { void refresh() }, 30000)
}
async function loadOwners(keyword = '') {
  const epoch = store.epoch, ticket = ++ownerSequence
  ownerLoading.value = true
  try {
    const result = await api.members({ current: 1, size: 100, keyword })
    if (disposed || epoch !== store.epoch || ticket !== ownerSequence) return
    ownerOptions.value = result.records.filter(member => member.enabled && member.roles.some(role => role.roleCode === 'TENANT_ADMIN'))
  } catch (e) { if (!disposed && epoch === store.epoch && ticket === ownerSequence) ruleError.value = errorMessage(e) }
  finally { if (ticket === ownerSequence) ownerLoading.value = false }
}
async function configure() {
  const epoch = store.epoch, ticket = ++ruleSequence
  ruleError.value = ''; ruleOpen.value = true
  void loadOwners()
  Object.assign(rule, { enabled: false, thresholdCount: 3, windowSeconds: 600, cooldownSeconds: 300, ownerUserId: String(store.user?.userId || ''), expectedVersion: undefined })
  try {
    const result = await api.alertRule()
    if (disposed || epoch !== store.epoch || ticket !== ruleSequence) return
    Object.assign(rule, { enabled: result.enabled, thresholdCount: result.thresholdCount, windowSeconds: result.windowSeconds,
      cooldownSeconds: result.cooldownSeconds, ownerUserId: String(result.ownerUserId), expectedVersion: result.version })
  } catch (e) {
    if (disposed || epoch !== store.epoch || ticket !== ruleSequence) return
    if (!(e instanceof ApiError && e.status === 404)) ruleError.value = errorMessage(e)
  }
}
async function saveRule() {
  if (busy.value) return
  ruleError.value = ''
  const epoch = store.epoch
  if (!/^[1-9][0-9]*$/.test(String(rule.ownerUserId))) { ruleError.value = '请填写本企业有效管理员的用户 ID'; return }
  busy.value = true
  try {
    await store.mutate(() => api.saveAlertRule({ ...rule }))
    if (disposed || epoch !== store.epoch) return
    ruleOpen.value = false; ElMessage.success('告警规则已保存'); await refresh()
  } catch (e) { if (!disposed && epoch === store.epoch) ruleError.value = errorMessage(e) }
  finally { busy.value = false }
}
async function openDetail(id: AlertId) {
  const epoch = store.epoch, ticket = ++detailSequence
  detailOpen.value = true; detail.value = null; actions.value = []; note.value = ''; detailError.value = ''
  try {
    const [event, timeline] = await Promise.all([api.alert(id), api.alertActions(id)])
    if (disposed || epoch !== store.epoch || ticket !== detailSequence) return
    detail.value = event; actions.value = timeline
  } catch (e) { if (!disposed && epoch === store.epoch && ticket === detailSequence) detailError.value = errorMessage(e) }
}
async function act(action: 'acknowledge' | 'notes' | 'resolve') {
  const event = detail.value, epoch = store.epoch
  if (!event || busy.value) return
  if (!note.value.trim()) { detailError.value = '请填写接手或处置说明'; return }
  busy.value = true; detailError.value = ''
  try {
    await store.mutate(() => api.actOnAlert(event.id, action, { expectedVersion: event.version, note: note.value.trim() }))
    if (disposed || epoch !== store.epoch) return
    ElMessage.success('处置记录已保存'); await openDetail(event.id); await refresh()
  } catch (e) {
    if (!disposed && epoch === store.epoch) {
      detailError.value = errorMessage(e)
      if (e instanceof ApiError && e.status === 409) { detail.value = null; detailError.value += '，请关闭详情后重新打开。' }
    }
  } finally { busy.value = false }
}
async function readNotice(id: AlertId, eventId: AlertId) {
  if (busy.value) return
  const epoch = store.epoch
  busy.value = true; error.value = ''
  try {
    await store.mutate(() => api.readAlertNotice(id))
    if (disposed || epoch !== store.epoch) return
    await notices.load(); await openDetail(eventId)
  } catch (e) { if (!disposed && epoch === store.epoch) error.value = errorMessage(e) }
  finally { busy.value = false }
}
watch(() => [store.epoch, store.isAdmin], () => {
  detailSequence++; ruleSequence++; ownerSequence++; ownerOptions.value = []; stopPoll(); events.clear(); notices.clear()
  detail.value = null; actions.value = []; detailOpen.value = false; ruleOpen.value = false
  error.value = ''; ruleError.value = ''; detailError.value = ''
  if (store.isAdmin) void refresh()
}, { immediate: true })
onScopeDispose(() => { disposed = true; detailSequence++; ruleSequence++; stopPoll() })
</script>

<template>
  <section v-if="store.isAdmin" class="alerts-page">
    <PageHead title="告警与处置" description="跟踪导出任务系统故障、处理记录及个人站内提醒。">
      <ElButton :disabled="busy" @click="configure">配置告警规则</ElButton>
      <ElButton :disabled="busy" @click="refresh">刷新</ElButton>
    </PageHead>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <section class="alerts-panel">
      <div class="alerts-toolbar"><h2>企业告警</h2><label>处置状态 <select v-model="selectedStatus" @change="events.load({ current: 1, status: selectedStatus })"><option value="">全部</option><option value="OPEN">待处理</option><option value="ACKNOWLEDGED">已接手</option><option value="RESOLVED">已结案</option></select></label></div>
      <ElAlert v-if="events.error" :title="events.error" type="error" :closable="false" />
      <ElTable v-loading="events.loading" :data="events.records" empty-text="暂无符合条件的告警">
        <ElTableColumn prop="id" label="告警 ID" width="100" />
        <ElTableColumn prop="errorCode" label="故障类型" min-width="150" />
        <ElTableColumn label="处置状态" width="110"><template #default="{ row }">{{ alertStatusText[(row as AlertEvent).status] }}</template></ElTableColumn>
        <ElTableColumn label="检测状态" width="130"><template #default="{ row }">{{ row.recoveryStatus === 'RECOVERED' ? '已检测恢复' : '恢复待确认' }}</template></ElTableColumn>
        <ElTableColumn prop="occurrenceCount" label="累计任务数" width="120" />
        <ElTableColumn label="最近新故障" min-width="170"><template #default="{ row }">{{ formatTime(row.lastSeenAt) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="100"><template #default="{ row }"><ElButton link type="primary" @click="openDetail(row.id)">查看处置</ElButton></template></ElTableColumn>
      </ElTable>
      <PagePager :current="events.page.current" :size="events.page.size" :total="events.page.total" :loading="events.loading" @change="events.load({ current: $event })" @resize="events.load({ current: 1, size: $event })" />
    </section>
    <section class="alerts-panel"><h2>我的站内提醒</h2>
      <ElAlert v-if="notices.error" :title="notices.error" type="error" :closable="false" />
      <ElTable v-loading="notices.loading" :data="notices.records" empty-text="暂无站内提醒">
        <ElTableColumn prop="title" label="标题" min-width="180" /><ElTableColumn prop="message" label="内容" min-width="280" />
        <ElTableColumn label="阅读状态" width="100"><template #default="{ row }">{{ row.readAt ? '已读' : '未读' }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="120"><template #default="{ row }"><ElButton link type="primary" :disabled="busy" @click="readNotice(row.id, row.eventId)">阅读并查看</ElButton></template></ElTableColumn>
      </ElTable>
      <PagePager :current="notices.page.current" :size="notices.page.size" :total="notices.page.total" :loading="notices.loading" @change="notices.load({ current: $event })" @resize="notices.load({ current: 1, size: $event })" />
    </section>
    <ElDialog v-model="ruleOpen" title="导出故障告警规则" width="min(560px, 95vw)" :close-on-click-modal="false">
      <p>选择接收故障提醒的企业管理员。可输入姓名或账号搜索负责人。</p>
      <div class="alerts-form">
        <label>启用规则 <ElSwitch v-model="rule.enabled" :disabled="busy" /></label>
        <label>失败任务阈值 <ElInputNumber v-model="rule.thresholdCount" :min="1" :max="10000" /></label>
        <label>统计窗口（秒） <ElInputNumber v-model="rule.windowSeconds" :min="1" :max="86400" /></label>
        <label>通知冷却（秒） <ElInputNumber v-model="rule.cooldownSeconds" :min="0" :max="86400" /></label>
        <label>告警负责人 <ElSelect v-model="rule.ownerUserId" filterable remote :remote-method="loadOwners" :loading="ownerLoading" placeholder="搜索管理员姓名或账号" style="width:250px"><ElOption v-for="member in ownerOptions" :key="member.userId" :label="`${member.displayName}（${member.account}）`" :value="String(member.userId)" /><ElOption v-if="rule.ownerUserId && !ownerOptions.some(member => String(member.userId) === String(rule.ownerUserId))" :label="`当前负责人（用户 ${rule.ownerUserId}）`" :value="String(rule.ownerUserId)" /></ElSelect></label>
      </div>
      <ElAlert v-if="ruleError" :title="ruleError" type="error" :closable="false" />
      <template #footer><ElButton :disabled="busy" @click="configure">重新读取</ElButton><ElButton :loading="busy" type="primary" @click="saveRule">保存配置</ElButton></template>
    </ElDialog>
    <ElDialog v-model="detailOpen" title="告警详情与处置" width="min(760px, 95vw)" :close-on-click-modal="false">
      <ElAlert v-if="detailError" :title="detailError" type="error" :closable="false" />
      <template v-if="detail"><p>告警 #{{ detail.id }} · {{ detail.errorCode }} · {{ alertStatusText[detail.status] }}</p>
        <p>累计 {{ detail.occurrenceCount }} 条任务，负责人 {{ detail.ownerUserId }}。检测状态为{{ detail.recoveryStatus === 'RECOVERED' ? '已恢复' : '待确认' }}。</p>
        <ElInput v-if="detail.status !== 'RESOLVED'" v-model="note" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="填写接手、排查或结案说明，请勿填写凭据" />
        <div class="alerts-actions"><ElButton v-if="detail.status === 'OPEN'" :loading="busy" @click="act('acknowledge')">确认接手</ElButton><ElButton v-if="detail.status !== 'RESOLVED'" :loading="busy" @click="act('notes')">保存备注</ElButton><ElButton v-if="detail.status === 'ACKNOWLEDGED'" :loading="busy" type="primary" @click="act('resolve')">确认结案</ElButton></div>
        <h3>最近 200 条处置记录</h3><ol><li v-for="item in actions" :key="item.id"><strong>{{ actionText[item.actionType] || item.actionType }} · 用户 {{ item.actorUserId }}</strong><p>{{ item.note }}</p><small>{{ formatTime(item.createdAt) }}</small></li></ol>
      </template>
    </ElDialog>
  </section>
</template>
<style scoped>
.alerts-page{display:grid;gap:20px}.alerts-panel{background:var(--surface,#fff);border:1px solid #e4e8ee;border-radius:14px;padding:20px}.alerts-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.alerts-toolbar select{padding:8px;border:1px solid #cbd5e1;border-radius:6px}.alerts-panel h2{font-size:18px}.alerts-form{display:grid;gap:16px;margin:20px 0}.alerts-form label{display:flex;align-items:center;justify-content:space-between;gap:20px}.alerts-form .el-input{max-width:250px}.alerts-actions{display:flex;gap:10px;margin:16px 0}li{padding:12px 0;border-bottom:1px solid #eee}li p{white-space:pre-wrap;overflow-wrap:anywhere}
</style>
