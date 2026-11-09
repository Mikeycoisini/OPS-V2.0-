<script setup lang="ts">
defineProps<{ title: string; description: string; eyebrow?: string }>()
</script>
<template><header class="page-head"><div><span class="page-eyebrow">{{ eyebrow || 'EQUIPOPS / OPERATIONS' }}</span><h1>{{ title }}</h1><p>{{ description }}</p></div><div class="page-head-actions"><slot /></div></header></template>
