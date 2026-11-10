<script setup lang="ts">
import { onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, RefreshCw } from 'lucide-vue-next'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { useSites } from '@/composables/useSites'
import { formatTime } from '@/services/backend-contract'
import PageHead from '@/components/PageHead.vue'
import ResourceState from '@/components/ResourceState.vue'
import StatusPill from '@/components/StatusPill.vue'
const store = useAppStore()
const resource = useSites(api, () => store.epoch, store.mutate) // 目录和表单共用当前企业代次及写入锁。
const { records, loading, error, visible, saving, formError, target, form } = resource // 顶层ref便于模板正确解包。
/** 执行流程：1.检查管理员入口；2.校验并保存当前表单；3.仅当前企业成功后提示。 */
async function save() {
  if (!store.isAdmin) return // 菜单隐藏之外仍限制前端写入口。
  if (await resource.save()) ElMessage.success('厂区资料已保存') // 后端成功并回查后才提示。
}
onMounted(() => { if (store.isAdmin) void resource.load() }) // 进入页面按真实范围读取目录。
</script>
<template>
  <div>
    <PageHead title="厂区管理" description="维护当前企业的厂区资料，在企业成员中分配厂区访问范围。" eyebrow="ORGANIZATION / SITES">
      <el-button v-if="store.isAdmin" type="primary" :disabled="saving" @click="resource.create"><Plus :size="16" />新增厂区</el-button>
    </PageHead>
    <section v-if="store.isAdmin" class="panel">
      <div class="panel-heading"><h2>企业厂区<small>{{ store.user?.activeTenant?.name }}</small></h2><el-button text :loading="loading" @click="resource.load"><RefreshCw :size="15" />刷新</el-button></div>
      <ResourceState :loading="loading" :error="error" :empty="!records.length" title="厂区目录" description="尚无可见厂区。可新增厂区后，在企业成员中配置普通成员的访问范围。" @retry="resource.load" />
      <div v-if="!loading && !error && records.length" class="table-wrap">
        <table class="data-table site-table"><thead><tr><th>厂区编号</th><th>厂区名称</th><th>地址</th><th>状态</th><th>默认厂区</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody><tr v-for="site in records" :key="site.id"><td class="mono">{{ site.siteCode }}</td><td><span class="row-primary">{{ site.name }}</span></td><td class="site-address">{{ site.address || '—' }}</td><td><StatusPill :value="site.enabled ? 'ENABLED' : 'DISABLED'" /></td><td>{{ site.isDefault ? '默认厂区' : '—' }}</td><td class="mono">{{ formatTime(site.updatedAt) }}</td><td><el-button link type="primary" :disabled="saving" @click="resource.edit(site)">编辑</el-button></td></tr></tbody>
        </table>
      </div>
    </section>
    <p v-else class="info-note">仅企业管理员可维护厂区。</p>
    <p class="page-footnote">新增厂区不会自动向普通成员授权。停用厂区前，需处理该厂区仍在运行的设备与未结束工单；默认厂区不能停用。</p>
    <el-dialog v-model="visible" :title="target ? '编辑厂区' : '新增厂区'" width="min(560px,94vw)" :show-close="!saving" :close-on-click-modal="!saving" :close-on-press-escape="!saving" destroy-on-close>
      <p class="dialog-intro">{{ target ? '厂区编号创建后不可修改。资料变更不改变已有业务记录的归属。' : '新厂区初始不授予普通成员访问权，请创建后前往企业成员分配范围。' }}</p>
      <el-form label-position="top" :disabled="saving" @submit.prevent="save">
        <el-form-item label="厂区编号" required><el-input v-model="form.siteCode" :disabled="!!target" maxlength="64" placeholder="企业内唯一，创建后不可修改" /></el-form-item>
        <el-form-item label="厂区名称" required><el-input v-model="form.name" maxlength="160" placeholder="填写厂区名称" /></el-form-item>
        <el-form-item label="厂区地址"><el-input v-model="form.address" type="textarea" :rows="3" maxlength="255" show-word-limit placeholder="选填，可清空" /></el-form-item>
        <el-form-item label="启用状态"><el-switch v-model="form.enabled" :disabled="target?.isDefault" active-text="已启用" inactive-text="已停用" /></el-form-item>
      </el-form>
      <p v-if="formError" class="inline-error" role="alert">{{ formError }}</p>
      <template #footer><el-button :disabled="saving" @click="resource.close">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存厂区</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.site-table { min-width: 900px; }
.site-address { min-width: 200px; max-width: 280px; white-space: normal; overflow-wrap: anywhere; }
</style>
