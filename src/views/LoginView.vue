<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Boxes, ClipboardCheck, ShieldCheck, Wrench } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { errorMessage } from '@/services/backend-contract'
const store = useAppStore()
const route = useRoute()
const router = useRouter()
const form = reactive({ account: '', password: '' })
const busy = ref(false)
const error = ref('')
const message = computed(() => error.value || store.sessionError)
async function submit() {
  if (busy.value) return
  if (!form.account.trim() || !form.password) { error.value = '请填写账号和密码'; return }
  busy.value = true; error.value = ''
  try {
    await store.login(form.account, form.password)
    form.password = ''
    const redirect = typeof route.query.redirect === 'string' && /^\/(?!\/)/.test(route.query.redirect) && !route.query.redirect.startsWith('/login') ? route.query.redirect : '/workspace'
    await router.replace(store.user?.activeTenant ? redirect : { name: 'select-tenant', query: { redirect } })
  } catch (reason) { error.value = errorMessage(reason) } finally { busy.value = false }
}
</script>
<template><main class="signin-page"><section class="signin-story"><a class="signin-brand" href="/login"><span class="brand-icon"><Boxes :size="25" /></span><strong>EquipOps<small>设备运维协作平台</small></strong></a><div class="signin-story-content"><span class="page-eyebrow">MAINTENANCE, IN SYNC</span><h1>让每一次维护，<br />都有清晰的下一步。</h1><p>连接设备档案、现场维修与备件库存。<br />从问题上报到验收归档，协作始终有据可循。</p><div class="signin-flow"><span><ClipboardCheck :size="22" />报修与派单</span><ArrowRight :size="18" /><span><Wrench :size="22" />维修与领料</span><ArrowRight :size="18" /><span><ShieldCheck :size="22" />验收与留痕</span></div></div><small class="signin-story-foot">为设备可靠运行，建立有序的日常。</small></section><section class="signin-form-panel"><form class="signin-form" @submit.prevent="submit"><span class="page-eyebrow">WELCOME BACK</span><h2>登录工作空间</h2><p class="muted">使用你的企业账号，继续今天的工作。</p><el-form label-position="top" :model="form"><el-form-item label="账号"><el-input v-model="form.account" autocomplete="username" placeholder="请输入账号" size="large" :disabled="busy" /></el-form-item><el-form-item label="密码"><el-input v-model="form.password" type="password" autocomplete="current-password" show-password placeholder="请输入密码" size="large" :disabled="busy" /></el-form-item></el-form><p v-if="message" class="inline-error" role="alert">{{ message }}</p><el-button class="signin-submit" size="large" type="primary" native-type="submit" :loading="busy">{{ busy ? '正在登录…' : '登录' }}<ArrowRight v-if="!busy" :size="17" /></el-button><p class="signin-note"><ShieldCheck :size="14" />登录后按企业成员权限访问业务数据。</p></form><small class="signin-copyright">EquipOps · 设备运维协作平台</small></section></main></template>
