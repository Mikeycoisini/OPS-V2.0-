import { getCurrentScope, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import type { Site, SiteId, SiteInput } from '../services/site-contract'
interface SiteApi {
  siteCatalog: () => Promise<Site[]>
  createSite: (body: SiteInput) => Promise<Site>
  updateSite: (id: SiteId, body: SiteInput) => Promise<Site>
}
/** 执行流程：1.按企业读取可见目录；2.独立初始化新建或编辑表单；3.校验后锁定目标保存；4.离开、关闭或换企业后丢弃旧响应。 */
export function useSites(api: SiteApi, getEpoch: () => number, mutate: <T>(operation: () => Promise<T>) => Promise<T>) {
  const records = shallowRef<Site[]>([]), loading = ref(false), error = ref('') // 目录与表单状态独立。
  const visible = ref(false), saving = ref(false), formError = ref(''), target = shallowRef<Site | null>(null) // 编辑只锁定当前目标。
  const form = reactive<SiteInput>({ siteCode: '', name: '', address: '', enabled: true }) // 不含企业与默认标记。
  let sequence = 0, formSequence = 0, formEpoch = -1 // 读取和写入分别跟踪代次。
  function close() {
    formSequence++; formEpoch = -1; visible.value = false; target.value = null // 作废表单及其在途响应。
    Object.assign(form, { siteCode: '', name: '', address: '', enabled: true }) // 不留下旧企业地址和名称。
    formError.value = ''; saving.value = false // 为下一次打开重置状态。
  }
  function clear() {
    sequence++; records.value = []; loading.value = false; error.value = '' // 清空旧企业目录并作废读取。
    close() // 企业切换或销毁时同步清理表单。
  }
  async function load() {
    const ticket = ++sequence, epoch = getEpoch() // 只允许当前目录请求更新页面。
    loading.value = true; error.value = '' // 显示读取状态。
    try {
      const result = await api.siteCatalog() // 使用新增目录接口，不改变默认厂区语义。
      if (ticket !== sequence || epoch !== getEpoch()) return // 旧企业和乱序响应不落地。
      if (!Array.isArray(result)) throw new Error('厂区目录响应无效') // 禁止将错误响应当作空目录。
      records.value = result // 显示真实可见厂区。
    } catch (reason) {
      if (ticket === sequence && epoch === getEpoch()) error.value = reason instanceof Error ? reason.message : '读取厂区目录失败' // 保留真实错误。
    } finally {
      if (ticket === sequence && epoch === getEpoch()) loading.value = false // 旧请求不改变当前加载状态。
    }
  }
  function create() {
    if (saving.value) return // 正在保存时不替换表单。
    close(); formEpoch = getEpoch(); visible.value = true // 新建始终从空表单开始。
  }
  function edit(site: Site) {
    if (saving.value) return // 防止保存中更改目标。
    close(); target.value = { ...site }; formEpoch = getEpoch() // 捕获数据库返回的固定编号和ID。
    Object.assign(form, { siteCode: site.siteCode, name: site.name, address: site.address || '', enabled: site.enabled }) // 只复制允许修改的字段。
    visible.value = true // 最后打开，避免显示旧表单。
  }
  async function save(): Promise<boolean> {
    if (!visible.value || saving.value || formEpoch !== getEpoch()) return false // 无有效当前企业表单不能写入。
    const body: SiteInput = { siteCode: target.value?.siteCode ?? form.siteCode.trim(), name: form.name.trim(), address: form.address?.trim() || null, enabled: form.enabled } // 编辑强制保持原编号。
    if (!body.siteCode || body.siteCode.length > 64) { formError.value = '厂区编号不能为空且最多64个字符'; return false } // 对齐后端字段约束。
    if (!body.name || body.name.length > 160) { formError.value = '厂区名称不能为空且最多160个字符'; return false } // 不向后端提交明显非法参数。
    if (body.address && body.address.length > 255) { formError.value = '厂区地址不能超过255个字符'; return false } // 地址空白统一清空。
    const id = target.value?.id, ticket = formSequence, epoch = formEpoch // 保存固定目标及企业。
    saving.value = true; formError.value = '' // 阻止重复点击。
    try {
      await mutate(() => id == null ? api.createSite(body) : api.updateSite(id, body)) // 由store阻止保存期间切换企业。
      if (ticket !== formSequence || epoch !== getEpoch() || !visible.value) return false // 旧成功不关闭新弹窗或刷新新企业。
      close(); await load() // 成功后回查数据库目录。
      return epoch === getEpoch() // 仅当前企业显示成功消息。
    } catch (reason) {
      if (ticket === formSequence && epoch === getEpoch() && visible.value) {
        const message = reason instanceof Error ? reason.message : '保存厂区失败' // 保留停用冲突等真实原因。
        const status = typeof reason === 'object' && reason !== null && 'status' in reason ? reason.status : undefined // 只根据明确的服务端状态处理撤权。
        if (status === 403 || status === 404) { clear(); error.value = message } // 撤权后移除缓存厂区和表单，仅展示拒绝原因。
        else formError.value = message // 普通校验冲突保留表单供修正。
      }
      return false // 失败保留表单供用户更正。
    } finally {
      if (ticket === formSequence && epoch === getEpoch()) saving.value = false // 旧响应不改变新状态。
    }
  }
  watch(visible, value => { if (!value && formEpoch !== -1) close() }, { flush: 'sync' }) // 任意关闭方式同步销毁表单。
  watch(getEpoch, clear, { flush: 'sync' }) // 企业切换立即清空旧目录和表单。
  if (getCurrentScope()) onScopeDispose(clear) // 组件销毁后不再接受响应。
  return { records, loading, error, visible, saving, formError, target, form, load, create, edit, save, close }
}
