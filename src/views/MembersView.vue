<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, ElCheckboxGroup } from 'element-plus'
import { Search, UserPlus } from 'lucide-vue-next'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { usePage } from '@/composables/usePage'
import { useMemberSiteScopes } from '@/composables/useMemberSiteScopes'
import { errorMessage, formatTime } from '@/services/backend-contract'
import type { Member } from '@/domain'
import PageHead from '@/components/PageHead.vue'
import PagePager from '@/components/PagePager.vue'
import ResourceState from '@/components/ResourceState.vue'
import StatusPill from '@/components/StatusPill.vue'
const store = useAppStore()
const resource = usePage(api.members, () => store.epoch)
const { records, page, loading, error } = resource
const scopes = useMemberSiteScopes(api, () => store.epoch, store.mutate) // 授权弹窗每次读取真实成员范围。
const { visible: scopeOpen, loading: scopeLoading, saving: scopeSaving, error: scopeError, conflict: scopeConflict, member: scopeMember, record: scopeRecord, sites: scopeSites, selectedIds: scopeIds } = scopes // 模板使用顶层ref。
const scopeAdmin = computed(() => !!scopeMember.value?.roles.some(role => role.roleCode === 'TENANT_ADMIN')) // 明确管理员全厂区例外。
const hiddenScopeIds = computed(() => (scopeRecord.value?.siteIds.map(String) || []).filter(id => !scopeSites.value.some(site => String(site.id) === id))) // 已停用或不可选的旧范围仍允许显式移除。
/** 执行流程：1.检查管理员入口；2.完整替换普通厂区范围；3.仅当前企业成功时提示。 */
async function saveScopes() {
  if (!store.isAdmin) return // 前端限制管理入口，后端仍作最终校验。
  if (await scopes.save()) ElMessage.success('成员厂区范围已更新') // 真实成功后再提示。
}
const keyword = ref('')
const enabled = ref('')
const addOpen = ref(false)
const userId = ref('')
const user = ref<{ id: number; account: string; displayName: string; enabled: boolean } | null>(null)
const checking = ref(false)
const saving = ref(false)
const formError = ref('')
const statusBusy = ref<number | string | null>(null)
function load(current = 1) { return resource.load({ current, keyword: keyword.value, enabled: enabled.value }) }
function openAdd() { userId.value = ''; user.value = null; formError.value = ''; addOpen.value = true }
async function checkUser() {
  user.value = null; formError.value = ''
  const id = Number(userId.value)
  if (!Number.isSafeInteger(id) || id < 1) { formError.value = '请填写已有账号的正整数用户 ID'; return }
  checking.value = true
  try { user.value = await api.user(id); if (!user.value.enabled) formError.value = '该全局账号已停用，不能添加成员' }
  catch (reason) { formError.value = errorMessage(reason) } finally { checking.value = false }
}
async function add() {
  if (saving.value || !user.value?.enabled || user.value.id !== Number(userId.value)) return
  saving.value = true; formError.value = ''
  try { await store.mutate(() => api.addMember(user.value!.id)); addOpen.value = false; ElMessage.success('已有账号已加入当前企业'); await load() }
  catch (reason) { formError.value = errorMessage(reason) } finally { saving.value = false }
}
async function changeStatus(member: Member) {
  if (statusBusy.value) return
  try {
    await ElMessageBox.confirm(`${member.enabled ? '停用后，该成员将不能访问本企业。' : '确认恢复该成员的企业访问权限？'}\n成员：${member.displayName || member.account}`, member.enabled ? '停用企业成员' : '启用企业成员', { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' })
    statusBusy.value = member.id
    await store.mutate(() => api.memberStatus(member.id, !member.enabled))
    ElMessage.success('成员状态已更新')
    if (String(member.userId) === String(store.user?.userId) && member.enabled) { store.invalidateSession(); location.assign('/login'); return }
    await load(page.current)
  } catch (reason) { if (reason !== 'cancel' && reason !== 'close') ElMessage.error(errorMessage(reason)) }
  finally { statusBusy.value = null }
}
watch(() => store.epoch, () => { resource.clear(); addOpen.value = false; user.value = null; userId.value = ''; formError.value = '' }, { flush: 'sync' }) // 企业切换同步清理成员资料和旧授权弹窗。
onMounted(() => { if (store.isAdmin) void load() })
</script>
<template><div><PageHead title="企业成员" description="管理本企业的成员关系，明确人员角色与访问状态。" eyebrow="ORGANIZATION / MEMBERS"><el-button v-if="store.isAdmin" type="primary" @click="openAdd"><UserPlus :size="16" />添加已有账号</el-button></PageHead><section v-if="store.isAdmin" class="panel"><div class="panel-heading"><h2>当前企业成员<small>{{ store.user?.activeTenant?.name }}</small></h2><span class="muted mono">仅企业管理员可管理</span></div><form class="filter-bar" @submit.prevent="load()"><el-input v-model="keyword" :prefix-icon="Search" clearable placeholder="搜索账号或姓名" aria-label="搜索企业成员" /><el-select v-model="enabled" clearable placeholder="全部成员状态" aria-label="成员启用状态"><el-option label="已启用" value="true" /><el-option label="已停用" value="false" /></el-select><el-button native-type="submit" :loading="loading">查询</el-button><el-button text @click="keyword = ''; enabled = ''; load()">重置</el-button></form><ResourceState :loading="loading" :error="error" :empty="!records.length" title="企业成员" @retry="load(page.current)" /><div v-if="!loading && !error && records.length" class="table-wrap"><table class="data-table"><thead><tr><th>成员</th><th>账号</th><th>企业角色</th><th>成员状态</th><th>加入时间</th><th>操作</th></tr></thead><tbody><tr v-for="member in records" :key="member.id"><td><div class="member-identity"><span class="member-avatar">{{ (member.displayName || member.account).slice(0, 1) }}</span><div><span class="row-primary">{{ member.displayName || member.account }}<small v-if="String(member.userId) === String(store.user?.userId)" class="self-label">我</small></span><span class="row-secondary">用户 #{{ member.userId }}</span></div></div></td><td>{{ member.account }}</td><td><div class="role-list"><span v-for="role in member.roles" :key="role.id" class="role-tag">{{ role.name || role.roleCode }}</span><span v-if="!member.roles?.length" class="muted">未分配角色</span></div></td><td><StatusPill :value="member.enabled ? 'ENABLED' : 'DISABLED'" /></td><td class="mono">{{ formatTime(member.joinedAt || member.createdAt) }}</td><td><el-button link type="primary" :disabled="scopeSaving" @click="scopes.show(member)">厂区范围</el-button><el-button link :type="member.enabled ? 'danger' : 'primary'" :loading="statusBusy === member.id" :disabled="statusBusy !== null" @click="changeStatus(member)">{{ member.enabled ? '停用成员' : '启用成员' }}</el-button></td></tr></tbody></table></div><PagePager v-if="!error" :current="page.current" :size="page.size" :total="page.total" :loading="loading" @change="load" @resize="resource.load({ current: 1, size: $event, keyword, enabled })" /></section><p v-else class="info-note">仅企业管理员可查看和管理企业成员。</p><p class="page-footnote">成员状态仅影响本企业访问；企业角色在此只读展示。新增成员不自动授予角色或厂区访问权。</p><el-dialog v-model="addOpen" title="将已有账号加入企业" width="min(520px,94vw)" :show-close="!saving" :close-on-click-modal="!saving" :close-on-press-escape="!saving"><p class="dialog-intro">填写已有全局账号的用户 ID，并核对账号信息。新成员初始角色为空。</p><el-form label-position="top" :disabled="saving"><el-form-item label="用户 ID" required><el-input v-model="userId" inputmode="numeric" placeholder="填写已有用户的 ID" @input="user = null"><template #append><el-button :loading="checking" @click="checkUser">核对账号</el-button></template></el-input></el-form-item></el-form><div v-if="user" class="info-note"><strong>{{ user.displayName || user.account }}</strong> · {{ user.account }}<br />用户 #{{ user.id }} · {{ user.enabled ? '账号已启用' : '账号已停用' }}</div><p v-if="formError" class="inline-error" role="alert">{{ formError }}</p><template #footer><el-button :disabled="saving" @click="addOpen = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!user?.enabled || user.id !== Number(userId) || checking" @click="add">确认加入企业</el-button></template></el-dialog>
<el-dialog v-model="scopeOpen" title="成员厂区访问范围" width="min(620px,94vw)" :show-close="!scopeSaving" :close-on-click-modal="!scopeSaving" :close-on-press-escape="!scopeSaving" destroy-on-close>
  <p class="dialog-intro">成员：<strong>{{ scopeMember?.displayName || scopeMember?.account }}</strong> · 成员关系 #{{ scopeMember?.id }}</p>
  <p v-if="scopeAdmin" class="info-note">该成员是企业管理员，可访问本企业全部厂区。下方分配记录在其成为普通成员时生效；清空不会撤销管理员权限。</p>
  <p class="scope-impact">保存后立即影响该成员的设备、工单、维护、库存、统计、导出与文件下载。<strong>不选择任何厂区表示无普通厂区访问权。</strong></p>
  <p v-if="scopeLoading" role="status" class="info-note">正在读取当前授权与可选厂区…</p>
  <p v-if="scopeError" class="inline-error" role="alert">{{ scopeError }}</p>
  <template v-if="scopeRecord && !scopeLoading">
    <p class="muted">已选择 {{ scopeIds.length }} 个厂区 · 版本 {{ scopeRecord.version }}</p>
    <el-checkbox-group v-model="scopeIds" :disabled="scopeSaving || scopeConflict" class="site-scope-options" aria-label="成员可访问厂区">
      <el-checkbox v-for="site in scopeSites" :key="site.id" :value="String(site.id)" :disabled="!site.enabled && !scopeIds.includes(String(site.id))">{{ site.name }} · {{ site.siteCode }}{{ site.enabled ? '' : '（已停用，仅可移除）' }}</el-checkbox>
      <el-checkbox v-for="id in hiddenScopeIds" :key="id" :value="id" :disabled="!scopeIds.includes(id)">已授权厂区 #{{ id }}（当前不可选，仅可移除）</el-checkbox>
    </el-checkbox-group>
    <p v-if="!scopeSites.length && !hiddenScopeIds.length" class="info-note">当前企业暂无可选厂区，请先在厂区管理中新增或启用厂区。</p>
    <p v-if="!scopeIds.length" class="info-note">当前未选择厂区，保存将撤销该成员的全部普通厂区访问权。</p>
  </template>
  <template #footer><el-button :disabled="scopeSaving" @click="scopes.close">取消</el-button><el-button :disabled="scopeSaving" :loading="scopeLoading" @click="scopes.reload">重新加载</el-button><el-button type="primary" :disabled="!scopeRecord || scopeLoading || scopeConflict" :loading="scopeSaving" @click="saveScopes">保存范围</el-button></template>
</el-dialog></div></template>
<style scoped>
.scope-impact { line-height: 1.8; color: #64748b; }
.site-scope-options { display: flex; flex-direction: column; align-items: flex-start; max-height: 300px; overflow-y: auto; margin: 14px 0; }
.site-scope-options :deep(.el-checkbox) { margin-right: 0; max-width: 100%; height: auto; min-height: 36px; }
.site-scope-options :deep(.el-checkbox__label) { white-space: normal; overflow-wrap: anywhere; }
</style>
