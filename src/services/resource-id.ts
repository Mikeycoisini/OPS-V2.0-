export type ResourceId = string | number
/** 执行流程：1.检查正整数和精度；2.限定Java Long范围；3.原样保留十进制ID。 */
export function resourceId(id: ResourceId): string {
  const value = String(id) // URL和集合始终用十进制字符串比较。
  if ((typeof id === 'number' && !Number.isSafeInteger(id)) || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new Error('ID 必须为有效正整数，长 ID 请保留字符串') // 拒绝已丢失精度或非法路径。
  return value // 不转换为JavaScript Number。
}
