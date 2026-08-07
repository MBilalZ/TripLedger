<script setup lang="ts">
import { ref } from "vue";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";

defineProps<{
  id?: string;
  model: MenuItem[];
}>();

const menu = ref<{ toggle: (event: Event) => void } | null>(null);

function toggle(event: Event) {
  menu.value?.toggle(event);
}

defineExpose({ toggle });
</script>

<template>
  <Menu :id="id" ref="menu" :model="model" popup />
</template>
