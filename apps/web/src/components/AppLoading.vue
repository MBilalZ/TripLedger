<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
  }>(),
  {
    label: "Loading",
  },
);
</script>

<template>
  <div class="tl-loading" role="status" aria-live="polite">
    <i class="pi pi-spinner pi-spin tl-loading__icon" aria-hidden="true" />
    <span class="tl-loading__label">{{ label }}</span>
  </div>
</template>
