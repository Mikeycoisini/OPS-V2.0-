<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'
import type { Equipment } from '@/types'

const props = defineProps<{ modelValue: boolean; equipment: Equipment }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const url = computed(() => `${window.location.origin}/equipment?equipmentId=${props.equipment.id}`)
const localAddress = computed(() => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname))
const image = ref('')
const error = ref('')
let sequence = 0
watch(() => [props.modelValue, url.value], async ([open]) => {
  const ticket = ++sequence
  image.value = ''; error.value = ''
  if (!open) return
  try {
    const result = await QRCode.toDataURL(url.value, { width: 240, margin: 2, errorCorrectionLevel: 'M' })
    if (ticket === sequence) image.value = result
  } catch { if (ticket === sequence) error.value = '二维码生成失败，请稍后重试。' }
}, { immediate: true })
function print() {
  if (!image.value) return
  const popup = window.open('', '_blank', 'width=600,height=700')
  if (!popup) { error.value = '无法打开打印窗口，请允许浏览器弹出窗口后重试。'; return }
  const doc = popup.document
  doc.title = '设备二维码'
  const title = doc.createElement('h1'); title.textContent = props.equipment.name
  const code = doc.createElement('p'); code.textContent = `资产编号：${props.equipment.assetCode}`
  const img = doc.createElement('img'); img.src = image.value; img.alt = '设备二维码'; img.width = 240; img.height = 240
  const link = doc.createElement('p'); link.textContent = url.value; link.style.overflowWrap = 'anywhere'
  doc.body.append(title, code, img, link)
  img.onload = () => { popup.focus(); popup.print() }
}
</script>
<template>
  <el-dialog :model-value="modelValue" title="设备二维码" width="min(460px, 94vw)" @update:model-value="emit('update:modelValue', $event)">
    <div style="text-align:center">
      <h3>{{ equipment.name }}</h3><p>资产编号：{{ equipment.assetCode }}</p>
      <img v-if="image" :src="image" alt="设备分享链接二维码" width="240" height="240" />
      <p v-else-if="!error">正在生成二维码…</p>
      <p style="overflow-wrap:anywhere">{{ url }}</p>
      <p v-if="localAddress" class="info-note">当前地址为本机地址，手机无法直接访问。请使用手机可访问的站点地址打开页面后重新生成。</p>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    </div>
    <template #footer><el-button @click="emit('update:modelValue', false)">关闭</el-button><el-button type="primary" :disabled="!image" @click="print">打印</el-button></template>
  </el-dialog>
</template>
