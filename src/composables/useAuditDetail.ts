import { getCurrentScope, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { AuditEventDetail, AuditId } from '../services/audit-contract'

/** 执行流程：1.清空旧详情；2.记录请求序号和企业代次；3.仅接受当前响应；4.关闭或离开时作废。 */
export function useAuditDetail(fetchDetail: (id: AuditId) => Promise<AuditEventDetail>, getEpoch: () => number) {
  const visible = ref(false), loading = ref(false), error = ref('') // 弹窗和请求状态独立于列表。
  const record = shallowRef<AuditEventDetail | null>(null) // 不用列表行充当详情。
  let sequence = 0 // 每次读取或清理都使旧请求失效。
  function clear() {
    sequence++ // 作废在途请求。
    record.value = null; error.value = ''; loading.value = false // 清除旧企业全部详情状态。
  }
  function close() {
    visible.value = false // 关闭弹窗。
    clear() // 同步清理，不等待组件重建。
  }
  async function show(id: AuditId) {
    clear() // 打开新事件前不展示旧记录。
    const ticket = sequence, epoch = getEpoch() // 保存当前请求上下文。
    visible.value = true; loading.value = true // 显示读取状态。
    try {
      const result = await fetchDetail(id) // 使用真实只读接口。
      if (ticket !== sequence || epoch !== getEpoch() || !visible.value) return // 丢弃旧事件、旧企业和已关闭响应。
      record.value = result // 仅保存后端详情。
    } catch (reason) {
      if (ticket === sequence && epoch === getEpoch() && visible.value) error.value = reason instanceof Error ? reason.message : '读取审计详情失败' // 保留真实错误。
    } finally {
      if (ticket === sequence && epoch === getEpoch()) loading.value = false // 旧请求不能改变新请求状态。
    }
  }
  watch(visible, value => { if (!value) clear() }, { flush: 'sync' }) // 关闭按钮、遮罩和Esc均清空详情。
  watch(getEpoch, close, { flush: 'sync' }) // 企业切换立即关闭并作废旧响应。
  if (getCurrentScope()) onScopeDispose(close) // 离开路由时不再接受响应。
  return { visible, loading, error, record, show, close }
}
