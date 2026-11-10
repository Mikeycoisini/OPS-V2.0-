import { getCurrentScope, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import type { Member, Page } from '../domain'
import type { Query } from '../services/backend-contract'
import type { Site } from '../services/site-contract'
import type { Team, TeamCreate, TeamUpdate, TeamMembersInput, TeamSitesInput } from '../services/team-contract'
import type { ResourceId } from '../services/resource-id'
export type TeamMode = 'view' | 'create' | 'metadata' | 'members' | 'sites'
interface TeamApi {
  teams: () => Promise<Team[]>; team: (id: ResourceId) => Promise<Team>
  createTeam: (body: TeamCreate) => Promise<Team>; updateTeam: (id: ResourceId, body: TeamUpdate) => Promise<Team>
  saveTeamMembers: (id: ResourceId, body: TeamMembersInput) => Promise<Team>; saveTeamSites: (id: ResourceId, body: TeamSitesInput) => Promise<Team>
  members: (query: Query) => Promise<Page<Member>>; siteCatalog: () => Promise<Site[]>
}
type Pending = { mode: 'create'; body: TeamCreate } | { mode: 'metadata'; id: ResourceId; body: TeamUpdate } | { mode: 'members'; id: ResourceId; body: TeamMembersInput } | { mode: 'sites'; id: ResourceId; body: TeamSitesInput }
/** 执行流程：1.按企业读取目录和真实版本；2.独立编辑资料或完整集合；3.固定UUID与载荷手动重试；4.冲突重载，撤权/切企业/离开清除旧正文。 */
export function useTeams(api: TeamApi, getEpoch: () => number, mutate: <T>(op: () => Promise<T>) => Promise<T>, keyFactory: () => string = () => crypto.randomUUID()) {
  const records = shallowRef<Team[]>([]), loading = ref(false), error = ref('') // 企业目录状态独立。
  const visible = ref(false), mode = ref<TeamMode>('view'), record = shallowRef<Team | null>(null) // 弹窗始终读取完整VO。
  const detailLoading = ref(false), saving = ref(false), formError = ref(''), conflict = ref(false), frozen = ref(false) // 不确定结果需要显式核对或原号重试。
  const form = reactive({ teamCode: '', name: '', enabled: true }), selectedIds = ref<string[]>([]) // 集合保留成员关系/厂区字符串ID。
  const memberOptions = shallowRef<Member[]>([]), siteOptions = shallowRef<Site[]>([]), memberLoading = ref(false), memberTotal = ref(0), memberCurrent = ref(0), memberKeyword = ref('') // 成员候选支持分页，不把首100人当作全部。
  let sequence = 0, detailSequence = 0, memberSequence = 0, detailEpoch = -1, targetId: ResourceId | null = null, pending: Pending | null = null // 三种请求分别作废。
  function close(force = false): boolean {
    if (!force && (saving.value || frozen.value)) return false // 未确认写入时先保留原号和参数。
    detailSequence++; memberSequence++; detailEpoch = -1; targetId = null; pending = null // 作废在途详情及旧操作。
    visible.value = false; record.value = null; selectedIds.value = []; memberOptions.value = []; siteOptions.value = [] // 清除旧企业授权正文。
    Object.assign(form, { teamCode: '', name: '', enabled: true }); detailLoading.value = false; saving.value = false; formError.value = ''; conflict.value = false; frozen.value = false // 新表单不继承旧状态。
    memberLoading.value = false; memberTotal.value = 0; memberCurrent.value = 0; memberKeyword.value = '' // 候选缓存也不跨团队或企业。
    return true // 允许调用方关闭弹窗。
  }
  function clear() {
    sequence++; records.value = []; loading.value = false; error.value = '' // 立即移除旧企业目录。
    close(true) // 企业切换及组件销毁不能被未确认表单阻止清理。
  }
  async function load() {
    const ticket = ++sequence, epoch = getEpoch(); loading.value = true; error.value = '' // 锁定本次目录上下文。
    try {
      const result = await api.teams() // 管理员全部、普通成员自己的启用团队均由后端决定。
      if (ticket !== sequence || epoch !== getEpoch()) return // 丢弃旧企业和乱序响应。
      if (!Array.isArray(result)) throw new Error('团队目录响应无效') // 不把异常结构当空集合。
      records.value = result // 保留后端完整团队数据。
    } catch (reason) {
      if (ticket === sequence && epoch === getEpoch()) { records.value = []; error.value = reason instanceof Error ? reason.message : '读取团队失败' } // 读取拒绝后不保留旧正文。
    } finally { if (ticket === sequence && epoch === getEpoch()) loading.value = false } // 旧请求不停止新加载。
  }
  async function loadMembers(keyword = memberKeyword.value, append = false): Promise<boolean> {
    const ticket = ++memberSequence, context = detailSequence, epoch = getEpoch(), current = append ? memberCurrent.value + 1 : 1 // 固定成员分页与弹窗上下文。
    memberKeyword.value = keyword; memberLoading.value = true // 搜索不清空已选完整集合。
    try {
      const page = await api.members({ current, size: 100, keyword }) // 停用的现有成员可见并允许移除，不能新增。
      if (ticket !== memberSequence || context !== detailSequence || epoch !== getEpoch() || !visible.value) return false // 不将旧候选放入新团队。
      if (!Array.isArray(page.records)) throw new Error('成员目录响应无效') // 校验分页正文。
      memberOptions.value = append ? [...memberOptions.value, ...page.records] : page.records; memberCurrent.value = page.current; memberTotal.value = page.total // 保持真实分页总量。
      return true // 首次候选成功后才允许提交成员集合。
    } catch (reason) {
      if (ticket === memberSequence && context === detailSequence && epoch === getEpoch()) {
        const message = reason instanceof Error ? reason.message : '读取成员失败'
        const status = typeof reason === 'object' && reason !== null && 'status' in reason ? reason.status : undefined
        if (status === 403 || status === 404) { clear(); error.value = message } else formError.value = message
      } // 显示真实候选错误。
      return false // 不伪造空目录。
    } finally { if (ticket === memberSequence && context === detailSequence && epoch === getEpoch()) memberLoading.value = false } // 不影响新搜索动画。
  }
  async function open(nextMode: TeamMode, id?: ResourceId) {
    if (saving.value || frozen.value) return // 未确认操作不能切换目标。
    close(true); mode.value = nextMode; visible.value = true; detailEpoch = getEpoch(); targetId = id ?? null // 打开前清除旧团队资料。
    if (nextMode === 'create') return // 新建不猜造服务端版本。
    const ticket = detailSequence, epoch = detailEpoch; detailLoading.value = true // 详情读取锁定目标企业。
    try {
      if (id == null) throw new Error('团队ID无效') // 编辑必须有明确目标。
      const result = await api.team(id) // 不使用列表行版本覆盖并发变更。
      if (ticket !== detailSequence || epoch !== getEpoch() || !visible.value) return // 丢弃已关闭或旧企业响应。
      if (String(result.id) !== String(id) || !Number.isSafeInteger(result.version) || result.version < 0) throw new Error('团队详情响应无效') // 不接受错误目标和版本。
      if (nextMode === 'members' && !await loadMembers('')) throw new Error(formError.value || '读取成员失败') // 候选加载失败时禁止误清集合。
      if (nextMode === 'sites') { const sites = await api.siteCatalog(); if (!Array.isArray(sites)) throw new Error('厂区目录响应无效'); if (ticket === detailSequence && epoch === getEpoch()) siteOptions.value = sites } // 厂区候选由管理员真实范围提供。
      if (ticket !== detailSequence || epoch !== getEpoch() || !visible.value) return // 选项读取期间切企业也须作废。
      record.value = result; Object.assign(form, { teamCode: result.teamCode, name: result.name, enabled: result.enabled }) // 仅保留当前真实详情。
      selectedIds.value = (nextMode === 'members' ? result.membershipIds : nextMode === 'sites' ? result.siteIds : []).map(String) // 完整集合不依赖候选当前页。
    } catch (reason) {
      if (ticket === detailSequence && epoch === getEpoch()) {
        const message = reason instanceof Error ? reason.message : '读取团队详情失败'
        const status = typeof reason === 'object' && reason !== null && 'status' in reason ? reason.status : undefined
        if (status === 403 || status === 404) { clear(); error.value = message } else { record.value = null; formError.value = message }
      } // 保留真实错误并阻止保存。
    } finally { if (ticket === detailSequence && epoch === getEpoch()) detailLoading.value = false } // 不影响新详情。
  }
  async function reload() {
    if (saving.value) return // 写入中的结果不能被重载覆盖。
    const id = targetId, currentMode = mode.value // 记住当前目标以核对数据库状态。
    frozen.value = false; pending = null // 用户主动重载表示先核对结果，再开始新操作。
    if (currentMode === 'create') { close(true); await load(); return } // 新建结果不确定时回目录核对唯一团队编号。
    if (id != null) await open(currentMode, id) // 重新取得版本与完整集合。
  }
  async function save(): Promise<boolean> {
    if (!visible.value || mode.value === 'view' || detailLoading.value || saving.value || conflict.value || detailEpoch !== getEpoch() || (mode.value !== 'create' && !record.value)) return false // 未加载、冲突或旧企业不能写入。
    if (!pending) {
      if ((mode.value === 'create' || mode.value === 'metadata') && (!form.name.trim() || form.name.trim().length > 160)) { formError.value = '团队名称不能为空且最多160个字符'; return false } // 明确必填约束。
      if (mode.value === 'create' && (!form.teamCode.trim() || form.teamCode.trim().length > 64)) { formError.value = '团队编号不能为空且最多64个字符'; return false } // 编号不在更新时修改。
      if (selectedIds.value.length > 500) { formError.value = '集合最多500项'; return false } // 不提交超限授权集合。
      const requestId = keyFactory() // 一次显式操作只产生一个UUID。
      if (mode.value === 'create') pending = { mode: 'create', body: { requestId, teamCode: form.teamCode.trim(), name: form.name.trim(), enabled: form.enabled } } // 固定新建载荷。
      else if (mode.value === 'metadata') pending = { mode: 'metadata', id: record.value!.id, body: { requestId, expectedVersion: record.value!.version, name: form.name.trim(), enabled: form.enabled } } // 固定目标与版本。
      else if (mode.value === 'members') pending = { mode: 'members', id: record.value!.id, body: { requestId, expectedVersion: record.value!.version, membershipIds: [...selectedIds.value] } } // 空数组仍完整替换。
      else pending = { mode: 'sites', id: record.value!.id, body: { requestId, expectedVersion: record.value!.version, siteIds: [...selectedIds.value] } } // 工作范围不能扩大个人授权。
    }
    const intent = pending, ticket = detailSequence, epoch = detailEpoch; saving.value = true; formError.value = '' // 手动重试使用已固定的原载荷。
    try {
      await mutate(() => intent.mode === 'create' ? api.createTeam(intent.body) : intent.mode === 'metadata' ? api.updateTeam(intent.id, intent.body) : intent.mode === 'members' ? api.saveTeamMembers(intent.id, intent.body) : api.saveTeamSites(intent.id, intent.body)) // 业务写入期间store阻止切企业。
      if (ticket !== detailSequence || epoch !== getEpoch() || !visible.value) return false // 不接受旧企业写成功。
      close(true); await load() // 幂等响应可能是旧快照，成功后重新读取目录。
      return epoch === getEpoch() // 仅当前上下文提示成功。
    } catch (reason) {
      if (ticket === detailSequence && epoch === getEpoch() && visible.value) {
        const message = reason instanceof Error ? reason.message : '保存团队失败', status = typeof reason === 'object' && reason !== null && 'status' in reason ? reason.status : undefined // 区分确定拒绝和未知结果。
        if (status === 403 || status === 404) { clear(); error.value = message } // 撤权后立即移除缓存正文。
        else { formError.value = message; conflict.value = status === 409; frozen.value = status == null || typeof status === 'number' && status >= 500; if (!frozen.value) pending = null } // 409须重载，传输不确定保留原号。
      }
      return false // 失败不伪造成功。
    } finally { if (ticket === detailSequence && epoch === getEpoch()) saving.value = false } // 旧结果不改变新状态。
  }
  watch(visible, value => { if (!value && detailEpoch !== -1) close(true) }, { flush: 'sync' }) // 外部关闭也清除详情。
  watch(getEpoch, clear, { flush: 'sync' }) // 企业切换同步清理整个团队上下文。
  if (getCurrentScope()) onScopeDispose(clear) // 离开组件后不接受响应。
  return { records, loading, error, visible, mode, record, detailLoading, saving, formError, conflict, frozen, form, selectedIds, memberOptions, siteOptions, memberLoading, memberTotal, memberCurrent, memberKeyword, load, open, reload, save, close, loadMembers }
}
