<script setup lang="ts">
withDefaults(
  defineProps<{
    active?: boolean;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  {
    active: false,
    type: "button",
  },
);
</script>

<template>
  <button
    :type="type"
    class="tl-chip"
    :class="{ 'is-active': active }"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>
