<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Building2, ArrowRight, Check } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { errorMessage } from '@/services/backend-contract'
import ResourceState from './ResourceState.vue'
const store = useAppStore()
const emit = defineEmits<{ chosen: [] }>()
const loading = ref(false)
const error = ref('')
const selected = ref<number | null>(null)
async function load() {
  loading.value = true; error.value = ''
  try { await store.refreshTenants() } catch (reason) { error.value = errorMessage(reason) } finally { loading.value = false }
}
async function choose(id: number) {
  if (store.mutationCount || store.switching) return
  selected.value = id; error.value = ''
  try { if (store.user?.activeTenant?.id !== id) await store.activateTenant(id); emit('chosen') }
  catch (reason) { error.value = errorMessage(reason) } finally { selected.value = null }
}
onMounted(load)
</script>
<template><div class="tenant-chooser"><ResourceState :loading="loading" :error="error" :empty="!store.tenants.length" title="可用企业" description="当前账号尚未加入企业，请联系管理员添加成员关系。" @retry="load" /><button v-for="tenant in store.tenants" v-show="!loading" :key="tenant.id" class="tenant-choice" :disabled="!tenant.enabled || store.switching || store.mutationCount > 0" @click="choose(tenant.id)"><span class="tenant-icon"><Building2 :size="21" /></span><span><strong>{{ tenant.name }}</strong><small>{{ tenant.tenantCode }}{{ !tenant.enabled ? ' · 已停用' : '' }}</small></span><span v-if="selected === tenant.id" class="muted">切换中…</span><Check v-else-if="store.user?.activeTenant?.id === tenant.id" :size="18" /><ArrowRight v-else :size="18" /></button></div></template>
