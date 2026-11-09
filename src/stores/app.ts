import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, ApiError } from '@/services/api'
import type { AuthUser, Tenant } from '@/domain'
import type { Equipment, EquipmentPage, EquipmentStatusFilter, EquipmentUpsert } from '@/types'

export const useAppStore = defineStore('app', () => {
  const user = ref<AuthUser | null>(null)
  const tenants = ref<Tenant[]>([])
  const epoch = ref(0)
  const refreshVersion = ref(0)
  const mutationCount = ref(0)
  const switching = ref(false)
  const sessionError = ref('')
  const bootstrapped = ref(false)
  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => !!user.value?.roleCodes.includes('TENANT_ADMIN'))
  const equipment = ref<Equipment[]>([])
  const equipmentPage = reactive<EquipmentPage & { keyword: string; status: EquipmentStatusFilter }>({ records: [], current: 1, size: 10, total: 0, pages: 0, keyword: '', status: 'ALL' })
  const resources = reactive({ equipment: { loading: false, error: '', ready: false } })
  let equipmentSequence = 0
  let bootstrapRequest: Promise<void> | null = null

  function clearContext() {
    epoch.value++
    equipmentSequence++
    equipment.value = []
    Object.assign(equipmentPage, { records: [], current: 1, total: 0, pages: 0, keyword: '', status: 'ALL' })
    Object.assign(resources.equipment, { loading: false, error: '', ready: false })
  }
  function invalidateSession() {
    clearContext(); user.value = null; tenants.value = []
    // 清除旧版留下的 Bearer 信息；真实登录状态只由后端 Session 决定。
    for (const storage of [localStorage, sessionStorage]) { storage.removeItem('equipops-token'); storage.removeItem('equipops-name') }
  }
  async function refreshTenants() { tenants.value = await api.tenants() }
  async function bootstrap() {
    if (bootstrapped.value) return
    if (bootstrapRequest) return bootstrapRequest
    bootstrapRequest = (async () => {
      try { user.value = await api.me(); sessionError.value = '' }
      catch (error) { user.value = null; if (!(error instanceof ApiError && error.status === 401)) sessionError.value = error instanceof Error ? error.message : '读取会话失败' }
      finally { bootstrapped.value = true }
    })()
    await bootstrapRequest
    bootstrapRequest = null
  }
  async function login(account: string, password: string) {
    await api.login(account.trim(), password)
    const identity = await api.me()
    clearContext(); user.value = identity; bootstrapped.value = true; sessionError.value = ''
  }
  async function logout() { await api.logout(); invalidateSession(); bootstrapped.value = true }
  async function activateTenant(tenantId: number) {
    if (mutationCount.value || switching.value) throw new Error('请等待当前操作完成后再切换企业')
    switching.value = true
    try { const identity = await api.activateTenant(tenantId); clearContext(); user.value = identity }
    finally { switching.value = false }
  }
  async function mutate<T>(operation: () => Promise<T>): Promise<T> {
    if (switching.value) throw new Error('正在切换企业，请稍后操作')
    const scope = epoch.value
    mutationCount.value++
    try {
      const result = await operation()
      if (scope !== epoch.value) throw new Error('当前会话已变化，请在当前企业重新查询结果')
      return result
    } finally { mutationCount.value = Math.max(0, mutationCount.value - 1) }
  }

  async function loadEquipmentPage(current = equipmentPage.current, keyword = equipmentPage.keyword, status = equipmentPage.status) {
    Object.assign(equipmentPage, { current, keyword, status })
    const ticket = ++equipmentSequence
    const scope = epoch.value
    Object.assign(resources.equipment, { loading: true, error: '' })
    try {
      const page = await api.equipment(current, equipmentPage.size, keyword, status)
      if (ticket !== equipmentSequence || scope !== epoch.value) return
      equipment.value = page.records
      Object.assign(equipmentPage, page)
      resources.equipment.ready = true
    } catch (error) {
      if (ticket === equipmentSequence && scope === epoch.value) resources.equipment.error = error instanceof Error ? error.message : '读取设备失败'
    } finally { if (ticket === equipmentSequence && scope === epoch.value) resources.equipment.loading = false }
  }
  const refresh = (_key: 'equipment') => loadEquipmentPage()
  const createEquipment = (body: EquipmentUpsert) => mutate(async () => { const saved = await api.createEquipment(body); await loadEquipmentPage(1); return saved })
  const updateEquipment = (id: number, body: EquipmentUpsert) => mutate(async () => { const saved = await api.updateEquipment(id, body); await loadEquipmentPage(); return saved })
  const deleteEquipment = (id: number) => mutate(async () => {
    await api.deleteEquipment(id)
    await loadEquipmentPage()
    if (!resources.equipment.error && !equipment.value.length && equipmentPage.current > 1) await loadEquipmentPage(equipmentPage.current - 1)
  })
  const changeEquipmentStatus = (id: number, target: 'RUNNING' | 'STOPPED') => mutate(async () => {
    const saved = await api.changeEquipmentStatus(id, target)
    await loadEquipmentPage()
    if (!resources.equipment.error && !equipment.value.length && equipmentPage.current > 1) await loadEquipmentPage(equipmentPage.current - 1)
    return saved
  })
  window.addEventListener('equipops:unauthorized', invalidateSession)
  return { user, tenants, epoch, refreshVersion, mutationCount, switching, sessionError, isAuthenticated, isAdmin, equipment, equipmentPage, resources,
    bootstrap, login, logout, activateTenant, refreshTenants, invalidateSession, mutate, clearContext, refresh,
    loadEquipmentPage, createEquipment, updateEquipment, deleteEquipment, changeEquipmentStatus }
})
