/** Read Spring error responses without guessing a business failure from HTTP status. */
export function readErrorMessage(payload: unknown, status: number, method = 'GET'): string {
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>
    for (const field of ['detail', 'message']) {
      const value = body[field]
      if (typeof value === 'string' && value.trim()) return value
    }
  }
  const action = method === 'DELETE' ? '删除' : method === 'POST' ? '新增' : method === 'PUT' ? '修改' : '查询'
  return action + '失败（' + status + '），后端未返回具体原因。'
}

/** Result.code, rather than HTTP 200 alone, determines whether a mutation succeeded. */
export function readBusinessFailure(payload: unknown): { code?: number; message: string } | null {
  if (!payload || typeof payload !== 'object') return null
  const body = payload as { code?: unknown; success?: unknown; message?: unknown }
  if ((typeof body.code === 'number' && body.code !== 200) || body.success === false) {
    return {
      code: typeof body.code === 'number' ? body.code : undefined,
      message: typeof body.message === 'string' && body.message.trim() ? body.message : '服务未能完成请求',
    }
  }
  return null
}
