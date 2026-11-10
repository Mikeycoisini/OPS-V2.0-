import { getCurrentScope, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { MemberSiteScopes, Site, SiteId, SiteScopesInput } from '../services/site-contract'

export interface ScopeMember { id: SiteId; account: string; displayName: string; roles: { roleCode: string }[] }
interface ScopeApi {
  memberSiteScopes: (id: SiteId) => Promise<MemberSiteScopes>
  siteCatalog: () => Promise<Site[]>
  saveMemberSiteScopes: (id: SiteId, body: SiteScopesInput) => Promise<MemberSiteScopes>
}
/** 执行流程：1.同时读取成员授权与可选厂区；2.锁定成员、版本及企业代次；3.显式完整替换；4.关闭、换企业或离开后作废旧响应。 */
export function useMemberSiteScopes(api: ScopeApi, getEpoch: () => number, mutate: <T>(operation: () => Promise<T>) => Promise<T>) {
  const visible = ref(false), loading = ref(false), saving = ref(false), error = ref(''), conflict = ref(false) // 独立管理弹窗和写入状态。
  const member = shallowRef<ScopeMember | null>(null), record = shallowRef<MemberSiteScopes | null>(null) // 不使用成员列表快照冒充授权详情。
  const sites = shallowRef<Site[]>([]), selectedIds = ref<string[]>([]) // 选项及选中值统一保留字符串ID。
  let sequence = 0, loadedEpoch = -1 // 企业代次与请求序号共同阻止旧数据提交。
  function clear() {
    sequence++; loadedEpoch = -1 // 作废当前读取和写入响应。
    member.value = null; record.value = null; sites.value = []; selectedIds.value = [] // 清除旧企业资料。
    loading.value = false; saving.value = false; error.value = ''; conflict.value = false // 不让旧请求改变新弹窗状态。
  }
  function close() {
    visible.value = false // 关闭按钮、企业切换及组件销毁共用清理路径。
    clear() // 同步清除敏感授权信息。
  }
  async function show(target: ScopeMember) {
    if (saving.value) return // 正在保存时不能替换目标成员。
    clear(); member.value = target; visible.value = true; loading.value = true // 打开新成员前不保留旧授权。
    const ticket = sequence, epoch = getEpoch() // 捕获当前读取上下文。
    try {
      const [scopes, catalog] = await Promise.all([api.memberSiteScopes(target.id), api.siteCatalog()]) // 两者均成功后才允许编辑。
      if (ticket !== sequence || epoch !== getEpoch() || !visible.value) return // 丢弃晚到或关闭响应。
      if (String(scopes.membershipId) !== String(target.id) || !Array.isArray(scopes.siteIds) || !Array.isArray(catalog)) throw new Error('成员范围响应无效，请重新加载') // 不接受不匹配的成员详情。
      record.value = scopes; sites.value = catalog; selectedIds.value = scopes.siteIds.map(String); loadedEpoch = epoch // 记录读取时的真实版本和企业。
    } catch (reason) {
      if (ticket === sequence && epoch === getEpoch() && visible.value) error.value = reason instanceof Error ? reason.message : '读取成员厂区范围失败' // 保留真实403等原因。
    } finally {
      if (ticket === sequence && epoch === getEpoch()) loading.value = false // 旧请求不能停止新加载动画。
    }
  }
  async function reload() {
    if (!member.value || saving.value) return // 无目标或写入中不重新读取。
    return show(member.value) // 冲突重载后才取得可提交的新版本。
  }
  async function save(): Promise<boolean> {
    if (!visible.value || !record.value || !member.value || loading.value || saving.value || conflict.value || loadedEpoch !== getEpoch()) return false // 旧企业、未加载及冲突版本不能提交。
    const ticket = sequence, epoch = loadedEpoch, target = member.value.id // 捕获固定成员和企业。
    const body = { expectedVersion: record.value.version, siteIds: [...selectedIds.value] } // 保存完整副本，包括空集合。
    saving.value = true; error.value = '' // 阻止重复点击并移除旧错误。
    try {
      await mutate(() => api.saveMemberSiteScopes(target, body)) // 复用store写入计数，写入期间阻止企业切换。
      if (ticket !== sequence || epoch !== getEpoch() || !visible.value) return false // 离开或会话变化后不显示旧成功。
      close() // 成功后要求下次打开重新读取真实授权。
      return true // 仅当前上下文可以显示成功提示。
    } catch (reason) {
      if (ticket === sequence && epoch === getEpoch() && visible.value) {
        error.value = reason instanceof Error ? reason.message : '保存成员厂区范围失败' // 保留后端真实原因。
        const status = typeof reason === 'object' && reason !== null && 'status' in reason ? reason.status : undefined // 只根据明确的HTTP状态处理撤权。
        conflict.value = status === 409 // 版本冲突后必须重载，禁止重复覆盖。
        if (status === 403 || status === 404) { record.value = null; sites.value = []; selectedIds.value = []; loadedEpoch = -1 } // 服务端拒绝后不再显示缓存授权正文。
      }
      return false // 失败不伪造成功。
    } finally {
      if (ticket === sequence && epoch === getEpoch()) saving.value = false // 旧请求不能改变新弹窗状态。
    }
  }
  watch(visible, value => { if (!value) clear() }, { flush: 'sync' }) // Esc、遮罩及v-model关闭都清除授权。
  watch(getEpoch, close, { flush: 'sync' }) // 切换企业立即清空已显示的旧数据。
  if (getCurrentScope()) onScopeDispose(close) // 离开路由时作废未完成读取和保存。
  return { visible, loading, saving, error, conflict, member, record, sites, selectedIds, show, reload, save, close }
}
