<script setup lang="ts">
const props = defineProps<{
  htmlFor?: string;
}>();
</script>

<template>
  <label class="tl-input-label" :for="props.htmlFor || undefined">
    <slot />
  </label>
</template>
