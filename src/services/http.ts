import { inventoryExportFileName } from './inventory-export.ts'
import { readBusinessFailure, readErrorMessage } from './api-response.ts'

export class ApiError extends Error {
  readonly status?: number
  readonly data?: unknown
  constructor(message: string, status?: number, data?: unknown) { super(message); this.name = 'ApiError'; this.status = status; this.data = data }
}

/** 统一会话请求；CSRF 每次写入前获取，兼容登录/切换企业后的令牌轮换。 */
export function createHttpClient({ baseUrl = '', fetcher = fetch, onUnauthorized = () => {} }: {
  baseUrl?: string; fetcher?: typeof fetch; onUnauthorized?: () => void
} = {}) {
  let unauthorizedReported = false
  function reportUnauthorized() {
    if (unauthorizedReported) return
    unauthorizedReported = true
    onUnauthorized()
  }
  async function send<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) controller.abort()
    const timer = setTimeout(abort, 25_000)
    let response: Response
    let text: string
    try {
      response = await fetcher(`${baseUrl.replace(/\/$/, '')}/api${path}`, { ...options, credentials: 'include', signal: controller.signal })
      text = await response.text()
    } catch {
      throw new ApiError('暂时无法连接服务或请求超时，请检查后端运行状态。写入结果请通过查询确认。')
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
    let payload: unknown
    try { payload = text ? JSON.parse(text) : undefined } catch {
      if (response.ok) throw new ApiError('服务返回的内容不是有效 JSON')
      payload = text
    }
    if (!response.ok) {
      if (response.status === 401) reportUnauthorized()
      throw new ApiError(readErrorMessage(payload, response.status, options.method), response.status, (payload as { data?: unknown } | undefined)?.data)
    }
    const failure = readBusinessFailure(payload)
    if (failure) {
      if (failure.code === 401) reportUnauthorized()
      throw new ApiError(failure.message, failure.code)
    }
    if (path === '/auth/login' || path === '/auth/me') unauthorizedReported = false
    // 保留 MyBatis-Plus 整页；只解开 Result 的 data 外壳。
    if (payload && typeof payload === 'object' && 'data' in payload) return (payload as { data: T }).data
    return payload as T
  }

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase()
    const headers = new Headers(options.headers)
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = await send<{ headerName: string; token: string }>('/auth/csrf')
      if (!csrf?.headerName || !csrf.token) throw new ApiError('服务未返回 CSRF 令牌，请刷新后重试')
      headers.set(csrf.headerName, csrf.token)
    }
    // 不自动重试写入，避免重复执行；库存由调用方保存同一幂等请求号。
    return send<T>(path, { ...options, method, headers })
  }
  /** 文件接口返回二进制，不能经过JSON响应解析；会话失效仍沿用同一处理。 */
  async function download(path: string, signal?: AbortSignal): Promise<{ blob: Blob; fileName: string }> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(abort, 120_000)
    try {
      const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/api${path}`, { credentials: 'include', signal: controller.signal })
      if (!response.ok) {
        if (response.status === 401) reportUnauthorized()
        let payload: unknown
        try { payload = await response.json() } catch { payload = undefined }
        throw new ApiError(readErrorMessage(payload, response.status), response.status)
      }
      if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
        throw new ApiError('服务未返回Excel文件，请刷新任务状态后重试')
      }
      const blob = await response.blob()
      if (!blob.size) throw new ApiError('下载的文件为空，请刷新任务状态后重试')
      return { blob, fileName: inventoryExportFileName(response.headers.get('Content-Disposition')) }
    } catch (e) {
      if (e instanceof ApiError) throw e
      throw new ApiError('下载中断或超时，请稍后重试')
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort)
    }
  }
  return { request, download }
}
