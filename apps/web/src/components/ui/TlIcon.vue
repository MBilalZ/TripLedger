<script setup lang="ts">
import { computed, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** PrimeIcons name without the `pi-` prefix, e.g. `pencil` or `chevron-right`. */
  name: string;
  ariaHidden?: boolean;
}>();

const attrs = useAttrs();

const iconClass = computed(() => {
  const n = props.name.startsWith("pi-") ? props.name.slice(3) : props.name;
  return ["pi", `pi-${n}`, "tl-icon", attrs.class];
});
</script>

<template>
  <i
    :class="iconClass"
    v-bind="{ ...attrs, class: undefined }"
    :aria-hidden="ariaHidden !== false ? true : undefined"
  />
</template>
