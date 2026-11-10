import { getCurrentScope, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import type { Order } from '../domain'
import type { Team, ReassignInput } from '../services/team-contract'
import type { ResourceId } from '../services/resource-id'
interface ReassignApi { order: (id: ResourceId) => Promise<Order>; teams: () => Promise<Team[]>; reassignOrder: (id: ResourceId, body: ReassignInput) => Promise<Order> }
/** 执行流程：1.回查工单版本和启用团队；2.填写个人/团队接单及交接原因；3.固定UUID和载荷提交；4.冲突重载、撤权或上下文变化清理旧正文。 */
export function useReassign(api: ReassignApi, getEpoch: () => number, mutate: <T>(op: () => Promise<T>) => Promise<T>, keyFactory: () => string = () => crypto.randomUUID()) {
  const visible = ref(false), loading = ref(false), saving = ref(false), error = ref(''), conflict = ref(false), frozen = ref(false), denied = ref(false) // 未知写入结果仅支持原号重试或主动核对。
  const record = shallowRef<Order | null>(null), teams = shallowRef<Team[]>([]) // 不使用列表快照推断资格或版本。
  const form = reactive({ targetAssigneeUserId: null as ResourceId | null, targetTeamId: null as ResourceId | null, reason: '' }) // 团队为空表示个人接单。
  let sequence = 0, loadedEpoch = -1, targetId: ResourceId | null = null, pending: ReassignInput | null = null // 固定目标和本次幂等请求。
  function close(force = false): boolean {
    if (!force && (saving.value || frozen.value)) return false // 未确认结果时保留原号和载荷。
    sequence++; loadedEpoch = -1; targetId = null; pending = null // 作废读取及写入响应。
    visible.value = false; record.value = null; teams.value = [] // 清除旧工单与候选团队。
    Object.assign(form, { targetAssigneeUserId: null, targetTeamId: null, reason: '' }); loading.value = false; saving.value = false; error.value = ''; conflict.value = false; frozen.value = false; denied.value = false // 新弹窗不继承旧目标和原因。
    return true // 允许当前弹窗关闭。
  }
  async function show(id: ResourceId) {
    if (saving.value || frozen.value) return // 处理中或结果未确认时不能换目标。
    close(true); visible.value = true; loading.value = true; targetId = id // 先移除旧工单详情。
    const ticket = sequence, epoch = getEpoch() // 捕获真实读取上下文。
    try {
      const [order, candidates] = await Promise.all([api.order(id), api.teams()]) // 回查当前工单版本与团队资格候选。
      if (ticket !== sequence || epoch !== getEpoch() || !visible.value) return // 丢弃旧企业、已关闭和乱序响应。
      if (String(order.id) !== String(id) || !Number.isSafeInteger(order.version) || order.version < 0 || !Array.isArray(candidates)) throw new Error('工单或团队响应无效，请重新加载') // 错误目标不能提交。
      record.value = order; loadedEpoch = epoch // 保存真实版本，后端仍会锁后校验。
      teams.value = candidates.filter(team => team.enabled && team.siteIds.some(siteId => String(siteId) === String(order.siteId))) // 仅提示启用且负责该工单厂区的团队。
      Object.assign(form, { targetAssigneeUserId: order.assigneeUserId, targetTeamId: order.teamId, reason: '' }) // 原原因不自动复制为新交接理由。
      if (!['PENDING', 'IN_PROGRESS'].includes(order.status)) error.value = '当前工单状态不允许受控改派，仅待处理或维修中可交接' // 待验收或完成只读。
    } catch (reason) {
      if (ticket === sequence && epoch === getEpoch()) { record.value = null; teams.value = []; error.value = reason instanceof Error ? reason.message : '读取改派信息失败'; denied.value = typeof reason === 'object' && reason !== null && 'status' in reason && (reason.status === 403 || reason.status === 404) } // 读取拒绝后不显示缓存正文。
    } finally { if (ticket === sequence && epoch === getEpoch()) loading.value = false } // 旧请求不改变新加载状态。
  }
  async function reload() {
    if (saving.value || targetId == null) return // 写入中不重新查询。
    const id = targetId; frozen.value = false; pending = null // 用户主动核对服务器结果后再产生新请求。
    await show(id) // 回查真实状态和版本，清空旧原因。
  }
  async function save(): Promise<boolean> {
    if (!visible.value || !record.value || targetId == null || loading.value || saving.value || conflict.value || loadedEpoch !== getEpoch() || !['PENDING', 'IN_PROGRESS'].includes(record.value.status)) return false // 未加载、冲突、过期状态或企业不能提交。
    if (!pending) {
      const reason = form.reason.trim() // 幂等载荷先规范化正文。
      if (!form.targetAssigneeUserId) { error.value = '请选择启用的企业成员作为目标负责人'; return false } // 不提交空目标。
      if (!reason || reason.length > 1000) { error.value = '交接原因不能为空且最多1000个字符'; return false } // 保留首版理由约束。
      if (form.targetTeamId != null && !teams.value.some(team => String(team.id) === String(form.targetTeamId))) { error.value = '所选团队未启用或不负责该工单厂区，请重新选择'; return false } // 候选提示不代替后端成员与个人范围校验。
      pending = { requestId: keyFactory(), expectedVersion: record.value.version, targetAssigneeUserId: form.targetAssigneeUserId, targetTeamId: form.targetTeamId, reason } // 固定UUID、版本、目标和理由。
    }
    const body = { ...pending }, id = targetId, ticket = sequence, epoch = loadedEpoch; saving.value = true; error.value = '' // 重试复制同一载荷，不读取已变更表单。
    try {
      await mutate(() => api.reassignOrder(id, body)) // 管理员资格、交集及工单版本由后端实时检查。
      if (ticket !== sequence || epoch !== getEpoch() || !visible.value) return false // 旧成功不能影响新工单或企业。
      close(true) // 成功后由详情组件回查工单、用料和时间线。
      return true // 仅当前上下文提示真实成功。
    } catch (reason) {
      if (ticket === sequence && epoch === getEpoch() && visible.value) {
        const message = reason instanceof Error ? reason.message : '改派失败', status = typeof reason === 'object' && reason !== null && 'status' in reason ? reason.status : undefined // 明确区分拒绝与未知结果。
        if (status === 403 || status === 404) { const retryId = targetId; close(true); visible.value = true; targetId = retryId; error.value = message; denied.value = true } // 撤权后移除缓存工单、目标及原因，仅保留拒绝提示。
        else { error.value = message; conflict.value = status === 409; frozen.value = status == null || typeof status === 'number' && status >= 500; if (!frozen.value) pending = null } // 冲突须重载，未知结果保留原请求重试。
      }
      return false // 不吞掉失败原因或伪造成功。
    } finally { if (ticket === sequence && epoch === getEpoch()) saving.value = false } // 旧请求不停止新请求状态。
  }
  watch(visible, value => { if (!value && targetId != null) close(true) }, { flush: 'sync' }) // 任意关闭途径均作废在途响应。
  watch(getEpoch, () => close(true), { flush: 'sync' }) // 企业切换不携带工单和目标缓存。
  if (getCurrentScope()) onScopeDispose(() => close(true)) // 路由销毁后拒绝晚到结果。
  return { visible, loading, saving, error, conflict, frozen, denied, record, teams, form, show, reload, save, close }
}
