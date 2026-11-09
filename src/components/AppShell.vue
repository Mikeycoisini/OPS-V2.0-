<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Boxes, Building2, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Menu, MonitorCog, Package, RefreshCw, Users, BookOpen, CalendarClock, ChartNoAxesColumn } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/app'
import { authRequired } from '@/config'
import { errorMessage } from '@/services/backend-contract'
import { exitWorkspace } from '@/services/session-actions'
import TenantChooser from './TenantChooser.vue'
const store = useAppStore()
const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)
const tenantOpen = ref(false)
const guideOpen = ref(false)
const loggingOut = ref(false)
const nav = [
  { path: '/workspace', label: '工作台', icon: LayoutDashboard, caption: '今日运维概览' },
  { path: '/orders', label: '维修工单', icon: ClipboardList, caption: '报修 · 处理 · 验收' },
  { path: '/equipment', label: '设备档案', icon: MonitorCog, caption: '设备信息与履历' },
  { path: '/maintenance', label: '维护计划', icon: CalendarClock, caption: '维护 · 巡检' },
  { path: '/statistics', label: '维护统计', icon: ChartNoAxesColumn, caption: '工单与设备统计' },
  { path: '/inventory', label: '备件库存', icon: Package, caption: '仓库与出入库' },
]
async function logout() {
  loggingOut.value = true
  try { await exitWorkspace(() => store.logout(), () => router.replace('/login')); ElMessage.success('已退出登录') }
  catch (reason) { ElMessage.error(errorMessage(reason)) } finally { loggingOut.value = false }
}
function refresh() { store.clearContext(); ElMessage.info('正在刷新当前页面') }
async function chosen() { tenantOpen.value = false; mobileOpen.value = false; await router.replace('/workspace'); ElMessage.success('企业工作空间已切换') }
</script>
<template><div class="admin-app"><button v-if="mobileOpen" class="sidebar-shade" aria-label="关闭导航" @click="mobileOpen = false"></button><aside class="admin-sidebar" :class="{ 'is-open': mobileOpen }"><router-link class="app-brand" to="/workspace"><span class="brand-icon"><Boxes :size="25" /></span><span><strong>EquipOps</strong><small>设备运维协作平台</small></span></router-link><button class="tenant-switch" :disabled="store.mutationCount > 0 || store.switching" @click="tenantOpen = true"><span class="tenant-icon"><Building2 :size="18" /></span><span><strong>{{ store.user?.activeTenant?.name || '选择工作企业' }}</strong><small>{{ store.user?.activeTenant?.tenantCode || '企业工作空间' }}</small></span><ChevronDown :size="15" /></button><span class="nav-section-label">运维工作空间</span><nav aria-label="主导航"><router-link v-for="item in nav" :key="item.path" :to="item.path" class="nav-item" active-class="is-active" @click="mobileOpen = false"><component :is="item.icon" :size="20" /><span><strong>{{ item.label }}</strong><small>{{ item.caption }}</small></span></router-link><div v-if="store.isAdmin" class="nav-divider"></div><router-link v-if="store.isAdmin" to="/alerts" class="nav-item" active-class="is-active" @click="mobileOpen = false"><MonitorCog :size="20" /><span><strong>告警与处置</strong><small>规则 · 处置 · 通知</small></span></router-link><router-link v-if="store.isAdmin" class="nav-item" active-class="is-active" to="/members" @click="mobileOpen = false"><Users :size="20" /><span><strong>企业成员</strong><small>成员关系与访问状态</small></span></router-link></nav><div class="sidebar-footer"><button class="guide-link" @click="guideOpen = true"><BookOpen :size="16" />工作空间使用说明</button><span>EquipOps · 让维护有序发生</span></div></aside><div class="admin-main"><header class="admin-topbar"><div class="topbar-context"><button class="icon-button mobile-menu" aria-label="展开导航" @click="mobileOpen = !mobileOpen"><Menu :size="21" /></button><span class="topbar-home">企业运维</span><span class="breadcrumb-slash">/</span><strong>{{ route.meta.title }}</strong></div><div class="topbar-actions"><span v-if="store.mutationCount" class="mutation-indicator">操作处理中…</span><button class="icon-button" title="刷新当前页面" aria-label="刷新当前页面" :disabled="store.mutationCount > 0 || store.switching" @click="refresh"><RefreshCw :size="17" /></button><span class="topbar-divider"></span><span class="user-avatar">{{ (store.user?.name || store.user?.account || '访').slice(0, 1) }}</span><span class="user-name">{{ store.user?.name || store.user?.account || '开发预览' }}<small>{{ store.isAdmin ? '企业管理员' : store.user ? '企业成员' : '未登录' }}</small></span><button v-if="store.user" class="icon-button" aria-label="退出登录" title="退出登录" :disabled="loggingOut || store.mutationCount > 0" @click="logout"><LogOut :size="17" /></button><router-link v-else class="text-link" to="/login">登录</router-link></div></header><div v-if="!authRequired && !store.user" class="dev-notice">本地开发预览：尚未登录，业务数据仍需后端授权。<router-link to="/login">前往登录</router-link></div><main class="admin-content"><router-view v-slot="{ Component }"><component :is="Component" :key="`${store.epoch}:${route.fullPath}`" /></router-view></main><footer class="app-footer"><span>EquipOps / 企业设备运维</span><span>设备 · 工单 · 备件，一处协作</span></footer></div><el-dialog v-model="tenantOpen" title="切换工作企业" width="min(520px, 94vw)" destroy-on-close><p class="dialog-intro">切换后，页面将读取所选企业的业务数据。</p><TenantChooser @chosen="chosen" /></el-dialog><el-dialog v-model="guideOpen" title="工作空间使用说明" width="min(590px, 94vw)"><div class="guide-content"><h3>1. 登记设备并提交报修</h3><p>在设备档案记录现场资料；工单选择已有设备，填写故障说明和优先级。</p><h3>2. 派单与处理</h3><p>企业管理员派单后，负责人开始维修、记录过程并领用备件。待处理同时包含待派单和待开工工单。</p><h3>3. 验收与库存</h3><p>负责人提交验收，由报修人或验收角色通过或退回。退料需关联原领料流水，完成后的工单也可退回剩余用料。</p><h3>4. 企业数据</h3><p>列表和统计均按当前企业读取。无权限或暂不可用的接口会显示原因，操作成功后刷新相关记录。</p></div></el-dialog></div></template>
