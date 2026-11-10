import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { authRequired } from '@/config'

export const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
  { path: '/select-tenant', name: 'select-tenant', component: () => import('@/views/TenantSelectView.vue') },
  { path: '/', component: () => import('@/components/AppShell.vue'), children: [
    { path: '', redirect: '/workspace' },
    { path: 'workspace', name: 'workspace', component: () => import('@/views/WorkspaceView.vue'), meta: { title: '工作台' } },
    { path: 'orders', name: 'orders', component: () => import('@/views/OrdersView.vue'), meta: { title: '维修工单' } },
    { path: 'equipment', name: 'equipment', component: () => import('@/views/EquipmentView.vue'), meta: { title: '设备档案' } },
    { path: 'maintenance', name: 'maintenance', component: () => import('@/views/MaintenanceView.vue'), meta: { title: '维护计划' } },
    { path: 'statistics', name: 'statistics', component: () => import('@/views/StatisticsView.vue'), meta: { title: '维护统计' } },
    { path: 'inventory', name: 'inventory', component: () => import('@/views/InventoryView.vue'), meta: { title: '备件库存' } },
    { path: 'alerts', name: 'alerts', component: () => import('@/views/AlertsView.vue'), meta: { title: '告警与处置', admin: true } },
    { path: 'audit', name: 'audit', component: () => import('@/views/AuditView.vue'), meta: { title: '操作审计', admin: true } },
    { path: 'teams', name: 'teams', component: () => import('@/views/TeamsView.vue'), meta: { title: '协作团队' } },
    { path: 'sites', name: 'sites', component: () => import('@/views/SitesView.vue'), meta: { title: '厂区管理', admin: true } },
    { path: 'members', name: 'members', component: () => import('@/views/MembersView.vue'), meta: { title: '企业成员', admin: true } },
  ] },
  { path: '/:pathMatch(.*)*', redirect: '/workspace' },
] })

router.beforeEach(async to => {
  const store = useAppStore()
  await store.bootstrap()
  if (!to.meta.public && authRequired && !store.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  if (store.isAuthenticated && !store.user?.activeTenant && to.name !== 'select-tenant') return { name: 'select-tenant', query: { redirect: to.fullPath } }
  if (to.name === 'login' && store.isAuthenticated) return { name: 'workspace' }
  if (to.meta.admin && !store.isAdmin) return { name: 'workspace', query: { notice: 'members-admin' } }
})
window.addEventListener('equipops:unauthorized', () => {
  if (authRequired && router.currentRoute.value.name && router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
  }
})
