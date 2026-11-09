<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { Building2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/app'
import { exitWorkspace } from '@/services/session-actions'
import { errorMessage } from '@/services/backend-contract'
import TenantChooser from '@/components/TenantChooser.vue'
const router = useRouter()
const route = useRoute()
function afterChoose() {
  const value = route.query.redirect
  const redirect = typeof value === 'string' && /^\/(?!\/)/.test(value) && !/^\/(login|select-tenant)(?:[/?#]|$)/.test(value) ? value : '/workspace'
  void router.replace(redirect)
}
const store = useAppStore()
const busy = ref(false)
async function changeAccount() {
  if (busy.value) return
  busy.value = true
  try { await exitWorkspace(() => store.logout(), () => router.replace('/login')) }
  catch (reason) { ElMessage.error(errorMessage(reason)) }
  finally { busy.value = false }
}
</script>
<template><main class="tenant-select-page"><section class="tenant-select-card"><span class="brand-icon"><Building2 :size="24" /></span><span class="page-eyebrow">EQUIPOPS / ORGANIZATION</span><h1>选择工作企业</h1><p class="muted">进入你的设备、工单与库存工作空间。</p><TenantChooser @chosen="afterChoose" /><el-button link :loading="busy" :disabled="store.switching" @click="changeAccount">退出并更换账号</el-button></section></main></template>
