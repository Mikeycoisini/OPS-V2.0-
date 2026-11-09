<script setup lang="ts">
defineProps<{ current: number; size: number; total: number; loading?: boolean }>()
defineEmits<{ change: [number]; resize: [number] }>()
</script>
<template><div class="page-pager"><span>共 <b>{{ total }}</b> 条记录</span><el-pagination background layout="sizes, prev, pager, next" :pager-count="5" :current-page="current" :page-size="size" :total="total" :page-sizes="[10, 20, 50]" :disabled="loading" @current-change="$emit('change', $event)" @size-change="$emit('resize', $event)" /></div></template>
