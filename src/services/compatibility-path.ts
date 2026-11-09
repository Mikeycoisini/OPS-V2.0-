export function compatibleEquipmentPath(sparePartId: number): string {
  if (!Number.isSafeInteger(sparePartId) || sparePartId < 1) throw new Error('备件 ID 必须为正整数')
  return `/spare-parts/${sparePartId}/compatible-equipment`
}
