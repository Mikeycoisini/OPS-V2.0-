/** 厂区及成员关系ID保留后端BIGINT字符串，数字仅兼容安全整数。 */
export type SiteId = string | number
export interface Site {
  id: SiteId; tenantId: SiteId; siteCode: string; name: string; address: string | null
  enabled: boolean; isDefault: boolean; createdAt: string; updatedAt: string
}
export interface SiteInput { siteCode: string; name: string; address: string | null; enabled: boolean }
export interface MemberSiteScopes { membershipId: SiteId; version: number; siteIds: SiteId[] }
export interface SiteScopesInput { expectedVersion: number; siteIds: SiteId[] }

/** 执行流程：1.校验正整数ID；2.保留原始字符串；3.禁止将长ID转换为Number。 */
function idPath(id: SiteId) {
  if ((typeof id === 'number' && !Number.isSafeInteger(id)) || !/^[1-9]\d*$/.test(String(id)) || BigInt(id) > 9223372036854775807n) throw new Error('ID 必须为有效正整数，长 ID 请保留字符串') // URL与正文均不接收精度丢失的ID。
  return String(id) // 不使用Number转换。
}
/** 执行流程：1.校验版本和集合；2.检测重复及非法ID；3.显式发送空数组以撤销全部范围。 */
function scopeBody(body: SiteScopesInput): SiteScopesInput {
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) throw new Error('范围版本无效，请重新加载') // 无有效版本不能覆盖授权。
  if (!Array.isArray(body.siteIds) || body.siteIds.length > 500) throw new Error('厂区范围最多选择500项') // 与后端集合上限一致。
  const ids = body.siteIds.map(idPath) // 校验每个ID且保留字符串精度。
  if (new Set(ids).size !== ids.length) throw new Error('厂区范围不能重复') // 数字与同值字符串也属于重复。
  return { expectedVersion: body.expectedVersion, siteIds: [...body.siteIds] } // 只保留允许字段，防止客户端指定企业。
}
/** 执行流程：1.拆分默认厂区和范围目录；2.限定写入字段；3.交由会话客户端保留真实错误。 */
export function createSiteApi(request: <T>(path: string, options?: RequestInit) => Promise<T>) {
  const write = <T>(path: string, method: string, body: unknown) => request<T>(path, { method, body: JSON.stringify(body) }) // 不自动重试授权变更。
  const siteBody = (body: SiteInput): SiteInput => ({ siteCode: body.siteCode, name: body.name, address: body.address, enabled: body.enabled }) // 不发送tenantId或isDefault。
  return {
    defaultSites: () => request<Site[]>('/sites'), // 保留现有默认厂区接口语义。
    siteCatalog: () => request<Site[]>('/sites/catalog'), // 目录由后端返回当前用户可见范围。
    createSite: (body: SiteInput) => write<Site>('/sites', 'POST', siteBody(body)), // 管理员新建厂区。
    updateSite: (id: SiteId, body: SiteInput) => write<Site>(`/sites/${idPath(id)}`, 'PUT', siteBody(body)), // 编号不可变由表单和后端共同约束。
    memberSiteScopes: (id: SiteId) => request<MemberSiteScopes>(`/tenant-members/${idPath(id)}/site-scopes`), // 成员关系ID不是用户ID。
    saveMemberSiteScopes: (id: SiteId, body: SiteScopesInput) => write<MemberSiteScopes>(`/tenant-members/${idPath(id)}/site-scopes`, 'PUT', scopeBody(body)), // 空数组表示撤销普通成员全部范围。
  }
}
