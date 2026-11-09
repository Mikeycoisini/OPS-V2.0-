import { getCurrentScope, onScopeDispose, reactive, ref, shallowRef } from 'vue'
import type { Page } from '../domain'
import type { Query } from '../services/backend-contract'

/** 统一分页状态；查询乱序、退出和企业切换后的旧响应均不落入当前页面。 */
export function usePage<T>(fetchPage: (query: Query) => Promise<Page<T>>, getEpoch: () => number) {
  const records = shallowRef<T[]>([])
  const params = reactive<Query>({ current: 1, size: 10 })
  const page = reactive({ current: 1, size: 10, total: 0, pages: 0 })
  const loading = ref(false)
  const error = ref('')
  const ready = ref(false)
  let sequence = 0

  async function load(query: Query = {}) {
    Object.assign(params, query)
    const ticket = ++sequence
    const epoch = getEpoch()
    loading.value = true
    error.value = ''
    try {
      const result = await fetchPage({ ...params })
      if (ticket !== sequence || epoch !== getEpoch()) return
      if (!result || !Array.isArray(result.records)) throw new Error('接口未返回有效分页数据')
      records.value = result.records
      Object.assign(page, { current: result.current, size: result.size, total: result.total, pages: result.pages })
      ready.value = true
    } catch (reason) {
      if (ticket === sequence && epoch === getEpoch()) error.value = reason instanceof Error ? reason.message : '读取失败，请重试'
    } finally {
      if (ticket === sequence && epoch === getEpoch()) loading.value = false
    }
  }
  function clear() { sequence++; records.value = []; loading.value = false; error.value = ''; ready.value = false; page.total = 0 }
  if (getCurrentScope()) onScopeDispose(clear)
  return { records, params, page, loading, error, ready, load, clear }
}
