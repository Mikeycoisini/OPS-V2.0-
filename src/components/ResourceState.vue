<script setup lang="ts">
import { CircleAlert, RefreshCw } from 'lucide-vue-next'
defineProps<{ loading:boolean; error:string; empty:boolean; title:string; description?:string }>()
defineEmits<{ retry:[] }>()
</script>
<template>
  <div v-if="loading" class="resource-loading" role="status"><RefreshCw :size="14" class="loading-spin" /> 正在读取数据…</div>
  <div v-else-if="error" class="resource-error" role="status"><div><CircleAlert :size="15" /><span>暂时无法获取{{ title }}</span><button @click="$emit('retry')">重试</button></div><details><summary>连接详情</summary><p>{{ error }}</p></details></div>
  <div v-else-if="empty" class="resource-empty"><span class="empty-cross">+</span><strong>暂无{{ title }}</strong><p>{{ description || '后端返回真实记录后，将显示在这里。' }}</p></div>
</template>
