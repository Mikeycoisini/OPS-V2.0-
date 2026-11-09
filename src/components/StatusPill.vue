<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ value: string }>()
const labels: Record<string, [string, string]> = {
  PENDING: ['待处理', 'amber'], IN_PROGRESS: ['维修中', 'blue'], AWAITING_ACCEPTANCE: ['待验收', 'purple'], COMPLETED: ['已完成', 'green'],
  RUNNING: ['运行中', 'green'], STOPPED: ['未运行', 'gray'], NEEDS_ATTENTION: ['需关注', 'amber'],
  NORMAL: ['普通', 'gray'], HIGH: ['高', 'amber'], URGENT: ['紧急', 'red'],
  ENABLED: ['已启用', 'green'], DISABLED: ['已停用', 'gray'], LOW: ['低于预警值', 'amber'], NORMAL_STOCK: ['库存正常', 'green'],
  INBOUND: ['入库', 'green'], OUTBOUND: ['出库', 'blue'], ADJUSTMENT: ['调整', 'purple'], RETURN: ['退料入库', 'purple'],
}
const badge = computed(() => labels[props.value] || [props.value, 'gray'])
</script>
<template><span class="status-pill" :class="badge[1]"><i></i>{{ badge[0] }}</span></template>
