<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";

export type TlButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "text"
  | "outlined";

const props = withDefaults(
  defineProps<{
    label?: string;
    /** PrimeIcons class, e.g. `pi pi-pencil`, or short name `pencil`. */
    icon?: string;
    variant?: TlButtonVariant;
    /** Force text chrome (e.g. danger text actions). */
    text?: boolean;
    /** Force outlined chrome. */
    outlined?: boolean;
    disabled?: boolean;
    loading?: boolean;
    type?: "button" | "submit" | "reset";
    ariaLabel?: string;
    class?: string | Record<string, boolean> | Array<string | Record<string, boolean>>;
  }>(),
  {
    variant: "primary",
    type: "button",
  },
);

const iconClass = computed(() => {
  if (!props.icon) return undefined;
  if (props.icon.startsWith("pi ")) return props.icon;
  if (props.icon.startsWith("pi-")) return `pi ${props.icon}`;
  return `pi pi-${props.icon}`;
});

const severity = computed(() => {
  switch (props.variant) {
    case "danger":
      return "danger";
    case "secondary":
    case "text":
    case "outlined":
      return "secondary";
    default:
      return undefined;
  }
});

const isText = computed(
  () => props.text === true || props.variant === "text",
);
const isOutlined = computed(
  () => props.outlined === true || props.variant === "outlined",
);
</script>

<template>
  <Button
    :label="label"
    :icon="iconClass"
    :severity="severity"
    :text="isText"
    :outlined="isOutlined && !isText"
    :disabled="disabled"
    :loading="loading"
    :type="type"
    :aria-label="ariaLabel"
    :class="props.class"
  />
</template>
