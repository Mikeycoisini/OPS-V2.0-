<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElCheckboxGroup, ElDescriptions, ElDescriptionsItem, ElTag } from 'element-plus'
import { Plus, RefreshCw, Search } from 'lucide-vue-next'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { useTeams } from '@/composables/useTeams'
import PageHead from '@/components/PageHead.vue'
import ResourceState from '@/components/ResourceState.vue'
import StatusPill from '@/components/StatusPill.vue'
const store = useAppStore()
const resource = useTeams(api, () => store.epoch, store.mutate) // 企业代次和写入计数统一处理。
const { records, loading, error, visible, mode, record, detailLoading, saving, formError, conflict, frozen, form, selectedIds, memberOptions, siteOptions, memberLoading, memberTotal, memberKeyword } = resource // 模板使用顶层ref。
const keyword = ref('') // 团队目录只筛选当前已授权列表。
const filtered = computed(() => records.value.filter(team => `${team.teamCode} ${team.name}`.toLowerCase().includes(keyword.value.trim().toLowerCase()))) // 不推断其他企业或不可见团队。
const titles = { view: '团队详情', create: '新建团队', metadata: '团队资料', members: '团队成员', sites: '团队工作厂区' } // 各写动作保持独立版本语义。
const unknownIds = computed(() => selectedIds.value.filter(id => !(mode.value === 'members' ? memberOptions.value : siteOptions.value).some(option => String(option.id) === id))) // 已选完整集合不被候选当前页截断。
/** 执行流程：1.限制管理员写入口；2.保存固定版本及完整集合；3.真实成功后提示。 */
async function save() {
  if (!store.isAdmin) return // 普通成员只读自己启用团队。
  if (await resource.save()) ElMessage.success('团队已更新') // 幂等结果已成功后再提示。
}
/** 执行流程：1.仅允许可编辑状态；2.按字符串ID移除完整集合中的单项。 */
function remove(id: string) {
  if (saving.value || frozen.value || conflict.value) return // 未确认或冲突状态不修改待重试载荷。
  selectedIds.value = selectedIds.value.filter(value => value !== id) // 不把ID转换为Number。
}
onMounted(() => { void resource.load() }) // 普通和管理员均使用后端真实范围目录。
</script>
<template>
  <div>
    <PageHead :title="store.isAdmin ? '团队管理' : '我的协作团队'" description="团队工作厂区与个人厂区授权取交集，团队成员身份不会扩大个人访问范围。" eyebrow="ORGANIZATION / TEAMS">
      <el-button v-if="store.isAdmin" type="primary" :disabled="saving || frozen" @click="resource.open('create')"><Plus :size="16" />新建团队</el-button>
    </PageHead>
    <section class="panel">
      <div class="panel-heading"><h2>{{ store.isAdmin ? '企业团队' : '我参加的启用团队' }}<small>{{ store.user?.activeTenant?.name }}</small></h2><el-button text :loading="loading" @click="resource.load"><RefreshCw :size="15" />刷新</el-button></div>
      <form class="filter-bar" @submit.prevent><el-input v-model="keyword" :prefix-icon="Search" clearable placeholder="搜索团队编号或名称" aria-label="搜索团队" /><span class="muted">{{ filtered.length }} 个可见团队</span></form>
      <ResourceState :loading="loading" :error="error" :empty="!filtered.length" title="协作团队" :description="store.isAdmin ? '当前没有符合筛选的团队，可新建团队后分配成员与工作厂区。' : '当前尚未参加启用团队，请联系企业管理员。'" @retry="resource.load" />
      <div v-if="!loading && !error && filtered.length" class="table-wrap"><table class="data-table team-table"><thead><tr><th>团队编号 / 名称</th><th>状态</th><th>成员</th><th>工作厂区</th><th>版本</th><th>操作</th></tr></thead><tbody><tr v-for="team in filtered" :key="team.id">
        <td><span class="row-primary">{{ team.name }}</span><span class="row-secondary">{{ team.teamCode }}</span></td><td><StatusPill :value="team.enabled ? 'ENABLED' : 'DISABLED'" /></td><td>{{ team.membershipIds.length }} 人</td><td>{{ team.siteIds.length }} 个</td><td class="mono">{{ team.version }}</td>
        <td><div class="row-actions"><el-button link type="primary" :disabled="saving || frozen" @click="resource.open('view', team.id)">详情</el-button><template v-if="store.isAdmin"><el-button link type="primary" :disabled="saving || frozen" @click="resource.open('metadata', team.id)">资料</el-button><el-button link type="primary" :disabled="saving || frozen" @click="resource.open('members', team.id)">成员</el-button><el-button link type="primary" :disabled="saving || frozen" @click="resource.open('sites', team.id)">工作厂区</el-button></template></div></td>
      </tr></tbody></table></div>
    </section>
    <p class="page-footnote">{{ store.isAdmin ? '停用团队、移除成员或缩小工作厂区前，须先交接受影响的未结束工单。成员及厂区集合保存时完整替换，空集合表示撤清。' : '只展示你在当前企业参加的启用团队。工单与业务数据的可见范围仍按个人厂区授权核验。' }}</p>
    <el-dialog v-model="visible" :title="titles[mode]" width="min(660px,94vw)" :show-close="!saving && !frozen" :close-on-click-modal="!saving && !frozen" :close-on-press-escape="!saving && !frozen" destroy-on-close>
      <p v-if="record" class="dialog-intro">{{ record.name }} · {{ record.teamCode }} · 版本 {{ record.version }}</p>
      <p v-if="detailLoading" class="info-note" role="status">正在读取团队及可选范围…</p>
      <p v-if="formError" class="inline-error" role="alert">{{ formError }}</p>
      <p v-if="frozen" class="info-note">写入结果尚未确认，已锁定原请求号与参数。可按原请求重试，或重新加载核对服务器记录后再开始新操作。</p>
      <template v-if="!detailLoading && (record || mode === 'create')">
        <el-descriptions v-if="mode === 'view' && record" :column="1" border>
          <el-descriptions-item label="团队ID">{{ record.id }}</el-descriptions-item><el-descriptions-item label="启用状态">{{ record.enabled ? '已启用' : '已停用' }}</el-descriptions-item><el-descriptions-item label="成员关系ID">{{ record.membershipIds.join('、') || '无成员' }}</el-descriptions-item><el-descriptions-item label="工作厂区ID">{{ record.siteIds.join('、') || '无工作厂区' }}</el-descriptions-item>
        </el-descriptions>
        <el-form v-else-if="mode === 'create' || mode === 'metadata'" label-position="top" :disabled="saving || frozen || conflict" @submit.prevent="save">
          <el-form-item label="团队编号" required><el-input v-model="form.teamCode" :disabled="mode !== 'create'" maxlength="64" placeholder="企业内唯一，创建后不可修改" /></el-form-item><el-form-item label="团队名称" required><el-input v-model="form.name" maxlength="160" placeholder="填写团队名称" /></el-form-item><el-form-item label="启用状态"><el-switch v-model="form.enabled" active-text="已启用" inactive-text="已停用" /></el-form-item>
        </el-form>
        <template v-else-if="mode === 'members' || mode === 'sites'">
          <p class="info-note">{{ mode === 'members' ? '选择有效企业成员。加入团队不授予个人厂区权限；已停用成员仅可移除。' : '选择团队负责的工作厂区。接单时还需同时具备个人厂区授权；已停用厂区仅可移除。' }}</p>
          <form v-if="mode === 'members'" class="member-search" @submit.prevent="resource.loadMembers(memberKeyword)"><el-input v-model="memberKeyword" placeholder="搜索成员账号或姓名" clearable :disabled="saving || frozen || conflict" aria-label="搜索团队可选成员" /><el-button native-type="submit" :loading="memberLoading" :disabled="saving || frozen || conflict">搜索</el-button></form>
          <p class="muted">已选择 {{ selectedIds.length }} {{ mode === 'members' ? '位成员' : '个厂区' }}，最多500项</p>
          <el-checkbox-group v-model="selectedIds" :max="500" :disabled="saving || frozen || conflict" class="team-options" :aria-label="mode === 'members' ? '团队成员范围' : '团队工作厂区范围'">
            <template v-if="mode === 'members'"><el-checkbox v-for="member in memberOptions" :key="member.id" :value="String(member.id)" :disabled="!member.enabled && !selectedIds.includes(String(member.id))">{{ member.displayName || member.account }} · {{ member.account }} · 成员关系 #{{ member.id }}{{ member.enabled ? '' : '（已停用，仅可移除）' }}</el-checkbox></template>
            <template v-else><el-checkbox v-for="site in siteOptions" :key="site.id" :value="String(site.id)" :disabled="!site.enabled && !selectedIds.includes(String(site.id))">{{ site.name }} · {{ site.siteCode }}{{ site.enabled ? '' : '（已停用，仅可移除）' }}</el-checkbox></template>
          </el-checkbox-group>
          <el-button v-if="mode === 'members' && memberOptions.length < memberTotal" link type="primary" :loading="memberLoading" :disabled="saving || frozen || conflict" @click="resource.loadMembers(memberKeyword, true)">加载更多成员（{{ memberOptions.length }}/{{ memberTotal }}）</el-button>
          <div v-if="unknownIds.length" class="selected-extra"><p class="muted">其他已选{{ mode === 'members' ? '成员（可不在当前搜索页）' : '厂区' }}：</p><el-tag v-for="id in unknownIds" :key="id" :closable="!saving && !frozen && !conflict" @close="remove(id)">{{ mode === 'members' ? '成员关系' : '厂区' }} #{{ id }}</el-tag></div>
          <p v-if="!selectedIds.length" class="info-note">保存空集合将{{ mode === 'members' ? '移除该团队全部成员' : '撤销该团队全部工作厂区' }}。</p>
        </template>
      </template>
      <template #footer><el-button :disabled="saving || frozen" @click="resource.close()">{{ mode === 'view' ? '关闭' : '取消' }}</el-button><el-button v-if="mode !== 'view' && mode !== 'create' || frozen" :loading="detailLoading" :disabled="saving" @click="resource.reload">{{ frozen ? '重新加载并核对' : '重新加载' }}</el-button><el-button v-if="store.isAdmin && mode !== 'view'" type="primary" :loading="saving" :disabled="detailLoading || conflict || (mode !== 'create' && !record)" @click="save">{{ frozen ? '按原请求重试' : '保存团队' }}</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.team-table { min-width: 820px; }
.member-search { display: flex; gap: 10px; margin: 16px 0; }
.team-options { display: flex; flex-direction: column; align-items: flex-start; max-height: 290px; overflow-y: auto; margin: 12px 0; }
.team-options :deep(.el-checkbox) { height: auto; min-height: 36px; margin-right: 0; max-width: 100%; }
.team-options :deep(.el-checkbox__label) { white-space: normal; overflow-wrap: anywhere; }
.selected-extra { margin: 14px 0; }
.selected-extra :deep(.el-tag) { margin: 0 6px 6px 0; max-width: 100%; }
</style>
